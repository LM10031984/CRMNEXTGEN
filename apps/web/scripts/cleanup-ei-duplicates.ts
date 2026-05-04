/**
 * Nettoyage des Organizations EI doublonnes créées par l'import du 28/04
 * qui n'a pas dédupliqué sur l'ordre nom/prénom.
 *
 * Pattern : pour un même apprenant EI, on a 2 Organizations distinctes
 *   - "NOM Prenom" (créée 27/04 via SmartOF)
 *   - "Prenom NOM" (créée 28/04 via Airtable BDD Refonte)
 *
 * Stratégie :
 *   1. Trouve les Person ayant ≥2 LegalLink role=EI_SELF
 *   2. Filtre les Organizations ciblées : legalForm ∈ {EI, EIRL, AUTO_ENTREPRENEUR}
 *   3. Détecte le pattern strict : noms identiques après normalisation
 *      (uppercase, accents retirés, mots triés)
 *   4. Choisit la canonical = celle avec le plus de relations
 *      (LegalLinks + SessionParticipant + AgeficeProfile + Invoice + ...)
 *   5. Réoriente toutes les FK depuis la doublon vers la canonical, en
 *      gérant les conflits de @@unique
 *   6. Supprime la doublon Organization
 *
 * Mode `--dry-run` (défaut) : affiche ce qui serait fait, n'écrit rien.
 * Mode `--execute` : applique les modifications dans une transaction.
 *
 * Usage :
 *   pnpm --filter @qualiof/web exec dotenv -e ../../.env -- tsx scripts/cleanup-ei-duplicates.ts
 *   pnpm --filter @qualiof/web exec dotenv -e ../../.env -- tsx scripts/cleanup-ei-duplicates.ts --execute
 */

import { prisma } from '@qualiof/db';

const EXECUTE = process.argv.includes('--execute');
const SOLO_FORMS = ['EI', 'EIRL', 'AUTO_ENTREPRENEUR'] as const;

function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/)
    .sort()
    .join(' ');
}

interface OrgWithCount {
  id: string;
  legalName: string;
  createdAt: Date;
  relCount: number;
}

async function countRelations(orgId: string): Promise<number> {
  const [ll, sp, inv, agf, ld] = await Promise.all([
    prisma.legalLink.count({ where: { organizationId: orgId } }),
    prisma.sessionParticipant.count({ where: { sponsorOrgId: orgId } }),
    prisma.invoice.count({ where: { payerOrgId: orgId } }),
    prisma.ageficeProfile.count({ where: { organizationId: orgId } }),
    prisma.lead.count({ where: { organizationId: orgId } }),
  ]);
  return ll + sp + inv + agf + ld;
}

