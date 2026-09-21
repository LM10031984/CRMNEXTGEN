import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveInvoiceIssueDate, resolveInvoiceDueDate } from '../invoice-dates';

/**
 * Quick 260910-lon — lot B de la spec
 * `.planning/specs/2026-09-10-datation-numerotation-factures.md`.
 *
 * Ce fichier REMPLACE les tests de la décision du 13/08/2026, qui disaient la
 * règle inverse : « une facture se date de la fin de la prestation ». Cette
 * règle est révisée, pas oubliée — l'histoire complète vit dans l'en-tête de
 * `invoice-dates.ts`, et le résumé tient en deux lignes : le numéro était
 * attribué à l'instant du clic pendant que la date venait de la fin de session,
 * donc deux horloges, donc une numérotation qui n'était plus chronologique
 * (5 ruptures mesurées sur 31 pièces le 10/09/2026).
 *
 * ── Plancher du 21/09/2026 ──────────────────────────────────────────────
 *
 * Le lot B laissait passer une pièce datée AVANT la fin de la prestation :
 * les 7 factures de SES-0111 (formation du 28 au 29/09) sont sorties datées du
 * 21/09. L'émission reçoit donc un plancher — `max(jour d'établissement, fin
 * de formation)` — sans rien changer au cas courant, où la formation est déjà
 * terminée quand on facture. Les tests de ce fichier disent les DEUX cas.
 *
 * ⚠ Note de méthode, pour qui relira ce fichier en croyant l'améliorer.
 * Aucune assertion de VALEUR sur `resolveInvoiceIssueDate` en un seul argument
 * n'était RED avant le lot B : l'ancienne implémentation
 * `(sessionEndDate, now = new Date()) => …` rendait l'argument reçu, donc
 * `resolveInvoiceIssueDate(CLIC) === CLIC` passait DÉJÀ. Ce qui fait vraiment
 * le rouge ici, ce sont trois faits structurels :
 *   · l'arité de la fonction (1 → 0) ;
 *   · les deux points d'appel de `invoices.ts` qui ne passent plus
 *     `session.endDate` ;
 *   · `resolveInvoiceDueDate`, qui n'existait pas.
 * Les tests de valeur restent là pour se LIRE — ils disent la règle à voix
 * haute — pas pour prouver qu'elle a changé.
 */

const INVOICES_SRC = readFileSync(
  path.join(__dirname, '..', '..', 'server', 'actions', 'invoices.ts'),
  'utf-8',
);

afterEach(() => {
  vi.useRealTimers();
});

describe('resolveInvoiceIssueDate — le jour où on l’établit, jamais avant la fin de formation', () => {
  it('formation terminée : la pièce porte le jour d’établissement (règle du lot B, intacte)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T09:12:00Z'));

    // Session de juin facturée en septembre : la date reste septembre, sinon
    // la numérotation cesse d'être chronologique (5 ruptures mesurées le 10/09).
    expect(resolveInvoiceIssueDate({ finDeFormation: new Date('2026-06-12T00:00:00Z') })).toEqual(
      new Date('2026-09-21T09:12:00Z'),
    );
  });

  it('formation à venir : la pièce porte la fin de formation, pas le jour du clic', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T05:27:00Z'));

    // Le cas SES-0111 : 7 factures émises le 21/09 pour une formation qui se
    // termine le 29. On ne facture pas une prestation qui n'a pas eu lieu.
    expect(resolveInvoiceIssueDate({ finDeFormation: new Date('2026-09-29T00:00:00Z') })).toEqual(
      new Date('2026-09-29T00:00:00Z'),
    );
  });

  it('formation qui se termine aujourd’hui : le jour d’établissement l’emporte', () => {
    const now = new Date('2026-09-29T16:40:00Z');
    // Fin de session à minuit, facture éditée en fin de journée : c'est l'heure
    // réelle d'établissement qui est la plus tardive, donc celle qui est portée.
    expect(
      resolveInvoiceIssueDate({ finDeFormation: new Date('2026-09-29T00:00:00Z'), now }),
    ).toEqual(now);
  });

  it('sans date de fin connue, rend le jour d’établissement', () => {
    const clic = new Date('2026-09-04T14:30:00Z');
    expect(resolveInvoiceIssueDate({ now: clic })).toEqual(clic);
    expect(resolveInvoiceIssueDate({ finDeFormation: null, now: clic })).toEqual(clic);
  });

  it('ne rend JAMAIS une date antérieure à la fin de formation', () => {
    // La propriété, énoncée une fois pour toutes plutôt que cas par cas.
    const fins = ['2026-01-05', '2026-09-21', '2027-03-30'].map((d) => new Date(d + 'T00:00:00Z'));
    const now = new Date('2026-09-21T05:27:00Z');
    for (const fin of fins) {
      const emission = resolveInvoiceIssueDate({ finDeFormation: fin, now });
      expect(emission.getTime()).toBeGreaterThanOrEqual(fin.getTime());
      expect(emission.getTime()).toBeGreaterThanOrEqual(now.getTime());
    }
  });

  it('prend ses deux dates par NOM, pour qu’un appelant ne confonde plus les deux sens', () => {
    // `Function.length` compte les paramètres déclarés avant le premier défaut.
    // L'objet a un défaut : 0. Ce qui compte ici n'est pas le chiffre mais le
    // fait qu'aucune date positionnelle ne subsiste — la même valeur a désigné
    // la fin de prestation jusqu'au 10/09, puis l'horloge de test.
    expect(resolveInvoiceIssueDate.length).toBe(0);
    expect(resolveInvoiceIssueDate()).toBeInstanceOf(Date);
  });
});

