/**
 * fix-data-ses-0086.ts — Correction documentée du dossier SES-0086
 * (Tracfin 4h, 15/04/2026, 29 apprenants Riviera Estates).
 *
 * Contexte (audit Laurent runtime 09/06/2026) :
 *   SES-0086 pointait sur PROD-0662 (« Maîtriser l'IA pour développer son
 *   activité ») au lieu de PROD-0671 (« Tracfin »). 12 certificats + 12
 *   conventions ont été générés sur le programme IA et stockés en BDD/MinIO.
 *   Laurent a confirmé que ces docs sont restés EN INTERNE (jamais envoyés
 *   aux apprenants ni à l'AGEFICE) — correction silencieuse possible.
 *
 *   Le re-link a été fait à la main via Prisma brute le 09/06 — ce script
 *   ferme la boucle audit en posant les AuditLogs honnêtes et en marquant
 *   les anciens docs en `superseded`. Pas de régénération automatique des
 *   nouveaux PDFs : Laurent relance via l'UI quand il veut.
 *
 * Posture audit Qualiopi :
 *   - AuditLogs datés du 09/06/2026, userId=null, libellé clair
 *     « data-fix-script », jamais backdaté pour mimer un clic in-app
 *   - Anciens PDFs conservés en MinIO (audit trail) — le swap est en BDD
 *     via `Document.status = 'superseded'`
 *   - `diff` AuditLog porte la raison et les valeurs avant/après
 *
 * Idempotent : re-run = no-op (skip si déjà appliqué).
 *
 * Usage :
 *   pnpm tsx scripts/fix-data-ses-0086.ts --dry-run    # défaut, affiche
 *   pnpm tsx scripts/fix-data-ses-0086.ts --execute    # applique
 */

import { prisma } from '@qualiof/db';

const SESSION_CODE = 'SES-0086';
const WRONG_PRODUCT_CODE = 'PROD-0662';
const CORRECT_PRODUCT_CODE = 'PROD-0671';
const CORRECT_PRICE_HT_PER_LEARNER = 144; // 4176€ budget total / 29 apprenants
const PROGRAM_INJECTED_LENGTH = 4482; // longueur du markdown injecté manuellement le 09/06
const FIX_DATE = '2026-06-09';

const DRY_RUN = !process.argv.includes('--execute');

function log(label: string, val?: unknown) {
  if (val !== undefined) console.log(`  ${label}:`, val);
  else console.log(label);
}

