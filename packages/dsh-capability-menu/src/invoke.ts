/**
 * Model-facing `meta_invoke` tool: unified execution/loading of capabilities.
 *
 * @module @daweifu/capability-menu (invoke plugin)
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { isModelInvocable, renderSkillContent, type SkillResourceBase } from '@deepseek-ai/dsh-skill'
import { MCP_ID_PREFIX } from './registry.ts'

export const name = 'capability-menu-invoke'
export const inject = ['capability', 'capabilityPolicy', 'tools', 'skills']

/** Forwarding mode for the MCP branch. */
export type MetaForwardMode = 'direct' | 'resolve'

/** Model-facing `meta_invoke` configuration. */
export interface Config {
  /** How to forward MCP calls: `direct` executes via the tool pipeline; `resolve` returns the schema for the model to call directly. */
  forwardMode?: MetaForwardMode
}

/** Validate and default the tool configuration. */
export const Config: z<Config> = z.object({
  forwardMode: z.union(['direct', 'resolve']).default('direct'),
})

/** Canonical MCP result shape. */
export interface MetaInvokeMcpDetail {
  readonly forwarded: true
  readonly target: string
  readonly content: ContentBlock[]
}

/** Canonical skill result shape (matches the `skill` tool output). */
export interface MetaInvokeSkillDetail {
  readonly name: string
  readonly provider: string
  readonly resourceBase?: SkillResourceBase
  readonly content: string
}

/** Canonical resolve-mode result shape (forwardMode: 'resolve'). */
export interface MetaInvokeResolveDetail {
  readonly target: string
  readonly kind: string
  readonly name: string
  readonly description: string
  readonly parameters: unknown
}

/** Discriminated canonical result. */
export type MetaInvokeResult =
  | { ok: true; kind: 'mcp'; id: string; detail: MetaInvokeMcpDetail }
  | { ok: true; kind: 'skill'; id: string; detail: MetaInvokeSkillDetail }
  | { ok: true; kind: 'resolve'; id: string; detail: MetaInvokeResolveDetail }

/**
 * Register the `meta_invoke` tool.
 *
 * Dispatch is by the explicit `kind` argument (no id-prefix parsing).
 *
 * - Tools (`kind: 'tool'`, e.g. `mcp__gongfeng__create_issue` or a harness-native
 *   tool such as `bash`): forwards to the underlying tool call via the official
 *   `ctx.tools.execute` pipeline, preserving `agent`/`signal`/parent lineage.
 *   `forwardMode: 'resolve'` instead returns the target schema so the model can
 *   call the tool directly.
 * - Skills (`kind: 'skill'`, id is the bare skill name): loads the full skill
 *   instructions and returns them as `<skill_content>` — no args, no script
 *   execution (matches the existing `skill` tool semantics).
 */
