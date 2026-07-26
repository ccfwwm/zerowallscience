import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CLAIM_STATUSES,
  RESOLUTION_ACTIONS,
  REVIEWER_RUN_STATUSES,
  VERIFICATION_RESULTS,
} from "./review-state";

// __dirname, not import.meta.url: the desktop vitest config runs this file
// through a CJS-flavoured transform where import.meta.url is not a file: URL.
const MIGRATION = readFileSync(
  join(__dirname, "..", "..", "..", "apps", "desktop", "src-tauri", "migrations", "M006__review.sql"),
  "utf-8",
);

/**
 * The literals of `CHECK (<column> IN ('a', 'b'))` inside one CREATE TABLE.
 * Scoped by table because `reviewer_runs` and `claims` both have a `status`.
 */
function sqlCheckValues(table: string, column: string): Set<string> {
  const body = new RegExp(`CREATE TABLE ${table} \\([\\s\\S]*?\\n\\);`).exec(MIGRATION);
  if (!body) throw new Error(`M006 has no CREATE TABLE ${table}`);
  const clause = new RegExp(`${column}\\s+TEXT NOT NULL CHECK\\s*\\(\\s*${column} IN \\(([^)]*)\\)`)
    .exec(body[0]);
  if (!clause) throw new Error(`M006 does not CHECK ${table}.${column} against a value list`);
  return new Set([...clause[1].matchAll(/'([^']*)'/g)].map((match) => match[1]));
}

describe("review state vocabularies", () => {
  it("M006 constrains reviewer_runs.status to exactly REVIEWER_RUN_STATUSES", () => {
    expect(sqlCheckValues("reviewer_runs", "status")).toEqual(new Set(REVIEWER_RUN_STATUSES));
  });

  it("M006 constrains claims.status to exactly CLAIM_STATUSES", () => {
    expect(sqlCheckValues("claims", "status")).toEqual(new Set(CLAIM_STATUSES));
  });

  it("M006 constrains verification_checks.result to exactly VERIFICATION_RESULTS", () => {
    expect(sqlCheckValues("verification_checks", "result")).toEqual(
      new Set(VERIFICATION_RESULTS),
    );
  });

  it("M006 constrains resolutions.action to exactly RESOLUTION_ACTIONS", () => {
    expect(sqlCheckValues("resolutions", "action")).toEqual(new Set(RESOLUTION_ACTIONS));
  });
});
