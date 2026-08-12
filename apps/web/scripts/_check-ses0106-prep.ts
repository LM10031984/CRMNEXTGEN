// Contrôle LECTURE SEULE post-« Lancer la préparation » SES-0106 (quick 2026-08-12)
import { prisma } from '@qualiof/db';
async function main() {
  const s = await prisma.trainingSession.findFirst({
    where: { code: 'SES-0106' },
    select: {
      id: true, status: true, updatedAt: true,
      tasks: { select: { id: true, title: true, status: true } },
      documents: { select: { id: true, type: true, entityType: true } },
      pedagogicalAssets: { select: { id: true, kind: true } },
      trainers: { select: { personId: true, role: true } },
      _count: { select: { participants: true, slots: true } },
    },
  });
  console.log(JSON.stringify(s, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
