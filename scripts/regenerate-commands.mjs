#!/usr/bin/env node
// Regenerate the user-invocable ARS command wrappers in resources/skills from an
// upstream Academic Research Skills checkout.
//
// Usage:
//   node scripts/regenerate-commands.mjs <upstream-repo-path>
//
// Each wrapper is a DSH skill (name = upstream command name) marked
// `disable-model-invocation: true` + `user-invocable: true`, so it fires only
// when the user types /ars-<name>.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const upstreamArg = process.argv[2];
if (upstreamArg === undefined || upstreamArg.trim() === '') {
  console.error('usage: node scripts/regenerate-commands.mjs <upstream-repo-path>');
  process.exit(1);
}
const upstream = resolve(upstreamArg);

// Tiny YAML-subset frontmatter read: our wrapper source files use
// single-line quoted `name` / `description`.
function readFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line || /^\s/.test(line) || line.trim().startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[line.slice(0, idx).trim()] = value;
  }
  return fields;
}

const sourceDir = join(upstream, 'commands');
if (!existsSync(sourceDir)) {
  console.error(`upstream commands directory was not found: ${sourceDir}`);
  process.exit(1);
}
const outputRoot = fileURLToPath(new URL('../resources/skills/', import.meta.url));
mkdirSync(outputRoot, { recursive: true });

const files = readdirSync(sourceDir).filter((f) => /^ars-.*\.md$/.test(f)).sort();
for (const entry of readdirSync(outputRoot)) {
  if (/^ars-[a-z0-9-]+$/.test(entry)) rmSync(join(outputRoot, entry), { recursive: true, force: true });
}
let count = 0;
for (const file of files) {
  const raw = readFileSync(join(sourceDir, file), 'utf8');
  const fm = readFrontmatter(raw);
  if (!fm?.name) {
    console.warn(`skip (no frontmatter): ${file}`);
    continue;
  }
  const name = fm.name;
  const description = fm.description ?? '';
  let body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').trim();
  const trigger = body.match(/Trigger the `([a-z0-9-]+)`/);
  if (trigger) {
    body =
      `The user invoked \`/${name}\` (port of the Claude Code slash command). ` +
      `First call the \`skill\` tool with name \`${trigger[1]}\` to load that skill ` +
      '(unless it is already loaded in this session), then execute the mode it specifies:\n\n' +
      body;
  }
  const content =
    `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n` +
    `disable-model-invocation: true\nuser-invocable: true\n---\n\n${body}\n\n` +
    'Note: this command was ported from the ARS Claude Code plugin ' +
    '(Imbad0202/academic-research-skills, CC-BY-NC-4.0). The deterministic ' +
    'tooling it references (scripts/*.py, MODE_REGISTRY.md, shared/) ships in ' +
    'the upstream repo — clone it alongside this plugin if you need script-based ' +
    'features such as the citation verification gate.\n';
  mkdirSync(join(outputRoot, name), { recursive: true });
  writeFileSync(join(outputRoot, name, 'SKILL.md'), content, 'utf8');
  count += 1;
  console.log(`wrapper: ${name}`);
}
console.log(`regenerated ${count} wrappers into ${outputRoot}`);
