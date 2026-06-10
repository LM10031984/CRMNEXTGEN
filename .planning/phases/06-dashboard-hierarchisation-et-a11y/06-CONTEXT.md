# Phase 6: Dashboard hiérarchisation & a11y - Context

**Gathered:** 2026-05-13

## Phase Boundary

3 frictions UX :
- **UX-11** : Dashboard `/app` actuel a 14 KPI tiles (6 CA + 2 cashflow + 7 performance + alertes) — densité anxiogène. Hiérarchiser = 4 KPI prioritaires en grand + 10 autres repliables.
- **UX-12** : Codes financeurs raw (`OPCOMMERCE`, `OPCO_EP`) parfois affichés sans transformation. Centraliser un mapping → labels user-friendly (`OPCO Commerce`, `OPCO EP`) via helper.
- **UX-13** : Audit a11y léger — contraste badges (notamment success/info vert et bleu clair), navigation clavier sur listes, `aria-label` manquants.

## Implementation Decisions

### UX-11 — Hiérarchisation KPI

- 4 KPI prioritaires (en GRAND, bandeau du haut) :
  - **CA encaissé** (success, le plus important)
  - **AGEFICE consommé année courante** (warning si > 80%)
  - **Sessions actives / à venir** (volume opérationnel)
  - **Taux remplissage moyen** (santé pédagogique)
- Section "Indicateurs détaillés" (collapsible, fermée par défaut sauf si user a opt-in via localStorage) contient les 10 KPI restants (CA prévu/signé/à venir/Facturé/Reste, DSO, Factures en attente, Apprenants, Heures, CA per X).
- Conserver Pipeline / Top sessions / Stats par catégorie (pas dans le scope hiérarchisation, ce sont des sections différentes).

### UX-12 — Codes financeurs

- Nouveau fichier `apps/web/src/lib/funder-codes.ts` avec :
  - `FUNDER_LABELS: Record<string, string>` mapping `OPCOMMERCE → OPCO Commerce`, `OPCO_EP → OPCO EP`, `AGEFICE → AGEFICE`, `FIFPL → FIFPL`, `ATLAS → ATLAS`, `CPF → CPF`, `OF → OF (auto-financé)`, etc.
  - Helper `formatFunderCode(code: string | null | undefined): string` qui retourne le label ou le code raw si inconnu.
- Utiliser ce helper partout où un code financeur est affiché en UI :
  - Dashboard pipeline / financeurs sections
  - Fiche apprenant (déjà visible)
  - Sessions list (badge sponsor)
  - Pages financeurs/[code]
- Note : on garde le code raw en BDD (`opcoCode`) — uniquement le RENDU change.

### UX-13 — a11y

- Audit Badge `success` (vert) → vérifier contraste WCAG AA. Si KO, foncer le texte ou la border.
- Audit Badge `info` (bleu clair) → idem.
- Vérifier `aria-label` manquants sur boutons icon-only (déjà fait Phase 4 pour TopBar, ré-audit rapide ailleurs).
- Navigation clavier : déjà bonne via `<Link>` natif. Vérifier qu'on n'a pas de `onClick` sur `<div>` non-cliquable au clavier.
- Pas de Lighthouse complet (infra dev), juste audit visuel + grep ciblé.

## Out of scope

- Refonte complète du Dashboard (juste hiérarchisation). 
- Renommage des codes en BDD (`OPCOMMERCE` → `OPCO_COMMERCE`).
- Lighthouse score automatisé (CI v6).
- Refonte typographique mobile.

## Canonical Refs

- `apps/web/src/app/app/page.tsx` (dashboard, à hiérarchiser)
- `apps/web/src/lib/dashboard-stats.ts` (compute KPI — pas modifié, juste consommé)
- `apps/web/src/components/ui/badge.tsx` (vérifier contraste)
- (NEW) `apps/web/src/lib/funder-codes.ts`
- `apps/web/src/app/app/financeurs/page.tsx` (utilise opcoCode raw)
- `apps/web/src/app/app/financeurs/[code]/page.tsx`
