---
phase: quick-260619-mpn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/app/produits/[id]/page.tsx
autonomous: true
requirements: [EVALWIRE-01]
quick: true

must_haves:
  truths:
    - "Sur /app/produits/[id] (onglet Stats), les cards RÉUSSITE QCM / RECOMMANDATION / NOTE GLOBALE affichent des pourcentages réels pour un produit ayant des sessions COMPLETED avec QCM + satisfaction à chaud (PROD-053)."
    - "Un produit sans aucune évaluation réelle continue d'afficher « aucune évaluation » (comportement préservé)."
    - "Le bloc ProductSatisfactionPanel et les 4 PrioCards existantes (Sessions/Apprenants/Heures/CA) restent intacts."
  artifacts:
    - path: "apps/web/src/app/app/produits/[id]/page.tsx"
      provides: "Appel à getProductEvaluationStats + passage de la prop evalStats à <ProductStatsTab>"
      contains: "getProductEvaluationStats"
  key_links:
    - from: "apps/web/src/app/app/produits/[id]/page.tsx"
      to: "apps/web/src/lib/evaluation-stats.ts (getProductEvaluationStats)"
      via: "appel en Promise.all dans la branche activeTab === 'stats'"
      pattern: "getProductEvaluationStats\\("
    - from: "apps/web/src/app/app/produits/[id]/page.tsx"
      to: "<ProductStatsTab>"
      via: "prop evalStats={evalStats}"
      pattern: "evalStats=\\{"
---

<objective>
Brancher les stats d'évaluation (Réussite QCM / Recommandation / Note globale) sur la fiche produit.

Bug vérifié : sur `/app/produits/[id]` (onglet Stats), les cards RÉUSSITE QCM / RECOMMANDATION / NOTE GLOBALE affichent toujours « aucune évaluation » sur TOUS les produits. Cause racine : `getProductEvaluationStats` (`evaluation-stats.ts:134`) n'est appelée nulle part, et `page.tsx` rend `<ProductStatsTab stats={stats} productId={...} />` SANS la prop optionnelle `evalStats` → toujours `undefined` → les 3 cards tombent dans le fallback « aucune évaluation ». Les données existent (PROD-053/SES-0011 : QCM 92, reco Oui) et `ProductSatisfactionPanel` (bien câblé) les affiche déjà (99 % / 100 %).

Purpose: rendre visibles des stats Qualiopi (indicateurs résultats) déjà calculables, sans toucher à la logique métier.
Output: 1 fichier modifié (`page.tsx`), câblage minimal.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@apps/web/src/app/app/produits/[id]/page.tsx
@apps/web/src/lib/evaluation-stats.ts
@apps/web/src/components/produits/tabs/product-stats-tab.tsx

<interfaces>
<!-- Contrats déjà en place — l'exécuteur utilise ces signatures, aucune exploration nécessaire. -->

Depuis apps/web/src/lib/evaluation-stats.ts (NE PAS modifier ce fichier) :
```typescript
export interface EvaluationStats {
  qcm: QcmStats | null;
  satisfaction: SatisfactionStats | null;
  nbSessions: number;
}
export async function getProductEvaluationStats(
  productId: string,
  tenantId: string,
): Promise<EvaluationStats>;
```

Depuis apps/web/src/components/produits/tabs/product-stats-tab.tsx (NE PAS modifier ce fichier — il consomme déjà evalStats) :
```typescript
interface Props {
  stats: ProductStats;
  evalStats?: EvaluationStats | null;  // <-- prop optionnelle déjà attendue, jamais passée aujourd'hui
  productId: string;
}
```

