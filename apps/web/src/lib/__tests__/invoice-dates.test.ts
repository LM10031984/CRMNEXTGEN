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

describe('resolveInvoiceIssueDate — la facture se date du jour où on l’établit', () => {
  it('rend le jour d’établissement, sans rien lui demander', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T09:12:00Z'));

    expect(resolveInvoiceIssueDate()).toEqual(new Date('2026-09-07T09:12:00Z'));
  });

  it('accepte une horloge injectée, pour que les tests n’aient pas à voyager', () => {
    const clic = new Date('2026-09-04T14:30:00Z');
    expect(resolveInvoiceIssueDate(clic)).toEqual(clic);
  });

  it('n’a PLUS de paramètre « fin de prestation » — c’est tout l’objet du lot B', () => {
    // `Function.length` compte les paramètres déclarés AVANT le premier défaut.
    // Avant le lot B : 1 (`sessionEndDate`, requis). Après : 0, `now` ayant un
    // défaut. C'est la seule façon d'écrire « ce paramètre n'existe plus »
    // comme un fait exécutable plutôt que comme un commentaire.
    expect(resolveInvoiceIssueDate.length).toBe(0);
  });
});

describe('invoices.ts — les deux points d’émission ne datent plus depuis la session', () => {
  // Lecture du source, à la manière de
  // `server/actions/__tests__/invoices-audit.test.ts` : la logique d'émission
  // est trop enchevêtrée (PDF, MinIO, transaction multi-table) pour un test
  // runtime, mais ce qu'on veut garantir se lit au grep.

  it('aucun appel `resolveInvoiceIssueDate(session.endDate)` ne subsiste', () => {
    expect(INVOICES_SRC).not.toMatch(/resolveInvoiceIssueDate\(\s*session\.endDate/);
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
    expect(corpsDe(nom)).toMatch(/const emission = resolveInvoiceIssueDate\(\);/);
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
    const emission = resolveInvoiceIssueDate(new Date('2026-09-07T09:12:00Z'));
    const echeance = resolveInvoiceDueDate(30, emission);
    expect(echeance.getTime()).toBeGreaterThan(emission.getTime());
  });
});
