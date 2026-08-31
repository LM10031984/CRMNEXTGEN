---
description: Branche un nouveau financeur (OPCO, FAF, France Travail, CPF) de bout en bout dans QualiOF — catalogue, règles d'éligibilité, pièces, workflow, relances
argument-hint: "[nom du financeur, ex: FIFPL]"
allowed-tools: Bash(pnpm *) Read Edit Write Grep Glob WebSearch WebFetch
---

# Brancher le financeur : $1

## Constat de départ

Aujourd'hui l'automatisation profonde est **mono-financeur** : AGEFICE.
`OpcoCatalog` n'est seedé qu'avec AGEFICE / OPCO_EP / ATLAS / OPCOMMERCE ;
`funder-codes.ts` connaît 11 libellés mais ce ne sont que des étiquettes
d'affichage. Tout le reste (formulaire pré-rempli, budget annuel, relances,
pièces obligatoires) est câblé AGEFICE.

Cette commande sert à ajouter **$1** au même niveau de service, sans dupliquer
le code AGEFICE.

## 1. Établir les règles réelles (ne pas les deviner)

Cherche et cite les sources officielles $1 pour :

- **Qui est éligible** (statut : TNS, salarié, dirigeant assimilé, libéral…)
  et sur quelle cotisation (CFP URSSAF, contribution conventionnelle…)
- **Plafonds** : par action, par personne, par année civile
- **Antériorité de la demande** : combien de jours avant le démarrage
  (FIFPL notamment : dépôt strictement avant le début, sous peine de refus)
- **Pièces exigées** au dépôt et au solde
- **Subrogation** : le financeur paie-t-il l'OF directement, ou rembourse-t-il
  le stagiaire (qui paie l'OF) ? Ça change tout le suivi de trésorerie.
- **Délais moyens** de traitement et de remboursement
- **Format attendu du programme** (certains exigent des mentions spécifiques)

Résume en tableau avec les URLs. Si une règle est incertaine, dis-le plutôt que
de l'inventer — une règle de financement fausse coûte un dossier refusé.

## 2. Le modéliser

- `OpcoCatalog` : `code`, `type` (FAF / OPCO / Autre), `averageDelayDays`,
  `maxAmountPerTraining`, `yearlyCapPerPerson`, `requiredDocs` (Json),
  `conditions`. Migration Prisma **additive** + `prisma migrate deploy`
  (jamais `db push` vers le cloud).
- Ajouter le code dans `FUNDER_LABELS` (`apps/web/src/lib/funder-codes.ts`).
- Si le workflow diffère : étendre `FinancingMode`, pas contourner.

## 3. Le rendre actionnable

Généralise plutôt que copier `agefice-generator.ts` :

- **Éligibilité** : une fonction pure `isEligible(participant, funder)` testable,
  qui lit `LegalLink.role` (EI_SELF / AGENT_COMMERCIAL / SALARIE / DIRIGEANT) et
  le rattachement de l'`Organization`.
- **Budget annuel** : réutiliser la logique `financingRequestDate` du budget
  AGEFICE (l'année du dossier, pas celle de la session) — c'est la même règle
  chez presque tous les financeurs.
- **Pièces** : piloter la check-list par `OpcoCatalog.requiredDocs`, pas par un
  `if (code === 'AGEFICE')`. Chaque nouveau `if` sur un code financeur est une
  dette qui se paiera au financeur suivant.
- **Alerte antériorité** : si la formation démarre avant l'accord, ou si le
  dépôt est trop tardif au regard du délai $1, blocker dans
  `getSessionCompleteness`.
- **Relances** : brancher sur le cron `opco-submission-reminders` existant avec
  le délai propre à $1.

## 4. Prouver

Tests : un participant éligible, un non éligible, un au plafond annuel, un
déposé trop tard. Puis un dossier témoin de bout en bout sur une session réelle,
en lecture seule d'abord.

## 5. Documenter

Une entrée dans `CLAUDE.md` (section financeurs) : qui est couvert, à quel
niveau (référentiel seul / pièces / formulaire pré-rempli / relances), et ce qui
reste manuel.
