import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Quick 260910-lon — l'invariante du §4 de la spec
 * `.planning/specs/2026-09-10-datation-numerotation-factures.md`, rendue
 * exécutable :
 *
 *   Pour un tenant et un préfixe donnés, l'ordre des numéros suit l'ordre des
 *   dates d'émission : number(n) > number(n-1) ⟹ issueDate(n) >= issueDate(n-1).
 *
 * `scripts/audit-invoice-chronology.ts` (lot A) vérifie cette invariante SUR LE
 * PARC EXISTANT, à froid, contre la base. Ce test-ci la vérifie À L'ÉMISSION,
 * sur la mécanique qui la produit : la numérotation et la datation, jouées
 * ensemble comme le fait `invoices.ts`. Les deux sont nécessaires — l'un mesure
 * l'histoire, l'autre empêche d'en écrire une nouvelle.
 *
 * Le scénario rejoué est le scénario RÉEL du §5, celui qui a produit les cinq
 * ruptures : des sessions de juin et juillet facturées en septembre, dans le
 * désordre. Avant le lot B, ce test était rouge par construction — FAC-000002,
 * daté de la fin de session du 12 juin, reculait derrière FAC-000001 daté du
 * 4 septembre.
 *
 * Stratégie de mock : identique à `numbering.test.ts` — factory `vi.mock` sur
 * `@qualiof/db`, `tenant.findUnique` + `invoice.findFirst` en `vi.fn()`. Ici on
 * branche `findFirst` sur un registre local alimenté au fur et à mesure, pour
 * que la séquence avance vraiment d'une émission à l'autre.
 */

vi.mock('@qualiof/db', () => {
  return {
    prisma: {
      tenant: { findUnique: vi.fn() },
      invoice: { findFirst: vi.fn() },
    },
  };
});

import { prisma } from '@qualiof/db';
import { getNextInvoiceNumber } from '../numbering';
import { resolveInvoiceIssueDate, resolveInvoiceDueDate } from '../invoice-dates';

const tenantFindUnique = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;
const invoiceFindFirst = prisma.invoice.findFirst as unknown as ReturnType<typeof vi.fn>;

const TENANT = 'tenant-start-academy';
const JOUR_MS = 86_400_000;

interface Piece {
  number: string;
  issueDate: Date;
  dueDate: Date;
}

/** Le parc, tel qu'il grossit au fil des émissions. */
let registre: Piece[];

beforeEach(() => {
  registre = [];
  tenantFindUnique.mockReset();
  invoiceFindFirst.mockReset();

  tenantFindUnique.mockResolvedValue({ invoicePrefix: 'FAC' });
  // `getNextInvoiceNumber` demande le max courant : on le sert depuis le
  // registre, comme le ferait `orderBy: { number: 'desc' }` sur la base.
  invoiceFindFirst.mockImplementation(async () => {
    if (registre.length === 0) return null;
    const trie = [...registre].sort((a, b) => (a.number < b.number ? 1 : -1));
    return { number: trie[0]!.number };
  });
});

/**
 * Une émission, telle que `invoices.ts` la joue : numéro d'abord, puis les deux
 * dates ancrées sur le même instant de clic.
 *
 * `sessionEndDate` redevient UTILE le 21/09/2026 — non pour dater la pièce dans
 * le passé, ce que le lot B a retiré, mais comme PLANCHER : on ne facture pas
 * une prestation qui n'a pas encore eu lieu. Tant que la formation est
 * terminée au moment du clic, le plancher est déjà franchi et cette invariante
 * se joue exactement comme au lot B.
 */
async function emettre(clic: Date, sessionEndDate: Date): Promise<Piece> {
  const number = await getNextInvoiceNumber(TENANT);
  const emission = resolveInvoiceIssueDate({ now: clic, finDeFormation: sessionEndDate });
  const piece: Piece = {
    number,
    issueDate: emission,
    dueDate: resolveInvoiceDueDate(30, emission),
  };
  registre.push(piece);
  return piece;
}

