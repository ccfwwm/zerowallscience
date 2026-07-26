import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

// The shipping app version is declared five times. Nothing in the build makes
// them agree, so a partial bump ships an installer labelled one version whose
// binary reports another. The root package.json is the reference; everything
// else must repeat it exactly.
const referencePath = "package.json";
const jsonSources = [
  referencePath,
  "apps/desktop/package.json",
  // Tauri stamps this into the installer name and the update manifest.
  "apps/desktop/src-tauri/tauri.conf.json",
];
const cargoTomlPath = "apps/desktop/src-tauri/Cargo.toml";
// The lock file records the workspace crate's own version alongside its
// dependencies, and `cargo build` rewrites it when Cargo.toml moves. A lock
// left behind by a bump that never rebuilt is the most common way this set
// drifts in practice, so it is a checked source and not an afterthought.
const cargoLockPath = "apps/desktop/src-tauri/Cargo.lock";

// NOT app-version sources. `packages/sdk` and `packages/shared` are internal
// libraries with their own release cadence (both at 0.1.0 today); forcing them
// to the app version would make every app bump a false library bump. They are
// listed rather than silently skipped so the exclusion is a deliberate
// statement, and each one is still required to exist and declare a version —
// otherwise this list would quietly rot into meaninglessness.
const independentlyVersionedPackages = [
  "packages/sdk/package.json",
  "packages/shared/package.json",
];

const violations = [];

async function readText(path) {
  try {
    return await readFile(resolve(root, path), "utf8");
  } catch (error) {
    violations.push(`${path}: cannot be read (${error.code ?? error.message})`);
    return null;
  }
}

function jsonVersion(path, contents) {
  try {
    const version = JSON.parse(contents).version;
    return typeof version === "string" ? version : null;
  } catch (error) {
    violations.push(`${path}: is not valid JSON (${error.message})`);
    return null;
  }
}

/** Read one key from the `[package]` table, ignoring every other table. */
function cargoTomlPackageField(contents, field) {
  let table = "";
  for (const line of contents.split(/\r?\n/).map((entry) => entry.trim())) {
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      table = header[1];
      continue;
    }
    if (table !== "package") continue;
    const value = new RegExp(`^${field}\\s*=\\s*"([^"]+)"`).exec(line);
    if (value) return value[1];
  }
  return null;
}

/** Read the version of one `[[package]]` entry in a Cargo.lock file. */
function cargoLockVersion(contents, crate) {
  let name = null;
  for (const line of contents.split(/\r?\n/).map((entry) => entry.trim())) {
    if (line === "[[package]]") {
      name = null;
      continue;
    }
    const declaredName = /^name\s*=\s*"([^"]+)"$/.exec(line);
    if (declaredName) {
      name = declaredName[1];
      continue;
    }
    const declaredVersion = /^version\s*=\s*"([^"]+)"$/.exec(line);
    if (declaredVersion && name === crate) return declaredVersion[1];
  }
  return null;
}

const declarations = [];

for (const path of jsonSources) {
  const contents = await readText(path);
  if (contents !== null) declarations.push({ path, version: jsonVersion(path, contents) });
}

const cargoToml = await readText(cargoTomlPath);
// The crate name comes from Cargo.toml so a rename keeps pointing the lock
// lookup at the right entry instead of silently finding nothing.
let crateName = null;
if (cargoToml !== null) {
  crateName = cargoTomlPackageField(cargoToml, "name");
  declarations.push({ path: cargoTomlPath, version: cargoTomlPackageField(cargoToml, "version") });
}

const cargoLock = await readText(cargoLockPath);
if (cargoLock !== null) {
  if (crateName === null) {
    violations.push(`${cargoTomlPath}: no [package] name, so ${cargoLockPath} cannot be checked`);
  } else {
    declarations.push({
      path: `${cargoLockPath} ([[package]] ${crateName})`,
      version: cargoLockVersion(cargoLock, crateName),
    });
  }
}

const reference = declarations.find((declaration) => declaration.path === referencePath)?.version;

if (!reference) {
  violations.push(`${referencePath}: declares no "version", so there is nothing to compare against`);
} else if (!/^\d+\.\d+\.\d+$/.test(reference)) {
  // Tauri rejects a non-semver version at bundle time, long after CI would
  // have called a uniformly wrong version consistent.
  violations.push(`${referencePath}: version ${JSON.stringify(reference)} is not MAJOR.MINOR.PATCH`);
}

for (const { path, version } of declarations) {
  if (version === null) {
    violations.push(`${path}: declares no version`);
  } else if (reference && version !== reference) {
    violations.push(
      `${path}: declares ${JSON.stringify(version)} but ${referencePath} declares ${JSON.stringify(reference)}`,
    );
  }
}

for (const path of independentlyVersionedPackages) {
  const contents = await readText(path);
  if (contents === null) continue;
  if (jsonVersion(path, contents) === null) {
    violations.push(`${path}: is excluded from the app version contract but declares no version of its own`);
  }
}

if (violations.length > 0) {
  console.error("App version contract violations:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`ZeroWall Science app version contract passed (${reference}).`);
