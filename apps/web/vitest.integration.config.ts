import { defineConfig } from 'vitest/config';
import base from './vitest.config';
import { assertTestTarget } from '../../packages/db/scripts/assert-test-target';
assertTestTarget({ databaseUrl: process.env.TEST_DATABASE_URL });
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    setupFiles: [],
    exclude: [],
    include: [
      'scripts/__tests__/dedupe.merge.test.ts',
      'src/server/actions/__tests__/invoices-lines-contract.test.ts',
    ],
  },
});
