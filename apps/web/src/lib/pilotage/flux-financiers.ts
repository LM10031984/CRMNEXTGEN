/**
 * Vendu · Facturé · Encaissé (Laurent 2026-09-10).
 *
 * Le pilotage n'affichait qu'un seul chiffre — le « vendu », déduit du prix
 * porté par chaque inscription. Constaté sur la base le 10/09/2026 : 158 478 €
 * vendus, 31 115 € facturés, 17 696 € encaissés. Trois réalités, un seul
 * chiffre affiché, et un écart de 127 k€ que rien ne montrait.
 *
 * Choix de sources, tous vérifiés en base avant d'être écrits :
 *  - **vendu** : `SessionParticipant.priceHT`, rangé au mois de DÉBUT de
 *    session (même convention que le reste du pilotage) ;
 *  - **facturé** : `Invoice.amountHT` au mois de `issueDate`. Les avoirs
 *    portent DÉJÀ un montant négatif (l'unique avoir 2026 : −336 €) : on les
 *    additionne, on ne les soustrait pas une seconde fois ;
 *  - **encaissé** : `InvoicePayment.amount` au mois de `receivedAt` — la date
 *    où l'argent arrive, pas celle où la facture est marquée payée. Les 10
 *    lignes de paiement existantes totalisent exactement les `amountPaid` des
 *    factures, donc les deux lectures concordent aujourd'hui ; c'est
 *    `receivedAt` qui restera juste si un paiement est enregistré en retard.
 *
 * ⚠️ La carte « CA du mois » de la page Factures compte `ISSUED · PAID ·
 * PARTIAL` et ignore `OVERDUE`. Ici, une facture en retard reste une facture
 * émise : elle compte. Aucune facture n'est en retard aujourd'hui, l'écart est
 * donc nul — mais les deux définitions existent, et c'est à trancher un jour.
 *
 * Section 1 pure (testable sans base), section 2 lectures Prisma.
 */

import { prisma } from '@qualiof/db';
import type { InvoiceStatus } from '@qualiof/db';

// ───────────────────────────────────────────────────────────────────────────
// 1. Pur
// ───────────────────────────────────────────────────────────────────────────

export interface FluxMois {
  /** 0-11. */
  mois: number;
  vendu: number;
  facture: number;
  encaisse: number;
}

export interface FluxFinanciers {
  mensuel: FluxMois[];
  totalVendu: number;
  totalFacture: number;
  totalEncaisse: number;
  /** Vendu non encore facturé. Jamais négatif. */
  resteAFacturer: number;
  /** Facturé non encore encaissé. Jamais négatif. */
  resteAEncaisser: number;
}

export function assembleFlux(input: {
  vendu: number[];
  facture: number[];
  encaisse: number[];
}): FluxFinanciers {
  const mensuel: FluxMois[] = Array.from({ length: 12 }, (_, mois) => ({
    mois,
    vendu: input.vendu[mois] ?? 0,
    facture: input.facture[mois] ?? 0,
    encaisse: input.encaisse[mois] ?? 0,
  }));
  const somme = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const totalVendu = somme(input.vendu);
  const totalFacture = somme(input.facture);
  const totalEncaisse = somme(input.encaisse);
  return {
    mensuel,
    totalVendu,
    totalFacture,
    totalEncaisse,
    // Un « reste » négatif voudrait dire qu'on a facturé plus qu'on n'a vendu :
    // c'est un décalage de calendrier (acompte, facture d'avance), pas une
    // créance. On l'affiche à zéro plutôt que d'inventer une dette à l'envers.
    resteAFacturer: Math.max(0, totalVendu - totalFacture),
    resteAEncaisser: Math.max(0, totalFacture - totalEncaisse),
  };
}

/** Mois UTC (0-11) d'une date, ou `null` si absente ou hors de l'année. */
export function moisDeLAnnee(date: Date | null | undefined, annee: number): number | null {
  if (!date) return null;
  if (date.getUTCFullYear() !== annee) return null;
  return date.getUTCMonth();
}

/** Jours entre émission et encaissement. `null` si l'ordre est incohérent. */
export function delaiEnJours(emission: Date | null, paiement: Date | null): number | null {
  if (!emission || !paiement) return null;
  const jours = Math.round((paiement.getTime() - emission.getTime()) / 86_400_000);
  return jours < 0 ? null : jours;
}

