import { configDefaults, defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    pool: 'forks',
    // Exported review artifacts contain explicit disposable SQL experiments, not application suites.
    exclude: [...configDefaults.exclude, 'outputs/**', ...(process.env.SWUWS_PRODUCTION_INTEGRATION === '1' ? [] : ['lib/production/integrity.integration.test.ts', 'lib/db/history.integration.test.ts', 'lib/production/hierarchy_repair.integration.test.ts'])],
    environment: 'node',
    alias: {
      '@': path.resolve(__dirname, './'),
      'server-only': path.resolve(__dirname, 'lib/test-utils/server-only-mock.js'),
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
