import { defineConfig } from 'tsdown'

const id = '@daweifu/capability-menu'

const clientConfig = defineConfig({
  entry: { client: 'src/client/index.ts' },
  format: ['cjs'],
  outDir: 'lib',
  // The server half (tsc) emits into the same `lib` dir; never wipe it.
  clean: false,
  platform: 'node',
  sourcemap: false,
  // Keep the file name the package.json `exports` refer to: the browser
  // bundle is served from `./client` → `lib/client.js`. tsdown emits
  // `.cjs`/`.mjs` by default; force `.js`.
  outExtensions: () => ({ js: '.js' }),
  // The dsh client module system injects these via the factory `require`:
  // never bundle them, keep them as external `require("...")` calls.
  external: [
    'react',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    // NOTE: `zod` is deliberately NOT external — the real client bundles (e.g.
    // @deepseek-ai/dsh-api-remotes) inline it, and it is not a platform seed
    // word, so an external `require("zod")` would miss the module table.
    /^@deepseek-ai\//,
  ],
  // The dsh ModuleLoader invokes the factory with only `require` — the bundle
  // must declare its own CommonJS locals, mirroring every official client
  // bundle (`var module = { exports: {} }; var exports = module.exports;`),
  // and return `module.exports` so the loader captures the module table.
  banner: (ctx) => `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {\nvar module = { exports: {} };\nvar exports = module.exports;\n`,
  footer: () => `\nreturn module.exports;\n}});`,
})

// The Host remote assembly imports this descriptor as a normal ESM module.
// Keep it as a separate entry so the browser bundle's ModuleLoader wrapper is
// never applied to the Typert contribution.
const remoteConfig = defineConfig({
  entry: { 'typert.remote-client': 'src/client/remote.ts' },
  format: ['esm'],
  outDir: 'lib',
  clean: false,
  platform: 'node',
  sourcemap: false,
  outExtensions: () => ({ js: '.js' }),
  external: [/^@deepseek-ai\//],
})

export default [clientConfig, remoteConfig]
