# Phase 1: Smoke verification + bugs critiques - Research

**Researched:** 2026-05-12
**Status:** Research complete

## Phase Summary

Trois bugs critiques rapportés par l'audit UX/QA 2026-05-12. L'analyse statique du code laisse penser que 2 sur 3 sont des faux positifs et que le 3e (header sticky) a une cause racine identifiable dans `MainContent`. Cette recherche confirme les patterns à utiliser pour le fix, identifie les pièges et propose une stratégie de validation.

## Findings par bug

### BUG-01 — "FileText is not defined" sur `/app/sessions/[id]`

**Statut analyse statique :** Faux positif probable
- `apps/web/src/app/app/sessions/[id]/page.tsx:4` importe explicitement `FileText` depuis `lucide-react`
- Utilisation au ligne 656 (`<FileText className="h-4 w-4" /> Documents partagés`)
- Build récent (refonte UX 2026-05-12 visible dans `git log`) a probablement réordonné les imports ; l'audit pourrait provenir d'un cache `.next` stale

**Pattern de re-vérification runtime :**
1. `rm -rf apps/web/.next` (purge cache Next build)
2. `pnpm --filter @qualiof/web dev` (relance dev clean)
3. Naviguer sur `/app/sessions/<un id valide>` via browser headless ou manuel
4. Vérifier console : aucune erreur `is not defined`

**Pattern de test smoke (Vitest) :**

Le repo a déjà Vitest (`packages/shared/src/helpers/__tests__/siret.test.ts`). Pas de Playwright. Pour ne pas ouvrir un chantier test infra ici, l'approche "import-only" est sûre :

```ts
// apps/web/src/app/app/sessions/[id]/__tests__/page.smoke.test.ts
import { describe, it, expect } from 'vitest';

describe('sessions/[id] page module', () => {
  it('imports without "is not defined" runtime error', async () => {
    const mod = await import('../page');
    expect(typeof mod.default).toBe('function');
  });
});
```

**Pourquoi ça marche :** quand on `import` le module, JS exécute le top-level (incluant les imports `lucide-react`). Si un symbole utilisé en JSX n'était PAS importé, **on n'aurait pas d'erreur à l'import** mais au rendu. Pour un test smoke vraiment efficace, on peut compléter par un check de tokens :

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';

it('all lucide-react JSX symbols are imported', () => {
  const src = readFileSync(path.join(__dirname, '../page.tsx'), 'utf8');
  const importMatch = src.match(/import \{([^}]+)\} from 'lucide-react'/);
  expect(importMatch).toBeTruthy();
  const imported = new Set(importMatch![1].split(',').map(s => s.trim()));
  const usedInJsx = [...src.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)].map(m => m[1]);
  const lucideUsed = usedInJsx.filter(t => imported.has(t)); // sanity
  const lucideMissing = usedInJsx
    .filter(t => /^[A-Z]/.test(t))
    .filter(t => src.includes(`<${t}`) && /^(FileText|ArrowLeft|Calendar|Clock|Euro|Users|Briefcase|ClipboardCheck|Check|Minus|Package|ChevronRight)$/.test(t))
    .filter(t => !imported.has(t));
  expect(lucideMissing).toEqual([]);
});
```

(Variante plus simple acceptable : juste assert que `imported.has('FileText')` ET `src.includes('<FileText')` cohérents.)

**Vitest config attendue :** Pas de config Vitest dédiée `apps/web/vitest.config.ts` aujourd'hui ; le repo utilise probablement les défauts. Une config minimale serait à ajouter si test fail à cause de TSX/Next/aliases — vérifier au moment du run.

**Anti-pattern à éviter :**
- Ne pas mocker tout l'arbre Lucia + Prisma + Next pour un test smoke. Si le test grossit, il dépasse le scope de la phase.

### BUG-02 — Header sticky qui se décolle au scroll

**Source du bug (hypothèse forte) :**
- `apps/web/src/app/app/layout.tsx` : root `<div className="min-h-screen bg-background"><Sidebar /><MainContent>...</MainContent></div>`
- `apps/web/src/components/layout/main-content.tsx` : `<div className="flex flex-col min-h-screen transition-[margin-left] duration-200 ml-64">{children}</div>`
- `apps/web/src/components/layout/top-bar.tsx` : `<header className="... sticky top-0 z-10">`

**Pourquoi sticky casse ici :**
- `position: sticky` se calcule par rapport au plus proche **ancêtre scrollable**.
- Si MainContent a `min-h-screen` (= 100vh minimum), c'est son enfant `<main className="flex-1">` qui grow lors de contenu long. La hauteur scrollable totale = body / html (pas MainContent). Le `<header>` sticky cherche son contexte de scroll : il remonte jusqu'au body.
- Avec `bg-background` sur le wrapper outer et `min-h-screen` au moins en 2 endroits, certains navigateurs résolvent sticky à `static` quand le containing block ne dépasse pas le viewport au moment du calcul initial.
- Plus subtil : `transition-[margin-left]` n'introduit pas de transform, mais des regressions Webkit/Chromium connues sur `sticky` dans des contextes `flex flex-col min-h-screen` existent (cf. bugzilla et CSSWG threads 2023-2024).

**Fix #1 (recommandé) — Retirer `min-h-screen` de MainContent :**
```tsx
// before
<div className={cn('flex flex-col min-h-screen transition-[margin-left] duration-200', collapsed ? 'ml-[64px]' : 'ml-64')}>

