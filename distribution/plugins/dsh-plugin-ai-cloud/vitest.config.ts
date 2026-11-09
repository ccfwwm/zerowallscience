import { fileURLToPath } from 'node:url'
import { standardDecoratorPlugin } from '../../../vitest.shared.ts'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'
export default defineConfig({ plugins: [standardDecoratorPlugin(), tsconfigPaths({ projects: [fileURLToPath(new URL('../../../tsconfig.base.json', import.meta.url))] })], test: { include: ['test/**/*.spec.ts', 'test/**/*.spec.tsx'] } })
