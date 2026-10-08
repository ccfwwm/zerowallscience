/**
 * SQL safety assessment for db_execute. Database CRUD is far more frequent than
 * host-shell ops, so detection is statement-verb based rather than a substring
 * scan: keywords that merely appear inside string literals, comments, or
 * column names must NOT trip the guard (otherwise a logging INSERT that quotes
 * the word "TRUNCATE" would be falsely blocked). Destructive leading verbs are
 * DROP / TRUNCATE / SHUTDOWN, detected per statement across multi-statement
 * input so `SELECT 1; DROP TABLE x` is still caught. Recoverable writes
 * (INSERT/UPDATE/DELETE/CREATE/ALTER) are allowed; DELETE without WHERE remains
 * permitted because it is transactional and a common legitimate bulk operation.
 */

const DESTRUCTIVE_VERBS = new Set(["DROP", "TRUNCATE", "SHUTDOWN"]);

const WHITESPACE = new Set([" ", "\t", "\n", "\r", "\f", "\v"]);
const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

/**
 * Walk the SQL text and return the leading verb (uppercased) of every
 * top-level statement. Derived from scanTokens so the string/comment/quote
 * handling exists exactly once; a statement whose first bare word sits inside
 * a parenthesis yields no verb, matching the historical walker.
 */
function statementVerbs(sql) {
  return scanTokens(sql)
    .map((stmt) => (stmt.tokens[0] && stmt.tokens[0].depth === 0 ? stmt.tokens[0].word : null))
    .filter((verb) => verb !== null);
}

/**
 * @param {string} sql
 * @returns {{ blocked: boolean, reason?: string, verb?: string }}
 */
export function assessSqlStatement(sql) {
  if (typeof sql !== "string" || sql.trim() === "") return { blocked: false };
  for (const verb of statementVerbs(sql)) {
    if (DESTRUCTIVE_VERBS.has(verb)) {
      return { blocked: true, reason: `${verb} 不可恢复或会停库`, verb };
    }
  }
  return { blocked: false };
}

// ── read-only gate for the query channel ─────────────────────────────────────

const READONLY_VERBS = new Set(["SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN", "WITH"]);

/**
 * Bare words that must never appear (outside strings, quoted identifiers and
 * comments) anywhere in a read-only statement. Covers statement verbs, the
 * data-modifying CTE bodies PostgreSQL allows (`WITH x AS (DELETE ...) SELECT`)
 * and write-adjacent keywords (INTO OUTFILE/@var, locking reads, session
 * control). Bare-word matching is safe because all of these are reserved
 * words: a real column named "update" or "delete" must be quoted and is then
 * skipped as an identifier literal.
 */
const WRITE_KEYWORDS = new Set([
  "INSERT", "UPDATE", "DELETE", "MERGE", "TRUNCATE", "REPLACE",
  "CREATE", "ALTER", "DROP", "RENAME", "GRANT", "REVOKE",
  "CALL", "DO", "SET", "LOAD", "HANDLER", "INTO",
  "LOCK", "UNLOCK", "SHARE", "OPTIMIZE", "PURGE", "FLUSH", "RESET", "KILL", "SHUTDOWN",
  "PREPARE", "EXECUTE", "DEALLOCATE", "START", "STOP", "BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT",
  "ANALYZE"
]);

/**
 * Walk the SQL collecting every bare word token per statement, with the paren
 * depth it appears at and whether it is immediately followed by "(" (call).
 * Strings, quoted identifiers and comments are skipped so keywords inside them
 * never produce tokens. Statements are split on top-level ";".
 */
function scanTokens(sql) {
  const statements = [];
  let current = null;
  const n = sql.length;
  let i = 0;
  let depth = 0;

  const closeStatement = () => {
    if (current && current.tokens.length > 0) statements.push(current);
    current = null;
    depth = 0;
  };

  while (i < n) {
    const ch = sql[i];
    if (WHITESPACE.has(ch)) { i++; continue; }
    if ((ch === "-" && sql[i + 1] === "-") || ch === "#") {
      i += ch === "#" ? 1 : 2;
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      // MySQL executable version comments: /*!50000 DROP TABLE x */ is sent to
      // the server verbatim and EXECUTED, so its content must be lexed as SQL,
      // never skipped as a comment. Plain comments and optimizer hints skip.
      if (sql[i + 2] === "!") {
        i += 3;
        while (i < n && sql[i] >= "0" && sql[i] <= "9") i++;
        continue;
      }
      i += 2;
      while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch;
      i++;
      while (i < n) {
        const c = sql[i];
        if (c === "\\") { i += 2; continue; }
        if (c === quote) {
          if (sql[i + 1] === quote) { i += 2; continue; }
          i++; break;
        }
        i++;
      }
      continue;
    }
    if (ch === ";") { closeStatement(); i++; continue; }
    if (ch === "(") { depth++; i++; continue; }
    if (ch === ")") { depth = Math.max(0, depth - 1); i++; continue; }
    if (IDENT_START.test(ch)) {
      if (!current) current = { tokens: [] };
      let j = i;
      while (j < n && IDENT_PART.test(sql[j])) j++;
      let k = j;
      while (k < n && WHITESPACE.has(sql[k])) k++;
      const isCall = sql[k] === "(";
      current.tokens.push({ word: sql.slice(i, j).toUpperCase(), depth, isCall });
      i = j;
      continue;
    }
    i++;
  }
  closeStatement();
  return statements;
}

/**
 * Lexical read-only gate for the query channel: every statement must start
 * with a read verb AND contain no write keyword as a bare word at any depth.
 * `SHOW CREATE TABLE` is allowed (the one legit bare CREATE), and REPLACE is
 * allowed when used as the string function `REPLACE(...)` (not as REPLACE INTO).
 *
 * @param {string} sql
 * @returns {{ ok: boolean, reason?: string, verbs?: string[] }}
 */
export function assessReadOnlySql(sql) {
  if (typeof sql !== "string" || sql.trim() === "") return { ok: true, verbs: [] };
  const statements = scanTokens(sql);
  const verbs = statements.map((stmt) => stmt.tokens[0].word);
  for (const stmt of statements) {
    const verb = stmt.tokens[0].word;
    if (!READONLY_VERBS.has(verb)) {
      return { ok: false, reason: `只读查询不允许以 “${verb}” 开头的语句（仅允许 SELECT/SHOW/DESCRIBE/EXPLAIN/WITH）`, verbs };
    }
    for (const token of stmt.tokens) {
      if (token.word === "CREATE" && verb === "SHOW") continue; // SHOW CREATE TABLE
      if (token.word === "REPLACE" && token.isCall) continue;   // REPLACE(str, a, b)
      if (WRITE_KEYWORDS.has(token.word)) {
        return { ok: false, reason: `只读查询中不允许出现 ${token.word}；如需变更请走 db_execute（高危会转人工确认）或数据库面板`, verbs };
      }
    }
  }
  return { ok: true, verbs };
}
