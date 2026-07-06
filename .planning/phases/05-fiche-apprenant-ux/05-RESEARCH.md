# Phase 5: Fiche apprenant UX - Research

**Researched:** 2026-05-13

## Findings

### UX-08 — Bouton Supprimer (faux positif)

`DeleteEntityButton` a déjà un modal Radix Dialog de confirmation, un soft-delete par défaut (`force=false`), un hard-delete optionnel (`force=true`) avec case à cocher explicite. Audit était inexact. **Vérification rapide : aucune modif nécessaire.** Si tu veux quand même passer en menu "Actions", ce sera un polish v6.

### UX-09 — Champs manquants visible directement

`LearnerCompletenessBadge` actuel : `useState(false)` + bouton "Voir les X champs manquants" qui toggle l'expansion. Fix : retirer le state + bouton, afficher TOUJOURS la liste (compacte si > 0) sous la barre de pourcentage. Préserver l'icône/tone selon score.

### UX-06 + UX-04 — BudgetAgefice : sélecteur année + CTA dépôt

Actuellement `BudgetAgefice` reçoit `{ year, consomme, sessions }` en props (server-side). Sélecteur année = chips `2024 / 2025 / 2026` qui changent `?ageficeYear=NNNN` dans l'URL. La page server-side relit le param et recalcule `consomme` + `sessions` pour l'année.

CTA "Déposer un dossier AGEFICE" : bouton qui ouvre le formulaire `agefice-generator` pré-rempli ou link vers `/app/apprenants/[id]/agefice/nouveau` (à créer minimal) OU plus simple : link vers la page existante du wizard avec query params.

**Simplification :** créer un bouton qui ouvre une modale de confirmation "Lancer la génération de la fiche AGEFICE pour [nom apprenant] année [year] ?" + bouton qui submit `agefice-generator`. La fiche AGEFICE est ensuite téléchargeable dans Documents.

### UX-03 — CTA Générer document onglet Documents

Onglet Documents actuel : à vérifier. Si vide → afficher un message + un dropdown "Générer un document" (Fiche AGEFICE / Convention / Attestation / Certificat) qui appelle les server actions existantes.

Server actions disponibles (`server/actions/`) :
- `agefice-generator.ts` — Fiche AGEFICE PDF
- `convention-generator.ts` — Convention de formation
- `programme-generator.ts` — Programme commercial
- `closure-pack.ts` — Pack fin de formation
- `generate-checklist-formation.ts` — Checklist formation

Tous prennent un personId/sessionId. Pour la fiche apprenant : on a `personId`, il manque `sessionId` (un apprenant peut être dans plusieurs sessions). Solution : dropdown propose les docs **par-personne** d'abord (Fiche AGEFICE) puis si plusieurs sessions, picker session pour les docs par-session.

**Scope simplifié pour Phase 5 :** CTA "Générer fiche AGEFICE" (le doc principal par apprenant). Les autres docs par-session sont déjà accessibles depuis la page session.

### UX-05 — Compteurs cliquables

Onglet Activité affiche "Sessions: N" et "Heures formées: X h". Aujourd'hui c'est du texte plain. Fix : wrap dans `<Link href="/app/sessions?apprenant=<personId>">` ou vers une vue filtrée.

**Vérifier :** `/app/sessions/page.tsx` accepte-t-il un param `apprenant=` ? Si non, ajouter le filtre dans server-side fetch.

### UX-07 — Tooltip badge

`LearnerTabs` badge actuel : nombre simple sans tooltip. Fix : `title="X sessions actives"` ou Radix Tooltip pour qu'au survol on voie ce que représente le nombre.

### UX-10 — Breadcrumb composant

Pattern simple :
```tsx
<Breadcrumb items={[
  { label: 'Apprenants', href: '/app/apprenants' },
  { label: 'NOM Prénom' }, // sans href = dernier
]} />
```

Composant client (pour highlight active sur usePathname si on veut) ou server. Server suffit.

Utilisations Phase 5 : fiche apprenant. (Fiche produit + autres pages détail à équiper en v6.)

## Pitfalls

1. Year selector AGEFICE : `searchParams` ?ageficeYear=NNNN doit être indépendant du `?tab=activity` existant. Bien gérer le merge dans URL.
2. CTA AGEFICE : le `agefice-generator.ts` a peut-être déjà une UI bouton — vérifier qu'on ne dédouble pas.
3. Compteurs cliquables : si `/app/sessions?apprenant=` n'existe pas, on doit l'ajouter à `sessions/page.tsx` (côté server-side filter).
4. Breadcrumb : ne pas dépendre de usePathname côté server.

## Validation Architecture

| Dim | Check |
|-----|-------|
| UX-08 | grep DeleteEntityButton avec modal — déjà OK, juste documenter |
| UX-09 | grep LearnerCompletenessBadge sans `useState(false)` — visible direct |
| UX-06 | grep BudgetAgefice avec sélecteur année / link `?ageficeYear=` |
| UX-04 | grep CTA "Déposer un dossier AGEFICE" dans BudgetAgefice |
| UX-03 | grep onglet Documents avec CTA "Générer fiche AGEFICE" |
| UX-05 | grep `apprenants/[id]/page.tsx` avec Link `?apprenant=` |
| UX-07 | grep LearnerTabs avec `title=` ou `<Tooltip>` |
| UX-10 | test -f `components/ui/breadcrumb.tsx` + usage dans page apprenant |
| Build + smoke | toutes routes compilent, Phase 1 smoke vert |

## Recommendations

5 plans + bookkeeping :
- 05-01 : UX-09 (completeness visible direct) + UX-08 (vérif faux positif)
- 05-02 : UX-06 + UX-04 (BudgetAgefice year selector + CTA AGEFICE)
- 05-03 : UX-03 (CTA Générer fiche AGEFICE onglet Documents)
- 05-04 : UX-05 + UX-07 (compteurs cliquables Activity + tooltip badge Tabs)
- 05-05 : UX-10 Breadcrumb réutilisable + intégration fiche apprenant
- 05-06 : Bookkeeping wave 2

---

## RESEARCH COMPLETE
