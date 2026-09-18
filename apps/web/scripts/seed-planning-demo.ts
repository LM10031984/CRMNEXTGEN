import { prisma } from '@qualiof/db';
import { seedPlanningFixture } from './lib/planning-fixture';
try {
  await seedPlanningFixture();
  console.log('Fixture planning locale prête.');
} finally {
  await prisma.$disconnect();
}
