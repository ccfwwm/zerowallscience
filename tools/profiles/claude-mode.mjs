import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const startMarker = '    # BEGIN GENERATED CLAUDE MODE PRESET'
const endMarker = '    # END GENERATED CLAUDE MODE PRESET'

/** Build a Claude CLI preset; the CLI owns tools while ZeroWall projects Skills and MCP separately. */
export function renderClaudeModePatch(standardPatch) {
  if (!standardPatch.includes('id: preset-standard') || !standardPatch.includes("name: '@deepseek-ai/dsh-agent-preset'")) {
    throw new Error('Standard agent preset patch has no DSH preset declaration')
  }
  return `${startMarker}
    - id: preset-claude
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: claude
        name: Claude Code
        description: "使用应用独立管理的 Claude Code CLI；复用当前模型凭据，并同步已启用的 Skills、MCP 与环境变量。"
        order: 4
        plugins:
          - id: persona
            name: '@deepseek-ai/dsh-persona'
            config:
              prefix: You are Claude Code, powered by the selected {{model}} model. Use your native tools, enabled Skills, and configured MCP servers to complete the request in the current workspace.
          - id: agent-instructions
            name: '@deepseek-ai/dsh-agent-instructions'
            config:
              maxBytes: 65536
          - id: time-context
            name: '@deepseek-ai/dsh-time-context'
${endMarker}`
}

/** Register Claude mode only while the Claude plugin's bundle patch is active. */
export async function syncClaudeModePatch(root, check = false) {
  const standardPatch = await readFile(join(root, 'deepseek-harness/packages/bundle/web-app/presets/standard.patch.yml'), 'utf8')
  const rendered = renderClaudeModePatch(standardPatch)
  const patchPath = join(root, 'plugins/claude-code/dsh.bundle.patch.yml')
  const current = await readFile(patchPath, 'utf8')
  if ((current.match(/- insert:/gu) ?? []).length !== 1) throw new Error('Claude plugin patch must contain one insert block')
  if ((current.match(/id: zerowall-claude-code/gu) ?? []).length !== 1) throw new Error('Claude plugin patch must declare its Host plugin exactly once')
  const start = current.indexOf(startMarker)
  const end = current.indexOf(endMarker)
  if ((start < 0) !== (end < 0) || (start >= 0 && (end < start || current.indexOf(startMarker, start + startMarker.length) >= 0
    || current.indexOf(endMarker, end + endMarker.length) >= 0))) {
    throw new Error('Claude plugin patch has an invalid generated mode section')
  }
  const withoutGenerated = start < 0 ? current : `${current.slice(0, start)}${current.slice(end + endMarker.length)}`
  const next = `${withoutGenerated.trimEnd()}\n${rendered}\n`

  if (check) {
    if (current !== next) throw new Error(`Generated Claude plugin mode is stale: ${patchPath}`)
  } else if (current !== next) {
    await writeFile(patchPath, next)
  }
}
