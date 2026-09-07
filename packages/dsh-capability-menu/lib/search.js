/**
 * Model-facing `capability_search` tool: capability catalog search + detail.
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
 * Register the `capability_search` tool.
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
        name: 'capability_search',
        description: 'Search tools and skills by keyword, category, or server. Returns bounded summaries by default and the input schema only for one exact id. Execute an exact result with capability_execute.',
        parameters: {
            query: { type: 'string', description: 'Natural-language or keyword query; mutually exclusive with id.' },
            id: { type: 'string', description: 'Exact capability id (from a previous search results[].id); mutually exclusive with query, takes precedence.' },
            detail: { type: 'boolean', description: 'When true, returns the single capability full schema; only meaningful with an exact id.' },
            kind: { type: 'string', enum: ['tool', 'skill', 'all'], description: 'Filter by capability kind (default all).' },
            server: { type: 'string', description: 'Filter by server name — an MCP server (gongfeng/iwiki/km/zhiyan_qci) or the reserved built-in pseudo-server grouping harness-native tools.' },
            tag: { type: 'string', description: 'Filter by tag.' },
            max_results: { type: 'integer', description: 'Maximum results (default and maximum 12).' },
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
            const kind = args.kind ?? 'all';
            const server = args.server?.trim() || undefined;
            const tag = args.tag?.trim() || undefined;
            const requestedMax = args.max_results;
            if (query.length > 0 && id.length > 0) {
                throw new Error('capability_search: query and id are mutually exclusive; pass exactly one');
            }
            // Models often attach `detail: true` to a keyword search while looking
            // for a capability. Treat that as list mode; full detail is only
            // selected when an exact result id is supplied. This keeps discovery
            // single-hop and avoids turning a harmless search into a tool error.
            const scope = exec.agent;
            const context = {
                cwd: exec.agent?.session.header.cwd,
                signal: exec.signal,
                scope,
            };
            // Disabled capabilities are not discoverable: the registry keeps them
            // indexed for the management surface, but capability_search never surfaces
            // them to the model.
            const policy = ctx.get('capabilityPolicy');
            const isDisabled = (capId, capKind) => policy?.classifyFor(capId, capKind, exec.agent) === 'disabled';
            // The kind filter doubles as a disambiguator for exact-id lookups.
            const kindArg = kind === 'all' || kind === undefined ? undefined : kind;
            if (id.length > 0) {
                const resolved = ctx.capability.get(id, kindArg);
                if (resolved === undefined) {
                    const compact = ctx.get('zerowallMcp');
                    if (compact !== undefined && kindArg !== 'skill') {
                        const [remote] = await compact.searchCompactCapabilities('', id, 1, exec);
                        if (remote !== undefined) {
                            return {
                                mode: 'detail',
                                result: {
                                    id: remote.id,
                                    kind: 'tool',
                                    actions: ['execute'],
                                    name: remote.id,
                                    description: remote.summary.slice(0, 900),
                                    origin: { provider: remote.backend, serverName: remote.backend },
                                    parameters: remote.inputSchema ?? {},
                                    invocation: { modelInvocable: true, userInvocable: false },
                                    tags: [remote.backend, remote.publicTool, 'internal'],
                                    summary: remote.summary.slice(0, 350),
                                },
                            };
                        }
                    }
                    throw new Error(`capability_search: capability "${id}" is unknown, unavailable, or ambiguous — pass kind: "tool" | "skill" when both exist`);
                }
                if (isDisabled(id, resolved.kind)) {
                    throw new Error(`capability_search: capability "${id}" is disabled and cannot be inspected`);
                }
                const result = await ctx.capability.getDetail(id, resolved.kind, context);
                if (result === undefined) {
                    throw new Error(`capability_search: capability "${id}" is unknown or no longer available`);
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
            for (const result of results) {
                const disabled = isDisabled(result.id, result.kind);
                if (disabled)
                    continue;
                const summary = { id: result.id, kind: result.kind, name: result.name, ...(result.server === undefined ? {} : { server: result.server }), summary: result.summary.slice(0, 350), status: 'available' };
                if (JSON.stringify([...summaries, summary]).length > 10_000)
                    continue;
                summaries.push(summary);
            }
            const compact = ctx.get('zerowallMcp');
            if (compact !== undefined && kind !== 'skill' && summaries.length < 12) {
                const remote = await compact.searchCompactCapabilities(query, undefined, 12 - summaries.length, exec);
                const seen = new Set(summaries.map(item => typeof item === 'object' && item !== null && !Array.isArray(item) ? item.id : undefined));
                for (const result of remote) {
                    if (seen.has(result.id))
                        continue;
                    summaries.push({ id: result.id, kind: 'tool', name: result.id, server: result.backend, summary: result.summary.slice(0, 350), status: 'available' });
                    seen.add(result.id);
                }
            }
            return {
                mode: 'list',
                total: summaries.length,
                results: summaries,
                hint: 'Use capability_execute with one exact result id and the reported kind.',
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