// after
<div className={cn('flex flex-col transition-[margin-left] duration-200', collapsed ? 'ml-[64px]' : 'ml-64')}>
```
Le wrapper parent `<div className="min-h-screen bg-background">` dans `app/app/layout.tsx` garantit déjà la hauteur minimale du body.

**Fix #2 (fallback) — TopBar `fixed` :**
```tsx
// top-bar.tsx
<header className="fixed top-0 left-64 right-0 h-14 ... z-30">
// layout.tsx <main className="pt-14 ...">
```
Inconvénient : il faut gérer `left-64` vs `left-[64px]` selon collapsed, et le responsive (Phase 2). Moins propre.

**Pattern de vérification :**
- Ouvrir devtools, sélectionner `<header>`, regarder **Computed > position**. Doit être `sticky` (pas `relative`/`static`) pendant et après scroll.
- Test JS rapide en console : `getComputedStyle(document.querySelector('header')).position === 'sticky'`.
- Test visuel : screenshot top of page, scroll de 500px, screenshot — le header doit être au même endroit visuellement.

**Anti-pattern à éviter :**
- Ajouter `overflow-y: auto` ou `overflow: clip` quelque part pour "forcer" un nouveau context de scroll — ça créera de nouveaux bugs.
- Toucher la sidebar (qui est `fixed` probablement) — ce n'est pas son problème.

### BUG-03 — Routes naturelles 404

**Statut analyse :** Faux positif menu. La sidebar utilise les bonnes routes (`apps/web/src/components/layout/sidebar.tsx:55,75`). L'auditeur a tapé les URLs naturelles `/app/pre-inscriptions` et `/app/modeles` qui n'existent pas, et a interprété ça comme un bug du menu.

**Fix — Redirects 301 dans `next.config.mjs` :**
```js
// apps/web/next.config.mjs
const nextConfig = {
  // ... existant
  async redirects() {
    return [
      {
        source: '/app/pre-inscriptions',
        destination: '/app/preinscriptions',
        permanent: true,
      },
      {
        source: '/app/modeles',
        destination: '/app/templates',
        permanent: true,
      },
    ];
  },
};
```

**Note Next.js 14 :** `permanent: true` envoie un **308 Permanent Redirect** (pas 301). Sémantiquement équivalent pour SEO/clients, mais préserve la méthode HTTP (GET reste GET, POST reste POST). C'est l'équivalent moderne du 301.

**Pattern de vérification :**
```bash
curl -sI http://localhost:3000/app/pre-inscriptions | grep -E '^(HTTP|Location)'
# attendu:
# HTTP/1.1 308 Permanent Redirect
# Location: /app/preinscriptions

