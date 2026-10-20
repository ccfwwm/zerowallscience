import { defineConfig } from 'vitest/config'
import base from './vitest.plugins.config.js'
export default defineConfig({ ...base, root: import.meta.dirname, test: { ...base.test, passWithNoTests: false, include: ['plugins/videos/tests/**/*.test.ts', 'plugins/videos/tests/**/*.test.tsx'], testTimeout: 20_000 } })
