import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'
import { viewerStylePlugin } from './tools/plugins/viewer-style.mjs'
import { standardDecoratorPlugin, vitestExecArgv } from './deepseek-harness/vitest.shared.ts'

const root = import.meta.dirname
const workspaceRequire = createRequire(resolve(root, 'package.json'))
const dshRuntimeRequire = createRequire(resolve(root, 'deepseek-harness/packages/test-support/client-runtime/package.json'))

export default defineConfig({
  resolve: {
    // The account plugin and DSH test-support package are separate pnpm
    // workspaces and may otherwise load different React/ReactDOM copies.
    // Dedupe the package roots (including subpaths such as react-dom/client)
    // so slot components and Testing Library share the same hook dispatcher.
    dedupe: ['react', 'react-dom'],
    // DSH is a nested workspace with its own install root. Client tests must
    // still render against one React instance or hooks imported by DSH UI
    // primitives will use a different dispatcher from ReactDOM.
    alias: [
      { find: /^@testing-library\/react$/u, replacement: dshRuntimeRequire.resolve('@testing-library/react') },
      { find: '@deepseek-ai/dsh-client-ui-chat/client', replacement: resolve(root, 'deepseek-harness/packages/client/ui-chat/src/client/index.ts') },
      // Client helper entrypoints are intentionally source-only exports in the
      // published plugin manifest. Map them explicitly in Vite so plugin
      // component tests do not depend on a prebuilt `lib/` tree.
      { find: '@zerowallscience/plugin-base/client-helpers', replacement: resolve(root, 'plugins/base/src/shared/client-helpers.ts') },
      { find: /^react$/u, replacement: dshRuntimeRequire.resolve('react') },
      { find: /^react-dom\/client$/u, replacement: dshRuntimeRequire.resolve('react-dom/client') },
      { find: /^react-dom$/u, replacement: dshRuntimeRequire.resolve('react-dom') },
      { find: /^react\/jsx-runtime$/u, replacement: dshRuntimeRequire.resolve('react/jsx-runtime') },
      { find: /^react\/jsx-dev-runtime$/u, replacement: dshRuntimeRequire.resolve('react/jsx-dev-runtime') },
    ],
  },
  plugins: [
    standardDecoratorPlugin(),
    viewerStylePlugin(),
    tsconfigPaths({ projects: [resolve(root, 'tsconfig.plugins.json')] }),
    tsconfigPaths({ projects: [resolve(root, 'deepseek-harness/tsconfig.base.json')] }),
  ],
  test: {
    // pnpm runs several plugin projects together; bound each project's
    // filesystem/Python integration workers to avoid multiplying that budget.
    maxWorkers: 2,
    execArgv: vitestExecArgv,
    include: [resolve(process.cwd()) === root ? 'plugins/**/test/**/*.{test,spec}.{ts,tsx}' : 'test/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
    passWithNoTests: true,
    restoreMocks: true,
    server: {
      // Published DSH UI primitives import KaTeX CSS as a side effect. Route
      // them through Vite so browser-component tests do not hand CSS to Node.
      // Keep Testing Library in the Vite graph as well: its externalized
      // CommonJS require would otherwise resolve the root ReactDOM 18.2 copy,
      // bypassing the React/ReactDOM aliases above.
      deps: { inline: [/@deepseek-ai\/dsh-client-ui-primitives/, /@testing-library\/react/] },
    },
  },
})
