import { defineConfig } from 'vitest/config'
import base from './vitest.plugins.config.js'
export default defineConfig({ ...base, root: import.meta.dirname, test: { ...base.test, passWithNoTests: false, include: ['plugins/oh-story-dsh/tests/**/*.test.ts', 'plugins/oh-story-dsh/tests/**/*.test.tsx'], testTimeout: 20_000 } })
