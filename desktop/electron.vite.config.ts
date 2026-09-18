import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: { build: { rollupOptions: { input: { index: 'src/main/index.ts', 'python-updater-worker': 'src/main/python-updater-worker.ts' } }, externalizeDeps: { exclude: ['electron-updater'] } } },
  preload: {
    build: {
      externalizeDeps: true,
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
})
