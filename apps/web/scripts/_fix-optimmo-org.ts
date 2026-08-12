/**
 * _fix-optimmo-org.ts — Corrections Laurent 12/08 sur OPTIMMO SARL (quick) :
 *   - L'agence n'est PLUS sous enseigne Century 21 → brandName/network retirés.
 *   - Adresse siège = 29 boulevard Simone Veil, 06200 Nice (remplace
 *     2 avenue Saint Sylvestre 06100).
 *   - Contact Gilles Blanchon : fonction « Gérant » (formulation retenue).
 *   - Email gilles.blanchon@century21.fr CONSERVÉ (adresse réelle).
 *   - Vérifie que la Location « Locaux OPTIMMO » porte la MÊME adresse.
 * Run : cd apps/web && node --import tsx --env-file=../../.env scripts/_fix-optimmo-org.ts
 */
import { prisma, Prisma } from '@qualiof/db';
import { buildAddress } from '@qualiof/shared';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';
const SIRET = '43143029700033';
const ADDR = { street: '29 Boulevard Simone Veil', postalCode: '06200', city: 'NICE' };

async function main() {
  const org = await prisma.organization.findFirst({
    where: { tenantId: TENANT_ID, siret: SIRET },
    select: { id: true, legalName: true, brandName: true, network: true, address: true, email: true },
  });
  if (!org) throw new Error('OPTIMMO introuvable');
  console.log('AVANT :', JSON.stringify({ brandName: org.brandName, network: org.network, address: org.address }));

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      brandName: null, // plus d'enseigne Century 21 — agence indépendante
      network: null,
      address: buildAddress(ADDR) as Prisma.InputJsonValue,
    },
  });

  const contact = await prisma.contact.findFirst({
    where: { organizationId: org.id, lastName: { equals: 'Blanchon', mode: 'insensitive' } },
    select: { id: true, function: true, email: true },
  });
  if (contact) {
    await prisma.contact.update({ where: { id: contact.id }, data: { function: 'Gérant' } });
    console.log(`Contact Blanchon : function « ${contact.function} » → « Gérant » (email conservé : ${contact.email})`);
  }

  const after = await prisma.organization.findUnique({
    where: { id: org.id },
    select: { brandName: true, network: true, address: true, email: true },
  });
  console.log('APRÈS :', JSON.stringify(after));

  const loc = await prisma.location.findFirst({
    where: { tenantId: TENANT_ID, name: { equals: 'Locaux OPTIMMO', mode: 'insensitive' } },
    select: { id: true, legalName: true, address: true },
  });
  console.log('LOCATION :', JSON.stringify(loc?.address));
  const locAddr = loc?.address as Record<string, string> | null;
  if (locAddr?.street !== ADDR.street || locAddr?.postalCode !== ADDR.postalCode)
    throw new Error('Location ≠ adresse siège — incohérence à corriger');
  console.log('✅ Une seule adresse partout : 29 Boulevard Simone Veil, 06200 NICE');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
