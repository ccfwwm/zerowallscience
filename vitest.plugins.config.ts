import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

const root = import.meta.dirname
const workspaceRequire = createRequire(resolve(root, 'package.json'))
const testingLibraryRequire = createRequire(workspaceRequire.resolve('@testing-library/react'))

export default defineConfig({
  resolve: {
    // DSH is a nested workspace with its own install root. Client tests must
    // still render against one React instance or hooks imported by DSH UI
    // primitives will use a different dispatcher from ReactDOM.
    alias: [
      { find: /^react$/u, replacement: testingLibraryRequire.resolve('react') },
      { find: /^react-dom$/u, replacement: testingLibraryRequire.resolve('react-dom') },
    ],
  },
  plugins: [
    tsconfigPaths({ projects: [resolve(root, 'tsconfig.plugins.json')] }),
    tsconfigPaths({ projects: [resolve(root, 'deepseek-harness/tsconfig.base.json')] }),
  ],
  test: {
    environment: 'node',
    passWithNoTests: true,
    restoreMocks: true,
  },
})
