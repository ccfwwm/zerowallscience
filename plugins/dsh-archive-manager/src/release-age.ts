import { existsSync } from "node:fs";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function releaseAgeSpec(packageSpec: string) {
  const at = packageSpec.lastIndexOf("@");
  if (at <= 0) return undefined;
  const name = packageSpec.slice(0, at);
  const version = packageSpec.slice(at + 1);
  if (!isPackageName(name) || !isReleaseVersion(version)) return undefined;
  return { name, version };
}
function isPackageName(name: string) {
  return /^@[^/\s]+\/[^/\s]+$/.test(name) || /^[^@/\s]+$/.test(name);
}
function isReleaseVersion(version: string) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version);
}
function unreadableReleaseAgeExclude() {
  return new Error("发布年龄白名单无法安全合并，已停止更新，避免这个 profile 之后无法安装插件。");
}
function excludeEntry(indent: string, name: string, versions: readonly string[], comment = "") {
  const entry = `${indent}- '${name}@${versions.join(" || ")}'`;
  return comment === "" ? entry : `${entry} ${comment}`;
}
function parseExcludeLine(line: string) {
  const dash = line.indexOf("-");
  if (!/^\s+-/.test(line) || dash < 0) return undefined;
  const indent = line.slice(0, dash);
  const raw = line.slice(dash + 1).trim();
  let body = raw;
  let comment = "";
  if (raw.startsWith("'") || raw.startsWith("\"")) {
    const quote = raw[0] ?? "'";
    const end = raw.lastIndexOf(quote);
    if (end <= 0) return undefined;
    const rest = raw.slice(end + 1).trim();
    if (rest !== "" && !rest.startsWith("#")) return undefined;
    if (rest.startsWith("#")) comment = rest;
    body = raw.slice(1, end);
  } else if (raw.includes("#")) return undefined;
  if (body.includes("#")) return undefined;
  const versionAt = body.lastIndexOf("@");
  if (versionAt > 0) {
    const name = body.slice(0, versionAt);
    const versions = body.slice(versionAt + 1).split(" || ");
    if (isPackageName(name) && versions.every(isReleaseVersion)) return { indent, name, versions, comment };
    return undefined;
  }
  if (isPackageName(body) || /^@[^/\s]+\/\*$/.test(body)) return { indent, name: body, versions: undefined, comment };
  return undefined;
}
/** 把刚安装的精确版本并进 profile 白名单。pnpm 每个包名只认第一条，所以必须并进已有 union，不能另起一行，也不能收成裸包名。 */
export function mergeMinimumReleaseAgeExclude(yaml: string, packageSpec: string) {
  const spec = releaseAgeSpec(packageSpec);
  if (spec === undefined) throw new Error("更新版本无法写入发布年龄白名单，已停止更新。");
  const eol = yaml.includes("\r\n") ? "\r\n" : "\n";
  const text = yaml.replaceAll("\r\n", "\n");
  const next = mergeReleaseAgeText(text, spec.name, spec.version);
  return eol === "\r\n" ? next.replaceAll("\n", "\r\n") : next;
}
function mergeReleaseAgeText(yaml: string, name: string, version: string) {
  if (/minimumReleaseAgeExclude:[^\n\r]/.test(yaml)) throw unreadableReleaseAgeExclude();
  const marker = /(?:^|\n)minimumReleaseAgeExclude:[ \t]*(?:\n|$)/.exec(yaml);
  if (marker === null) {
    const base = yaml.endsWith("\n") || yaml.length === 0 ? yaml : `${yaml}\n`;
    const gap = base.length === 0 || base.endsWith("\n\n") ? "" : "\n";
    return `${base}${gap}minimumReleaseAgeExclude:\n  - '${name}@${version}'\n`;
  }
  const keyAt = (marker.index ?? 0) + (marker[0].startsWith("\n") ? 1 : 0);
  let cursor = keyAt + "minimumReleaseAgeExclude:".length;
  while (cursor < yaml.length && (yaml[cursor] === " " || yaml[cursor] === "\t")) cursor += 1;
  if (yaml[cursor] !== "\n") throw unreadableReleaseAgeExclude();
  const bodyStart = cursor + 1;
  const lines: string[] = [];
  let bodyEnd = bodyStart;
  while (bodyEnd <= yaml.length) {
    const nextNl = yaml.indexOf("\n", bodyEnd);
    const lineEnd = nextNl === -1 ? yaml.length : nextNl;
    const line = yaml.slice(bodyEnd, lineEnd);
    const ended = line.trim() !== "" && !/^[ \t]*#/.test(line) && !/^[ \t]/.test(line);
    if (ended) break;
    if (line.trim() !== "" && !/^[ \t]*#/.test(line) && !/^[ \t]+-/.test(line)) throw unreadableReleaseAgeExclude();
    lines.push(line);
    if (nextNl === -1) {
      bodyEnd = yaml.length;
      break;
    }
    bodyEnd = nextNl + 1;
    if (bodyEnd === yaml.length) break;
  }
  let ours: { index: number; versions: string[] | undefined; indent: string; comment: string } | undefined;
  const rewritten = lines.map((line, index) => {
    if (line.trim() === "" || /^[ \t]*#/.test(line)) return line;
    const parsed = parseExcludeLine(line);
    if (parsed === undefined) throw unreadableReleaseAgeExclude();
    if (parsed.name !== name) return line;
    if (ours === undefined) {
      ours = { index, indent: parsed.indent, versions: parsed.versions, comment: parsed.comment };
      return line;
    }
    if (ours.versions !== undefined && parsed.versions !== undefined) ours.versions = [...ours.versions, ...parsed.versions.filter((item) => !ours?.versions?.includes(item))];
    return "";
  });
  if (ours?.versions === undefined && ours !== undefined) return yaml;
  const indent = ours?.indent ?? lines.find((line) => /^[ \t]+-/.test(line))?.match(/^([ \t]+)/)?.[1] ?? "  ";
  const versions = ours?.versions === undefined ? [version] : ours.versions.includes(version) ? ours.versions : [...ours.versions, version];
  const entry = excludeEntry(indent, name, versions, ours?.comment ?? "");
  if (ours === undefined) rewritten.push(entry);
  else rewritten[ours.index] = entry;
  const body = rewritten.filter((line) => line !== "").join("\n");
  const prefix = yaml.slice(0, bodyStart);
  const suffix = yaml.slice(bodyEnd);
  const joined = `${prefix}${body}${body.length === 0 || body.endsWith("\n") ? "" : "\n"}${suffix}`;
  return joined.endsWith("\n") ? joined : `${joined}\n`;
}
export async function guardReleaseAgeExclude(profileDir: string, packageSpec: string) {
  const file = resolve(profileDir, "pnpm-workspace.yaml");
  const current = existsSync(file) ? await readFile(file, "utf8") : "packages:\n  - .\n";
  mergeMinimumReleaseAgeExclude(current, packageSpec);
}
async function replaceTextFile(file: string, next: string) {
  const tmp = `${file}.${process.pid}.tmp`;
  const backup = `${file}.${process.pid}.bak`;
  await writeFile(tmp, next, "utf8");
  try {
    await rename(tmp, file);
    return;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code !== "EEXIST" && code !== "EPERM" && code !== "EACCES") {
      await unlink(tmp).catch(() => {});
      throw error;
    }
  }
  await unlink(backup).catch(() => {});
  await rename(file, backup);
  try {
    await rename(tmp, file);
  } catch (error) {
    await rename(backup, file).catch(() => {});
    await unlink(tmp).catch(() => {});
    throw error;
  }
  await unlink(backup).catch(() => {});
}
export async function recordReleaseAgeExclude(profileDir: string, packageSpec: string) {
  const file = resolve(profileDir, "pnpm-workspace.yaml");
  const current = existsSync(file) ? await readFile(file, "utf8") : "packages:\n  - .\n";
  const next = mergeMinimumReleaseAgeExclude(current, packageSpec);
  if (next !== current) await replaceTextFile(file, next);
}
