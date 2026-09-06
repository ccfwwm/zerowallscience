/**
 * Model-facing `meta_search` tool: capability catalog search + detail.
 *
 * @module @daweifu/capability-menu (search plugin)
 */
import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
export const name = 'capability-menu-search';
export const inject = ['capability', 'tools', 'skills'];
/** Validate and default the tool configuration. */
export const Config = z.object({
    maxResults: z.number().default(20),
});
/**
 * Register the `meta_search` tool.
 *
 * - Mode A (list, default): query by keyword/tag/server, returns id + short summary.
 * - Mode B (detail): pass an exact id (optionally `detail: true`) to get the full schema.
 *
 * Validation rules enforced here:
 * - `query` and `id` are mutually exclusive.
 * - `detail: true` with a fuzzy query (no exact id) is rejected.
 */
export function apply(ctx, config = {}) {
    const maxResults = config.maxResults ?? 20;
    if (!Number.isInteger(maxResults) || maxResults < 1) {
        throw new Error('maxResults must be a positive integer');
    }
    const tool = defineTool({
        name: 'meta_search',
        description: 'Search tools and skills by keyword, category or server. Returns bounded summaries or details for one exact id. Use meta_enable to enable selected tools or load one skill.',
        parameters: {
            query: { type: 'string', description: 'Natural-language or keyword query; mutually exclusive with id.' },
            id: { type: 'string', description: 'Exact capability id (from a previous search results[].id); mutually exclusive with query, takes precedence.' },
            detail: { type: 'boolean', description: 'When true, returns the single capability full schema; only meaningful with an exact id.' },
            kind: { type: 'string', enum: ['tool', 'skill', 'all'], description: 'Filter by capability kind (default all).' },
            server: { type: 'string', description: 'Filter by server name — an MCP server (gongfeng/iwiki/km/zhiyan_qci) or the reserved built-in pseudo-server grouping harness-native tools.' },
            tag: { type: 'string', description: 'Filter by tag.' },
            max_results: { type: 'integer', description: 'Maximum results (default and maximum 12).' },
            auto_enable: { type: 'boolean', description: 'Automatically enable matching read-only tools for this session (default true).' },
        },
        output: {
            schema: {
                oneOf: [
                    {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            mode: { type: 'string', required: true, const: 'list' },
                            total: { type: 'integer', required: true },
                            results: { type: 'array', required: true, items: { type: 'json' } },
                            hint: { type: 'string', required: true },
                        },
                    },
                    {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            mode: { type: 'string', required: true, const: 'detail' },
                            result: { type: 'json', required: true },
                        },
                    },
                ],
            },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        async execute(args, exec) {
            const query = args.query?.trim() ?? '';
            const id = args.id?.trim() ?? '';
            const detail = args.detail === true;
            const kind = args.kind ?? 'all';
            const server = args.server?.trim() || undefined;
            const tag = args.tag?.trim() || undefined;
            const requestedMax = args.max_results;
            const autoEnable = args.auto_enable !== false;
            if (query.length > 0 && id.length > 0) {
                throw new Error('meta_search: query and id are mutually exclusive; pass exactly one');
            }
            if (detail && id.length === 0) {
                throw new Error('meta_search: detail:true requires an exact id; pass id to get the full schema of one capability');
            }
            const scope = exec.agent;
            const context = {
                cwd: exec.agent?.session.header.cwd,
                signal: exec.signal,
                scope,
            };
            // Disabled capabilities are not discoverable: the registry keeps them
            // indexed for the management surface, but meta_search never surfaces
            // them to the model.
            const policy = ctx.get('capabilityPolicy');
            const isDisabled = (capId, capKind) => policy?.classifyFor(capId, capKind, exec.agent) === 'disabled';
            // The kind filter doubles as a disambiguator for exact-id lookups.
            const kindArg = kind === 'all' || kind === undefined ? undefined : kind;
            if (id.length > 0) {
                const resolved = ctx.capability.get(id, kindArg);
                if (resolved === undefined) {
                    throw new Error(`meta_search: capability "${id}" is unknown, unavailable, or ambiguous — pass kind: "tool" | "skill" when both exist`);
                }
                if (isDisabled(id, resolved.kind)) {
                    throw new Error(`meta_search: capability "${id}" is disabled and cannot be inspected`);
                }
                const result = await ctx.capability.getDetail(id, resolved.kind, context);
                if (result === undefined) {
                    throw new Error(`meta_search: capability "${id}" is unknown or no longer available`);
                }
                const bounded = { ...result, description: result.description.slice(0, 900) };
                if (JSON.stringify(bounded).length > 12_000) {
                    return { mode: 'detail', result: { id: result.id, kind: result.kind, name: result.name, description: bounded.description, parameters: Object.keys(result.parameters).slice(0, 40), truncated: true, hint: 'Enable this capability to receive its schema within the session budget.' } };
                }
                return { mode: 'detail', result: bounded };
            }
            const results = ctx.capability.search({
                query,
                kind,
                server,
                tag,
                maxResults: Math.max(1, Math.min(Number.isFinite(requestedMax) ? requestedMax : maxResults, 12)),
                scope,
            });
            const summaries = [];
            const autoEnabled = [];
            for (const result of results) {
                const disabled = isDisabled(result.id, result.kind);
                const readOnly = result.kind === 'tool' && /(?:^|[_:-])(read|get|list|search|find|describe|catalog|status|metadata|info|preview|validate)(?:$|[_:-])/i.test(result.name);
                if (autoEnable && readOnly && !disabled && exec.agent !== undefined && result.kind === 'tool') {
                    try {
                        ctx.get('capabilityPolicy')?.selectTools(exec.agent, [result.id], true);
                        autoEnabled.push(result.id);
                    }
                    catch { /* execution approval remains authoritative */ }
                }
                const summary = { id: result.id, kind: result.kind, name: result.name, ...(result.server === undefined ? {} : { server: result.server }), summary: result.summary.slice(0, 350), status: disabled ? 'disabled' : autoEnabled.includes(result.id) ? 'enabled' : 'available', ...(disabled ? { hint: 'Restore defaults or enable this capability in Capability Management before use.' } : {}) };
                if (JSON.stringify([...summaries, summary]).length > 10_000)
                    continue;
                summaries.push(summary);
            }
            return {
                mode: 'list',
                total: summaries.length,
                results: summaries,
                hint: autoEnabled.length > 0 ? `Read-only tools auto-enabled: ${autoEnabled.join(', ')}. Use meta_enable for other selected tools or skills.` : 'Use meta_enable to enable selected tools or load one skill.',
            };
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: args.id !== undefined ? `Inspect capability ${args.id}` : `Search capabilities${args.query ? `: ${args.query}` : ''}`,
                kind: 'read',
                rawInput: args.id ?? args.query ?? '',
            };
        },
    });
    ctx.tools.register(tool);
}
//# sourceMappingURL=search.js.map