describe('invoices.ts — les deux points d’émission datent avec le plancher de fin de formation', () => {
  // Lecture du source, à la manière de
  // `server/actions/__tests__/invoices-audit.test.ts` : la logique d'émission
  // est trop enchevêtrée (PDF, MinIO, transaction multi-table) pour un test
  // runtime, mais ce qu'on veut garantir se lit au grep.

  it('les deux émetteurs passent la fin de formation, par son nom', () => {
    // Plancher du 21/09/2026. Le test lit le source : l'émission est trop
    // enchevêtrée (PDF, MinIO, transaction multi-table) pour un test runtime.
    expect(INVOICES_SRC).toMatch(
      /resolveInvoiceIssueDate\(\{ finDeFormation: participant\.session\.endDate \}\)/,
    );
    expect(INVOICES_SRC).toMatch(
      /resolveInvoiceIssueDate\(\{ finDeFormation: session\.endDate \}\)/,
    );
  });

  it('aucun émetteur ne date plus sans plancher', () => {
    // `resolveInvoiceIssueDate()` nu rendrait le jour du clic : c'est
    // exactement ce qui a daté les 7 factures de SES-0111 du 21/09.
    expect(INVOICES_SRC).not.toMatch(/const emission = resolveInvoiceIssueDate\(\);/);
  });

  // Les deux actions qui ÉMETTENT une facture. Le reste des `issueDate:` du
  // fichier ne les concerne pas : `invoice.issueDate ?? …` sont des lectures
  // pour le gabarit, `issueDate: true` un `select` Prisma, et l'avoir
  // (`createCreditNote`) était déjà daté du jour — il n'a jamais tiré sa date
  // de la session, la période vivant sur la facture d'origine qu'il nomme.
  const EMETTEURS = ['createInvoiceFromParticipant', 'createInvoiceForSponsorGroup'] as const;

  function corpsDe(nom: string): string {
    const m = INVOICES_SRC.match(new RegExp(`export async function ${nom}[\\s\\S]*?\\n\\}\\n`));
    expect(m, `fonction ${nom} introuvable`).not.toBeNull();
    return m![0]!;
  }

  it.each(EMETTEURS)('%s écrit `issueDate: emission`', (nom) => {
    expect(corpsDe(nom)).toMatch(/issueDate: emission,/);
  });

  it.each(EMETTEURS)('%s calcule l’émission une seule fois, avant la transaction', (nom) => {
    // Les DEUX dates de la pièce doivent partir du même instant — avant le lot
    // B, `issueDate` et `dueDate` naissaient de deux horloges distantes de
    // quelques millisecondes.
    expect(corpsDe(nom)).toMatch(/const emission = resolveInvoiceIssueDate\(\{ finDeFormation:/);
  });

  it.each(EMETTEURS)('%s ancre l’échéance sur cette émission', (nom) => {
    expect(corpsDe(nom)).toMatch(/dueDate: resolveInvoiceDueDate\(dueDays, emission\)/);
  });

  it('plus aucun `dueDate` de facture ne repart d’un `Date.now()` de son côté', () => {
    expect(INVOICES_SRC).not.toMatch(/dueDate: new Date\(Date\.now\(\) \+ dueDays/);
  });
});

describe('resolveInvoiceDueDate — la règle d’échéance est INCHANGÉE par ce lot', () => {
  // Ce bloc n'est pas décoratif : maintenant que `issueDate` vaut aussi `now`,
  // plus rien ne distingue les deux règles à la lecture d'un diff. Sans test,
  // la prochaine main qui « simplifie » les fusionnera — et une facture
  // rattrapée des mois plus tard naîtrait déjà en retard, réveillant le cron de
  // relances sur une pièce émise le matin même.

  it('compte 30 jours depuis l’émission qu’on lui passe', () => {
    const emission = new Date('2026-09-07T09:12:00Z');
    expect(resolveInvoiceDueDate(30, emission)).toEqual(new Date('2026-10-07T09:12:00Z'));
  });

  it('honore un délai non standard (45 j, 0 j)', () => {
    const emission = new Date('2026-09-07T00:00:00Z');
    expect(resolveInvoiceDueDate(45, emission)).toEqual(new Date('2026-10-22T00:00:00Z'));
    expect(resolveInvoiceDueDate(0, emission)).toEqual(emission);
  });

  it('est ancrée sur l’argument reçu, jamais sur l’horloge système', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));

    const emission = new Date('2026-09-07T09:12:00Z');
    expect(resolveInvoiceDueDate(30, emission)).toEqual(new Date('2026-10-07T09:12:00Z'));
  });

  it('une facture rattrapée ne naît pas en retard : émission d’aujourd’hui ⇒ échéance future', () => {
    const emission = resolveInvoiceIssueDate({ now: new Date('2026-09-07T09:12:00Z') });
    const echeance = resolveInvoiceDueDate(30, emission);
    expect(echeance.getTime()).toBeGreaterThan(emission.getTime());
  });
});
