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

import { requiresContratIndividuel, isSoloForm } from '@/lib/legal-forms';

/**
 * Rôles par lesquels le commanditaire est l'EMPLOYEUR de l'apprenant.
 *
 * `EI_SELF`, `DIRIGEANT` et `AGENT_COMMERCIAL` en sont volontairement absents :
 * ces trois-là décrivent quelqu'un qui se forme À SES FRAIS, donc le contrat
 * individuel. C'est exactement la distinction que porte l'enum `LinkRole`.
 */
export const ROLES_EMPLOYEUR = ['SALARIE', 'ALTERNANT', 'STAGIAIRE'] as const;

/** true si le commanditaire est l'employeur de cet apprenant. */
export function estEmployeurDeLApprenant(role: string | null | undefined): boolean {
  return !!role && (ROLES_EMPLOYEUR as readonly string[]).includes(role);
}

/**
 * LE prédicat : ce couple (commanditaire, apprenant) relève-t-il de la
 * CONVENTION de formation professionnelle ?
 *
 * Correction du 02/09/2026 — cas AGENCE DE L'OLIVIER (SES-0109). La règle ne
 * regardait QUE la forme juridique : toute EI partait en contrat individuel.
 * Or une entreprise individuelle PEUT avoir des salariés (registre INSEE :
 * SIREN 337700504, entrepreneur individuel, tranche d'effectif 1 à 2 salariés),
 * et quand elle paye pour eux, elle n'est pas « à ses frais ».
 *
 * Le Code du travail ne tranche pas sur la forme juridique mais sur QUI PAYE
 * POUR QUI :
 *  - L6353-3 — contrat de formation professionnelle : conclu par une personne
 *    physique « à titre individuel et **à ses frais** ». C'est l'auto-payeur.
 *  - L6353-2 — convention de formation professionnelle : conclue avec
 *    l'EMPLOYEUR qui envoie ses salariés. Sa forme juridique est indifférente.
 *
 * D'où deux questions, dans cet ordre :
 *  1. le commanditaire est-il une société ? → convention (inchangé) ;
 *  2. sinon, est-il l'employeur de cet apprenant ? → convention aussi.
 *
 * Forme absente ⇒ `false` : on ne présume pas d'une convention sur une donnée
 * manquante. Le chemin individuel reste toujours défendable.
 *
 * Portée mesurée avant bascule (02/09, base de production) : sur 237 inscrits
 * dont le commanditaire est en forme solo, **4** changent de régime — les 2 de
 * SES-0109 et 2 de SES-0012 (même cas réel, EIRL avec salariés). Les 226
 * `EI_SELF` et 6 `AGENT_COMMERCIAL` restent en contrat individuel.
 */
export function releveDeLaConvention(input: {
  sponsorLegalForm: string | null | undefined;
  /** Rôle de l'apprenant DANS l'organisation commanditaire (`LegalLink.role`). */
  roleChezSponsor?: string | null;
}): boolean {
  if (!input.sponsorLegalForm) return false;
  // Société ⇒ convention, quel que soit le lien.
  if (!requiresContratIndividuel(input.sponsorLegalForm)) return true;
  // PARTICULIER n'est pas une entreprise : il ne peut employer personne, et
  // reste donc toujours au contrat individuel. C'est précisément pourquoi
  // `SOLO_FORMS` (EI / EIRL / micro — qui, elles, peuvent embaucher) et
  // `CONTRAT_INDIVIDUEL_FORMS` (= SOLO_FORMS + PARTICULIER) sont deux listes
  // distinctes dans `legal-forms.ts`.
  if (!isSoloForm(input.sponsorLegalForm)) return false;
  // Forme solo ⇒ c'est le LIEN qui tranche, pas la forme.
  return estEmployeurDeLApprenant(input.roleChezSponsor);
}

/** Inscrit vu sous l'angle « qui paye ? ». */
export interface PayerParticipant {
  id: string;
  sponsorOrgId: string;
  sponsorLegalForm: string | null | undefined;
  sponsorName?: string | null;
  /**
   * Rôle de l'apprenant dans l'organisation commanditaire. Sans lui, une EI
   * employeuse retombe en contrat individuel — c'est le comportement d'avant
   * le 02/09, conservé comme repli sûr quand l'appelant ne charge pas le lien.
   */
  roleChezSponsor?: string | null;
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
 * true si la FORME JURIDIQUE seule fait du commanditaire une personne morale.
 *
 * ⚠ Ne répond PLUS à « faut-il une convention ? » depuis le 02/09 : une EI
 * employeuse relève de la convention sans être une personne morale. Pour cette
 * question-là, utiliser `releveDeLaConvention`, qui regarde aussi le lien.
 *
 * Reste utile là où c'est bien la forme juridique qui compte — la tarification
 * (`resolve-default-price` : un forfait entreprise s'applique à une structure,
 * pas à un auto-payeur).
 *
 * Défini comme le complément EXACT de `requiresContratIndividuel`, la source
 * unique gelée le 12/08 — surtout pas comme une seconde liste de formes
 * juridiques, qui divergerait au premier ajout à l'enum `LegalForm`.
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
 * (cas EXPERTA / SES-0108). Il ne dépend pas non plus de la FORME de
 * l'employeur : une entreprise individuelle qui paye pour ses salariés relève
 * de la convention (cas AGENCE DE L'OLIVIER / SES-0109).
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
    if (!releveDeLaConvention({ sponsorLegalForm: p.sponsorLegalForm, roleChezSponsor: p.roleChezSponsor })) {
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
