import { fileURLToPath } from 'node:url'
import { standardDecoratorPlugin } from '../../../vitest.shared.ts'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'
export default defineConfig({ plugins: [standardDecoratorPlugin(), tsconfigPaths({ projects: [fileURLToPath(new URL('../../../tsconfig.base.json', import.meta.url))] })], oxc: { jsx: { runtime: 'automatic' } }, resolve: { dedupe: ['react', 'react-dom'] }, test: { include: ['test/**/*.spec.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'], server: { deps: { inline: [/@deepseek-ai\/dsh-client-/] } }, testTimeout: 20000 } })
