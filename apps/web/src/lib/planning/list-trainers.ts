import { prisma } from '@qualiof/db';

/** Critère partagé avec Formateurs (spec planning §1). Ordre existant conservé. */
export async function listTrainers(tenantId: string) {
  // Formateurs = Persons qui ont une ExternalIdentity entityType=Person.Trainer (depuis l'import)
  // OU au moins un LegalLink role=FORMATEUR.
  const trainers = await prisma.person.findMany({
    where: {
      tenantId,
      archived: false,
      OR: [
        { legalLinks: { some: { role: 'FORMATEUR' } } },
        // ExternalIdentity Person.Trainer (créé par l'import des formateurs SmartOF)
        // On les recoupe via une requête séparée ci-dessous si besoin
      ],
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    include: {
      legalLinks: {
        where: { role: 'FORMATEUR' },
        include: { organization: { select: { id: true, legalName: true, siret: true } } },
      },
    },
  });

  // Complète avec ceux marqués Person.Trainer dans ExternalIdentity (formateurs sans SIRET)
  const externalTrainers = await prisma.externalIdentity.findMany({
    where: { tenantId, entityType: 'Person.Trainer' },
    select: { entityId: true },
  });
  const externalIds = new Set(externalTrainers.map((e) => e.entityId));
  const additionalIds = [...externalIds].filter((id) => !trainers.find((t) => t.id === id));

  const additional = additionalIds.length
    ? await prisma.person.findMany({
        where: { id: { in: additionalIds }, tenantId, archived: false },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        include: {
          legalLinks: {
            where: { role: 'FORMATEUR' },
            include: { organization: { select: { id: true, legalName: true, siret: true } } },
          },
        },
      })
    : [];

  return [...trainers, ...additional];
}
