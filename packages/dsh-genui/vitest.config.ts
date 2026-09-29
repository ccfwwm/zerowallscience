import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      { find: /^react$/, replacement: resolve(__dirname, 'node_modules/react/index.js') },
      { find: /^react\/jsx-runtime$/, replacement: resolve(__dirname, 'node_modules/react/jsx-runtime.js') },
      { find: /^react\/jsx-dev-runtime$/, replacement: resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js') },
      { find: /^react-dom$/, replacement: resolve(__dirname, 'node_modules/react-dom/index.js') },
      { find: /^react-dom\/client$/, replacement: resolve(__dirname, 'node_modules/react-dom/client.js') },
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.spec.{ts,tsx}'],
    // The full jsdom suite can overwhelm Vitest's worker RPC on Windows when
    // every file runs at once. Keep the checks deterministic on the release OS.
    maxWorkers: process.platform === 'win32' ? 4 : undefined,
    server: {
      deps: { inline: ['@deepseek-ai/dsh-client-ui-primitives'] },
    },
  },
})
