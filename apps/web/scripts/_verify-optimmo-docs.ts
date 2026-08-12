/**
 * _verify-optimmo-docs.ts — Contrôle final LECTURE SEULE (quick 2026-08-12) :
 * les 2 Documents PROD-0674/SES-0106 résolvent bien un objet Supabase (%PDF-),
 * et l'état des inscriptions est conforme (11, somme 4 500,00 €).
 * Run : cd apps/web && node --import tsx --env-file=../../.env scripts/_verify-optimmo-docs.ts
 */
import { prisma } from '@qualiof/db';
import { downloadFile, DOCS_BUCKET } from '../src/lib/storage';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';

async function main() {
  const docs = await prisma.document.findMany({
    where: {
      tenantId: TENANT_ID,
      OR: [
        { type: 'PROGRAMME', entityId: '924ae33d-c144-4d5e-a8ed-353d9f7d5b21' },
        { type: 'CONVENTION', entityId: '63311a5a-6dcb-4557-9bd9-e553d71292ab' },
      ],
    },
    select: { id: true, type: true, pdfUrl: true, hashSha256: true },
  });
  if (docs.length !== 2) throw new Error(`${docs.length} documents ≠ 2`);
  for (const d of docs) {
    const buf = await downloadFile(DOCS_BUCKET, d.pdfUrl);
    const magic = buf.subarray(0, 5).toString('ascii');
    const okMagic = magic === '%PDF-';
    const okSize = buf.length > 10_000 && buf.length < 8 * 1024 * 1024;
    console.log(`${d.type}: ${d.pdfUrl} — ${(buf.length / 1024).toFixed(0)} Ko — magic=${magic} ${okMagic && okSize ? '✅' : '❌'}`);
    if (!okMagic || !okSize) throw new Error(`Objet storage KO pour ${d.type}`);
  }

  const agg = await prisma.sessionParticipant.aggregate({
    where: { session: { code: 'SES-0106', tenantId: TENANT_ID } },
    _sum: { priceHT: true },
    _count: true,
  });
  const slots = await prisma.sessionSlot.count({
    where: { session: { code: 'SES-0106', tenantId: TENANT_ID } },
  });
  console.log(`Inscriptions: ${agg._count} (somme ${agg._sum.priceHT} € HT) — slots: ${slots}`);
  if (agg._count !== 11 || Number(agg._sum.priceHT) !== 4500 || slots !== 38)
    throw new Error('État session non conforme');
  console.log('Contrôle final : TOUT VERT ✅');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
