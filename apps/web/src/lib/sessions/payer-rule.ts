/**
 * Règle « payeur personne morale » — SOURCE UNIQUE.
 *
 * Règle métier figée par Laurent le 12/08/2026 :
 * **payeur personne morale ⇒ une convention de groupe + une analyse des
 * besoins au nom de l'entreprise, jamais par stagiaire.**
 *
 * Un document nominatif là où le besoin (et l'engagement financier) est celui
 * de l'entreprise est une non-conformité en audit. Symétriquement, une
 * convention là où le Code du travail exige un contrat individuel en est une
 * autre — d'où un prédicat unique, et son complément.
 *
 * POURQUOI CE MODULE EXISTE :
 * jusqu'au 21/08/2026 la règle ne vivait que dans des scripts ponctuels
 * (`_gen-*`). L'application, elle, continuait de générer des conventions et des
 * analyses des besoins PAR STAGIAIRE dès qu'on cliquait « préparer » — c'est ce
 * qui a produit les doublons constatés sur SES-0107 (ASSALIT SYNDIC, 8
 * salariés) et SES-0108 (EXPERTA, 1 salariée).
 *
 * Un seul endroit doit répondre à « ce payeur relève-t-il de la convention de
 * groupe ? ». La revue Codex de la PR #13 a montré le coût de l'inverse :
 * quatre implémentations divergentes de la même question = 5 findings.
 *
 * MODULE NEUTRE : ni 'use server' ni 'use client', aucun import Prisma. Il doit
 * rester importable depuis un cœur sans auth comme depuis une page RSC.
 */

import { requiresContratIndividuel } from '@/lib/legal-forms';

/** Inscrit vu sous l'angle « qui paye ? ». */
export interface PayerParticipant {
  id: string;
  sponsorOrgId: string;
  sponsorLegalForm: string | null | undefined;
  sponsorName?: string | null;
}

/** Un commanditaire personne morale et les inscrits qu'il finance. */
export interface SponsorGroup {
  sponsorOrgId: string;
  sponsorName: string | null;
  participantIds: string[];
}

export interface PayerPartition {
  /** Payeurs personnes morales → convention de groupe (une par commanditaire). */
  groups: SponsorGroup[];
  /** Auto-payeurs → chemin individuel inchangé (contrat de formation). */
  individuels: string[];
}

/**
 * true si ce commanditaire relève de la convention de groupe.
 *
 * Défini comme le complément EXACT de `requiresContratIndividuel`, la source
 * unique gelée le 12/08 — surtout pas comme une seconde liste de formes
 * juridiques, qui divergerait au premier ajout à l'enum `LegalForm`.
 *
 * Forme absente ⇒ `false` : on ne présume pas d'une convention de groupe sur
 * une donnée manquante. Le chemin individuel, lui, reste toujours défendable.
 */
export function isPersonneMoralePayeur(legalForm: string | null | undefined): boolean {
  return !!legalForm && !requiresContratIndividuel(legalForm);
}

/**
 * Partitionne les inscrits d'une session entre groupes commanditaires
 * (personnes morales) et auto-payeurs.
 *
 * Le format « groupe » ne dépend PAS de l'effectif : une salariée seule dont
 * l'employeur paye relève de la convention, pas du contrat individuel
 * (cas EXPERTA / SES-0108).
 *
 * Groupes triés par `sponsorOrgId` et `participantIds` dans l'ordre d'entrée :
 * ordre stable et reproductible pour les tests, les logs et le journal d'audit.
 */
export function partitionByPayerRule(
  participants: ReadonlyArray<PayerParticipant>,
): PayerPartition {
  const byOrg = new Map<string, SponsorGroup>();
  const individuels: string[] = [];

  for (const p of participants) {
    if (!isPersonneMoralePayeur(p.sponsorLegalForm)) {
      individuels.push(p.id);
      continue;
    }
    let group = byOrg.get(p.sponsorOrgId);
    if (!group) {
      group = {
        sponsorOrgId: p.sponsorOrgId,
        sponsorName: p.sponsorName ?? null,
        participantIds: [],
      };
      byOrg.set(p.sponsorOrgId, group);
    }
    group.participantIds.push(p.id);
  }

  const groups = [...byOrg.values()].sort((a, b) =>
    a.sponsorOrgId.localeCompare(b.sponsorOrgId),
  );
  return { groups, individuels };
}

export interface AnalyseBesoinTargets {
  /** Inscrits pour qui une analyse PAR STAGIAIRE est légitime (auto-payeurs). */
  participantIds: string[];
  /** Commanditaires personnes morales sans analyse entreprise rendue. */
  entreprisesEnAttente: SponsorGroup[];
}

/**
 * Qui doit recevoir une analyse des besoins, et sous quelle forme.
 *
 * Règle du 12/08 appliquée au document de l'indicateur 4 : une analyse des
 * besoins au nom d'un SALARIÉ alors que le besoin est celui de l'entreprise
 * est une non-conformité en audit. Le besoin exprimé, les objectifs attendus
 * et l'adaptation proposée sont ceux de la structure qui commande et qui paye.
 *
 * Le document de référence attendu pour une entreprise est celui produit par
 * `apps/web/scripts/_gen-assalit-experta-analyses.ts` : contexte, besoins
 * exprimés, objectifs attendus, public et prérequis, modalités, adaptation
 * proposée, situation de handicap, signature.
 *
 * ⚠ Aucun générateur applicatif ne produit encore cette variante entreprise.
 * Ce helper fait la moitié qui protège : il ARRÊTE la production de la mauvaise
 * variante (nominative) et expose le manque au lieu de le masquer.
 *
 * Helper PUR : il ne lit rien, n'écrit rien, et ne supprime aucun résidu déjà
 * en base (SES-0108 en porte un). La remédiation est une étape séparée.
 *
 * `analyseEntrepriseExiste` est un booléen et non un compte : le schéma pose
 * `@@unique([sessionId, participantId, kind])` sur `PedagogicalAsset`, donc il
 * ne peut exister qu'UNE analyse de niveau session (`participantId = null`).
 */
export function selectAnalyseBesoinTargets(
  participants: ReadonlyArray<PayerParticipant>,
  opts: {
    /** participantIds ayant déjà une analyse par stagiaire rendue. */
    dejaRenduParStagiaire: ReadonlySet<string>;
    /** true si un PedagogicalAsset ANALYSE_BESOIN participantId=null existe pour la session. */
    analyseEntrepriseExiste: boolean;
  },
): AnalyseBesoinTargets {
  const { groups, individuels } = partitionByPayerRule(participants);

  return {
    participantIds: individuels.filter((id) => !opts.dejaRenduParStagiaire.has(id)),
    entreprisesEnAttente: opts.analyseEntrepriseExiste ? [] : groups,
  };
}
