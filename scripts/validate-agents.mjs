#!/usr/bin/env node
/**
 * Validate the agent definition JSON files in runtime/agents/.
 *
 * Checks, per file:
 *   - parses as JSON
 *   - required fields present, with valid formats
 *   - English-only text outside metadata.locale (AGENTS.md: project files are
 *     pure English; localized strings live under metadata.locale.<tag>)
 *
 * Then, across files: every handoff edge resolves to a known agent.
 *
 * Exit code 0 when everything passes, 1 otherwise.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const agentsDir = join(__dirname, "..", "runtime", "agents");

const agentFiles = [
  "general-purpose.json",
  "research-assistant.json",
  "code-specialist.json",
  "data-analyst.json",
  "onboarding.json",
  "operon.json",
  "reviewer.json",
  "bookmarker.json",
];

/** Schema file: validated for English-only text, but not as an agent definition. */
const schemaFile = "schema-v1.json";

const requiredFields = ["version", "id", "name", "role", "capabilities", "permissions"];
const requiredCapabilities = ["tools", "reasoning", "multimodal"];
const validRoles = ["general", "research", "code", "data"];
const validPermissionModes = ["off", "approve", "full"];

/**
 * Collect every string value containing non-ASCII characters, ignoring
 * subtrees under `metadata.locale` (the sanctioned home for localized text).
 */
function findNonAsciiStrings(node, path = [], found = []) {
  if (typeof node === "string") {
    if (!/^[\x00-\x7F]*$/.test(node)) {
      found.push({ path: path.join("."), value: node });
    }
    return found;
  }
  if (Array.isArray(node)) {
    node.forEach((item, i) => findNonAsciiStrings(item, [...path, String(i)], found));
    return found;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      // metadata.locale.<tag>.* is allowed to hold non-English text.
      if (key === "locale" && path[path.length - 1] === "metadata") continue;
      findNonAsciiStrings(value, [...path, key], found);
    }
  }
  return found;
}

let hasErrors = false;
const agents = new Map();

console.log("Validating agent definitions...\n");

for (const file of [...agentFiles, schemaFile]) {
  const filePath = join(agentsDir, file);
  const isAgent = file !== schemaFile;
  let fileErrors = 0;
  const fail = (msg) => {
    console.error(`  x ${msg}`);
    fileErrors++;
  };

  let doc;
  try {
    doc = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`x ${file}: ${error.message}`);
    hasErrors = true;
    console.log("");
    continue;
  }

  console.log(`- ${file}`);

  // English-only text outside metadata.locale.
  for (const { path, value } of findNonAsciiStrings(doc)) {
    const preview = value.length > 50 ? `${value.slice(0, 50)}...` : value;
    fail(`Non-English text at "${path}": "${preview}" (move it to metadata.locale)`);
  }

  if (isAgent) {
    for (const field of requiredFields) {
      if (!(field in doc)) fail(`Missing required field: ${field}`);
    }

    if (doc.version !== "1") {
      fail(`Invalid version: expected "1", got "${doc.version}"`);
    }

    if (!/^[a-z][a-z0-9-]*$/.test(doc.id ?? "")) {
      fail(`Invalid id format: "${doc.id}" (must be kebab-case)`);
    }

    if (doc.id && file !== `${doc.id}.json`) {
      fail(`Filename does not match id: "${doc.id}" should live in ${doc.id}.json`);
    }

    if (!validRoles.includes(doc.role)) {
      fail(`Invalid role: "${doc.role}" (expected one of: ${validRoles.join(", ")})`);
    }

    if (!doc.capabilities || typeof doc.capabilities !== "object") {
      fail("Invalid capabilities: must be an object");
    } else {
      for (const cap of requiredCapabilities) {
        if (typeof doc.capabilities[cap] !== "boolean") {
          fail(`Invalid capability "${cap}": must be boolean`);
        }
      }
    }

    if (!doc.permissions || typeof doc.permissions !== "object") {
      fail("Invalid permissions: must be an object");
    } else {
      if (!validPermissionModes.includes(doc.permissions.mode)) {
        fail(
          `Invalid permission mode: "${doc.permissions.mode}" ` +
            `(expected one of: ${validPermissionModes.join(", ")})`,
        );
      }
      if (!Array.isArray(doc.permissions.allowedTools)) {
        fail("Invalid allowedTools: must be an array");
      }
      if (doc.permissions.blockedTools && !Array.isArray(doc.permissions.blockedTools)) {
        fail("Invalid blockedTools: must be an array");
      }
    }

    const handoff = doc.metadata?.handoff;
    if (handoff) {
      if (handoff.to && !Array.isArray(handoff.to)) fail("Invalid handoff.to: must be an array");
      if (handoff.from && !Array.isArray(handoff.from)) fail("Invalid handoff.from: must be an array");
    }

    if (doc.id) agents.set(doc.id, doc);
  }

  if (fileErrors === 0) {
    console.log("  ok");
  } else {
    hasErrors = true;
  }
  console.log("");
}

console.log("Validating handoff graph...\n");

let handoffErrors = 0;
for (const [id, agent] of agents) {
  const handoff = agent.metadata?.handoff;
  if (!handoff) continue;

  for (const targetId of handoff.to ?? []) {
    if (!agents.has(targetId)) {
      console.error(`x Agent "${id}" handoff references unknown target "${targetId}"`);
      handoffErrors++;
    }
  }
  for (const sourceId of handoff.from ?? []) {
    if (!agents.has(sourceId)) {
      console.error(`x Agent "${id}" handoff references unknown source "${sourceId}"`);
      handoffErrors++;
    }
  }
}

if (handoffErrors === 0) {
  console.log("  ok\n");
} else {
  hasErrors = true;
  console.log("");
}

if (hasErrors) {
  console.error("Validation failed.");
  process.exit(1);
}

console.log(`All ${agents.size} agent definitions are valid.`);
process.exit(0);
