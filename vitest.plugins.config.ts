import { resolve } from 'node:path'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

const root = import.meta.dirname

export default defineConfig({
  plugins: [
    tsconfigPaths({ projects: [resolve(root, 'tsconfig.plugins.json')] }),
    tsconfigPaths({ projects: [resolve(root, 'dsh/source/tsconfig.base.json')] }),
  ],
  test: {
    environment: 'node',
    passWithNoTests: true,
    restoreMocks: true,
  },
})