async function main() {
  console.log(`\n${EXECUTE ? '⚠️  EXECUTE MODE — modifications seront appliquées' : '🔍 DRY-RUN — aucune modification'}\n`);

  // 1. Personnes avec ≥2 EI_SELF vers Org EI/EIRL/AUTO_ENTREPRENEUR
  const persons = await prisma.person.findMany({
    include: {
      legalLinks: {
        where: { role: 'EI_SELF', organization: { legalForm: { in: [...SOLO_FORMS] } } },
        include: { organization: { select: { id: true, legalName: true, legalForm: true, createdAt: true } } },
      },
    },
  });

  const candidates = persons.filter((p) => p.legalLinks.length >= 2);
  console.log(`${candidates.length} apprenants avec ≥2 LegalLink EI_SELF vers Org EI/EIRL/AE\n`);

  const matchedPairs: Array<{
    person: { id: string; firstName: string; lastName: string };
    canonical: OrgWithCount;
    duplicate: OrgWithCount;
  }> = [];
  const ambiguous: typeof candidates = [];

  for (const p of candidates) {
    if (p.legalLinks.length !== 2) {
      ambiguous.push(p);
      continue;
    }
    const [a, b] = p.legalLinks.map((l) => l.organization);
    if (normalizeName(a.legalName) !== normalizeName(b.legalName)) {
      ambiguous.push(p);
      continue;
    }
    const [aCount, bCount] = await Promise.all([countRelations(a.id), countRelations(b.id)]);
    // Canonical = celle avec le plus de relations ; tie-break par plus ancienne
    const aWins = aCount > bCount || (aCount === bCount && a.createdAt < b.createdAt);
    const canonical = aWins
      ? { ...a, relCount: aCount }
      : { ...b, relCount: bCount };
    const duplicate = aWins
      ? { ...b, relCount: bCount }
      : { ...a, relCount: aCount };
    matchedPairs.push({
      person: { id: p.id, firstName: p.firstName, lastName: p.lastName },
      canonical,
      duplicate,
    });
  }

  console.log(`✅ ${matchedPairs.length} paires "Nom Prenom" ⇄ "Prenom Nom" auto-merge`);
  console.log(`⚠️  ${ambiguous.length} cas ambigus (à examiner à la main)\n`);

  if (ambiguous.length > 0) {
    console.log('Cas ambigus skippés :');
    for (const p of ambiguous.slice(0, 10)) {
      const names = p.legalLinks.map((l) => `"${l.organization.legalName}"`).join(' / ');
      console.log(`  - ${p.firstName} ${p.lastName} : ${names}`);
    }
    if (ambiguous.length > 10) console.log(`  … et ${ambiguous.length - 10} autres`);
    console.log('');
  }

  console.log('Plan de fusion :');
  for (const m of matchedPairs.slice(0, 6)) {
    console.log(`  ${m.person.firstName} ${m.person.lastName}`);
    console.log(`    KEEP  "${m.canonical.legalName}" (${m.canonical.id.slice(0, 8)}, ${m.canonical.relCount} relations)`);
    console.log(`    MERGE "${m.duplicate.legalName}" (${m.duplicate.id.slice(0, 8)}, ${m.duplicate.relCount} relations) → suppression`);
  }
  if (matchedPairs.length > 6) console.log(`  … et ${matchedPairs.length - 6} autres\n`);

  if (!EXECUTE) {
    console.log('\n→ Pour appliquer : ajouter --execute\n');
    process.exit(0);
  }

  // === EXECUTE MODE ===
  console.log('\n🔧 Application des fusions...\n');

  let merged = 0;
  let skippedConflicts = 0;

  for (const m of matchedPairs) {
    try {
      await prisma.$transaction(async (tx) => {
        const dupId = m.duplicate.id;
        const canId = m.canonical.id;

        // 1. Migrer SessionParticipant.sponsorOrgId
        const spUpd = await tx.sessionParticipant.updateMany({
          where: { sponsorOrgId: dupId },
          data: { sponsorOrgId: canId },
        });

        // 2. Migrer Invoice.payerOrgId
        const invUpd = await tx.invoice.updateMany({
          where: { payerOrgId: dupId },
          data: { payerOrgId: canId },
        });

        // 3. Migrer Lead.organizationId
        const leadUpd = await tx.lead.updateMany({
          where: { organizationId: dupId },
          data: { organizationId: canId },
        });

        // 4. Migrer AgeficeProfile (1:1, possible conflit)
        const dupAgf = await tx.ageficeProfile.findUnique({ where: { organizationId: dupId } });
        const canAgf = await tx.ageficeProfile.findUnique({ where: { organizationId: canId } });
        if (dupAgf && !canAgf) {
          await tx.ageficeProfile.update({
            where: { organizationId: dupId },
            data: { organizationId: canId },
          });
        } else if (dupAgf && canAgf) {
          // Garde le canonical, supprime la doublon (les paFields canonical sont gardés)
          await tx.ageficeProfile.delete({ where: { organizationId: dupId } });
        }

        // 5. Migrer BillingProfile.organizationId (FK simple)
        await tx.billingProfile.updateMany({
          where: { organizationId: dupId },
          data: { organizationId: canId },
        });

        // 6. Migrer Contact.organizationId (FK simple)
        await tx.contact.updateMany({
          where: { organizationId: dupId },
          data: { organizationId: canId },
        });

        // 7. Migrer LegalLinks de la doublon → canonical en gérant le @@unique([personId, organizationId, role])
        const dupLinks = await tx.legalLink.findMany({ where: { organizationId: dupId } });
        for (const dl of dupLinks) {
          const conflict = await tx.legalLink.findUnique({
            where: { personId_organizationId_role: { personId: dl.personId, organizationId: canId, role: dl.role } },
          });
          if (conflict) {
            // Le LegalLink existe déjà sur la canonical → on supprime celui de la doublon
            await tx.legalLink.delete({ where: { id: dl.id } });
          } else {
            await tx.legalLink.update({ where: { id: dl.id }, data: { organizationId: canId } });
          }
        }

        // 8. Supprimer l'Organization doublon
        await tx.organization.delete({ where: { id: dupId } });

        console.log(
          `  ✓ ${m.person.firstName} ${m.person.lastName} : "${m.duplicate.legalName}" merged (sp=${spUpd.count}, inv=${invUpd.count}, leads=${leadUpd.count})`,
        );
        merged++;
      });
    } catch (err) {
      console.error(
        `  ✗ ${m.person.firstName} ${m.person.lastName} : ${(err as Error).message.slice(0, 200)}`,
      );
      skippedConflicts++;
    }
  }

  console.log(`\n📊 ${merged} fusions OK · ${skippedConflicts} erreurs · ${ambiguous.length} skip ambigus`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
