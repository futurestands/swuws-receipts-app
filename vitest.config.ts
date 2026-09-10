import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
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
