/**
 * lit-harvest — shared types.
 *
 * Everything the tools exchange is plain JSON (tool outputs must be
 * JSON-serializable and schema-valid). No LLM anywhere: sufficiency
 * judgment is deterministic (quota + subtopic coverage audit).
 */
/**
 * Recursively drop `undefined` values so every tool output/arg is lossless
 * JSON (the host validates against this). `null` is kept.
 */
export function sanitizeJson(value) {
    if (Array.isArray(value)) {
        return value.map((v) => sanitizeJson(v));
    }
    if (value !== null && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (v === undefined)
                continue;
            out[k] = sanitizeJson(v);
        }
        return out;
    }
    return value;
}
