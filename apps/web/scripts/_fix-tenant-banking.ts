/**
 * _fix-tenant-banking.ts — RIB officiel Start Academy dans le Tenant
 * (quick 2026-08-12, Volet 1bis) : IBAN FR76 1460 7003 3471 2212 3482 230,
 * BIC CCBPFRPPMAR. Stockage COMPACT sans espaces (convention iban-format.ts :
 * « le stockage BDD reste en forme compacte ; les espaces sont cosmétiques »).
 * of-config lit BDD-first (pick(t?.iban, 'OF_IBAN')) → les factures affichent
 * le bloc RIB dès que ces champs sont posés. Idempotent.
 * Run : cd apps/web && node --import tsx --env-file=../../.env scripts/_fix-tenant-banking.ts
 */
import { prisma } from '@qualiof/db';
import { formatIban } from '../src/lib/iban-format';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';
// Recopie stricte Laurent 12/08 (27 caractères, IBAN FR valide).
const IBAN_DISPLAY = 'FR76 1460 7003 3471 2212 3482 230';
const IBAN_COMPACT = IBAN_DISPLAY.replace(/\s/g, '');
const BIC = 'CCBPFRPPMAR';

async function main() {
  if (IBAN_COMPACT.length !== 27 || !IBAN_COMPACT.startsWith('FR'))
    throw new Error(`IBAN invalide : ${IBAN_COMPACT.length} chars`);
  if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(BIC)) throw new Error('BIC invalide');
  if (formatIban(IBAN_COMPACT) !== IBAN_DISPLAY)
    throw new Error(`formatIban(${IBAN_COMPACT}) ≠ « ${IBAN_DISPLAY} »`);

  const before = await prisma.tenant.findUnique({
    where: { id: TENANT_ID },
    select: { iban: true, bic: true },
  });
  console.log('AVANT :', JSON.stringify(before));
  await prisma.tenant.update({
    where: { id: TENANT_ID },
    data: { iban: IBAN_COMPACT, bic: BIC },
  });
  const after = await prisma.tenant.findUnique({
    where: { id: TENANT_ID },
    select: { iban: true, bic: true },
  });
  console.log('APRÈS :', JSON.stringify(after));
  console.log(`Affichage facture : IBAN ${formatIban(after!.iban)} / BIC ${after!.bic} ✅`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