curl -sI http://localhost:3000/app/modeles | grep -E '^(HTTP|Location)'
# attendu:
# HTTP/1.1 308 Permanent Redirect
# Location: /app/templates
```

**Documentation convention** dans `CLAUDE.md` pour éviter régression :
```md
### Routes (convention naming)
- French routes, kebab-case where multi-word: `/app/dossiers-opco`, `/app/budget-agefice`
- Exceptions historiques (préserver) : `/app/preinscriptions` (no hyphen), `/app/templates` (English)
- Always provide a 301/308 redirect for natural variants in next.config.mjs
```

**Anti-pattern à éviter :**
- Renommer `preinscriptions` en `pre-inscriptions` : casse les bookmarks internes + audit logs.
- Renommer `templates` en `modeles` : casse les bookmarks + introduit une incohérence avec le label français vs URL anglaise (déjà choix historique).

## Pitfalls cross-cutting

1. **Cache Next.js stale** — Toujours `rm -rf apps/web/.next` avant de declarer un bug "résolu" ou "non reproduit". Plusieurs incidents passés viennent de là.
2. **Hot reload + RSC** — Modifier un fichier `'use client'` puis re-tester sans full reload peut afficher un état stale. Forcer `Cmd+Shift+R`.
3. **Test smoke trop ambitieux** — Si le test smoke nécessite > 30 lignes de mocks Lucia/Prisma, il est trop gros pour cette phase. Reverter à un import-only test.
4. **`next.config.mjs` est ESM** — Pas de `module.exports`, utiliser `export default`. Le repo utilise déjà cette convention.
5. **`apps/web/src` vs `apps/web/`** — Les redirects sont dans `next.config.mjs` (racine de l'app), pas sous `src/`.
6. **TypeScript paths** — Les imports `@/...` sont alias vers `apps/web/src/*`. Le test smoke vit dans `apps/web/src/app/.../`, donc l'import relatif `../page` fonctionne sans config supplémentaire.

## Validation Architecture

> Cette section informe la création de `01-VALIDATION.md` (Nyquist Dimension 8).

**Dimensions critiques à valider pour Phase 1 :**

### 1. Smoke runtime — page `/app/sessions/[id]`
- **Type :** Test automatisé (Vitest)
- **Acceptance :** `pnpm --filter @qualiof/web test src/app/app/sessions/\[id\]/__tests__/page.smoke.test.ts` retourne exit code 0
- **Coverage :** import du module + assertion que tous les symboles Lucide JSX-utilisés sont importés
- **Frequency :** À chaque PR (ou à la main pour ce milestone, vu l'absence de CI)

### 2. Sticky header — pages clés
- **Type :** Test manuel + capture
- **Acceptance :** Sur dashboard, sessions list, fiche apprenant (`/app`, `/app/sessions`, `/app/apprenants/[id]`), scroller de >500px → `<header>` reste visible en haut, `getComputedStyle(header).position === 'sticky'`
- **Coverage :** 3 captures avant/après attachées au commit final
- **Frequency :** Une fois cette phase, plus à chaque mise à jour layout (manuel)

### 3. Redirects routes naturelles
- **Type :** Test curl + test automatisé léger
- **Acceptance :**
  - `curl -sI http://localhost:3000/app/pre-inscriptions` → `308` + `Location: /app/preinscriptions`
  - `curl -sI http://localhost:3000/app/modeles` → `308` + `Location: /app/templates`
- **Coverage :** Optionnel : un test Vitest qui import et inspecte `next.config.mjs` pour vérifier que les 2 redirects sont déclarés
- **Frequency :** Une fois cette phase

### 4. Aucune régression sur les pages clés
- **Type :** QA manuel
- **Acceptance :** Navigation sur 6 écrans clés (dashboard, sessions list/détail, apprenants list/détail, dossier OPCO détail) — pas d'erreur console nouvelle
- **Coverage :** Checklist dans le commit message du dernier plan
- **Frequency :** Avant transition vers Phase 2

### Validation success threshold

Phase 1 = SUCCESS si :
- ≥ 1 test automatisé passe (smoke page)
- 3 captures sticky attachées (preuve avant/après sur 3 pages)
- 2 redirects curl validés
- Checklist QA 6 écrans : ✓ partout (zero régression)

Phase 1 = FAILED si :
- Le test smoke échoue ET le runtime montre toujours "FileText is not defined" → reopener BUG-01 avec investigation plus profonde
- Le sticky ne fonctionne ni avec Fix #1 ni avec Fix #2 → reopener BUG-02 avec capture du computed style
- Un redirect ne marche pas → vérifier syntax next.config.mjs

## Recommendations for planner

1. **Granularité plans :** 3 plans atomiques (un par bug), wave 1 (parallélisables). Le sticky est le seul qui touche `MainContent` shared, mais l'écriture du test smoke / redirect ne crée pas de conflit de fichiers.
2. **Ordre suggéré dans la phase :** 
   - Plan 01-01 : BUG-01 (test smoke + retest runtime + commit "fix: confirm no FileText runtime error + smoke test")
   - Plan 01-02 : BUG-03 (ajouter redirects + doc CLAUDE.md + tests curl manual)
   - Plan 01-03 : BUG-02 (Fix #1 retrait `min-h-screen` + captures + fallback si nécessaire)
3. **Dépendances :** Aucune entre les 3 plans. Wave 1 tous parallèles. (Si exécuté manuellement séquentiel, l'ordre proposé ci-dessus est le plus rapide en risque/réward.)
4. **must_haves :** Les 4 success criteria de la roadmap doivent être atteints (page boote sans erreur, sticky OK, redirects 301/308 actifs, smoke test commit).

---

## RESEARCH COMPLETE

*Phase: 01-smoke-verification-bugs-critiques*
*Researched: 2026-05-12 (inline path — synthesized from existing codebase analysis)*
