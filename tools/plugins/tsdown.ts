import { defineConfig } from 'tsdown'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { viewerStylePlugin } from './viewer-style.mjs'
import '../build/register-output-resolution.mjs'
import { adaptViewerCore } from './viewer-adapter.mjs'
const { typertPlugin } = await import('../../deepseek-harness/packages/typert/generator/lib/types/tsdown-plugin.js')

const zerowallVersion = String(JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version)

export interface ZeroWallBundleOptions {
  host?: boolean
  client?: boolean
  hostAlwaysBundle?: RegExp[]
  inlinePngAssets?: boolean
  universalViewer?: boolean
}

export function zerowallBundle(id: string, options: ZeroWallBundleOptions = {}) {
  const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))
  const hasRemote = manifest.exports?.['./remote'] !== undefined
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
      ...options.hostAlwaysBundle === undefined ? {} : {
        deps: { alwaysBundle: options.hostAlwaysBundle },
      },
      plugins: [{ ...typertPlugin({ mode: 'package', faces: ['host'] }), writeBundle() {} }],
    })
  }
  if (options.client) {
    const isModuleTableExternal = (specifier: string): boolean =>
      /^(?:react|react\/jsx-runtime|react-dom|react-dom\/client)$/u.test(specifier)
      || /^@deepseek-ai\/(?:dsh-client[^/]*(?:\/|$)|dsh-api-remotes(?:\/|$))/u.test(specifier)
      || (/^@zerowallscience\/plugin-[^/]+(?:\/client)?$/u.test(specifier) && specifier !== id)
    configs.push({
      name: `${id}/client`,
      entry: { client: hasRemote ? 'zerowall:client-entry' : 'src/client/index.ts' },
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
        // Plugin entrypoints stay external; implementation helpers, lucide and
        // qrcode stay inside their owning classic-script artifact.
        neverBundle: isModuleTableExternal,
        // Helpers may resolve through a workspace symlink. The
        // resolver can hand this callback a resolved path for workspace
        // symlinks, so matching only the bare package specifier is not
        // sufficient; the explicit noExternal patterns below cover both.
        // Match package subpaths as well as package roots.  Several runtime
        // entry points (for example `qrcode/lib/browser.js` and
        // `react/jsx-runtime`) are resolved as explicit subpath imports.
        alwaysBundle: [
          ...(options.universalViewer ? [/^(?!.*(?:^|[\\/])(?:react(?:[\\/]|$)|react-dom(?:[\\/]|$)|@deepseek-ai[\\/]|@zerowallscience[\\/])).+/u] : []),
          // ZeroWall plugins are independently installable DSH bundles. Keep
          // their client entrypoints external so the ModuleLoader can load,
          // update and restart one plugin without rebuilding every client.
          /^@zerowallscience\/plugin-[^/]+\/(?:client-helpers$|client\/|src\/)/,
          /^dsh-file-review(?:\/|$)/,
          /^lucide-react(?:\/|$)/,
          /^qrcode(?:\/|$)/,
          /^zod(?:\/|$)/,
        ],
      },
      ...(options.universalViewer ? { codeSplitting: false } : {}),
      ...(options.universalViewer ? { inputOptions: { resolve: { conditionNames: ['browser', 'import', 'default'], mainFields: ['browser', 'module', 'main'] } } } : {}),
      outputOptions: {
        ...(options.universalViewer ? { inlineDynamicImports: true } : {}),
        entryFileNames: 'client.js',
        banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => { const __zerowallRequire = require; require = (specifier) => /^(?:react|react\\/jsx-runtime|react-dom|react-dom\\/client)$/.test(specifier) && globalThis.__DSH_REACT_SINGLETON__?.[specifier] !== undefined ? globalThis.__DSH_REACT_SINGLETON__[specifier] : __zerowallRequire(specifier);`,
        footer: 'return module.exports; } });',
        intro: 'var module = { exports: {} }; var exports = module.exports;',
      },
      plugins: [...(options.universalViewer ? [viewerStylePlugin(), {
        name: 'zerowall-viewer-browser-modules',
        transform(code: string, id: string) {
          if (!id.replace(/\\/gu, '/').endsWith('/@open-file-viewer/core/dist/index.js')) return null
          return adaptViewerCore(code)
        },
        resolveId(source: string, importer?: string) {
          if (source === 'shpjs' && importer) {
            // shpjs's source entry selects Node-only but-unzip when bundled
            // with mixed conditions. Its distributed browser ESM is standalone.
            const entry = createRequire(importer).resolve('shpjs')
            return resolve(dirname(entry), '../dist/shp.esm.js')
          }
          if (source === 'tslib' && importer) return resolve(dirname(createRequire(importer).resolve('tslib')), 'tslib.es6.js')
          // Mammoth's browser map is not applied to nested dynamic chunks by
          // the classic-script bundler. Keep filesystem access out of preview.
          if (!importer || !source.startsWith('.')) return null
          const candidate = resolve(dirname(importer), source).replace(/\\/gu, '/')
          const match = candidate.match(/^(.*\/mammoth)\/lib\/(unzip|docx\/files)(?:\.js)?$/u)
          return match ? `${match[1]}/browser/${match[2]}.js` : null
        },
      }] : []), ...(options.inlinePngAssets ? [{
        name: 'zerowall-inline-png-assets',
        resolveId(source: string, importer?: string) {
          if (!source.endsWith('.png?inline') || !importer) return null
          return `${resolve(dirname(importer), source.slice(0, -'?inline'.length))}?inline`
        },
        load(id: string) {
          if (!id.endsWith('.png?inline')) return null
          const png = readFileSync(id.slice(0, -'?inline'.length))
          return `export default ${JSON.stringify(`data:image/png;base64,${png.toString('base64')}`)}`
        },
      }] : []), {
        name: 'zerowall-owned-remote',
        resolveId(source: string) {
          if (source === 'zerowall:client-entry') return '\0zerowall:client-entry'
          return null
        },
        load(source: string) {
          if (source !== '\0zerowall:client-entry') return null
          const client = JSON.stringify(resolve(process.cwd(), 'src/client/index.ts').replaceAll('\\', '/'))
          const remote = JSON.stringify(resolve(process.cwd(), 'lib/typert.remote-client.js').replaceAll('\\', '/'))
          return `import * as feature from ${client}; import contribution from ${remote};
export * from ${client};
export const inject = ['remote'];
export async function apply(ctx, config) {
  const dispose = await ctx.remote.$mount(contribution);
  try { ctx.plugin(feature, config); } catch (error) { await dispose(); throw error; }
  return dispose;
}`
        },
      }, {
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
