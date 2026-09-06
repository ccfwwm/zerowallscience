export const ON_DEMAND_SERVERS = ['rmcp', 'zerowall_managed_bio_tools'];
export function defaultTier(name, kind) {
    if (kind === 'skill')
        return name === 'genui' ? 'resident' : 'on-demand';
    return ON_DEMAND_SERVERS.some(server => name.startsWith(`mcp__${server}__`)) ? 'on-demand' : 'resident';
}
export function isManagedBulkRule(rule) {
    return ON_DEMAND_SERVERS.some(server => [`server:${server}`, `server:${server}:*`, `mcp__${server}__*`].includes(rule));
}
/** Return the shipped ZeroWall default classification while preserving user single-tool disables. */
export function defaultConfig(config = {}) {
    return {
        ...config,
        tools: {
            resident: ['*'],
            'on-demand': ON_DEMAND_SERVERS.map(server => `server:${server}`),
            disabled: config.tools?.disabled?.filter(rule => !isManagedBulkRule(rule)) ?? [],
        },
        skills: { resident: ['genui'], 'on-demand': ['*'], disabled: config.skills?.disabled ?? [] },
    };
}
//# sourceMappingURL=defaults.js.map