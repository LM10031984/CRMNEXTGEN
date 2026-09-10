# Quick 260910-x7a — L'attestation d'assiduité absente de l'archive

**Terminé :** 2026-09-10
**Branche :** `fix/260910-assiduite-archive` (worktree `files-assiduite`, partie d'`origin/main` `273587c`)

## Le signalement

L'assistante administrative, après la livraison du bouton par apprenant
(quick 260910-f41) : « bouton ok, nom des docs ok 🤩 par contre y a écrit
"téléchargement (5)" mais l'attestation d'assiduité ne se télécharge pas ».

## La cause racine — deux listes, un seul bouton

Sur l'onglet « Avant la formation », le compteur et l'archive ne lisaient pas la
même liste :

| | Compteur du bouton | Contenu réel de l'archive |
|---|---|---|
| source | `buildDocDockItems` (les lignes affichées) | `PARTICIPANT_DOC_TYPES_BY_PHASE.avant` (`doc-phase.ts`) |
| pièces | Convention · Convocation · **AGEFICE · Assiduité** · Analyse besoin | Convention · Convocation · Analyse besoin · AGEFICE · **Programme** |
| total | **5** | **5** |

Les deux totaux tombaient sur 5 **par coïncidence** : l'archive remplaçait
l'attestation d'assiduité par le programme de formation. Rien ne le signalait —
c'est le pire cas pour un dossier OPCO, où une pièce manquante se découvre au
refus.

Vérifié en base avant toute correction (SES-0111, SES-0099) : le PDF de
l'attestation est intact et lisible dans Supabase
(`assiduite/SES-0111/boutry-jean-baptiste-08850047.pdf`) — le document n'a
jamais été en cause, seule la liste qui décide de l'embarquer.

**Pourquoi cette divergence existait :** la Phase 15 Lot 2 avait réembarqué
l'attestation dans l'onglet « Avant » parce que le `DocDockDrawer` venait d'être
supprimé et qu'aucun autre écran ne portait son bouton. Depuis le quick
260910-f41, l'onglet « Après » a ses blocs nominatifs : elle y est affichée,
téléchargeable, empaquetée. Elle était donc à deux endroits, dans deux phases
contradictoires — `doc-phase.ts` la classe « après » (elle atteste d'une
présence constatée, elle se signe après coup).

## Décision de Laurent (2026-09-10)

L'attestation d'assiduité AGEFICE est une **pièce d'APRÈS la formation**. Un
document, une phase, un endroit.

## Ce qui a été fait

### 1. Une seule fonction décide des pièces d'une phase

`resolveParticipantPhaseDocs` (`lib/sessions/participant-phase-items.ts`) devient
la source unique de « quelles pièces, pour cet inscrit, sur cette phase ». Ses
deux consommateurs — l'écran (compteur + lignes) et la route ZIP
(`server/actions/session-learner-zip.ts`) — passent désormais par elle. Tant que
c'est le cas, **le nombre annoncé est le nombre livré** ; ils ne peuvent plus
diverger.

### 2. L'attestation quitte l'onglet « Avant »

Retirée de `buildDocDockItems`. Son bouton de ligne l'a suivie dans « Après » :
`Générer` / `Régénérer`, câblé sur `dispatchGenerateDoc({ docType:
'ASSIDUITE_AGEFICE' })` — son générateur synchrone dédié, que le pack de fin de
formation ne produit pas. Rien n'est perdu, tout est à un seul endroit.

### 3. Le compteur de l'onglet « Avant » lit la table des phases

`page.tsx` dérive `avantGroups` avec `buildParticipantPhaseGroups`, en y
reportant les deux pièces d'ENTREPRISE que la route ZIP reporte aussi
(convention de groupe, analyse des besoins collective) — sans quoi le compteur
aurait sous-annoncé pour les salariés d'un commanditaire personne morale.

Le **programme de formation** reste dans le dossier de chaque apprenant (l'OPCO
le veut annexé à la convention) : il est affiché une fois en haut de l'onglet,
mais compté dans chaque archive. L'infobulle du bouton énumère désormais les
pièces — un nombre ne se vérifie qu'après décompression, une liste se lit avant
de cliquer.

### 4. Une pièce AGEFICE qui existe est toujours comptée

`AGEFICE_ONLY` (« sans objet » pour les non-affiliés) ne s'applique plus qu'aux
documents ABSENTS : un inscrit à double casquette (EI + enseigne) dont la pièce
a été produite la voit partir dans son archive, donc elle est comptée.

## Vérification

- `apps/web` : `tsc --noEmit` propre, **226 fichiers de tests / 1983 tests verts**.
- Nouveau test d'invariant `lib/docs/__tests__/compteur-vs-archive.test.ts` —
  pour chaque phase, `readyCount` du bouton == nombre d'entrées de l'archive.
  **Test de puissance joué** : réintroduire un filtre côté compteur seul →
  « annoncent le même nombre de pièces — Avant la formation » rouge ; restauré → vert.
- Nouveau test `lib/sessions/__tests__/doc-dock-items.test.ts` — aucun document
  hors phase « avant » dans l'onglet Avant.
- Données réelles (`apps/web/scripts/_verif-compteur-archive.ts`, lecture du
  stockage comprise) : SES-0111 et SES-0099, tous les inscrits, les trois phases.
  Aucun écart. SES-0111 : bouton (5) → 5 fichiers avant, bouton (1) → attestation
  d'assiduité livrée en après.

## Reste à faire

- Clic réel de Laurent (ou de son assistante) sur SES-0111, onglets Avant et
  Après — la vérification ci-dessus s'arrête au contenu de l'archive, pas au
  navigateur.
- `.planning/STATE.md` non touché volontairement : un merge était en cours dans
  le worktree `files-lieu` au moment du correctif et y conflictait déjà.
