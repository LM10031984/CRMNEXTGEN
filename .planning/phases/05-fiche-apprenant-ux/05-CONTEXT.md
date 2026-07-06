# Phase 5: Fiche apprenant UX - Context

**Gathered:** 2026-05-13

## Phase Boundary

8 frictions UX de l'audit sur `/app/apprenants/[id]/` (page de 654 lignes + 6 composants). Toutes vivent sur cette page (3 onglets : info, activity, documents).

**État actuel vérifié dans le code :**
- `DeleteEntityButton` (`components/forms/delete-entity-button.tsx`) a déjà une modale de confirmation + soft-delete via `deletePerson({ force })`. UX-08 = **faux positif probable** (audit reportait "trop exposé sans confirmation" mais c'est faux).
- `LearnerCompletenessBadge` : champs manquants cachés derrière un toggle `open` — UX-09 vraie friction (rendre visible direct).
- `BudgetAgefice` : pas de sélecteur d'année (UX-06 vraie friction).
- `LearnerTabs` : badge nombre simple, pas de tooltip (UX-07).
- Onglet Documents : à vérifier si CTA "Générer un document" existe.
- Onglet Activité : compteurs Sessions/Heures probablement non-cliquables (UX-05).

## Implementation Decisions

| Req | Fix |
|-----|-----|
| **UX-03** CTA Générer doc | Bouton dropdown menu "Générer un document" toujours visible onglet Documents (Fiche AGEFICE / Convention / Attestation selon contexte session) |
| **UX-04** CTA Déposer dossier AGEFICE | Bouton dans bloc BudgetAgefice pour déposer un dossier pré-rempli (link vers wizard ou modale). Si déjà déposé pour l'année courante : grisé + tooltip |
| **UX-05** Compteurs cliquables | Sessions / Heures dans onglet Activité → liens vers `/app/sessions?apprenant=<id>` (filtre déjà supporté ou à créer simple) |
| **UX-06** Sélecteur année BudgetAgefice | `<select>` ou chips année (2024/2025/2026...) dans le bloc, met à jour la prop `year` via searchParam ou state-up |
| **UX-07** Tooltip badge "1" | Ajouter `title` ou Radix Tooltip sur le badge des onglets pour expliquer le sens (ex: "1 session active") |
| **UX-08** Supprimer | **Vérification** — DeleteEntityButton a déjà confirmation et soft-delete. Si besoin : passer en menu DropdownMenu "Actions" (Archiver / Supprimer) plutôt qu'un bouton direct |
| **UX-09** Champs manquants visible | Retirer `open`/click expand de LearnerCompletenessBadge — afficher la liste des champs manquants directement (en chips compactes) |
| **UX-10** Breadcrumb | Composant `<Breadcrumb>` réutilisable dans `components/ui/breadcrumb.tsx`, utilisé fiche apprenant + fiche produit (et autres pages détail) |

## Out of scope
- Refonte complète du wizard AGEFICE (juste le link/CTA — le wizard existe déjà via `agefice-generator.ts`)
- Nouvelle page "Profil apprenant" hors fiche existante
- Modification de la structure des onglets (info/activity/documents reste)

## Canonical Refs

- `apps/web/src/app/app/apprenants/[id]/page.tsx` (page principale)
- `apps/web/src/components/apprenants/learner-completeness-badge.tsx` (UX-09)
- `apps/web/src/components/apprenants/budget-agefice.tsx` (UX-04, UX-06)
- `apps/web/src/components/apprenants/learner-tabs.tsx` (UX-07)
- `apps/web/src/components/forms/delete-entity-button.tsx` (UX-08, déjà OK)
- (NEW) `apps/web/src/components/ui/breadcrumb.tsx`
