import { prisma, type Prisma } from '@qualiof/db';
import { listTrainers } from './list-trainers';
type Actor = { tenantId: string; role: string; email: string };
export async function availabilityAccess(
  user: Actor,
  db: Pick<Prisma.TransactionClient, 'person' | 'externalIdentity'> = prisma,
) {
  if (user.role === 'ADMIN' || user.role === 'MANAGER') {
    return { trainerIds: (await listTrainers(user.tenantId, db)).map((t) => t.id), reason: null };
  }
  if (user.role === 'FORMATEUR') {
    // Décision Laurent du 18/09/2026 : email unique parmi toutes les Person actives du tenant.
    const matches = await db.person.findMany({
      where: {
        tenantId: user.tenantId,
        archived: false,
        email: { equals: user.email.trim(), mode: 'insensitive' },
      },
      select: { id: true },
      take: 2,
    });
    if (
      matches.length === 1 &&
      (await listTrainers(user.tenantId, db)).some((t) => t.id === matches[0]!.id)
    ) {
      return { trainerIds: [matches[0]!.id], reason: null };
    }
    return {
      trainerIds: [] as string[],
      reason:
        'Votre email de connexion ne correspond pas à une fiche formateur unique. Contactez un administrateur.',
    };
  }
  return { trainerIds: [] as string[], reason: null };
}
