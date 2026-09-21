import { defineConfig } from 'vitest/config';
import base from './vitest.config';
import { assertTestTarget } from '../../packages/db/scripts/assert-test-target';
assertTestTarget({ databaseUrl: process.env.TEST_DATABASE_URL });
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    setupFiles: [],
    // Shared PostgreSQL tables: fixture inserts/deletes in unrelated files can
    // conflict with SERIALIZABLE predicate locks. Concurrency tests still run
    // their simultaneous calls explicitly inside each file.
    fileParallelism: false,
    exclude: [],
    include: [
      'scripts/__tests__/dedupe.merge.test.ts',
      'src/server/actions/__tests__/invoices-lines-contract.test.ts',
      'src/**/*.integration.test.ts',
    ],
  },
});
