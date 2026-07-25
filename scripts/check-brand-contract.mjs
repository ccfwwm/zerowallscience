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
const allowedLegacyPatterns = new Map([
  ["apps/desktop/src-tauri/src/project.rs", new Set(["\\.openscience"])],
  ["apps/desktop/src-tauri/src/runtime.rs", new Set([
    "\\.openscience",
    "Open Science",
    "[\"']OpenScience[\"']",
  ])],
]);
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
for (const file of await collectFiles(root)) {
  const path = relative(root, file).replaceAll("\\", "/");
  if (excludedFiles.has(path) || binaryExtensions.has(extname(path).toLowerCase())) continue;

  const contents = await readFile(file, "utf8");
  for (const pattern of forbiddenBrands) {
    if (allowedLegacyPatterns.get(path)?.has(pattern.source)) continue;
    if (pattern.test(contents)) violations.push(`${path}: ${pattern.source}`);
  }
}

if (violations.length > 0) {
  console.error("Legacy brand contract violations:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("ZeroWall Science brand contract passed.");
