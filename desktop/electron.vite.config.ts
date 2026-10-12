import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: { build: { rollupOptions: { input: { index: 'src/main/index.ts' } }, externalizeDeps: { exclude: ['electron-updater'] } } },
  preload: {
    build: {
      externalizeDeps: true,
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
})
