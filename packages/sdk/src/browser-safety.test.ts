import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The SDK is reachable from the browser bundle — `apps/desktop/src/lib/runtime.ts`
 * imports it dynamically and the barrel below re-exports every module — so a
 * Node built-in imported at module scope ends up in rollup's graph, resolves to
 * `__vite-browser-external`, and breaks `pnpm build` outright.
 *
 * Nothing else catches this: vitest and tsc both run under Node, where such an
 * import is perfectly valid. The tree once had 970 green tests and 0 type
 * errors while the production build could not complete at all.
 *
 * Deferring the import to call time (`await import("fs/promises")`) keeps it
 * out of the graph and is the pattern the pack manager uses for real file I/O.
 */

const SRC = join(__dirname);

/** Node built-ins that have no browser implementation. */
const NODE_BUILTINS = [
  "crypto",
  "fs",
  "fs/promises",
  "path",
  "os",
  "child_process",
  "http",
  "https",
  "net",
  "stream",
  "zlib",
  "worker_threads",
];

/** Modules that are Node-only by design and never reach the browser bundle. */
const NODE_ONLY_FILES = new Set([
  // A test double that runs an HTTP server; imported only by tests.
  "mockServer.ts",
]);

const sourceFiles = () =>
  readdirSync(SRC)
    .filter((name) => name.endsWith(".ts"))
    .filter((name) => !name.endsWith(".test.ts") && !name.endsWith(".d.ts"))
    .filter((name) => !NODE_ONLY_FILES.has(name));

/** Static `import ... from "x"` specifiers — dynamic `import("x")` is fine. */
function staticImports(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /^\s*import\s(?:[^'"]*?\sfrom\s)?['"]([^'"]+)['"]/gm;
  for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  return specifiers;
}

describe("browser-bundle safety", () => {
  it("keeps Node built-ins out of every statically imported SDK module", () => {
    const offenders: string[] = [];
    for (const name of sourceFiles()) {
      const source = readFileSync(join(SRC, name), "utf-8");
      for (const specifier of staticImports(source)) {
        const bare = specifier.replace(/^node:/, "");
        if (NODE_BUILTINS.includes(bare)) offenders.push(`${name} imports "${specifier}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("still allows the deferred form the pack manager relies on", () => {
    const source = readFileSync(join(SRC, "pack-manager.ts"), "utf-8");
    // Proves the rule above is not satisfied by simply having no file I/O.
    expect(source).toContain('await import("fs/promises")');
    expect(staticImports(source)).not.toContain("fs/promises");
  });
});
