/**
 * Le CA vu par axe — produit, formateur, financeur, client, remplissage,
 * entonnoir (Laurent 2026-09-10 : « avec plus de stats utiles, sachant qu'on a
 * déjà pas mal de data »).
 *
 * Une seule lecture des inscriptions de l'année alimente tous les axes : sept
 * requêtes séparées auraient donné sept totaux qui ne se recoupent pas dès
 * qu'une session est modifiée entre deux.
 *
 * Choix qui vient des données, pas d'un a priori : **l'axe financeur est
 * `sponsorOrg.opcoCode`**, pas `financingMode`. Ce dernier n'est renseigné que
 * sur 41 inscrits sur 208 (10/09/2026) : un camembert bâti dessus serait faux
 * aux deux tiers et personne ne le verrait.
 *
 * Section 1 pure, section 2 lecture Prisma.
 */

import { prisma } from '@qualiof/db';

// ───────────────────────────────────────────────────────────────────────────
// 1. Pur
// ───────────────────────────────────────────────────────────────────────────

export interface LigneAxe {
  cle: string;
  libelle: string;
  ca: number;
  inscrits: number;
  /** Part du total, en % arrondi. */
  part: number;
}

/** Agrège des inscriptions en lignes triées par CA décroissant. */
export function agregeParAxe(
  rows: Array<{ cle: string; libelle: string; ca: number }>,
): LigneAxe[] {
  const map = new Map<string, { libelle: string; ca: number; inscrits: number }>();
  for (const r of rows) {
    const cur = map.get(r.cle) ?? { libelle: r.libelle, ca: 0, inscrits: 0 };
    cur.ca += r.ca;
    cur.inscrits += 1;
    map.set(r.cle, cur);
  }
  const total = [...map.values()].reduce((a, v) => a + v.ca, 0);
  return [...map.entries()]
    .map(([cle, v]) => ({
      cle,
      libelle: v.libelle,
      ca: v.ca,
      inscrits: v.inscrits,
      part: total > 0 ? Math.round((v.ca / total) * 100) : 0,
    }))
    .sort((a, b) => b.ca - a.ca);
}

/**
 * Part du CA concentrée sur les `n` premières lignes.
 *
 * Le chiffre qui compte pour un OF : si le top 3 pèse 80 %, perdre un client
 * n'est pas un incident commercial, c'est un trou dans l'année.
 */
export function partDuTop(lignes: LigneAxe[], n: number): number {
  const total = lignes.reduce((a, l) => a + l.ca, 0);
  if (total <= 0) return 0;
  const top = lignes.slice(0, n).reduce((a, l) => a + l.ca, 0);
  return Math.round((top / total) * 100);
}

/** Taux de remplissage d'une session. `null` si la capacité n'est pas exploitable. */
export function tauxRemplissage(inscrits: number, capaciteMax: number): number | null {
  if (!capaciteMax || capaciteMax <= 0) return null;
  return Math.round((inscrits / capaciteMax) * 100);
}

export interface Entonnoir {
  preInscrits: { n: number; ca: number };
  confirmes: { n: number; ca: number };
  presents: { n: number; ca: number };
  /** Pré-inscrits assis sur une session DÉJÀ terminée — du CA qui n'est étayé par rien. */
  preInscritsSurSessionsTerminees: { n: number; ca: number };
}

// ───────────────────────────────────────────────────────────────────────────
// 2. Lecture
// ───────────────────────────────────────────────────────────────────────────

export interface AxesPilotage {
  parProduit: LigneAxe[];
  parFormateur: LigneAxe[];
  parFinanceur: LigneAxe[];
  parClient: LigneAxe[];
  /** Concentration : part du CA sur les 3 premiers clients. */
  partTop3Clients: number;
  /** Remplissage moyen des sessions ayant au moins un inscrit. */
  remplissageMoyen: number | null;
  /** Sessions dont le remplissage est le plus faible (pour agir dessus). */
  sessionsMoinsRemplies: Array<{ code: string; libelle: string; inscrits: number; capaciteMax: number; taux: number }>;
  entonnoir: Entonnoir;
  panierMoyenParInscrit: number | null;
}

