/**
 * tsdown build for dsh-better-sidebar-icons: the host-half lib (lib/index.js,
 * ESM node) plus the browser client bundle (lib/client.js, CJS closure
 * factory registered through window.__ModuleLoader__ with the package-name
 * id — the client-modules compose keys on the package name).
 *
 * The client half is dependency-free at runtime (pure DOM + the bundled
 * generated manifest), so the module-loader require only ever resolves
 * nothing; cordis types are erased and never reach the bundle.
 */
import type { UserConfig } from 'tsdown'

export default [
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
  {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
    inputOptions: {
      resolve: {
        conditionNames: ['browser', 'import', 'require', 'default'],
      },
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "dsh-better-sidebar-icons", factory: (require) => {',
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      // One script: the manifest is inlined, nothing splits.
      codeSplitting: false,
    },
  },
] satisfies UserConfig[]
