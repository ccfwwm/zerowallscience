import { defineConfig } from 'tsdown'
import { readFileSync } from 'node:fs'
import { typertPlugin } from '../../dsh/source/packages/typert/generator/lib/types/tsdown-plugin.js'

const zerowallVersion = String(JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version)

export interface ZeroWallBundleOptions {
  host?: boolean
  client?: boolean
}

export function zerowallBundle(id: string, options: ZeroWallBundleOptions = {}) {
  const host = options.host !== false
  const configs = []
  if (host) {
    configs.push({
      name: id,
      entry: ['src/host/index.ts'],
      outDir: 'lib',
      format: ['esm'],
      platform: 'node',
      target: 'es2024',
      fixedExtension: false,
      dts: false,
      clean: false,
      plugins: [typertPlugin({ mode: 'package', faces: ['host'] })],
    })
  }
  if (options.client) {
    const isModuleTableExternal = (specifier: string): boolean =>
      /^(?:react|react\/jsx-runtime|react-dom|react-dom\/client)$/u.test(specifier)
      || /^@deepseek-ai\/(?:dsh-client[^/]*(?:\/|$)|dsh-api-remotes(?:\/|$))/u.test(specifier)
    configs.push({
      name: `${id}/client`,
      entry: { client: 'src/client/index.ts' },
      outDir: 'lib',
      // DSH's client module transport injects each plugin as a classic
      // script.  The artifact must therefore be CommonJS wrapped by the
      // ModuleLoader hand-off, not a standalone ESM module.  ESM happens to
      // build successfully but fails in Electron/Web with "Cannot use import
      // statement outside a module" before the plugin can register.
      format: ['cjs'],
      platform: 'browser',
      target: 'es2022',
      fixedExtension: false,
      dts: false,
      clean: false,
      define: {
        'process.env.ZEROWALL_VERSION': JSON.stringify(zerowallVersion),
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
        'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
        'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
      },
      deps: {
        // DSH client packages are provided by the browser ModuleLoader.
        // Everything else, including ZeroWall Client helpers, lucide and
        // qrcode, must be bundled into the classic script so it cannot
        // become an unresolved runtime require().
        neverBundle: isModuleTableExternal,
        // Keep every ZeroWall workspace package (including generated Typert
        // `/remote` contracts) inside the classic-script artifact.  The
        // resolver can hand this callback a resolved path for workspace
        // symlinks, so matching only the bare package specifier is not
        // sufficient; the explicit noExternal patterns below cover both.
        // Match package subpaths as well as package roots.  Several runtime
        // entry points (for example `qrcode/lib/browser.js` and
        // `react/jsx-runtime`) are resolved as explicit subpath imports.
        alwaysBundle: [
          /^@zerowallscience\/plugin-/,
          /^lucide-react(?:\/|$)/,
          /^qrcode(?:\/|$)/,
          /^zod(?:\/|$)/,
        ],
      },
      outputOptions: {
        entryFileNames: 'client.js',
        banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => { const __zerowallRequire = require; require = (specifier) => /^(?:react|react\\/jsx-runtime|react-dom|react-dom\\/client)$/.test(specifier) && globalThis.__DSH_REACT_SINGLETON__?.[specifier] !== undefined ? globalThis.__DSH_REACT_SINGLETON__[specifier] : __zerowallRequire(specifier);`,
        footer: 'return module.exports; } });',
        intro: 'var module = { exports: {} }; var exports = module.exports;',
      },
      plugins: [{
        name: 'zerowall-react-singleton',
        // Dependencies such as lucide-react import React themselves.  Mark
        // those transitive requests external too, otherwise the browser
        // bundle gets a private React dispatcher and hooks crash at runtime.
        resolveId(source: string) {
          if (/^(?:react|react\/jsx-runtime|react-dom|react-dom\/client)$/u.test(source)) {
            return { id: source, external: true }
          }
          return null
        },
      }, {
        name: 'zerowall-inline-css',
        generateBundle(_outputOptions: unknown, bundle: Record<string, any>) {
          const cssAsset = Object.values(bundle).find((item: any) => item.type === 'asset' && item.fileName.endsWith('.css')) as any
          const clientChunk = Object.values(bundle).find((item: any) => item.type === 'chunk' && item.fileName.endsWith('client.js')) as any
          if (cssAsset === undefined || clientChunk === undefined) return
          const css = String(cssAsset.source ?? '')
          clientChunk.code = `(function(){var s=document.createElement('style');s.setAttribute('data-zerowall-plugin-css',${JSON.stringify(id)});s.textContent=${JSON.stringify(css)};document.head.appendChild(s);})();\n${clientChunk.code}`
          delete bundle[cssAsset.fileName]
        },
      }],
    })
  }
  return defineConfig(configs)
}