/** Moyenne arrondie, `null` sur une liste vide (jamais 0, qui se lirait « payé le jour même »). */
export function moyenneDelais(jours: number[]): number | null {
  if (jours.length === 0) return null;
  return Math.round(jours.reduce((a, b) => a + b, 0) / jours.length);
}

// ───────────────────────────────────────────────────────────────────────────
// 2. Lectures (scopées tenantId)
// ───────────────────────────────────────────────────────────────────────────

/** Statuts qui font d'une facture une facture ÉMISE. `DRAFT` n'est pas partie. */
const STATUTS_FACTURES: InvoiceStatus[] = [
  'ISSUED',
  'PAID',
  'PARTIAL',
  'OVERDUE',
  'CREDIT_NOTE',
] as never;

function bornesUTC(annee: number) {
  return { start: new Date(Date.UTC(annee, 0, 1)), end: new Date(Date.UTC(annee + 1, 0, 1)) };
}

/** Facturé mensuel (EUR HT). */
export async function getFactureMensuel(tenantId: string, annee: number): Promise<number[]> {
  const { start, end } = bornesUTC(annee);
  const rows = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: { in: STATUTS_FACTURES },
      issueDate: { gte: start, lt: end },
    },
    select: { amountHT: true, issueDate: true },
  });
  const buckets = Array(12).fill(0) as number[];
  for (const r of rows) {
    const m = moisDeLAnnee(r.issueDate, annee);
    if (m === null) continue;
    buckets[m] = (buckets[m] ?? 0) + Number(r.amountHT);
  }
  return buckets;
}

/** Encaissé mensuel (EUR, à la date de réception du paiement). */
export async function getEncaisseMensuel(tenantId: string, annee: number): Promise<number[]> {
  const { start, end } = bornesUTC(annee);
  const rows = await prisma.invoicePayment.findMany({
    where: { invoice: { tenantId }, receivedAt: { gte: start, lt: end } },
    select: { amount: true, receivedAt: true },
  });
  const buckets = Array(12).fill(0) as number[];
  for (const r of rows) {
    const m = moisDeLAnnee(r.receivedAt, annee);
    if (m === null) continue;
    buckets[m] = (buckets[m] ?? 0) + Number(r.amount);
  }
  return buckets;
}

export interface DelaiParFinanceur {
  /** `AGEFICE`, `OPCO_EP`… ou « Sans OPCO » pour un payeur direct. */
  financeur: string;
  /** Délai moyen en jours entre l'émission et l'encaissement. */
  delaiMoyen: number | null;
  /** Nombre de paiements observés — un délai sur 1 facture n'est pas une moyenne. */
  paiements: number;
}

/**
 * Combien de temps chaque financeur met à payer.
 *
 * L'axe est `payerOrg.opcoCode` : c'est lui qui est renseigné (AGEFICE,
 * OPCO_EP…), là où `financingMode` ne l'est que sur un inscrit sur cinq.
 */
export async function getDelaiParFinanceur(
  tenantId: string,
  annee: number,
): Promise<DelaiParFinanceur[]> {
  const { start, end } = bornesUTC(annee);
  const paiements = await prisma.invoicePayment.findMany({
    where: { invoice: { tenantId }, receivedAt: { gte: start, lt: end } },
    select: {
      receivedAt: true,
      invoice: { select: { issueDate: true, payerOrg: { select: { opcoCode: true } } } },
    },
  });
  const parFinanceur = new Map<string, number[]>();
  for (const p of paiements) {
    const jours = delaiEnJours(p.invoice.issueDate, p.receivedAt);
    if (jours === null) continue;
    const cle = p.invoice.payerOrg?.opcoCode ?? 'Sans OPCO';
    parFinanceur.set(cle, [...(parFinanceur.get(cle) ?? []), jours]);
  }
  return [...parFinanceur.entries()]
    .map(([financeur, jours]) => ({
      financeur,
      delaiMoyen: moyenneDelais(jours),
      paiements: jours.length,
    }))
    .sort((a, b) => (b.delaiMoyen ?? 0) - (a.delaiMoyen ?? 0));
}
