import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const excludedDirectories = new Set([
  ".git",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "target",
]);
const excludedFiles = new Set([
  "PROGRESS.md",
  "scripts/check-brand-contract.mjs",
]);
const allowedLegacyOccurrences = [
  {
    path: "apps/desktop/src-tauri/src/project.rs",
    pattern: "\\.openscience",
    literal: ".openscience",
    context: "for store in [\".zerowall\", \".openscience\"] {",
    expectedCount: 1,
  },
  {
    path: "apps/desktop/src-tauri/src/project.rs",
    pattern: "\\.openscience",
    literal: ".openscience",
    context: "fs::create_dir_all(source.join(\".openscience\")).unwrap();",
    expectedCount: 1,
  },
  {
    path: "apps/desktop/src-tauri/src/project.rs",
    pattern: "\\.openscience",
    literal: ".openscience",
    context: "fs::write(source.join(\".openscience/project.json\"), r#\"{\"id\":\"legacy\"}\"#).unwrap();",
    expectedCount: 1,
  },
  {
    path: "apps/desktop/src-tauri/src/project.rs",
    pattern: "\\.openscience",
    literal: ".openscience",
    context: "fs::write(source.join(\".openscience/provenance.jsonl\"), \"legacy provenance\\n\").unwrap();",
    expectedCount: 1,
  },
  {
    path: "apps/desktop/src-tauri/src/project.rs",
    pattern: "\\.openscience",
    literal: ".openscience",
    context: "assert!(!destination.join(\".openscience\").exists());",
    expectedCount: 1,
  },
];
const binaryExtensions = new Set([
  ".gif",
  ".icns",
  ".ico",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".wasm",
  ".webp",
  ".zip",
]);
const forbiddenBrands = [
  /Open Science/,
  /@ai4s\//,
  /com\.ai4s\.workbench/,
  /\.openscience/,
  /ai4s[_-]workbench/,
  /ai4s_workbench_lib/,
  /["']ai4s\./,
  /ai4s-(?!skills|agent|research)/,
  /OPENSCIENCE_APP_VERSION/,
  /["']OpenScience["']/,
  /OpenScience\//,
  /OpenScience_/,
  /openscience\.(?:files|update)/,
  /openscience\/jobs/,
  /cd open-science/,
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;

    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

const violations = [];
const allowedCounts = new Map(allowedLegacyOccurrences.map((rule) => [rule, 0]));
for (const file of await collectFiles(root)) {
  const path = relative(root, file).replaceAll("\\", "/");
  if (excludedFiles.has(path) || binaryExtensions.has(extname(path).toLowerCase())) continue;

  const contents = await readFile(file, "utf8");
  for (const pattern of forbiddenBrands) {
    const matcher = new RegExp(pattern.source, `${pattern.flags.replaceAll("g", "")}g`);
    for (const match of contents.matchAll(matcher)) {
      const lineStart = contents.lastIndexOf("\n", match.index - 1) + 1;
      const lineEnd = contents.indexOf("\n", match.index);
      const context = contents.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
      const rule = allowedLegacyOccurrences.find((candidate) =>
        candidate.path === path
        && candidate.pattern === pattern.source
        && candidate.literal === match[0]
        && candidate.context === context
      );
      if (rule) {
        allowedCounts.set(rule, allowedCounts.get(rule) + 1);
      } else {
        violations.push(`${path}: ${pattern.source} (${JSON.stringify(context)})`);
      }
    }
  }
}

for (const rule of allowedLegacyOccurrences) {
  const actual = allowedCounts.get(rule);
  if (actual !== rule.expectedCount) {
    violations.push(
      `${rule.path}: allowlist expected ${rule.expectedCount} occurrence(s) of ${JSON.stringify(rule.literal)} in ${JSON.stringify(rule.context)}, found ${actual}`,
    );
  }
}

if (violations.length > 0) {
  console.error("Legacy brand contract violations:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("ZeroWall Science brand contract passed.");