export function apply(ctx: Context, config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'meta_enable',
    description: 'Enable up to 8 discovered tools or load a selected skill in this session. Enabled tools become directly callable. Existing approvals still apply.',
    parameters: {
      tools: { type: 'array', items: { type: 'string' } },
      skill: { type: 'string' },
      enabled: { type: 'boolean' },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args: { tools?: string[]; skill?: string; enabled?: boolean }, exec) {
      if (exec.agent === undefined) throw new Error('A session is required.')
      if (args.skill !== undefined) {
        if (args.tools?.length) throw new Error('Choose tools or one skill per request.')
        return await tool.execute({ id: args.skill, kind: 'skill' }, exec) as Record<string, JsonValue>
      }
      return ctx.capabilityPolicy.selectTools(exec.agent, args.tools ?? [], args.enabled ?? true)
    },
  }))
  const forwardMode = config.forwardMode ?? 'direct'
  if (forwardMode !== 'direct' && forwardMode !== 'resolve') {
    throw new Error(`forwardMode must be "direct" or "resolve", received "${String(forwardMode)}"`)
  }

  // Per-session dedup for loaded skills. Re-loading an already-injected skill
  // only returns a short reminder instead of re-injecting the full
  // instructions, saving tokens (mirrors synapse's `_loaded_skills`). Keyed by
  // the agent object so two sessions in the same process never share state; a
  // WeakMap lets entries be collected with the agent. Without an agent context
  // (headless dispatch) nothing is cached.
  const loadedSkills = new WeakMap<object, Set<string>>()

  const tool = defineTool({
    name: 'meta_invoke',
    description: 'Execute a capability by its exact id (from meta_search) and kind. For tools (kind "tool", e.g. mcp__gongfeng__create_issue or a native tool such as bash), forwards to the underlying tool call with args. For skills (kind "skill", e.g. frontend-design), loads the full skill instructions and returns them as <skill_content> — no args needed. Always pass the same kind the search result reported.',
    parameters: {
      id: { type: 'string', required: true, description: 'Capability id from meta_search, e.g. mcp__gongfeng__create_issue or frontend-design.' },
      kind: { type: 'string', enum: ['tool', 'skill'], required: true, description: 'Capability kind reported by meta_search for this id.' },
      args: { type: 'json', description: 'Arguments forwarded to a tool; ignored for skills.' },
    },
    output: {
      schema: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              ok: { type: 'boolean', required: true, const: true },
              kind: { type: 'string', required: true, const: 'mcp' },
              id: { type: 'string', required: true },
              detail: {
                type: 'object',
                required: true,
                additionalProperties: false,
                properties: {
                  forwarded: { type: 'boolean', required: true, const: true },
                  target: { type: 'string', required: true },
                  content: { type: 'array', required: true, items: { type: 'json' } },
                },
              },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              ok: { type: 'boolean', required: true, const: true },
              kind: { type: 'string', required: true, const: 'skill' },
              id: { type: 'string', required: true },
              detail: {
                type: 'object',
                required: true,
                additionalProperties: false,
                properties: {
                  name: { type: 'string', required: true },
                  provider: { type: 'string', required: true },
                  resourceBase: { type: 'json' },
                  content: { type: 'string', required: true },
                },
              },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              ok: { type: 'boolean', required: true, const: true },
              kind: { type: 'string', required: true, const: 'resolve' },
              id: { type: 'string', required: true },
              detail: {
                type: 'object',
                required: true,
                additionalProperties: false,
                properties: {
                  target: { type: 'string', required: true },
                  kind: { type: 'string', required: true },
                  name: { type: 'string', required: true },
                  description: { type: 'string', required: true },
                  parameters: { type: 'json', required: true },
                },
              },
            },
          },
        ],
      },
      render: (_args, value) => {
        const result = value as MetaInvokeResult
        if (result.ok && result.kind === 'skill') {
          return [{ type: 'text', text: renderSkillContent(result.detail as unknown as MetaInvokeSkillDetail) }]
        }
        return [{ type: 'text', text: JSON.stringify(value) }]
      },
    },
    async execute(args: { id: string; kind: 'tool' | 'skill'; args?: unknown }, exec: ToolRunContext) {
      const id = args.id.trim()
      const kind = args.kind
      if (kind !== 'tool' && kind !== 'skill') {
        throw new Error('meta_invoke: kind must be "tool" or "skill" (the kind meta_search reported for this id)')
      }
      const capability = ctx.capability.get(id, kind)
      if (capability === undefined) {
        throw new Error(`meta_invoke: no ${kind} capability "${id}" is available`)
      }
      // Disabled capabilities are a hard deny at the execution surface: the
      // registry keeps them indexed so the management UI can list them, but the
      // model can never reach a disabled capability through meta_invoke.
      const policy = ctx.get('capabilityPolicy')
      if (policy?.classifyFor(id, kind, exec.agent) === 'disabled') {
        throw new Error(`meta_invoke: ${kind} capability "${id}" is disabled and cannot be invoked`)
      }

      // Tool: forward to the underlying tool execution (an MCP server call or a
      // harness-native tool cataloged under the built-in server) — or resolve its
      // schema.
      if (capability.kind === 'tool') {
        if (exec.agent === undefined) throw new Error('A session is required to invoke a tool.')
        ctx.capabilityPolicy.selectTools(exec.agent, [capability.name])
        // Resolve the definition on the GLOBAL view (no agent scope) so a
        // tool hidden from the caller's exposure (On-demand) is still addressable.
        // Native tools cataloged from a preset standing scope live on the agent
        // plane and are invisible to the global view; for those, fall back to the
        // caller's own view (the agent joining the preset standing mount).
        const native = !capability.name.startsWith(MCP_ID_PREFIX)
        let definition = ctx.tools.get(capability.name)
        const nativeCallerView = native && definition === undefined ? exec.agent : undefined
        if (definition === undefined && nativeCallerView !== undefined) {
          definition = ctx.tools.get(capability.name, nativeCallerView)
        }
        if (definition === undefined) {
          throw new Error(`meta_invoke: tool "${capability.name}" is not available`)
        }
        if (forwardMode === 'resolve') {
          return {
            ok: true,
            kind: 'resolve' as const,
            id,
            detail: {
              target: capability.name,
              kind: 'tool' as const,
              name: definition.name,
              description: definition.description,
              parameters: definition.parameters as unknown as JsonValue,
            },
          }
        }
        // Nested execution through the official pipeline. The parent token marks
        // this as a transport sub-dispatch so code-mode collapse rules treat it
        // like a nested SDK call, and `tools/result` observers can attribute the
        // outcome to the target capability.
        const result = await ctx.tools.execute({
          callId: ToolCallId(`${exec.callId}:meta:${id}`),
          name: capability.name,
          arguments: args.args,
          signal: exec.signal,
          parent: exec.token,
          agent: exec.agent,
          rootCallId: exec.rootCallId ?? exec.callId,
        })
        if (result.isError) {
          const message = result.content.map(block => block.type === 'text' ? block.text : `[${block.type} content]`).join('\n')
          throw new Error(message || `meta_invoke: ${capability.name} failed`)
        }
        return {
          ok: true,
          kind: 'mcp' as const,
          id,
          detail: {
            forwarded: true,
            target: capability.name,
            content: result.content as unknown as JsonValue[],
          },
        }
      }

      // Skill: load the full instructions.
      if (capability.kind === 'skill') {
        const name = capability.name

        // Per-session loaded set (see the WeakMap above); undefined when there
        // is no agent context, in which case nothing is deduped.
        const agent = exec.agent
        let sessionSkills: Set<string> | undefined
        if (agent !== undefined) {
          sessionSkills = loadedSkills.get(agent.session)
          if (sessionSkills === undefined) {
            sessionSkills = new Set<string>()
            loadedSkills.set(agent.session, sessionSkills)
          }
          const live = new Set(agent.session.surface?.nodes ?? [])
          const opening = renderSkillContent({ name, provider: capability.origin.provider, content: '' }).split('\n')[0]!
          for (const event of agent.session.snapshotEvents()) {
            if (event.type !== 'tool/result' || !live.has(event.seq)) continue
            for (const block of event.data.message.content.filter(result => !result.isError).flatMap(result => result.content)) {
              if (block.type !== 'text') continue
              if (block.text.startsWith(opening) && !block.text.includes('is already loaded in this conversation')) sessionSkills.add(name)
              try {
                const parsed = JSON.parse(block.text)
                if (parsed?.ok === true && parsed.kind === 'skill' && parsed.detail?.name === name && typeof parsed.detail.content === 'string'
                  && !parsed.detail.content.includes('is already loaded in this conversation')) sessionSkills.add(name)
              } catch { /* Plain text skill results are handled above. */ }
            }
          }
        }

        // Already loaded this session → return a short reminder, no re-injection.
        if (sessionSkills?.has(name) === true) {
          return {
            ok: true,
            kind: 'skill' as const,
            id,
            detail: {
              name,
              provider: capability.origin.provider,
              content: `Skill "${name}" is already loaded in this conversation. Read the <skill_content> above and follow it.`,
            },
          }
        }

        const lookup = {
          cwd: exec.agent?.session.header.cwd,
          signal: exec.signal,
          scope: exec.agent,
        }
        const skill = await ctx.skills.get(name, lookup).catch(() => undefined)
        if (skill === undefined) {
          throw new Error(`meta_invoke: skill "${name}" is unknown or no longer available`)
        }
        if (!isModelInvocable(skill)) {
          throw new Error(`meta_invoke: skill "${name}" is not available for model invocation`)
        }
        sessionSkills?.add(name)
        return {
          ok: true,
          kind: 'skill' as const,
          id,
          detail: {
            name: skill.name,
            provider: skill.provider,
            ...skill.resourceBase !== undefined ? { resourceBase: { ...skill.resourceBase } } : {},
            content: skill.content,
          },
        }
      }

      throw new Error(`meta_invoke: capability id "${id}" has an unrecognized kind`)
    },
    presentCall(args) {
      return {
        card: 'generic',
        title: `Execute capability ${args.id}`,
        kind: args.kind === 'skill' ? 'read' : 'other',
        rawInput: args.id,
      }
    },
  })

  ctx.tools.register(tool)
}

