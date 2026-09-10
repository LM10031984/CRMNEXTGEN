/**
 * Contrat de montants — `Invoice.amountHT === Σ InvoiceLine.totalHT`.
 *
 * C'est le E-2 de l'audit du 28/08 appliqué à la pièce comptable : le jour où
 * quelqu'un corrigera un montant « à plat » sur `Invoice` sans toucher aux
 * lignes, la facture et le futur XML Factur-X raconteront deux histoires
 * différentes — l'une chez le client, l'autre chez l'État.
 *
 * ── Deux précautions, tirées de la passation du 03/09 ────────────────────
 *
 * ① Le contrat ne porte QUE sur les factures qui ont au moins une ligne.
 *    Aucune facture du parc n'en a avant le passage de
 *    `scripts/backfill-invoice-lines.ts`, et le code de commerce interdit de
 *    réécrire une pièce émise : un test qui échouerait sur ce parc-là
 *    demanderait une correction interdite.
 *
 * ② La comparaison se fait en `Number`, comme partout dans le dépôt. Comparer
 *    des `Decimal` Prisma rendrait l'égalité toujours fausse.
 *
 * Le scan sur base réelle est VOLONTAIREMENT vide aujourd'hui (`qualiof_test`
 * ne porte pas de factures) : il devient un filet le jour où elle en portera.
 * Ce qui est prouvé ici et maintenant, c'est le DÉTECTEUR — sur une facture
 * cohérente et sur une facture délibérément fausse, en transaction annulée.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaClientForUrl, Prisma } from '@qualiof/db';

// Même garde d'environnement que `scripts/__tests__/dedupe.merge.test.ts` :
// base DÉDIÉE `*_test`, jamais la prod-locale.
const TEST_URL = process.env.TEST_DATABASE_URL;
function dbName(u: string): string {
  return new URL(u).pathname.replace(/^\//, '');
}
if (!TEST_URL || !/_test$/.test(dbName(TEST_URL))) {
  throw new Error(
    'REFUS: invoices-lines-contract exige TEST_DATABASE_URL pointant une base *_test dédiée',
  );
}

const db = createPrismaClientForUrl(TEST_URL);

afterAll(async () => {
  await db.$disconnect();
});

/** Le détecteur, en une expression : ce que le script de backfill rapporte aussi. */
function ecart(amountHT: unknown, lines: { totalHT: unknown }[]): number {
  const total = lines.reduce((s, l) => s + Number(l.totalHT), 0);
  return Math.round((Number(amountHT) - total) * 100) / 100;
}

describe('contrat de montants — le détecteur', () => {
  it('ne signale rien sur une facture dont les lignes redonnent le total', async () => {
    await expect(
      db
        .$transaction(async (tx) => {
          const tenant = await tx.tenant.create({
            data: { name: 'TEST-TENANT-einvoice-contract' },
          });
          const invoice = await tx.invoice.create({
            data: {
              tenantId: tenant.id,
              number: `TEST-CONTRAT-OK-${Date.now()}`,
              status: 'ISSUED',
              amountHT: new Prisma.Decimal(2700),
              vatRate: new Prisma.Decimal(0),
              amountTTC: new Prisma.Decimal(2700),
              lines: {
                create: [
                  {
                    position: 1,
                    label: 'Stagiaire A',
                    quantity: new Prisma.Decimal(1),
                    unitPriceHT: new Prisma.Decimal(1500),
                    vatRate: new Prisma.Decimal(0),
                    totalHT: new Prisma.Decimal(1500),
                  },
                  {
                    position: 2,
                    label: 'Stagiaire B',
                    quantity: new Prisma.Decimal(1),
                    unitPriceHT: new Prisma.Decimal(1200),
                    vatRate: new Prisma.Decimal(0),
                    totalHT: new Prisma.Decimal(1200),
                  },
                ],
              },
            },
            include: { lines: true },
          });

          expect(invoice.lines).toHaveLength(2);
          expect(ecart(invoice.amountHT, invoice.lines)).toBe(0);

          // Rollback : rien ne persiste sur qualiof_test.
          throw new Error('ROLLBACK_ATTENDU');
        })
        .catch((e: Error) => {
          if (e.message !== 'ROLLBACK_ATTENDU') throw e;
          return 'annulé';
        }),
    ).resolves.toBe('annulé');
  });

  it('signale une facture dont une ligne a été rognée', async () => {
    await expect(
      db
        .$transaction(async (tx) => {
          const tenant = await tx.tenant.create({
            data: { name: 'TEST-TENANT-einvoice-contract' },
          });
          const invoice = await tx.invoice.create({
            data: {
              tenantId: tenant.id,
              number: `TEST-CONTRAT-KO-${Date.now()}`,
              status: 'ISSUED',
              amountHT: new Prisma.Decimal(2700),
              vatRate: new Prisma.Decimal(0),
              amountTTC: new Prisma.Decimal(2700),
              lines: {
                create: [
                  {
                    position: 1,
                    label: 'Stagiaire A',
                    quantity: new Prisma.Decimal(1),
                    unitPriceHT: new Prisma.Decimal(1500),
                    vatRate: new Prisma.Decimal(0),
                    totalHT: new Prisma.Decimal(1500),
                  },
                ],
              },
            },
            include: { lines: true },
          });

          expect(ecart(invoice.amountHT, invoice.lines)).toBe(1200);

          throw new Error('ROLLBACK_ATTENDU');
        })
        .catch((e: Error) => {
          if (e.message !== 'ROLLBACK_ATTENDU') throw e;
          return 'annulé';
        }),
    ).resolves.toBe('annulé');
  });
});

describe('contrat de montants — le parc', () => {
  it('aucune facture PORTANT DES LIGNES ne contredit son total', async () => {
    const factures = await db.invoice.findMany({
      where: { lines: { some: {} } },
      select: { number: true, amountHT: true, lines: { select: { totalHT: true } } },
    });

    const fautives = factures
      .map((f) => ({ number: f.number, ecart: ecart(f.amountHT, f.lines) }))
      .filter((f) => f.ecart !== 0);

    expect(fautives).toEqual([]);
  });
});