export async function getAxesPilotage(tenantId: string, annee: number): Promise<AxesPilotage> {
  const start = new Date(Date.UTC(annee, 0, 1));
  const end = new Date(Date.UTC(annee + 1, 0, 1));
  const maintenant = new Date();

  const inscrits = await prisma.sessionParticipant.findMany({
    where: { session: { tenantId, startDate: { gte: start, lt: end } } },
    select: {
      priceHT: true,
      enrollmentStatus: true,
      sponsorOrg: { select: { legalName: true, brandName: true, opcoCode: true } },
      session: {
        select: {
          code: true,
          endDate: true,
          capacityMax: true,
          product: { select: { code: true, title: true } },
          trainers: { select: { isPrimary: true, person: { select: { firstName: true, lastName: true } } } },
        },
      },
    },
  });

  const prix = (p: (typeof inscrits)[number]) => Number(p.priceHT ?? 0);

  const parProduit = agregeParAxe(
    inscrits.map((p) => ({
      cle: p.session.product?.code ?? '—',
      // Le code EN PLUS du titre : deux produits IA portent presque le même
      // intitulé (72 h et 8 h), les distinguer à l'œil est impossible sans lui.
      libelle: `${p.session.product?.code ?? '—'} · ${p.session.product?.title ?? 'Sans produit'}`,
      ca: prix(p),
    })),
  );

  const parFormateur = agregeParAxe(
    inscrits.map((p) => {
      const principal =
        p.session.trainers.find((t) => t.isPrimary) ?? p.session.trainers[0] ?? null;
      const nom = principal
        ? `${principal.person.firstName} ${principal.person.lastName.toUpperCase()}`
        : 'Non attribué';
      return { cle: nom, libelle: nom, ca: prix(p) };
    }),
  );

  const parFinanceur = agregeParAxe(
    inscrits.map((p) => {
      const code = p.sponsorOrg?.opcoCode ?? null;
      const libelle = code ?? 'Sans OPCO (payeur direct)';
      return { cle: libelle, libelle, ca: prix(p) };
    }),
  );

  const parClient = agregeParAxe(
    inscrits.map((p) => {
      const nom = p.sponsorOrg?.brandName ?? p.sponsorOrg?.legalName ?? '—';
      return { cle: nom, libelle: nom, ca: prix(p) };
    }),
  );

  // Remplissage : une session, pas une inscription.
  const parSession = new Map<string, { inscrits: number; capaciteMax: number; libelle: string }>();
  for (const p of inscrits) {
    const cur = parSession.get(p.session.code) ?? {
      inscrits: 0,
      capaciteMax: p.session.capacityMax,
      libelle: p.session.product?.title ?? p.session.code,
    };
    cur.inscrits += 1;
    parSession.set(p.session.code, cur);
  }
  const taux = [...parSession.entries()]
    .map(([code, s]) => ({ code, ...s, taux: tauxRemplissage(s.inscrits, s.capaciteMax) }))
    .filter((s): s is typeof s & { taux: number } => s.taux !== null);
  const remplissageMoyen = taux.length
    ? Math.round(taux.reduce((a, s) => a + s.taux, 0) / taux.length)
    : null;

  const entonnoir: Entonnoir = {
    preInscrits: { n: 0, ca: 0 },
    confirmes: { n: 0, ca: 0 },
    presents: { n: 0, ca: 0 },
    preInscritsSurSessionsTerminees: { n: 0, ca: 0 },
  };
  for (const p of inscrits) {
    const montant = prix(p);
    if (p.enrollmentStatus === 'PRE_ENROLLED') {
      entonnoir.preInscrits.n++;
      entonnoir.preInscrits.ca += montant;
      if (p.session.endDate < maintenant) {
        entonnoir.preInscritsSurSessionsTerminees.n++;
        entonnoir.preInscritsSurSessionsTerminees.ca += montant;
      }
    } else if (p.enrollmentStatus === 'CONFIRMED') {
      entonnoir.confirmes.n++;
      entonnoir.confirmes.ca += montant;
    } else if (p.enrollmentStatus === 'ATTENDED') {
      entonnoir.presents.n++;
      entonnoir.presents.ca += montant;
    }
  }

  const totalCA = inscrits.reduce((a, p) => a + prix(p), 0);

  return {
    parProduit,
    parFormateur,
    parFinanceur,
    parClient,
    partTop3Clients: partDuTop(parClient, 3),
    remplissageMoyen,
    sessionsMoinsRemplies: taux
      .sort((a, b) => a.taux - b.taux)
      .slice(0, 5)
      .map((s) => ({ code: s.code, libelle: s.libelle, inscrits: s.inscrits, capaciteMax: s.capaciteMax, taux: s.taux })),
    entonnoir,
    panierMoyenParInscrit: inscrits.length ? Math.round(totalCA / inscrits.length) : null,
  };
}
