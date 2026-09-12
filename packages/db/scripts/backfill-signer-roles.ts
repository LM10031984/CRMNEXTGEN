/**
 * Rattrapage prod, 12/09/2026 — « qui signe quoi » (D-10).
 *
 * La migration 20260910160000_signature_regime_financement est ADDITIVE, sans
 * backfill : en prod les trois colonnes SignerRole d'OpcoCatalog sont restées
 * NULL, donc TOUTES les pièces sortent « hors régime » et le bloc Signature est
 * muet (constaté sur SES-0112). Ce script ne touche QUE ces trois colonnes, avec
 * les valeurs de référence du seed — rien d'autre du catalogue n'est réécrit.
 *
 * Usage (volontairement explicite, cible prod) :
 *   SEED_ALLOW_PROD=1 pnpm --filter @qualiof/db exec dotenv -e ../../.env -- tsx scripts/backfill-signer-roles.ts
 */
import { PrismaClient, SignerRole } from '@prisma/client';
import { assertCibleAutorisee } from './assert-db-target.js';

const prisma = new PrismaClient();

const REGIMES: Record<
  string,
  { conventionSigner: SignerRole | null; ageficeSigner: SignerRole | null; assiduiteSigner: SignerRole | null }
> = {
  AGEFICE: { conventionSigner: 'DIRIGEANT', ageficeSigner: 'STAGIAIRE', assiduiteSigner: 'STAGIAIRE' },
  OPCO_EP: { conventionSigner: 'DIRIGEANT', ageficeSigner: null, assiduiteSigner: null },
  ATLAS: { conventionSigner: 'DIRIGEANT', ageficeSigner: null, assiduiteSigner: null },
  OPCOMMERCE: { conventionSigner: 'DIRIGEANT', ageficeSigner: null, assiduiteSigner: null },
  CPF: { conventionSigner: 'STAGIAIRE', ageficeSigner: null, assiduiteSigner: null },
  'FI-FPL': { conventionSigner: 'STAGIAIRE', ageficeSigner: null, assiduiteSigner: null },
};

async function main(): Promise<void> {
  assertCibleAutorisee('Rattrapage des rôles de signature (OpcoCatalog)');

  const avant = await prisma.opcoCatalog.findMany({
    select: { code: true, conventionSigner: true, ageficeSigner: true, assiduiteSigner: true },
    orderBy: { code: 'asc' },
  });
  console.log('Avant :');
  for (const o of avant) console.log(`  ${o.code.padEnd(11)} ${o.conventionSigner ?? '—'} / ${o.ageficeSigner ?? '—'} / ${o.assiduiteSigner ?? '—'}`);

  for (const [code, regime] of Object.entries(REGIMES)) {
    const r = await prisma.opcoCatalog.updateMany({ where: { code }, data: regime });
    console.log(`  ${code.padEnd(11)} → ${r.count} ligne(s) mise(s) à jour`);
  }

  const apres = await prisma.opcoCatalog.findMany({
    select: { code: true, conventionSigner: true, ageficeSigner: true, assiduiteSigner: true },
    orderBy: { code: 'asc' },
  });
  console.log('Après :');
  for (const o of apres) console.log(`  ${o.code.padEnd(11)} ${o.conventionSigner ?? '—'} / ${o.ageficeSigner ?? '—'} / ${o.assiduiteSigner ?? '—'}`);
  const inconnus = apres.filter((o) => !(o.code in REGIMES)).map((o) => o.code);
  if (inconnus.length > 0) console.log(`⚠ codes hors référentiel, laissés NULL (hors régime) : ${inconnus.join(', ')}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
