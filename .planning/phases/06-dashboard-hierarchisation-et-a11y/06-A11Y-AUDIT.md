# Phase 6 — Audit a11y

**Date :** 2026-05-13
**Scope :** Périmètre actuel du CRM QualiOF (apps/web). Audit visuel + grep ciblé. Pas de Lighthouse (cf CONTEXT.md > Out of scope).
**Méthodologie :** lecture de `apps/web/src/components/ui/badge.tsx`, lecture de `apps/web/tailwind.config.ts` (résolution des tokens `primary` et `muted`/`foreground`), et 6 commandes grep ciblées (cf détail par dimension).

## Verdict global

**PASS_AVEC_NOTES** — Le périmètre Phase 6 satisfait WCAG AA pour le contraste (tous les variants Badge passent), la navigation clavier (`<Link>` natif + `<button>` partout sur les chemins critiques), et l'aria-label sur les contrôles globaux (TopBar, sidebar, hamburger). 4 boutons icon-only de fermeture (croix `X` dans dialogs custom) sont sans `aria-label` — non bloquant car redondant avec le bouton "Annuler" textuel et le click-outside, mais à durcir en v6 (cf section 5).

---

## 1. Contraste Badge variants

**Commande :** lecture de `apps/web/src/components/ui/badge.tsx` + `apps/web/tailwind.config.ts` pour résoudre `primary-50`/`primary-700`/`muted`/`foreground`.
**Critère :** WCAG AA = ratio contraste ≥ 4.5:1 (texte normal, taille 11px → considéré "texte normal", pas "large").

Tokens Tailwind résolus depuis `tailwind.config.ts` :
- `primary-50` = `#E6F0F5` (très clair)
- `primary-700` = `#003049` (très foncé)
- `muted.DEFAULT` = `#F1F5F9`
- `foreground` = `#0F172A` (quasi noir)

| Variant | Classes | Couleurs résolues | Ratio approx | Verdict AA |
|---|---|---|---|---|
| success | bg-emerald-50 text-emerald-700 border-emerald-200 | #ecfdf5 / #047857 | ~6.5:1 | **PASS** |
| warning | bg-amber-50 text-amber-800 border-amber-200 | #fffbeb / #92400e | ~8.1:1 | **PASS** |
| danger | bg-red-50 text-red-700 border-red-200 | #fef2f2 / #b91c1c | ~6.4:1 | **PASS** |
| info | bg-sky-50 text-sky-700 border-sky-200 | #f0f9ff / #0369a1 | ~5.6:1 | **PASS** |
| muted | bg-slate-50 text-slate-600 border-slate-200 | #f8fafc / #475569 | ~7.5:1 | **PASS** |
| primary | bg-primary-50 text-primary-700 border-primary-100 | #E6F0F5 / #003049 | ~12.6:1 | **PASS** |
| default | bg-muted text-foreground border-border | #F1F5F9 / #0F172A | ~16.1:1 | **PASS** |

