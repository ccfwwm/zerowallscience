import { defineConfig } from 'tsup'

/**
 * ESM entry + lazy implementation chunks in lib/.
 * plugin/index.mjs remains the stable thin shell re-exporting lib/index.js.
 *
 * Host-provided deps stay external (peer/runtime), our small deps get inlined
 * so the published lib/ tree is self-contained.
 */
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  outDir: 'lib',
  splitting: true,
  // root.ts uses its module directory to find package assets. Shared chunks
  // must stay beside index.js, including when root.ts moves into a chunk.
  esbuildOptions(options) {
    options.chunkNames = 'chunk-[hash]'
  },
  // The explicit prebuild helper prunes only index.js and old Host chunks.
  // tsup's clean array still starts with **/*, so leave it disabled to keep
  // the separately built client.js and unrelated files intact.
  clean: false,
  dts: false,
  sourcemap: false,
  // `yaml` is CJS: inlining it into ESM leaves esbuild's `__require` shim with
  // no `require` in scope ("Dynamic require of \"process\" is not supported").
  // Define it in every chunk so a shared CJS dependency also works lazily.
  banner: {
    js: [
      "import { createRequire as __pptCreateRequire } from 'node:module';",
      'const require = __pptCreateRequire(import.meta.url);',
      '// dsh-ppt-maker — built artifact (tsup). Do not edit; edit src/ and run `npm run build`.'
    ].join('\n')
  },
  noExternal: ['yaml', 'fflate', '@xmldom/xmldom']
})
