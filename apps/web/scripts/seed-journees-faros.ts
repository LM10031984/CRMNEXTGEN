/**
 * seed-journees-faros.ts — écrit les 4 journées du diagnostic du stand en base.
 *
 * Le CONTENU des journées vit dans `src/lib/diagnostic/journees-faros.ts`, pas
 * ici : c'est du code, et il doit se vérifier sans base (leçon CI du
 * 02/09/2026). Ce script ne fait plus qu'une chose — le poser en base.
 *
 * IDEMPOTENCE
 *
 * Clé = (tenantId, code), contrainte unique en base. Réexécutable autant de fois
 * qu'on veut : les 4 produits sont mis à jour, jamais dupliqués. Le script ne
 * touche à AUCUN autre produit, ne crée aucune session, n'envoie aucun email.
 *
 * Run : cd apps/web && node --import tsx --env-file=../../.env scripts/seed-journees-faros.ts
 *       (WRITE=1 pour écrire ; sans, simulation)
 */

import { prisma, Modality, Prisma } from '@qualiof/db';
import {
  JOURNEES_FAROS,
  CODES_FAROS,
  PRIX_JOURNEE_HT,
  composerProgramme,
  capsules,
  ACCES,
  EVALUATION,
  ACCESSIBILITE,
  SUPPORT,
} from '../src/lib/diagnostic/journees-faros';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';

async function main() {
  const ecrire = process.env.WRITE === '1';
  console.log(ecrire ? '=== ÉCRITURE ===' : '=== SIMULATION (WRITE=1 pour écrire) ===\n');

  // Vérifié AVANT toute écriture, et sur les deux sens : aucun code étranger ne
  // passe, et aucune des quatre journées n'a été retirée par mégarde.
  const codes = JOURNEES_FAROS.map((j) => j.code);
  const intrus = codes.filter((c) => !CODES_FAROS.has(c));
  if (intrus.length > 0) {
    throw new Error(
      `Ce script ne tarifie QUE les journées Faros (décision Laurent du 02/09/2026). ` +
        `Codes non autorisés : ${intrus.join(', ')}.`,
    );
  }
  if (codes.length !== CODES_FAROS.size) {
    throw new Error(`Attendu ${CODES_FAROS.size} journées, trouvé ${codes.length}.`);
  }

  for (const j of JOURNEES_FAROS) {
    const programMd = composerProgramme(j.blocs);
    const refs = capsules(j.blocs);

    // Garde-fou métier : le mot « pige » est interdit dans tout ce qui part vers
    // un prospect (règle du 11/08/2026). Le seed refuse plutôt que d'écrire.
    if (/\bpige/i.test(programMd) || j.objectives.some((o) => /\bpige/i.test(o))) {
      throw new Error(`${j.code} : le mot « pige » est interdit — corriger le contenu avant de semer.`);
    }
    // La référence de capsule ne doit jamais atteindre le prospect.
    if (/\[[A-Z]\d?-?[A-Z]?\d?\]/.test(programMd)) {
      throw new Error(`${j.code} : une référence de capsule a fuité dans le programMd.`);
    }

    const donnees = {
      title: j.title,
      durationHours: 8,
      modality: Modality.PRESENTIEL,
      prerequisites: j.prerequisites,
      targetAudience: j.targetAudience,
      objectives: j.objectives,
      programMd,
      pedagogicalMethods:
        'Formation en présentiel. Alternance de démonstrations en direct et d\'ateliers sur les dossiers réels des participants.',
      evaluationMethods: EVALUATION,
      accessibility: ACCESSIBILITE,
      trainerProfile: j.trainerProfile,
      pedagogicalSupport: SUPPORT,
      accessConditions: ACCES,
      priceHT: new Prisma.Decimal(PRIX_JOURNEE_HT),
      vatRate: new Prisma.Decimal('0'),
      theme: j.theme,
      isActive: true,
      capacityMin: 5,
      capacityMax: 25,
      bpfSpecialty: "326 - Informatique, traitement de l'information, réseaux de transmission des données",
      bpfCategory: 'F.3.d - Autres formations professionnelles',
    };

    if (!ecrire) {
      console.log(
        `${j.code} — ${j.title}\n` +
          `   ${donnees.durationHours} h · ${PRIX_JOURNEE_HT} € HT · ${j.theme}\n` +
          `   ${j.objectives.length} objectifs · ${programMd.split('\n').filter((l) => l.startsWith('- ')).length} lignes de déroulé · ${new Set(refs).size} capsules Faros\n`,
      );
      continue;
    }

    const avant = await prisma.trainingProduct.findUnique({
      where: { tenantId_code: { tenantId: TENANT_ID, code: j.code } },
      select: { id: true },
    });

    await prisma.trainingProduct.upsert({
      where: { tenantId_code: { tenantId: TENANT_ID, code: j.code } },
      create: { tenantId: TENANT_ID, code: j.code, ...donnees },
      update: donnees,
    });

    console.log(`${avant ? 'mis à jour' : 'créé     '} ${j.code} — ${j.title}`);
  }

  if (ecrire) {
    const codes = JOURNEES_FAROS.map((j) => j.code);
    const relus = await prisma.trainingProduct.findMany({
      where: { tenantId: TENANT_ID, code: { in: codes } },
      select: { code: true, title: true, durationHours: true, priceHT: true, isActive: true, programMd: true },
      orderBy: { code: 'asc' },
    });
    console.log(`\n--- relecture : ${relus.length}/4 ---`);
    for (const r of relus) {
      console.log(
        `${r.code} · ${r.durationHours} h · ${r.priceHT} € · actif=${r.isActive} · ` +
          `${r.programMd.split('\n').filter((l) => l.startsWith('- ')).length} lignes · ${r.title}`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
