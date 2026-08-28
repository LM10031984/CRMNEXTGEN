/**
 * Rattrapage : rattacher les pièces des demandes DÉJÀ converties.
 *
 * Le correctif du 28/08/2026 fait suivre CNI / RIB / attestation CFP jusqu'à la
 * fiche apprenant. Les apprenants convertis AVANT ce correctif n'ont rien : les
 * pièces sont restées dans le bucket `preinscriptions`.
 *
 * Ce script les recopie vers `qualiof-docs` et renseigne les trois destinations
 * (SensitiveData.idDocumentUrl, Person.ribKey, AgeficeProfile.cfpAttestationKey).
 * Il ne touche JAMAIS une fiche qui a déjà un document : un document posé à la
 * main par l'admin fait autorité.
 *
 * SEC PAR DÉFAUT. Suppression du doute d'abord, écriture ensuite :
 *   pnpm docs:backfill-converted           # inventaire
 *   WRITE=1 pnpm docs:backfill-converted   # écriture
 */

import { prisma } from '@qualiof/db';
import { copyEnrollmentDocs } from '../src/lib/enrollment/attach-documents';

const WRITE = process.env.WRITE === '1';

async function main() {
  const demandes = await prisma.preEnrollment.findMany({
    where: {
      status: 'CONVERTED',
      convertedToPersonId: { not: null },
      OR: [{ cniKey: { not: null } }, { ribKey: { not: null } }, { cfpKey: { not: null } }],
    },
    select: {
      id: true,
      tenantId: true,
      firstName: true,
      lastName: true,
      cniKey: true,
      ribKey: true,
      cfpKey: true,
      convertedToPersonId: true,
      convertedToOrgId: true,
    },
    orderBy: { convertedAt: 'desc' },
  });

  console.log(`${demandes.length} demande(s) converties avec des pièces déposées.\n`);
  let aTraiter = 0;
  let ecrits = 0;

  for (const d of demandes) {
    const personId = d.convertedToPersonId!;
    const nom = [d.firstName, d.lastName].filter(Boolean).join(' ') || personId;

    const [person, sensible] = await Promise.all([
      prisma.person.findUnique({ where: { id: personId }, select: { ribKey: true } }),
      prisma.sensitiveData.findUnique({
        where: { personId },
        select: { idDocumentUrl: true },
      }),
    ]);
    const agefice = d.convertedToOrgId
      ? await prisma.ageficeProfile.findUnique({
          where: { organizationId: d.convertedToOrgId },
          select: { cfpAttestationKey: true },
        })
      : null;

    // On ne recopie que ce qui manque réellement côté fiche apprenant.
    const manquants = {
      cniKey: d.cniKey && !sensible?.idDocumentUrl ? d.cniKey : null,
      ribKey: d.ribKey && !person?.ribKey ? d.ribKey : null,
      cfpKey: d.cfpKey && !agefice?.cfpAttestationKey ? d.cfpKey : null,
    };
    const nb = Object.values(manquants).filter(Boolean).length;
    if (nb === 0) continue;

    aTraiter++;
    const libelle = [
      manquants.cniKey && 'CNI',
      manquants.ribKey && 'RIB',
      manquants.cfpKey && 'CFP',
    ]
      .filter(Boolean)
      .join(' + ');
    console.log(`${WRITE ? 'RATTACHE  ' : 'candidat  '} ${nom} → ${libelle}`);

    if (!WRITE) continue;

    const copies = await copyEnrollmentDocs(manquants, d.tenantId, personId);
    for (const w of copies.warnings) console.warn(`   ⚠ ${w}`);

    if (copies.cniKey) {
      await prisma.sensitiveData.upsert({
        where: { personId },
        create: { personId, idDocumentUrl: copies.cniKey },
        update: { idDocumentUrl: copies.cniKey },
      });
      ecrits++;
    }
    if (copies.ribKey) {
      await prisma.person.update({ where: { id: personId }, data: { ribKey: copies.ribKey } });
      ecrits++;
    }
    if (copies.cfpKey && d.convertedToOrgId) {
      await prisma.ageficeProfile.upsert({
        where: { organizationId: d.convertedToOrgId },
        create: {
          organizationId: d.convertedToOrgId,
          cfpAttestationKey: copies.cfpKey,
          paFields: {},
        },
        update: { cfpAttestationKey: copies.cfpKey },
      });
      ecrits++;
    } else if (copies.cfpKey) {
      console.warn(`   ⚠ CFP non rattachée : aucune organisation liée à ${nom}`);
    }
  }

  console.log('');
  console.log(`Fiches à compléter : ${aTraiter}`);
  console.log(
    WRITE ? `${ecrits} document(s) rattaché(s).` : 'Mode sec — relancer avec WRITE=1 pour écrire.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
