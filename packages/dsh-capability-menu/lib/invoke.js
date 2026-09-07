/**
 * Model-facing `capability_execute` tool: unified execution/loading of capabilities.
 *
 * @module @daweifu/capability-menu (invoke plugin)
 */
import z from '@deepseek-ai/schemastery';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { isModelInvocable, renderSkillContent } from '@deepseek-ai/dsh-skill';
import { MCP_ID_PREFIX } from "./registry.js";
export const name = 'capability-menu-invoke';
export const inject = ['capability', 'capabilityPolicy', 'tools', 'skills'];
/** Validate and default the tool configuration. */
export const Config = z.object({
    forwardMode: z.union(['direct', 'resolve']).default('direct'),
});
/**
 * Register the `capability_execute` tool.
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
export function apply(ctx, config = {}) {
    const forwardMode = config.forwardMode ?? 'direct';
    if (forwardMode !== 'direct' && forwardMode !== 'resolve') {
        throw new Error(`forwardMode must be "direct" or "resolve", received "${String(forwardMode)}"`);
    }
    // Per-session dedup for loaded skills. Re-loading an already-injected skill
    // only returns a short reminder instead of re-injecting the full
    // instructions, saving tokens (mirrors synapse's `_loaded_skills`). Keyed by
    // the agent object so two sessions in the same process never share state; a
    // WeakMap lets entries be collected with the agent. Without an agent context
    // (headless dispatch) nothing is cached.
    const loadedSkills = new WeakMap();
    const tool = defineTool({
        name: 'capability_execute',
        description: 'Execute a capability by its exact id (from capability_search) and kind. For tools (kind "tool", e.g. mcp__gongfeng__create_issue or a native tool such as bash), forwards to the underlying tool call with args. For skills (kind "skill", e.g. frontend-design), loads the full skill instructions and returns them as <skill_content> — no args needed. Always pass the same kind the search result reported.',
        parameters: {
            id: { type: 'string', required: true, description: 'Capability id from capability_search, e.g. mcp__gongfeng__create_issue or frontend-design.' },
            kind: { type: 'string', enum: ['tool', 'skill'], required: true, description: 'Capability kind reported by capability_search for this id.' },
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
                const result = value;
                if (result.ok && result.kind === 'skill') {
                    return [{ type: 'text', text: renderSkillContent(result.detail) }];
                }
                return [{ type: 'text', text: JSON.stringify(value) }];
            },
        },
        async execute(args, exec) {
            const id = args.id.trim();
            const kind = args.kind;
            if (kind !== 'tool' && kind !== 'skill') {
                throw new Error('capability_execute: kind must be "tool" or "skill" (the kind capability_search reported for this id)');
            }
            const capability = ctx.capability.get(id, kind);
            if (capability === undefined) {
                const compact = ctx.get('zerowallMcp');
                if (kind === 'tool' && compact !== undefined && /^(?:r|figureya|biomni|bio)\./u.test(id)) {
                    const result = await compact.executeCompactCapability(id, args.args, exec);
                    return {
                        ok: true,
                        kind: 'mcp',
                        id,
                        detail: { forwarded: true, target: result.target, content: result.content },
                    };
                }
                throw new Error(`capability_execute: no ${kind} capability "${id}" is available`);
            }
            // Disabled capabilities are a hard deny at the execution surface: the
            // registry keeps them indexed so the management UI can list them, but the
            // model can never reach a disabled capability through capability_execute.
            const policy = ctx.get('capabilityPolicy');
            if (policy?.classifyFor(id, kind, exec.agent) === 'disabled') {
                throw new Error(`capability_execute: ${kind} capability "${id}" is disabled and cannot be invoked`);
            }
            // Tool: forward to the underlying tool execution (an MCP server call or a
            // harness-native tool cataloged under the built-in server) — or resolve its
            // schema.
            if (capability.kind === 'tool') {
                if (exec.agent === undefined)
                    throw new Error('A session is required to invoke a tool.');
                ctx.capabilityPolicy.selectTools(exec.agent, [capability.name]);
                // Resolve the definition on the GLOBAL view (no agent scope) so a
                // tool hidden from the caller's exposure (On-demand) is still addressable.
                // Native tools cataloged from a preset standing scope live on the agent
                // plane and are invisible to the global view; for those, fall back to the
                // caller's own view (the agent joining the preset standing mount).
                const native = !capability.name.startsWith(MCP_ID_PREFIX);
                let definition = ctx.tools.get(capability.name);
                const nativeCallerView = native && definition === undefined ? exec.agent : undefined;
                if (definition === undefined && nativeCallerView !== undefined) {
                    definition = ctx.tools.get(capability.name, nativeCallerView);
                }
                if (definition === undefined) {
                    throw new Error(`capability_execute: tool "${capability.name}" is not available`);
                }
                if (forwardMode === 'resolve') {
                    return {
                        ok: true,
                        kind: 'resolve',
                        id,
                        detail: {
                            target: capability.name,
                            kind: 'tool',
                            name: definition.name,
                            description: definition.description,
                            parameters: definition.parameters,
                        },
                    };
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
                });
                if (result.isError) {
                    const message = result.content.map(block => block.type === 'text' ? block.text : `[${block.type} content]`).join('\n');
                    throw new Error(message || `capability_execute: ${capability.name} failed`);
                }
                return {
                    ok: true,
                    kind: 'mcp',
                    id,
                    detail: {
                        forwarded: true,
                        target: capability.name,
                        content: result.content,
                    },
                };
            }
            // Skill: load the full instructions.
            if (capability.kind === 'skill') {
                const name = capability.name;
                // Per-session loaded set (see the WeakMap above); undefined when there
                // is no agent context, in which case nothing is deduped.
                const agent = exec.agent;
                let sessionSkills;
                if (agent !== undefined) {
                    sessionSkills = loadedSkills.get(agent.session);
                    if (sessionSkills === undefined) {
                        sessionSkills = new Set();
                        loadedSkills.set(agent.session, sessionSkills);
                    }
                    const live = new Set(agent.session.surface?.nodes ?? []);
                    const opening = renderSkillContent({ name, provider: capability.origin.provider, content: '' }).split('\n')[0];
                    for (const event of agent.session.snapshotEvents()) {
                        if (event.type !== 'tool/result' || !live.has(event.seq))
                            continue;
                        for (const block of event.data.message.content.filter(result => !result.isError).flatMap(result => result.content)) {
                            if (block.type !== 'text')
                                continue;
                            if (block.text.startsWith(opening) && !block.text.includes('is already loaded in this conversation'))
                                sessionSkills.add(name);
                            try {
                                const parsed = JSON.parse(block.text);
                                if (parsed?.ok === true && parsed.kind === 'skill' && parsed.detail?.name === name && typeof parsed.detail.content === 'string'
                                    && !parsed.detail.content.includes('is already loaded in this conversation'))
                                    sessionSkills.add(name);
                            }
                            catch { /* Plain text skill results are handled above. */ }
                        }
                    }
                }
                // Already loaded this session → return a short reminder, no re-injection.
                if (sessionSkills?.has(name) === true) {
                    return {
                        ok: true,
                        kind: 'skill',
                        id,
                        detail: {
                            name,
                            provider: capability.origin.provider,
                            content: `Skill "${name}" is already loaded in this conversation. Read the <skill_content> above and follow it.`,
                        },
                    };
                }
                const lookup = {
                    cwd: exec.agent?.session.header.cwd,
                    signal: exec.signal,
                    scope: exec.agent,
                };
                const skill = await ctx.skills.get(name, lookup).catch(() => undefined);
                if (skill === undefined) {
                    throw new Error(`capability_execute: skill "${name}" is unknown or no longer available`);
                }
                if (!isModelInvocable(skill)) {
                    throw new Error(`capability_execute: skill "${name}" is not available for model invocation`);
                }
                sessionSkills?.add(name);
                return {
                    ok: true,
                    kind: 'skill',
                    id,
                    detail: {
                        name: skill.name,
                        provider: skill.provider,
                        ...skill.resourceBase !== undefined ? { resourceBase: { ...skill.resourceBase } } : {},
                        content: skill.content,
                    },
                };
            }
            throw new Error(`capability_execute: capability id "${id}" has an unrecognized kind`);
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: `Execute capability ${args.id}`,
                kind: args.kind === 'skill' ? 'read' : 'other',
                rawInput: args.id,
            };
        },
    });
    ctx.tools.register(tool);
}
//# sourceMappingURL=invoke.js.map