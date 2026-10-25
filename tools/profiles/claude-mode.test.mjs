import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { renderClaudeModePatch } from './claude-mode.mjs'

const standardPatch = await readFile(new URL('../../deepseek-harness/packages/bundle/web-app/presets/standard.patch.yml', import.meta.url), 'utf8')

test('Claude mode delegates tools to the isolated CLI and declares the selected runtime resources', () => {
  const rendered = renderClaudeModePatch(standardPatch)
  assert.match(rendered, /^    # BEGIN GENERATED CLAUDE MODE PRESET\n/u)
  assert.match(rendered, /id: preset-claude/u)
  assert.match(rendered, /id: claude\n\s+name: Claude Code/u)
  assert.match(rendered, /independent|独立管理的 Claude Code CLI/u)
  assert.match(rendered, /selected \{\{model\}\} model/u)
  assert.match(rendered, /id: agent-instructions/u)
  assert.match(rendered, /id: time-context/u)
  assert.doesNotMatch(rendered, /id: tool-(?:bash|pwsh|fs|web|subagent)/u)
})

test('Claude mode generation refuses an incompatible DSH Standard patch', () => {
  assert.throws(() => renderClaudeModePatch('no standard preset'), /no DSH preset declaration/u)
})