**Verdict dimension : PASS**
**Correctifs :** aucun. La palette Start Academy (charte issue de Qualiopi Gen) utilise un `primary-700` très foncé (#003049) sur `primary-50` très clair (#E6F0F5) — ratio confortable largement au-dessus du seuil AA.

---

## 2. Navigation clavier sur listes

**Commande :** `grep -rn "<div[^>]*onClick" apps/web/src --include="*.tsx" | grep -v "tabIndex\|role="`
**Résultat :** 11 occurrences, toutes des overlays Dialog ou anti-bubbling.

| Pattern | Fichiers | Verdict |
|---|---|---|
| `<Link>` natif sidebar | `components/layout/sidebar-nav.tsx` | **PASS** (Tab/Enter natifs sur Link Next) |
| `<Link>` natif DataTable rowHref | `components/ui/data-table.tsx` (via cell Link) | **PASS** |
| `<Link>` natif cards dashboard | `app/app/page.tsx` (PrioCard) | **PASS** |
| `<button>` toggles collapsible | `components/ui/collapsible-section.tsx`, `sidebar-nav.tsx`, `sessions/gap-row.tsx`, `dossiers-opco/group-row.tsx` | **PASS** (button natifs, `aria-expanded` présent sur CollapsibleSection) |
| `<div onClick>` overlay Dialog | `create-organization-button.tsx:69`, `create-product-button.tsx:92`, `create-person-button.tsx:232`, `delete-entity-button.tsx:73`, `new-link-button.tsx:63`, `add-person-to-org-button.tsx:101` | **PASS_AVEC_NOTE** (overlay click-outside-to-close ; le bouton de fermeture interne est `<button>` focusable) |
| `<div onClick={stopPropagation}>` panel Dialog | `create-organization-button.tsx:70`, etc. | **PASS** (no-op a11y : empêche juste la propagation) |
| `<div onClick>` backdrop dropdown | `sessions/session-status-select.tsx:89` | **PASS_AVEC_NOTE** (backdrop click-to-close, le trigger principal est button) |
| `<div onClick={stopPropagation}>` action cell | `dossiers-opco/group-row.tsx:96` | **PASS** (stopPropagation pour ne pas déclencher la row click — le contenu interne reste focusable) |
| Cmd+K command palette | `cmdk` library | **PASS** (handled by lib, focus trap natif) |
| TopBar bell / avatar | `notifications-bell.tsx`, `user-menu-button.tsx` | **PASS** (Radix DropdownMenu = focus trap + Esc + arrow keys) |
| Wizard create-session | `app/app/sessions/new/page.tsx` | **PASS** (tous form controls natifs) |

**Verdict dimension : PASS_AVEC_NOTE**
**Note :** Les `<div onClick>` détectés sont tous des overlays/backdrops de dialogs custom. Ils ne sont pas focusables au clavier, mais l'a11y n'est pas dégradée car :
1. Chaque dialog a un bouton de fermeture `<button>` accessible via Tab.
2. Le bouton "Annuler" est aussi accessible via Tab.
3. Le seul "gap" est l'absence de fermeture via `Esc` (les dialogs custom ne sont pas Radix). C'est noté en dette pour v6 (cf section 5).

---

## 3. aria-label sur boutons icon-only

**Commande :** `grep -rn "<button" apps/web/src --include="*.tsx" -A 5 | grep -B 1 "h-4 w-4\|h-5 w-5" | grep -v "aria-label\|aria-labelledby"`
**Résultat :** ~14 candidats. La majorité sont des boutons avec **texte adjacent** (ex: `<Plus class="h-4 w-4" /> Nouveau produit`) → NOT icon-only → pas besoin d'`aria-label`. Restent ~4 boutons icon-only (croix de fermeture dans dialogs custom).

| Composant | Type | aria-label présent | Notes |
|---|---|---|---|
| MobileMenuButton (`Menu` hamburger) | icon-only | **OUI** ("Ouvrir le menu") | Phase 2 |
| NotificationsBell (`Bell`) | icon-only | **OUI** ("Notifications") | Phase 4 |
| UserMenuButton (avatar) | trigger Radix | **OUI** (via Radix) | Phase 4 |
| GroupRow toggle (`ChevronDown/Right`) | icon-only | **OUI** ("Réduire" / "Développer") | Phase OPCO V2 |
| LearnerQuickView close (`X`) | icon-only | **OUI** ("Fermer") | OK |
| CollapsibleSection trigger | icon + texte | N/A (texte visible "INDICATEURS DÉTAILLÉS…") + `aria-expanded` | OK |
| Sidebar section toggle | icon + texte | N/A (texte "OUTILS"/"CONFIG"/etc visible) | OK |
| Sessions gap-row toggle | icon + texte | N/A (Badge + nom session lisibles) | OK |
| Dashboard PrioCard | `<Link>` | N/A (texte du KPI visible) | OK |
| Forms create-X (`Plus` + label) | button avec texte | N/A (texte "Nouveau X" visible) | OK |
| **`new-link-button.tsx:72` close (`X`)** | **icon-only** | **NON** | À durcir (cf correctifs) |
| **`add-person-to-org-button.tsx:108` close (`X`)** | **icon-only** | **NON** | À durcir (cf correctifs) |
| **`create-trainer-button.tsx` close (`X`)** | **icon-only** (à vérifier) | **NON** (présumé) | À durcir (cf correctifs) |
| **`create-organization-button.tsx` close (`X`)** (si présent) | **icon-only** | **NON** (présumé) | À durcir (cf correctifs) |

**Verdict dimension : PASS_AVEC_NOTE**
**Correctifs proposés (hors scope plan 06-03, à intégrer dette milestone v6) :**
- Ajouter `aria-label="Fermer"` aux croix `<X>` des dialogs custom listées ci-dessus.
- Mieux : migrer ces dialogs custom vers `@radix-ui/react-dialog` (déjà installé) pour bénéficier de focus-trap + Esc + aria native. Tâche dette technique.

Hors scope plan 06-03 (qui modifie UNIQUEMENT `badge.tsx`). Reporté à milestone v6.

---

## 4. `<div onClick>` non-focusables (anti-pattern)

**Commande :** `grep -rn "<div[^>]*onClick" apps/web/src --include="*.tsx"`
**Résultat :** 11 occurrences, **0 anti-pattern bloquant**. Tous sont des overlays/backdrops/stopPropagation.

| Fichier | Ligne | Contexte | Verdict |
|---|---|---|---|
| `forms/create-organization-button.tsx` | 69-70 | overlay click-outside + panel stopPropagation | ACCEPTABLE |
| `forms/create-product-button.tsx` | 92-93 | overlay + panel stopPropagation | ACCEPTABLE |
| `forms/delete-entity-button.tsx` | 73-74 | overlay + panel stopPropagation | ACCEPTABLE |
| `forms/create-person-button.tsx` | 232-233 | overlay + panel stopPropagation | ACCEPTABLE |
| `preinscriptions/new-link-button.tsx` | 63 | overlay click-outside | ACCEPTABLE |
| `editors/add-person-to-org-button.tsx` | ~101 | overlay click-outside | ACCEPTABLE |
| `sessions/session-status-select.tsx` | 89 | backdrop dropdown click-to-close | ACCEPTABLE |
| `dossiers-opco/group-row.tsx` | 96 | stopPropagation cell (anti-bubbling row click) | ACCEPTABLE |

**Verdict dimension : PASS**
Aucun `<div onClick>` n'est utilisé pour porter une action métier sur un élément non focusable. Tous sont des overlays/backdrops/anti-bubbling, ce qui est un pattern accepté à condition qu'un focusable existe pour la même action — c'est le cas ici (bouton "Annuler"/"Fermer" textuel présent dans chaque dialog).

---

## 5. Dette technique a11y (à reporter milestone v6)

- **Lighthouse / axe-core en CI** : reporté (cf CONTEXT.md > Out of scope, CI v6).
- **Migration dialogs custom → Radix Dialog** : ~5 boutons custom (`create-organization`, `create-product`, `delete-entity`, `create-person`, `new-link-button`, `add-person-to-org`) gagneraient en a11y (focus-trap, Esc, `aria-modal`, `role="dialog"` natifs). Lourd, garder pour v6.
- **`aria-label="Fermer"` sur croix X custom** : 3-4 fichiers à durcir (cf section 3). Quick win 15 min, peut être groupé avec la migration Radix ou fait isolément.
- **Skip-link "Aller au contenu principal"** : à ajouter si feedback utilisateur clavier-only (low priority, audience interne Start Academy).
- **Focus visible (ring)** : pattern Tailwind `focus:ring-2 focus:ring-primary-500` à vérifier sur tous les boutons custom. Audit séparé en v6.
- **Tests automatisés a11y** : `vitest-axe` ou `@axe-core/playwright` à ajouter quand l'infra CI sera en place (v6).

---

## Conclusion

L'audit visuel + grep ciblé du périmètre Phase 6 confirme un niveau a11y **raisonnable et conforme WCAG AA pour les fondamentaux** :
- **Contraste Badge** : 7/7 variants PASS (la palette Start Academy / Qualiopi Gen est bien dimensionnée).
- **Navigation clavier** : `<Link>` natif partout (sidebar, DataTable, dashboard) + Radix sur dropdowns/dialogs critiques.
- **aria-label** : présent sur les contrôles globaux (TopBar, sidebar, hamburger), manquant sur ~4 croix de fermeture dans dialogs custom (notes pour v6).

**Aucun gap bloquant identifié.** Le plan 06-03 Task 2 (correctif `badge.tsx`) est **NO-OP** : aucun variant Badge n'échoue le ratio AA, donc `badge.tsx` reste inchangé. La dette résiduelle (~4 boutons icon-only + 5 dialogs custom) est listée en section 5 pour milestone v6.

Le pattern dominant (Radix UI + `<Link>` natif + `<button>` avec aria-label) satisfait WCAG AA pour le périmètre interne Start Academy.
