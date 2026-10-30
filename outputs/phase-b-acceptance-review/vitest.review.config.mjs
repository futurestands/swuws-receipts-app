import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  test: {
    include: ['outputs/phase-b-acceptance-review/acceptance-probes.test.mjs'],
    environment: 'node',
    alias: { '@': process.cwd(), 'server-only': path.join(process.cwd(), 'lib/test-utils/server-only-mock.js') }
  },
  resolve: { alias: { '@': process.cwd() } }
});