async function main() {
  console.log(DRY_RUN ? '🔎 DRY-RUN' : '🚀 EXECUTE');
  console.log(`Cible : ${SESSION_CODE} (${WRONG_PRODUCT_CODE} → ${CORRECT_PRODUCT_CODE})\n`);

  // ── Récupérations préalables ────────────────────────────────────────
  const session = await prisma.trainingSession.findFirst({
    where: { code: SESSION_CODE },
    include: { product: true },
  });
  if (!session) throw new Error(`${SESSION_CODE} introuvable`);

  const correctProduct = await prisma.trainingProduct.findFirst({
    where: { code: CORRECT_PRODUCT_CODE },
    select: { id: true, code: true, programMd: true, durationHours: true, priceHT: true },
  });
  if (!correctProduct) throw new Error(`${CORRECT_PRODUCT_CODE} introuvable`);

  const oldDocs = await prisma.document.findMany({
    where: {
      sessionId: session.id,
      type: { in: ['CERTIFICAT_REALISATION', 'CONVENTION'] },
      status: { not: 'superseded' },
    },
    select: { id: true, type: true, participantId: true, status: true, createdAt: true },
  });

  log(`État actuel SES-0086 :`);
  log(`  productId actuel`, `${session.product?.code} (attendu : ${CORRECT_PRODUCT_CODE})`);
  log(`  pricePerLearner actuel`, `${session.pricePerLearner}€ (attendu : ${CORRECT_PRICE_HT_PER_LEARNER}€)`);
  log(`  participants`, session.participantsCount ?? '(non précisé)');
  log(`  docs IA non-superseded (cert+conv)`, oldDocs.length);
  log(`  programMd PROD-0671 longueur`, correctProduct.programMd?.length ?? 0);

  // ── Détection des actions à mener ────────────────────────────────────
  const tenantId = session.tenantId;
  const needRelink = session.productId !== correctProduct.id;
  const needPriceFix = session.pricePerLearner?.toNumber?.() !== CORRECT_PRICE_HT_PER_LEARNER;
  const needSuperseded = oldDocs.length > 0;

  // Vérification idempotence sur AuditLog : a-t-on déjà loggué le relink ?
  const existingRelinkAudit = await prisma.auditLog.findFirst({
    where: { tenantId, entity: 'session', entityId: session.id, action: 'session.productRelink' },
  });
  const existingPriceAudit = await prisma.auditLog.findFirst({
    where: { tenantId, entity: 'session', entityId: session.id, action: 'session.priceFix' },
  });
  const existingProgramAudit = await prisma.auditLog.findFirst({
    where: { tenantId, entity: 'product', entityId: correctProduct.id, action: 'product.programInjected' },
  });

  console.log('\nActions à mener :');
  log(`  relink productId`, needRelink ? 'OUI' : `non (déjà ${CORRECT_PRODUCT_CODE})`);
  log(`  log relink AuditLog`, existingRelinkAudit ? 'non (déjà loggé)' : 'OUI');
  log(`  fix prix → 144€`, needPriceFix ? 'OUI' : 'non (déjà 144€)');
  log(`  log priceFix AuditLog`, existingPriceAudit ? 'non (déjà loggé)' : 'OUI');
  log(`  log programInjected AuditLog`, existingProgramAudit ? 'non (déjà loggé)' : 'OUI');
  log(`  marquer ${oldDocs.length} docs IA superseded`, needSuperseded ? 'OUI' : 'non (aucun)');

  if (DRY_RUN) {
    console.log('\n🔎 DRY-RUN — rien n\'a été modifié. Relance avec --execute pour appliquer.');
    return;
  }

  // ── Transaction atomique ────────────────────────────────────────────
  await prisma.$transaction(async (tx) => {
    // 1. Re-link productId si nécessaire
    if (needRelink) {
      await tx.trainingSession.update({
        where: { id: session.id },
        data: { productId: correctProduct.id },
      });
    }
    if (!existingRelinkAudit) {
      await tx.auditLog.create({
        data: {
          tenantId, userId: null,
          entity: 'session', entityId: session.id, action: 'session.productRelink',
          diff: {
            from: { code: session.product?.code, id: session.productId },
            to: { code: correctProduct.code, id: correctProduct.id },
            reason: `Correction data ${FIX_DATE} via fix-data-ses-0086.ts. Le produit lié pointait sur ${WRONG_PRODUCT_CODE} (IA) alors que la session "${session.name}" a réellement enseigné Tracfin 4h (confirmé Riviera Estates 15/04/2026, programme PDF Drive du jour même).`,
            scriptVersion: '2026-06-09-1',
          },
        },
      });
    }

    // 2. Fix prix
    if (needPriceFix) {
      await tx.trainingSession.update({
        where: { id: session.id },
        data: { pricePerLearner: CORRECT_PRICE_HT_PER_LEARNER },
      });
    }
    if (!existingPriceAudit) {
      await tx.auditLog.create({
        data: {
          tenantId, userId: null,
          entity: 'session', entityId: session.id, action: 'session.priceFix',
          diff: {
            from: session.pricePerLearner?.toNumber?.() ?? null,
            to: CORRECT_PRICE_HT_PER_LEARNER,
            reason: `Bug import SmartOF : pricePerLearner = budget total (4176€) au lieu de budgetTotal/N apprenants (4176/29 = 144€). Cf. memory feedback_smartof_formule_prix_2026_06_03.`,
            scriptVersion: '2026-06-09-1',
          },
        },
      });
    }

    // 3. Log programme injecté (déjà fait manuellement plus tôt le 09/06)
    if (!existingProgramAudit) {
      await tx.auditLog.create({
        data: {
          tenantId, userId: null,
          entity: 'product', entityId: correctProduct.id, action: 'product.programInjected',
          diff: {
            programMdLength: PROGRAM_INJECTED_LENGTH,
            source: `Programme Tracfin 4h fourni par Laurent ${FIX_DATE} — issu de Drive "Programme Tracfin 4h (1).pdf" créé 15/04/2026 = jour SES-0086`,
            content_summary: 'TRACFIN et lutte contre le blanchiment — Objectifs verbes Bloom (Comprendre/Identifier/Reconnaître/Remplir/Réagir), 4h en 2 parties (Fondamentaux + Mises en situation), méthodes mobilisées, accessibilité PSH',
            scriptVersion: '2026-06-09-1',
          },
        },
      });
    }

    // 4. Marquer docs IA superseded + 1 AuditLog par doc
    for (const d of oldDocs) {
      await tx.document.update({
        where: { id: d.id },
        data: { status: 'superseded' },
      });
      await tx.auditLog.create({
        data: {
          tenantId, userId: null,
          entity: 'document', entityId: d.id, action: 'document.superseded',
          diff: {
            from: { status: d.status },
            to: { status: 'superseded' },
            docType: d.type,
            participantId: d.participantId,
            generatedAt: d.createdAt.toISOString(),
            reason: `Document généré sur produit erroné ${WRONG_PRODUCT_CODE} (IA) au lieu de ${CORRECT_PRODUCT_CODE} (Tracfin). Programme du certificat/convention parlait d'IA alors que la formation enseignée le 15/04/2026 portait sur Tracfin. Confirmé que ces docs n'ont JAMAIS été envoyés à l'extérieur (apprenants ni AGEFICE) — correction silencieuse. PDF original conservé en MinIO pour audit trail.`,
            replacementProduct: { code: correctProduct.code, id: correctProduct.id },
            scriptVersion: '2026-06-09-1',
          },
        },
      });
    }
  });

  console.log('\n✅ Transaction OK. État final :');
  const after = await prisma.trainingSession.findFirst({
    where: { id: session.id },
    select: {
      product: { select: { code: true, title: true } },
      pricePerLearner: true,
      documents: {
        where: { type: { in: ['CERTIFICAT_REALISATION', 'CONVENTION'] } },
        select: { type: true, status: true },
      },
    },
  });
  log(`  product`, `${after?.product?.code} ${after?.product?.title}`);
  log(`  pricePerLearner`, after?.pricePerLearner);
  const byStatus = new Map<string, number>();
  for (const d of after?.documents ?? []) {
    const k = `${d.type}:${d.status}`;
    byStatus.set(k, (byStatus.get(k) ?? 0) + 1);
  }
  for (const [k, c] of byStatus) log(`  ${k}`, c);

  console.log('\n📋 Prochaines étapes manuelles (UI) :');
  console.log('   1. Vérifier que PROD-0671.programMd est conforme T2 Qualiopi');
  console.log('   2. Sur fiche SES-0086, relancer "Pack fin de formation" pour régénérer les');
  console.log('      24 docs (12 cert + 12 conv) avec le bon programme Tracfin.');
  console.log('   3. Optionnel : générer les docs des 17 apprenants restants si pertinent.');
}

main()
  .catch((e) => { console.error('❌', e); process.exit(1); })
  .finally(() => process.exit(0));