État actuel du rendu (page.tsx l.202-209) :
```tsx
{activeTab === 'stats' && stats && (
  <div className="space-y-5">
    <ProductStatsTab stats={stats} productId={product.id} />   {/* evalStats manquant */}
    <ProductSatisfactionPanel productId={product.id} tenantId={user.tenantId} />
  </div>
)}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Câbler getProductEvaluationStats sur la fiche produit (onglet Stats)</name>
  <files>apps/web/src/app/app/produits/[id]/page.tsx</files>
  <action>
Câblage minimal — NE modifier QUE `page.tsx`. Ne PAS toucher `evaluation-stats.ts` (logique correcte), `product-stats-tab.tsx` (consomme déjà `evalStats`), ni `ProductSatisfactionPanel` (intact).

1. Import : ajouter `getProductEvaluationStats` et le type `EvaluationStats` depuis `@/lib/evaluation-stats`.
   - L'import existant des helpers produit vient de `@/lib/product-stats` (l.20-27) — NE PAS y mélanger. Ajouter un import séparé :
     ```ts
     import { getProductEvaluationStats, type EvaluationStats } from '@/lib/evaluation-stats';
     ```

2. Déclarer la variable d'état lazy à côté des autres (près de l.92-95 où sont déclarées `stats`, `sessions`, `learners`, `programmePdfId`) :
   ```ts
   let evalStats: EvaluationStats | null = null;
   ```

3. Dans la branche `if (activeTab === 'stats')` (l.97-99), remplacer l'appel solo par un `Promise.all` parallèle (les deux fetchs sont indépendants, scope `tenantId` déjà géré par chaque fonction) :
   ```ts
   if (activeTab === 'stats') {
     [stats, evalStats] = await Promise.all([
       getProductStats(id, user.tenantId),
       getProductEvaluationStats(id, user.tenantId),
     ]);
   } else if (activeTab === 'sessions') {
     ...
   ```
   Note typage : `stats` est `ProductStats | null` et `getProductStats` renvoie `ProductStats | null` ; `evalStats` est `EvaluationStats | null` et `getProductEvaluationStats` renvoie `EvaluationStats` (jamais null mais avec `qcm`/`satisfaction` éventuellement null en interne). Le tuple destructuré reste type-safe (`EvaluationStats` est assignable à `EvaluationStats | null`). Si tsc se plaint de la destructuration tuple+let, fallback acceptable :
   ```ts
   const [s, e] = await Promise.all([
     getProductStats(id, user.tenantId),
     getProductEvaluationStats(id, user.tenantId),
   ]);
   stats = s;
   evalStats = e;
   ```

4. Passer la prop dans le JSX (l.204), PRÉSERVER le garde existant `activeTab === 'stats' && stats` (le bloc n'est rendu QUE quand le produit/onglet a `stats` — comportement à conserver) :
   ```tsx
   <ProductStatsTab stats={stats} evalStats={evalStats} productId={product.id} />
   ```
   Ne RIEN changer d'autre dans ce bloc : `ProductSatisfactionPanel` reste tel quel juste en dessous.

Aucune nouvelle requête hors onglet Stats (lazy load préservé : `evalStats` n'est fetché que si `activeTab === 'stats'`). Aucun changement de logique de calcul. Pas de migration, pas de LLM.
  </action>
  <verify>
    <automated>cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" && pnpm --filter @qualiof/web exec tsc --noEmit && pnpm --filter @qualiof/web exec vitest run src/lib/__tests__/evaluation-stats.test.ts</automated>
  </verify>
  <done>
- `page.tsx` importe et appelle `getProductEvaluationStats(id, user.tenantId)` en `Promise.all` dans la branche `activeTab === 'stats'`.
- `<ProductStatsTab>` reçoit `evalStats={evalStats}`.
- `tsc --noEmit` vert sur apps/web.
- La suite existante `evaluation-stats.test.ts` (helpers purs) reste verte — aucun nouveau test ajouté (câblage pur, couverture déjà en place).
- Comportement préservé : garde `activeTab === 'stats' && stats` inchangé, `ProductSatisfactionPanel` intact, fichiers `evaluation-stats.ts` / `product-stats-tab.tsx` non modifiés.
  </done>
</task>

</tasks>

<verification>
- `tsc --noEmit` vert.
- Vérification manuelle (Laurent, dev:full sur :3010) : ouvrir `/app/produits/{id PROD-053}` onglet Stats → RÉUSSITE QCM ≈ 100 % (moy 92 %), RECOMMANDATION 100 %, NOTE GLOBALE ≈ 99 %. Cohérent avec `ProductSatisfactionPanel` juste en dessous.
- Un produit sans session COMPLETED évaluée affiche toujours « aucune évaluation » (pas de régression).
</verification>

<success_criteria>
- Les 3 cards d'évaluation affichent des pourcentages réels sur un produit pourvu (PROD-053).
- `evaluation-stats.ts`, `product-stats-tab.tsx`, `ProductSatisfactionPanel` non modifiés.
- tsc vert, suite helpers verte, 1 seul fichier touché.
</success_criteria>

<output>
After completion, create `.planning/quick/260619-mpn-brancher-evalstats-qcm-reco-note-sur-fic/260619-mpn-SUMMARY.md`
</output>