describe('Invariante §4 — les numéros et les dates d’émission montent ensemble', () => {
  it('rejoue le rattrapage de septembre 2026 sans produire une seule rupture', async () => {
    // Le scénario du §5, dans l'ordre où Laurent a cliqué.
    const p1 = await emettre(new Date('2026-09-04T10:00:00Z'), new Date('2026-09-01T17:30:00Z'));
    const p2 = await emettre(new Date('2026-09-07T09:00:00Z'), new Date('2026-06-12T17:30:00Z'));
    const p3 = await emettre(new Date('2026-09-07T11:30:00Z'), new Date('2026-07-20T17:30:00Z'));

    // 1. Les numéros montent, sans trou.
    expect([p1.number, p2.number, p3.number]).toEqual([
      'FAC-000001',
      'FAC-000002',
      'FAC-000003',
    ]);

    // 2. Aucune date d'émission ne recule quand le numéro monte.
    //    C'est l'invariante, mot pour mot.
    for (let i = 1; i < registre.length; i++) {
      const precedent = registre[i - 1]!;
      const courant = registre[i]!;
      expect(courant.number > precedent.number).toBe(true);
      expect(courant.issueDate.getTime()).toBeGreaterThanOrEqual(precedent.issueDate.getTime());
    }
  });

  it('la fin de prestation ne tire plus la date vers le passé : juin facturé en septembre reste septembre', async () => {
    const p = await emettre(new Date('2026-09-07T09:00:00Z'), new Date('2026-06-12T17:30:00Z'));

    expect(p.issueDate).toEqual(new Date('2026-09-07T09:00:00Z'));
    expect(p.issueDate.getUTCMonth()).toBe(8); // septembre, pas juin
  });

  it('⚠ le plancher du 21/09 peut rompre l’invariante quand on facture AVANT la fin', async () => {
    // Ce test ne célèbre pas un défaut : il le rend visible et mesurable.
    // Émettre pour une session à venir date la pièce en avant ; la suivante,
    // émise le lendemain pour une session déjà close, porte le jour du clic et
    // se retrouve donc ANTÉRIEURE avec un numéro SUPÉRIEUR.
    const avenir = await emettre(new Date('2026-09-21T05:27:00Z'), new Date('2026-09-29T00:00:00Z'));
    const passee = await emettre(new Date('2026-09-22T09:00:00Z'), new Date('2026-06-12T17:30:00Z'));

    expect(avenir.issueDate).toEqual(new Date('2026-09-29T00:00:00Z'));
    expect(passee.number > avenir.number).toBe(true);
    expect(passee.issueDate.getTime()).toBeLessThan(avenir.issueDate.getTime());

    // La parade n'est pas de rétablir l'ancienne règle — on ne facture pas
    // avant d'avoir livré — mais de ne pas ÉMETTRE avant la fin de formation.
    // Ce garde-fou est le chantier qui suit ; ce test tombera quand il sera là.
  });

  it('deux pièces émises le même jour ne se contredisent pas', async () => {
    const p2 = await emettre(new Date('2026-09-07T09:00:00Z'), new Date('2026-06-12T17:30:00Z'));
    const p3 = await emettre(new Date('2026-09-07T11:30:00Z'), new Date('2026-07-20T17:30:00Z'));

    expect(p3.number > p2.number).toBe(true);
    expect(p3.issueDate.getTime()).toBeGreaterThanOrEqual(p2.issueDate.getTime());
  });

  it('chaque échéance vaut son émission + 30 jours — pas une date déjà passée', async () => {
    await emettre(new Date('2026-09-04T10:00:00Z'), new Date('2026-09-01T17:30:00Z'));
    await emettre(new Date('2026-09-07T09:00:00Z'), new Date('2026-06-12T17:30:00Z'));
    await emettre(new Date('2026-09-07T11:30:00Z'), new Date('2026-07-20T17:30:00Z'));

    for (const piece of registre) {
      expect(piece.dueDate.getTime() - piece.issueDate.getTime()).toBe(30 * JOUR_MS);
      // La contrainte métier derrière le calcul : une facture rattrapée ne naît
      // pas en retard, donc le cron de relances ne part pas tout seul.
      expect(piece.dueDate.getTime()).toBeGreaterThan(piece.issueDate.getTime());
    }
  });
});
