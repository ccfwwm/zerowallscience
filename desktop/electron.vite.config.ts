import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: { build: { externalizeDeps: { exclude: ['electron-updater'] } } },
  preload: {
    build: {
      externalizeDeps: true,
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
})
