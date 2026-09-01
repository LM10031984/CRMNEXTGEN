---
created: 2026-08-12T00:00:00.000Z
title: Contrat vs convention selon le payeur + analyse de besoin par commanditaire
area: general
files:
  - packages/db/prisma/schema.prisma (SessionParticipant.sponsorOrgId — « C'est CETTE org qui paye et apparaît sur la convention » ; Organization.legalForm)
  - apps/web/src/lib/closure/analyse-besoin-template.ts (aujourd'hui générée PAR STAGIAIRE)
---

## Problem

Règle métier confirmée par Laurent le 2026-08-12 (cas de référence : SES-0086 Riviera Estates
SAS → 11 apprenants payés par la SAS ; idem SES-0079 Régie d'Immeubles Neyrat → 11 apprenants).
Pour Qualiopi/Code du travail (L6353), deux régimes distincts selon QUI PAYE :

1. **Payeur = personne morale** (entreprise commanditaire, chef d'entreprise signataire) :
   - **1 convention de formation** unique pour le groupe (pas une par stagiaire) ;
   - **1 analyse de besoin ENTREPRISE** (interlocuteur = commanditaire), pas 11 individuelles.
2. **Payeur = personne physique** (EI qui paye lui-même, même remboursé AGEFICE ensuite) :
   - **1 contrat de formation professionnelle PAR personne** (clauses B2C : rétractation 10 j,
     modalités de paiement…) — ⚠ template INEXISTANT dans QualiOF aujourd'hui ;
   - **1 analyse de besoin individuelle** (comportement actuel, correct pour ce cas).

Aujourd'hui QualiOF génère l'analyse de besoin par stagiaire dans tous les cas et n'a pas de
document « Contrat de formation professionnelle ». Une même session mixe les deux régimes
(SES-0086 : 11 Riviera + 18 EI).

## Solution

- Pivot de décision : `SessionParticipant.sponsorOrg` + `legalForm` (EI = personne physique
  payeuse → contrat ; SAS/SARL/autre personne morale → convention). Cohérent avec la règle
  payeur existante (auto-entrepreneur paye lui-même · salarié = la structure paye).
- Analyse de besoin : générer par COMMANDITAIRE — 1 doc par entreprise groupée (regrouper les
  participants par sponsorOrg non-EI), 1 doc par participant auto-payeur. Conserver la
  variation des dates (anti-uniformité audit).
- Créer le template « Contrat de formation professionnelle » (clauses L6353-3 à L6353-7,
  rétractation 10 j) sur le modèle des conventions C2.i06 existantes.
- Lié : [[2026-07-30-analyse-besoins-datation-convention-signedat]] (datation + champ
  conventionSignedAt — les deux chantiers se planifient ensemble).

## Constat terrain (2026-08-12, session OPTIMMO)

Gap UI confirmé par Laurent en conditions réelles : depuis la fiche session, IMPOSSIBLE de
générer une convention au nom de l'entreprise commanditaire (cas 11 salariées OPTIMMO,
dossier OPCO EP). Contournement du jour : génération hors-app par script (programme +
convention groupe) pour le dépôt portail. La cible : bouton « Convention entreprise » sur la
fiche session (ou par commanditaire), alimenté par sponsorOrg, avec annexe nominative
nom+prénom UNIQUEMENT (consigne Laurent : pas de CSP sur les documents).
