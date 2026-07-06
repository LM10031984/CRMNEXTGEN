/**
 * BACKFILL (LOT 1) — Recrée les Document pointers DEROULE_PEDAGOGIQUE manquants
 * au niveau PRODUIT.
 *
 * Contexte (bug "déroulé non cliquable") : la génération de masse 2025/2026 a
 * écrit les PDF déroulé dans le Drive mais n'a persisté le Document pointer
 * (entityType='product', type='DEROULE_PEDAGOGIQUE') que pour une partie des
 * produits utilisés. La fiche session ne montre un lien cliquable ("Voir le
 * PDF") que si ce Document existe en base, sinon elle propose "Générer".
 *
 * Ce script, pour chaque produit UTILISÉ par au moins une session, dont
 * TrainingProduct.derouleJson est NON NUL et qui n'a PAS de Document déroulé :
 *   1. Re-rend le PDF À PARTIR DU derouleJson FIGÉ (aucun appel LLM/Ollama —
 *      le contenu est déjà gelé et identique à ce qui est dans le Drive).
 *   2. Upload le PDF dans MinIO/S3 via le helper storage existant.
 *   3. Crée la ligne Document (entityType='product', type='DEROULE_PEDAGOGIQUE',
 *      entityId=productId, tenantId, pdfUrl=objectKey, hashSha256).
 *
 * Réutilise STRICTEMENT le chemin de
 * apps/web/src/server/actions/deroule-product-generator.ts (rendu + clé objet +
 * persistance) pour la parité. Ne change AUCUN contenu de génération.
 *
 * Idempotent : un produit qui a déjà un Document déroulé est ignoré.
 *
 * Lancer : pnpm --filter @qualiof/web exec -- dotenv -e ../../.env -- tsx scripts/_backfill-deroule-product-docs.ts
 *   ou      cd apps/web && dotenv -e ../../.env -- tsx scripts/_backfill-deroule-product-docs.ts
 */

import { createHash } from 'node:crypto';

const { prisma } = await import('@qualiof/db');
const { uploadFile, DOCS_BUCKET } = await import('../src/lib/storage');
const { renderHtmlToPdfWeasy } = await import('../src/lib/pdf-render');
const { renderProductDerouleHtml } = await import('../src/lib/closure/deroule-template');

type DerouleContent = Parameters<typeof renderProductDerouleHtml>[1];

async function main() {
  // 1) Produits UTILISÉS par au moins une session (jointure via TrainingSession).
  const used = await prisma.trainingProduct.findMany({
    where: { trainingSessions: { some: {} } },
    select: {
      id: true,
      code: true,
      title: true,
      tenantId: true,
      durationHours: true,
      derouleJson: true,
    },
    orderBy: { code: 'asc' },
  });

  const targets: typeof used = [];
  const noDeroule: typeof used = [];

  for (const p of used) {
    if (p.derouleJson == null) {
      noDeroule.push(p);
      continue;
    }
    // Idempotence : skip si un Document déroulé existe déjà pour ce produit.
    const existing = await prisma.document.findFirst({
      where: {
        tenantId: p.tenantId,
        type: 'DEROULE_PEDAGOGIQUE',
        entityType: 'product',
        entityId: p.id,
      },
      select: { id: true },
    });
    if (existing) continue;
    targets.push(p);
  }

  console.log(`Produits utilisés : ${used.length}`);
  console.log(`Cibles LOT 1 (derouleJson présent, pas de Document) : ${targets.length}`);
  console.log(`Hors scope (pas de derouleJson) : ${noDeroule.length}\n`);

  let created = 0;
  const failures: { code: string; error: string }[] = [];

  for (const p of targets) {
    try {
      const content = p.derouleJson as unknown as DerouleContent;
      if (!content || !Array.isArray((content as any).jours) || (content as any).jours.length === 0) {
        throw new Error('derouleJson sans jours exploitables');
      }

      // Rendu — MÊME chemin que deroule-product-generator.ts (parité exacte).
      const html = renderProductDerouleHtml(
        {
          produitTitre: p.title,
          produitCode: p.code,
          produitDureeHeures: p.durationHours,
        },
        content,
      );
      const pdfBuffer = await renderHtmlToPdfWeasy(html);

      const hash = createHash('sha256').update(pdfBuffer).digest('hex');
      const safeSlug = p.code
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const objectKey = `deroules/produits/${safeSlug}-${hash.slice(0, 8)}.pdf`;

      await uploadFile(DOCS_BUCKET, objectKey, pdfBuffer, 'application/pdf');

      const doc = await prisma.document.create({
        data: {
          tenantId: p.tenantId,
          type: 'DEROULE_PEDAGOGIQUE',
          entityType: 'product',
          entityId: p.id,
          pdfUrl: objectKey,
          hashSha256: hash,
        },
      });

      created++;
      console.log(
        `✓ ${p.code} — ${(content as any).jours.length}j — ${(pdfBuffer.length / 1024).toFixed(0)}KB — doc=${doc.id} — ${objectKey}`,
      );
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      failures.push({ code: p.code, error: msg });
      console.error(`✗ ${p.code} — ${msg}`);
    }
  }

  console.log(`\n=== RÉSUMÉ ===`);
  console.log(`Document créés : ${created}/${targets.length}`);
  if (failures.length) {
    console.log(`Échecs : ${failures.length}`);
    for (const f of failures) console.log(`  - ${f.code}: ${f.error}`);
  }
  if (noDeroule.length) {
    console.log(`\nHors scope LOT 1 (à traiter séparément — pas de derouleJson figé) :`);
    for (const p of noDeroule) console.log(`  - ${p.code} | ${p.title}`);
  }

  await prisma.$disconnect();
}

await main();
