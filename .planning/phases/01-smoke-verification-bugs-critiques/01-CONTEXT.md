# Phase 1: Smoke verification + bugs critiques - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning
**Source:** Codebase analysis (`.planning/codebase/CONCERNS.md`) + user audit 2026-05-12

<domain>
## Phase Boundary

Cette phase fait la chasse aux 3 "bugs critiques" rapportés par l'audit UX/QA 2026-05-12 :

1. **BUG-01** — "FileText is not defined" sur `/app/sessions/[id]`
2. **BUG-02** — Header TopBar se décolle au scroll (ne reste pas sticky)
3. **BUG-03** — Routes `/app/pre-inscriptions` et `/app/modeles` renvoient 404

L'analyse statique du code a déjà montré que **BUG-01 et BUG-03 sont probablement des faux positifs** :
- `apps/web/src/app/app/sessions/[id]/page.tsx:4` importe bien `FileText` de `lucide-react`. Utilisation ligne 656 (et non 574 comme indiqué dans l'audit).
- `apps/web/src/components/layout/sidebar.tsx:55,75` utilise les routes correctes `/app/preinscriptions` et `/app/templates`. Les URLs `/pre-inscriptions` et `/modeles` sont des hypothèses naturelles que l'auditeur a tapées à la main et qui n'existent simplement pas comme routes.

L'objectif de cette phase est donc à la fois de **vérifier ces hypothèses en runtime** (pour éviter le risque qu'une régression réelle se cache sous le faux positif présumé) **et** de transformer chaque finding en un livrable solide (test smoke, redirects propres, fix du sticky réel s'il existe).

</domain>

<decisions>
## Implementation Decisions

### BUG-01 — Vérification "FileText" runtime

- Décision verrouillée : **Re-tester en runtime avec clean build avant de fixer**. Si l'erreur n'apparaît pas après `rm -rf apps/web/.next && pnpm --filter @qualiof/web dev`, marquer la requirement comme "validé faux positif" dans `REQUIREMENTS.md` + commiter un test smoke qui boote `/app/sessions/[id]` et vérifie l'absence de runtime error pour empêcher toute régression future.
- Décision verrouillée : Si l'erreur SE reproduit, le fix attendu est probablement de réordonner les imports (le test smoke doit alors passer après fix).
- Méthode de test smoke : préférer un test **Vitest + jsdom** côté page qui mock auth + db plutôt qu'un test Playwright (pas de config Playwright dans le repo aujourd'hui — ne pas l'introduire ici, ce serait un scope creep traité au milestone v2).
  - Alternative acceptable : test minimal Vitest qui import dynamiquement la page module et asserte que tous les symboles lucide-react référencés JSX sont importés au top — pattern moins fragile que le rendu complet.

### BUG-02 — Header sticky

- Décision verrouillée : Le `<header sticky top-0 z-10>` est correct ; la cause racine probable est `min-h-screen` sur `MainContent` (`components/layout/main-content.tsx`) qui crée un contexte de positionnement où le sticky ne s'applique pas.
- Décision verrouillée : Approche préférée — **retirer `min-h-screen` de `MainContent`** (il est déjà sur le wrapper parent dans `app/app/layout.tsx`). Tester sticky sur dashboard + sessions list + apprenant détail.
- Fallback si le fix par retrait ne marche pas : convertir le TopBar en `fixed top-0 left-64 right-0` avec `pt-14` sur `<main>` (responsive `left-0 md:left-64` après Phase 2).
- Capture obligatoire : screenshot avant + après sur les 3 pages, attachés à la PR / au commit.

### BUG-03 — Routes naturelles 404

- Décision verrouillée : Ajouter **redirects 301** dans `next.config.mjs` pour les URLs naturelles vers les routes existantes :
  - `/app/pre-inscriptions` → `/app/preinscriptions`
  - `/app/modeles` → `/app/templates`
- Décision verrouillée : **Ne pas renommer** les routes existantes (impact bookmarks internes, liens externes, audit logs). Les redirects sont permanents (301) → moteurs/clients comprennent que c'est l'URL canonique.
- Documenter la convention de naming dans `CLAUDE.md` (kebab-case FR, sans hyphen pour `preinscriptions`, anglais pour `templates`) pour éviter de re-créer le piège.

### Tests / preuves

- Décision verrouillée : Chaque bug a une preuve attachée au commit final :
  - BUG-01 → log du test smoke qui passe + capture browser de la page rendue sans erreur
  - BUG-02 → captures avant/après sur 3 pages
  - BUG-03 → curl ou test e2e du redirect (statut 301 + Location header correct)
- Décision verrouillée : **Pas de CI introduite** dans cette phase. Tests locaux suffisent. CI = scope v2.

### Out of scope (à ne pas étendre)

- Pas de refonte de `tailwind.config.ts` ici (Phase 2 — RESP-01).
- Pas d'ajout de Playwright ni de framework E2E (futur milestone).
- Pas de changement de la sidebar ou des routes elles-mêmes (juste redirects).
- Pas de fix UX hors des 3 bugs ciblés.

### Claude's Discretion

- Choix exact du test smoke (Vitest rendu vs Vitest import-only) selon faisabilité technique avec auth Lucia mocké.
- Ordre des sous-tâches dans la phase (probablement BUG-01 → BUG-03 → BUG-02 car ce dernier risque d'être le plus iteratif).
- Wording exact des commit messages (suivre le pattern observé : `fix(web): ...`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Codebase map

- `.planning/codebase/CONCERNS.md` — Analyse détaillée des 3 bugs avec verifications statiques et hypothèses de cause racine
- `.planning/codebase/ARCHITECTURE.md` — Layers (RSC + Server Actions + worker BullMQ) et entry points
- `.planning/codebase/STRUCTURE.md` — Directory layout (apps/web/src/...) et naming conventions

### Project context

- `.planning/PROJECT.md` — Core Value (4 piliers) + Validated requirements (paliers 2.2-4)
- `.planning/REQUIREMENTS.md` — BUG-01, BUG-02, BUG-03 (v1 requirements scope)
- `.planning/STATE.md` — État courant et décisions

### Files in scope (directly modified by this phase)

- `apps/web/src/app/app/sessions/[id]/page.tsx` — Vérifier BUG-01, potentiellement ajouter test smoke voisin
- `apps/web/src/components/layout/main-content.tsx` — Source probable de BUG-02 (`min-h-screen`)
- `apps/web/src/components/layout/top-bar.tsx` — Cible alternative de BUG-02 (passage en `fixed`)
- `apps/web/src/app/app/layout.tsx` — Wrapper `min-h-screen` à respecter
- `apps/web/next.config.mjs` — Ajouter `async redirects()` pour BUG-03
- `CLAUDE.md` — Documenter convention naming routes

### Reference files (read only)

- `apps/web/src/components/layout/sidebar.tsx` — Pour confirmer les routes correctes (BUG-03)
- `apps/web/tailwind.config.ts` — À NE PAS toucher dans cette phase (réservé Phase 2)
- `apps/web/package.json` — Pour identifier les scripts de dev / test disponibles
- `packages/shared/src/helpers/__tests__/siret.test.ts` — Modèle de test Vitest existant à imiter

</canonical_refs>

<specifics>
## Specific Ideas

- **Test smoke "import-only" pattern** (sans rendu complet, évite la complexité Lucia/Prisma) :
  ```ts
  // sessions/[id]/page.test.ts (or co-located __tests__)
  import { describe, it, expect } from 'vitest';
  
  describe('sessions/[id] page module', () => {
    it('imports without runtime error', async () => {
      const mod = await import('../page');
      expect(typeof mod.default).toBe('function');
    });
  });
  ```
  Ce pattern force le module à être chargé (ce qui déclencherait `FileText is not defined` si l'erreur était réelle), sans nécessiter rendu + mocks.

- **Redirect Next.js 14** dans `next.config.mjs` :
  ```js
  async redirects() {
    return [
      { source: '/app/pre-inscriptions', destination: '/app/preinscriptions', permanent: true },
      { source: '/app/modeles',          destination: '/app/templates',      permanent: true },
    ];
  }
  ```

- **Vérification curl pour BUG-03** (preuve) :
  ```bash
  curl -sI http://localhost:3000/app/pre-inscriptions | head -3
  # Doit retourner: HTTP/1.1 308 (Next.js force 308 pour permanent=true, équivalent 301 sémantiquement)
  ```

- **Test sticky pour BUG-02** : ouvrir devtools, sur le `<header>`, vérifier `position: sticky` actif + `getComputedStyle(header).top === '0px'` pendant le scroll. Si le bug existe, sticky se résout à `relative` (computedStyle.position == "static") car le contexte parent ne le supporte pas.

</specifics>

<deferred>
## Deferred Ideas

- **Test rendu complet de la page sessions/[id]** avec mocks Lucia + Prisma + données fake — déféré au milestone v2 (TEST-01/TEST-02 dans REQUIREMENTS.md).
- **Convention de redirect automatique pour toutes les routes "naturelles"** (générées depuis les labels sidebar) — déféré, demande un script de génération.
- **Audit complet de tous les liens internes** pour vérifier qu'aucun ne pointe sur une URL morte — déféré.
- **Détection automatique des imports lucide-react manquants** via un lint rule custom — déféré.

</deferred>

---

*Phase: 01-smoke-verification-bugs-critiques*
*Context gathered: 2026-05-12 (offline path — synthesized from existing codebase analysis)*
