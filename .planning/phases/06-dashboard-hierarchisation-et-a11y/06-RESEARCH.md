# Phase 6: Dashboard hiérarchisation & a11y - Research

**Researched:** 2026-05-13

## Findings

### UX-11 — Hiérarchisation Dashboard

État actuel page.tsx :
- ~286 lignes
- 5 sections KPI : Bandeau CA (6 cards), Cashflow (2 cards), Performance (7 cards), Alertes/Pipeline (2 cards), Top sessions (3 listes)
- 14 KPI tiles total dans les sections numériques

Refactor proposé :
- **Section "À l'essentiel"** (top, sans collapse) : 4 PrioCard en grand format (icône + label + valeur + accent).
  - CA encaissé · AGEFICE consommé · Sessions à venir · Taux remplissage moyen
- **Section "Indicateurs détaillés"** (collapsible, fermée par défaut) : les 14 KPI actuels, regroupés en 3 sous-sections (CA, Cashflow, Performance).
- Pipeline + Top sessions + Stats par catégorie : intacts.

Implémentation collapsible : composant client `<CollapsibleSection title="..." defaultOpen={false}>` qui persiste l'état dans localStorage (clé `qualiof-dashboard-collapse-<id>`). Pattern proche de la sidebar config section (Phase 2).

### UX-12 — Codes financeurs

OPCO codes recensés via `OpcoCatalog.code` + seed :
- AGEFICE → "AGEFICE"
- OPCO_EP → "OPCO EP"
- OPCOMMERCE → "OPCO Commerce"
- ATLAS → "ATLAS"
- FIFPL → "FIFPL"
- CPF → "CPF"
- (autres possibles selon données)

`OpcoCatalog.name` contient déjà ces labels. La friction est quand on affiche `opcoCode` raw dans des badges où le name n'est pas fetched. Solution : helper qui fait le mapping côté client/server sans avoir besoin de fetch OpcoCatalog.

```ts
// apps/web/src/lib/funder-codes.ts
export const FUNDER_LABELS: Record<string, string> = {
  AGEFICE: 'AGEFICE',
  OPCO_EP: 'OPCO EP',
  OPCOMMERCE: 'OPCO Commerce',
  ATLAS: 'ATLAS',
  FIFPL: 'FIFPL',
  CPF: 'CPF',
  OF: 'OF (auto-financé)',
};

export function formatFunderCode(code: string | null | undefined): string {
  if (!code) return '—';
  return FUNDER_LABELS[code] ?? code;
}
```

Recherche grep des sites où `opcoCode` est affiché en UI (vs requête BDD) :
- Plusieurs Badge/Span avec `{p.sponsorOrg?.opcoCode}` ou `{opco.code}` à wrapper.

### UX-13 — a11y

Audit Badge.tsx :
- variants : default, success, warning, danger, info, muted, primary.
- Couleurs success : `bg-emerald-50 text-emerald-700 border-emerald-200` — emerald-700 sur emerald-50 = ratio ~6:1 (OK WCAG AA).
- Couleurs info : `bg-sky-50 text-sky-700 border-sky-200` — sky-700 sur sky-50 = ratio ~5:1 (OK).
- Couleurs warning : `bg-amber-50 text-amber-800` — amber-800 sur amber-50 = ratio ~7:1 (très OK).
- Couleurs danger : `bg-red-50 text-red-700` — OK.
- Couleurs muted : `text-slate-600` sur `bg-slate-50` — ratio ~5:1 OK.

**Verdict :** Les badges sont déjà conformes WCAG AA (text-color-700 ou 800 sur bg-color-50). Audit "contrastes badges" = quasiment rien à faire.

Audit nav clavier :
- Sidebar : `<Link>` natif → tab/enter OK
- DataTable : `<Link>` rowHref ou contenu cellule → tab/enter OK
- Cmd+K : déjà géré par cmdk lib
- TopBar : `<button>` natifs avec aria-label depuis Phase 4 → OK
- Bouton hamburger mobile : `aria-label="Ouvrir le menu"` Phase 2 → OK

Audit `aria-label` manquants : grep `<button` sans `aria-label` ni texte visible long.

**Verdict :** a11y est déjà raisonnable (pattern Radix + Link + button natifs partout). Audit léger suffit.

## Validation

- UX-11 : grep `<CollapsibleSection` ou équivalent dans page.tsx, 4 PrioCard visibles
- UX-12 : grep `formatFunderCode` import dans dashboard + autres pages financeurs
- UX-13 : note de validation a11y (contrastes OK déjà, nav clavier OK déjà)
- Build + smoke

## Recommendations

3 plans + bookkeeping :
- 06-01 : UX-12 helper funder-codes + integration dans dashboard + autres pages
- 06-02 : UX-11 hiérarchisation dashboard (PrioCard + CollapsibleSection)
- 06-03 : UX-13 audit a11y (mostly verification + a few fixes if needed)
- 06-04 : Bookkeeping
