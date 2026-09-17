import { prisma } from '@qualiof/db';
import { assertTestDatabaseContent } from '../../../packages/db/scripts/assert-test-target';
export default async function globalSetup() {
  try { await assertTestDatabaseContent(prisma, process.env.DATABASE_URL); }
  finally { await prisma.$disconnect(); }
}
