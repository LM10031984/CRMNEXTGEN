---
phase: quick-260618-rkj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/db/prisma/schema.prisma
  - apps/web/src/lib/closure/freeze-product-assets.ts
  - apps/web/src/lib/closure/generate-deroule-session.ts
  - apps/web/scripts/_gen-session-pack.ts
  - apps/web/src/lib/closure/__tests__/freeze-product-assets.test.ts
autonomous: true
requirements:
  - FIGER-PROG
  - FIGER-DEROULE
  - FIGER-CONVENTION-VERIF
  - INVARIANT-TEST

must_haves:
  truths:
    - "Deux sessions du MÊME produit reçoivent un PROGRAMME au corps texte identique (même hash)."
    - "Deux sessions du MÊME produit reçoivent un DÉROULÉ dont le CORPS (jours/séquences) est identique ; seul le bilan/rapport formateur diffère par session."
    - "Le programme n'est normalisé par LLM qu'UNE fois par produit ; les relances réutilisent product.programMd figé sans re-coût."
    - "Le corps du déroulé n'est généré par LLM qu'UNE fois par produit ; les relances réutilisent product.derouleJson figé sans re-coût."
    - "Casser le figeage (re-normaliser/re-générer le corps par session) fait virer le test de puissance ROUGE."
    - "La convention lit toujours product.programMd (programme figé) — aucune régression LLM introduite."
  artifacts:
    - path: "apps/web/src/lib/closure/freeze-product-assets.ts"
      provides: "freezeProductAssets(tenantId, product, memo) — fige programme normalisé (programMd) + corps déroulé (derouleJson) une fois par produit, mémoïsé par productId"
      min_lines: 60
    - path: "packages/db/prisma/schema.prisma"
      provides: "TrainingProduct.derouleJson Json? (stockage corps déroulé figé)"
      contains: "derouleJson"
    - path: "apps/web/src/lib/closure/__tests__/freeze-product-assets.test.ts"
      provides: "Test de puissance : 2 sessions même produit → même corps programme + même corps déroulé, malgré LLM mocké renvoyant des contenus DIFFÉRENTS à chaque appel"
      contains: "freezeProductAssets"
  key_links:
    - from: "apps/web/scripts/_gen-session-pack.ts"
      to: "freezeProductAssets"
      via: "appel UNE fois par productId en tête de boucle (memo Map)"
      pattern: "freezeProductAssets"
    - from: "apps/web/src/lib/closure/generate-deroule-session.ts"
      to: "TrainingProduct.derouleJson"
      via: "réutilise le corps figé, ne régénère QUE le bilan/rapport par session"
      pattern: "derouleJson"
---

<objective>
Figer le PROGRAMME et le CORPS du DÉROULÉ pédagogique au niveau PRODUIT pour garantir la conformité Qualiopi (même formation = même programme/déroulé sur toutes ses sessions) et supprimer le re-coût LLM à chaque session.

Aujourd'hui `_gen-session-pack.ts` régénère le programme normalisé (`generateNormalizedProgramme`) ET le déroulé (`persistDerouleSession(force:true)`) à CHAQUE itération de session → 4 hash programme différents + 4 déroulés différents sur PROD-0062 (4 sessions). Non-conformité + surcoût.

Règle métier verrouillée (Laurent) :
- PROGRAMME : appartient au PRODUIT, normalisé 1×, ne bouge plus (identique toutes sessions, zéro re-LLM).
- DÉROULÉ : CORPS figé au PRODUIT (identique toutes sessions). SEUL le bilan/rapport formateur reste généré par session (LLM acceptable).
- CONVENTION : déjà déterministe (template, AUCUN LLM) et lit `product.programMd`. NE PAS toucher la logique — vérifier seulement.
- Docs par apprenant : hors scope.

Purpose: conformité Qualiopi ind. 1/5 + réduction coût LLM.
Output: champ `derouleJson`, helper `freezeProductAssets`, déroulé refactoré (corps produit + bilan session), pipeline figé, test de puissance.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@apps/web/scripts/_gen-session-pack.ts
@apps/web/src/lib/closure/programme-core.ts
@apps/web/src/lib/closure/generate-deroule-session.ts
@apps/web/src/lib/closure/convention-core.ts
@apps/web/src/lib/closure/ollama-generators.ts
@apps/web/src/lib/closure/deroule-template.ts
@packages/db/prisma/schema.prisma

<interfaces>
<!-- Contrats déjà présents dans le code — l'exécuteur les utilise tels quels, pas d'exploration. -->

generateProgrammeForProductCore — find-or-create PRODUIT DÉJÀ implémenté (programme-core.ts:26-64).
  force:false → réutilise le Document PROGRAMME produit existant si product.updatedAt <= existing.createdAt (zéro re-rendu).
  opts.programmeMdOverride → injecte un programme normalisé au lieu de product.programMd.
```typescript
export async function generateProgrammeForProductCore(
  tenantId: string, productId: string,
  opts?: { force?: boolean; programmeMdOverride?: string },
): Promise<{ ok: boolean; documentId?: string; pdfUrl?: string; error?: string }>;
```

generateNormalizedProgramme — LLM, normalise programme. Retourne string|null (fallback = programMd brut).
```typescript
export async function generateNormalizedProgramme(
  programMd: string, objectives: string[], durationHours: number, titre: string, tenantId: string | null,
): Promise<string | null>;
```

generateDerouleContent — LLM, retourne DerouleContent|null. INCLUT rapportFormateur (généré dans le même appel).
```typescript
export async function generateDerouleContent(
  formation: { titre: string; programmeMd: string; nombreHeures: number },
  refTable?, refId?, tenantId?,
): Promise<DerouleContent | null>;
```

generateRapportFormateur — LLM tier 'fast' (Haiku), narratifs bilan SEULS. Retourne {adaptations,remarquesGroupe,bilan}|null.
```typescript
export async function generateRapportFormateur(
  formation: { titre: string; programmeMd: string; nombreHeures: number },
  refTable?, refId?, tenantId?,
): Promise<{ adaptations: string; remarquesGroupe: string; bilan: string } | null>;
```

DerouleContent (deroule-template.ts) : { jours: DerouleJour[]; rapportFormateur?: {adaptations;remarquesGroupe;bilan} }
  → "corps" = jours[] ; "bilan par session" = rapportFormateur.

persistDerouleSession (generate-deroule-session.ts) : findFirst({sessionId, participantId:null, kind:'DEROULE'}) puis update/create.
  ⚠ Idempotence : JAMAIS upsert compound key sur participantId=null (NULLS NOT DISTINCT Postgres → doublon). Conserver findFirst-then-update/create.

renderDerouleHtml(ctx, content) : assemble jours + renderBilanFormateur(rapport=content.rapportFormateur).
  → si on passe un DerouleContent avec corps figé + rapportFormateur de session, le rendu fusionne automatiquement.

TrainingProduct (schema.prisma:330) : déjà `programMd String` (NON null), `objectives Json`, `durationHours Int`, `priceHT Decimal`. À AJOUTER : `derouleJson Json?`.
</interfaces>

<convention_notes>
- Migration : `prisma db push --skip-generate` PUIS `prisma generate` (jamais `migrate dev` — plante en sandbox, cf. mémoire feedback_prisma_db_push_sandbox). Documenter qu'un `prisma migrate deploy` formel sera requis pour la prod (mémoire feedback_prisma_migrate_deploy).
- Scripts tsx n'importent JAMAIS @/lib/auth (transitivement) — utiliser les CŒURS (déjà le cas). freeze-product-assets.ts NE DOIT PAS importer @/lib/auth.
- TS strict, kebab-case fichiers, `{ ok, ... }` returns.
- Test déterministe sans Ollama/Claude : mocker generateNormalizedProgramme + generateDerouleContent pour renvoyer des contenus DIFFÉRENTS à chaque appel (compteur), et prouver que le pipeline figé renvoie quand même le MÊME corps pour 2 sessions.
</convention_notes>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schéma derouleJson + helper freezeProductAssets (fige programme + corps déroulé, mémoïsé par produit)</name>
  <files>packages/db/prisma/schema.prisma, apps/web/src/lib/closure/freeze-product-assets.ts</files>
  <action>
A) SCHÉMA (FIGER-PROG + FIGER-DEROULE) :
Dans `model TrainingProduct` (schema.prisma:330-390), ajouter un champ nullable APRÈS `programMd` (vers ligne 340) :
```
  derouleJson        Json?    // Corps figé du déroulé pédagogique (jours[]) — identique sur toutes les sessions du produit. Le bilan/rapport formateur reste par session.
```
Puis exécuter la migration NON interactive (sandbox) :
```
pnpm --filter @qualiof/db exec prisma db push --skip-generate && pnpm --filter @qualiof/db exec prisma generate
```
(Si `pnpm --filter` indisponible, fallback : `cd packages/db && pnpm exec prisma db push --skip-generate && pnpm exec prisma generate`.) NE PAS lancer `prisma migrate dev`. Ajouter un commentaire dans le schéma rappelant qu'un `prisma migrate deploy` formel sera requis pour la prod.

B) HELPER (FIGER-PROG + FIGER-DEROULE) — créer `apps/web/src/lib/closure/freeze-product-assets.ts` :
Module lib pur côté serveur (PAS `'use server'`, N'IMPORTE PAS @/lib/auth). Exporte une fonction qui fige UNE fois par produit, mémoïsée :
```typescript
import { prisma } from '@qualiof/db';
import { generateNormalizedProgramme, generateDerouleContent } from './ollama-generators';
import type { DerouleContent } from './deroule-template';

export interface FrozenProductAssets {
  /** Programme normalisé figé (markdown) — alimente Programme.pdf ET Convention.pdf. */
  programmeMd: string;
  /** Corps figé du déroulé (jours[] SANS rapportFormateur) — identique toutes sessions. */
  derouleBody: DerouleContent;
}

/**
 * Fige (1×/produit) le programme normalisé + le corps du déroulé, et les persiste
 * sur TrainingProduct (programMd normalisé + derouleJson). Mémoïse par productId
 * via la Map fournie (un même run multi-sessions = 1 seul figeage par produit).
 * Réutilise le figé existant SANS re-LLM si déjà présent.
 */
export async function freezeProductAssets(
  tenantId: string,
  product: { id: string; programMd: string; objectives: unknown; durationHours: number; title: string; derouleJson: unknown },
  memo: Map<string, FrozenProductAssets>,
): Promise<FrozenProductAssets> {
  const cached = memo.get(product.id);
  if (cached) return cached;

  const objectives = Array.isArray(product.objectives) ? (product.objectives as string[]) : [];

  // 1) PROGRAMME : normaliser UNE fois. Si product.programMd a déjà été figé
  //    (détecté via derouleJson présent = produit déjà passé par ce helper),
  //    on réutilise tel quel = zéro re-coût. Sinon on normalise et on persiste.
  const alreadyFrozen = product.derouleJson != null;
  let programmeMd: string;
  let derouleBody: DerouleContent;

  if (alreadyFrozen) {
    programmeMd = product.programMd;
    derouleBody = stripRapport(product.derouleJson as DerouleContent);
  } else {
    programmeMd =
      (await generateNormalizedProgramme(product.programMd ?? '', objectives, product.durationHours, product.title, tenantId)) ??
      (product.programMd ?? '');

    // 2) DÉROULÉ : générer le CORPS une fois. On retire rapportFormateur du figé
    //    produit (il sera regénéré par session). Le programmeMd FIGÉ alimente le déroulé.
    const generated = await generateDerouleContent(
      { titre: product.title, programmeMd, nombreHeures: product.durationHours },
      'PedagogicalAsset', null, tenantId,
    );
    if (!generated) throw new Error('Corps déroulé null (LLM) — figeage produit avorté');
    derouleBody = stripRapport(generated);

    // Persiste le figé sur le produit (programMd normalisé + corps déroulé).
    await prisma.trainingProduct.update({
      where: { id: product.id },
      data: { programMd: programmeMd, derouleJson: derouleBody as object },
    });
  }

  const frozen: FrozenProductAssets = { programmeMd, derouleBody };
  memo.set(product.id, frozen);
  return frozen;
}

/** Retire rapportFormateur du corps (le bilan est par session, pas figé au produit). */
function stripRapport(c: DerouleContent): DerouleContent {
  return { jours: c.jours };
}
```
IMPORTANT : le `alreadyFrozen` utilise `derouleJson != null` comme marqueur "déjà figé" (corrections_demandees §1 : détecter qu'un déroulé produit existe + product non modifié). C'est suffisant : si `derouleJson` est présent, le produit a déjà été figé par ce helper, donc programMd l'est aussi. Ne pas re-normaliser dans ce cas (zéro re-coût). Respecter TS strict (`noUncheckedIndexedAccess`).
  </action>
  <verify>
    <automated>cd "apps/web" && pnpm exec tsc --noEmit 2>&1 | tail -5</automated>
  </verify>
  <done>Champ derouleJson présent dans schema + DB poussée + `prisma generate` OK. freeze-product-assets.ts compile (tsc vert), n'importe pas @/lib/auth, mémoïse par productId, retourne {programmeMd, derouleBody}, réutilise le figé sans re-LLM si derouleJson présent.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Déroulé session = corps figé produit + bilan par session ; pipeline appelle freezeProductAssets 1×/produit</name>
  <files>apps/web/src/lib/closure/generate-deroule-session.ts, apps/web/scripts/_gen-session-pack.ts</files>
  <behavior>
    - persistDerouleSession accepte un corps déroulé figé optionnel : si `opts.frozenBody` fourni, NE PAS appeler generateDerouleContent (corps) — réutiliser le corps figé tel quel.
    - Le bilan/rapport formateur reste généré PAR SESSION (generateRapportFormateur) et fusionné au corps figé avant rendu PDF → corps identique entre 2 sessions, bilan potentiellement différent.
    - Idempotence inchangée : findFirst-then-update/create sur {sessionId, participantId:null, kind:'DEROULE'} (jamais upsert compound NULL).
    - Le pipeline _gen-session-pack appelle freezeProductAssets UNE SEULE FOIS par productId (Map memo hors boucle), passe programmeMd figé à generateProgrammeForProductCore(force:false) et frozenBody à persistDerouleSession.
  </behavior>
  <action>
A) `generate-deroule-session.ts` (FIGER-DEROULE) :
Étendre la signature : `opts?: { force?: boolean; frozenBody?: DerouleContent }` (importer `DerouleContent` depuis `./deroule-template`).
Dans le corps :
- Conserver le court-circuit idempotent existant (existing && !force → réutilise).
- Remplacer le bloc "3. Génère le contenu via LLM" :
  - SI `opts?.frozenBody` fourni → utiliser ce corps figé (`const body = opts.frozenBody`), NE PAS appeler `generateDerouleContent`. Puis appeler `generateRapportFormateur(formation, 'PedagogicalAsset', null, tenantId)` (importer depuis `./ollama-generators`) pour le bilan PAR SESSION, et fusionner : `const deroule = rapport ? { ...body, rapportFormateur: rapport } : body;`.
  - SINON (rétro-compat, pas de figé) → comportement actuel : `const deroule = await generateDerouleContent(...)` (qui inclut déjà son rapportFormateur). Garder le `if (!deroule) return {ok:false,...}`.
- Le reste (rendu PDF via renderDerouleHtml, hash, upload MinIO, persist findFirst-then-update/create) INCHANGÉ — renderDerouleHtml lit `content.rapportFormateur` donc le bilan session apparaît bien.
Note : le `force:true` actuel passé par le pipeline régénère le PDF (pour fusionner le nouveau bilan) MAIS le CORPS provient du figé → corps identique entre sessions. C'est voulu.

B) `_gen-session-pack.ts` (FIGER-PROG + FIGER-DEROULE + pipeline) :
- AVANT la boucle `for (const SES of CODES)`, déclarer `const frozenByProduct = new Map<string, import('../src/lib/closure/freeze-product-assets').FrozenProductAssets>();` et importer `freezeProductAssets` dans le bloc d'imports dynamiques (ligne ~48-67) : `const { freezeProductAssets } = await import('../src/lib/closure/freeze-product-assets');`.
- DANS la boucle, après avoir chargé `session.product` (vers ligne 116, `const p = session.product`), AVANT la génération des docs session, appeler UNE fois (mémoïsé) :
  `const frozen = await freezeProductAssets(tenantId, { id: p.id, programMd: p.programMd, objectives: p.objectives, durationHours: p.durationHours, title: p.title, derouleJson: (p as any).derouleJson }, frozenByProduct);`
  (Sauter en DRY_RUN : ne pas appeler freeze en dry-run, juste logguer "freeze (skip dry-run)".)
- Remplacer le bloc Programme (lignes ~196-204) : SUPPRIMER l'appel `generateNormalizedProgramme` par session ; à la place utiliser `frozen.programmeMd` et appeler `generateProgrammeForProductCore(tenantId, p.id, { force: false, programmeMdOverride: frozen.programmeMd })`. Commentaire : "Programme figé produit (FIGER-PROG) — force:false réutilise le Document PROGRAMME produit, zéro re-LLM."
- Remplacer l'appel déroulé (ligne ~207) : `const derouleRes = await persistDerouleSession(tenantId, session.id, { force: true, frozenBody: frozen.derouleBody });`. Commentaire : "Corps déroulé figé produit (FIGER-DEROULE) ; bilan regénéré par session."
- Retirer l'import désormais inutile `generateNormalizedProgramme` (ligne 55) SI plus référencé ailleurs dans le script (vérifier).
- CONVENTION (FIGER-CONVENTION-VERIF) : aucune modif. Vérifier (lecture) que `convention-core.ts:156` lit bien `participant.session.product.programMd` (le programme figé) — ajouter un commentaire dans _gen-session-pack au-dessus de la boucle conventions : "Convention = template déterministe SANS LLM, lit product.programMd figé (vérifié convention-core.ts:156)."
  </action>
  <verify>
    <automated>cd "apps/web" && pnpm exec tsc --noEmit 2>&1 | tail -5 && pnpm exec vitest run src/lib/closure/__tests__/gen-session-pack-pure.test.ts 2>&1 | tail -15</automated>
  </verify>
  <done>persistDerouleSession réutilise frozenBody sans appeler generateDerouleContent ; bilan généré par session. _gen-session-pack appelle freezeProductAssets 1×/productId, passe programmeMd figé (force:false) + frozenBody. generateNormalizedProgramme n'est plus appelé par session. Convention inchangée. tsc vert + tests existants gen-session-pack-pure toujours verts.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Test de puissance — 2 sessions même produit = corps programme + corps déroulé IDENTIQUES malgré LLM non déterministe</name>
  <files>apps/web/src/lib/closure/__tests__/freeze-product-assets.test.ts</files>
  <behavior>
    - generateNormalizedProgramme et generateDerouleContent sont MOCKÉS pour renvoyer un contenu DIFFÉRENT à chaque appel (compteur incrémental) → simule la non-détermination du LLM.
    - Scénario figeage : freezeProductAssets appelé 2 fois pour le MÊME productId via la même Map memo → 2e appel renvoie le corps mémoïsé identique au 1er ; LLM appelé EXACTEMENT 1× (programme) et 1× (déroulé) sur les 2 appels.
    - Scénario "déjà figé en base" : product.derouleJson non null → freezeProductAssets ne rappelle PAS le LLM (0 appel) et renvoie le corps figé existant.
    - Test de puissance / mutation : si on simule la régénération par session (appeler generateDerouleContent directement, hors freeze), les corps DIFFÈRENT → prouve que le test garde quelque chose. Documenter en commentaire que retirer la mémoïsation (memo) OU re-normaliser par session fait virer ROUGE.
    - Le corps figé NE contient PAS rapportFormateur (stripRapport) — assert absence.
    - Déterministe, sans Ollama/Claude (tout mocké), tourne en CI.
  </behavior>
  <action>
Créer `apps/web/src/lib/closure/__tests__/freeze-product-assets.test.ts` sur le modèle de `gen-session-pack-pure.test.ts` (vi.mock @qualiof/db + ollama-generators).
- Mocker `@qualiof/db` : `prisma.trainingProduct.update` = vi.fn (renvoie l'objet), pas d'autre table nécessaire.
- Mocker `../ollama-generators` :
  ```typescript
  let progCalls = 0; let derCalls = 0;
  vi.mock('../ollama-generators', () => ({
    generateNormalizedProgramme: vi.fn(async () => `programme normalisé #${++progCalls}`),
    generateDerouleContent: vi.fn(async () => ({
      jours: [{ theme: `Jour ${++derCalls}`, sequences: [] }],
      rapportFormateur: { adaptations: 'a', remarquesGroupe: 'r', bilan: 'b' },
    })),
  }));
  ```
  (Réinitialiser les compteurs en beforeEach si besoin via accès au mock.)
- `import { freezeProductAssets } from '../freeze-product-assets';`
- Test 1 (FIGEAGE — invariant cœur) : `const memo = new Map();` ; product avec `derouleJson: null`.
  `const a = await freezeProductAssets('tnt', product, memo);`
  `const b = await freezeProductAssets('tnt', product, memo);`
  Asserts : `a.programmeMd === b.programmeMd` (corps programme identique) ; `JSON.stringify(a.derouleBody) === JSON.stringify(b.derouleBody)` (corps déroulé identique) ; `generateNormalizedProgramme` appelé 1× ; `generateDerouleContent` appelé 1× (mémoïsation). Commentaire `// Test de puissance : retirer memo.get/set OU passer 2 Map → 2 appels LLM → corps différents → ROUGE`.
- Test 2 (DÉJÀ FIGÉ EN BASE) : product avec `derouleJson: { jours: [{ theme: 'figé', sequences: [] }] }` ; `const c = await freezeProductAssets('tnt', product2, new Map());` ; asserts : `generateNormalizedProgramme`/`generateDerouleContent` appelés 0× ; `c.derouleBody.jours[0].theme === 'figé'` ; `c.programmeMd === product2.programMd`. Commentaire test de puissance : re-normaliser malgré derouleJson présent → appel LLM ≠ 0 → ROUGE.
- Test 3 (CORPS SANS BILAN) : sur le résultat de Test 1, asserts : `a.derouleBody.rapportFormateur === undefined` (stripRapport retire le bilan du figé produit — il est par session, pas figé). Commentaire : prouve que le bilan n'est PAS figé au produit.
- Test 4 (test de puissance explicite — référence négative) : appeler `generateDerouleContent` 2× directement (hors freeze) et asserter que les `theme` DIFFÈRENT (`#1` vs `#2`) → démontre que SANS figeage le corps varie, donc le test garde bien l'invariant.
Respecter TS strict, pattern source-regex/mocks Phase 9. Pas de dépendance réseau.
  </action>
  <verify>
    <automated>cd "apps/web" && pnpm exec vitest run src/lib/closure/__tests__/freeze-product-assets.test.ts 2>&1 | tail -20</automated>
  </verify>
  <done>4 tests verts. Test 1 prouve corps programme+déroulé identiques sur 2 figeages du même produit avec LLM mocké non déterministe + LLM appelé 1×/1×. Test 2 prouve 0 re-LLM si déjà figé. Test 3 prouve bilan non figé au produit. Test 4 démontre la variation sans figeage (puissance). Déterministe, sans Ollama/Claude.</done>
</task>

</tasks>

<verification>
- `cd apps/web && pnpm exec tsc --noEmit` → vert (aucune régression type).
- `cd apps/web && pnpm exec vitest run src/lib/closure/__tests__/freeze-product-assets.test.ts src/lib/closure/__tests__/gen-session-pack-pure.test.ts` → tous verts.
- Schéma : `grep derouleJson packages/db/prisma/schema.prisma` présent ; DB poussée via `prisma db push --skip-generate` + `prisma generate`.
- Test de puissance : modifier temporairement freezeProductAssets pour re-normaliser malgré le memo (retirer `memo.get`) → Test 1 doit virer ROUGE (corps différents / 2 appels LLM), puis restaurer.
- Convention : lecture confirmée — convention-core.ts:156 lit `product.programMd` (programme figé). Aucune modif convention.
- AUCUN re-run de masse / génération réelle lancé ici (code + test uniquement).
</verification>

<success_criteria>
- TrainingProduct.derouleJson ajouté + DB synchronisée (db push + generate).
- freezeProductAssets fige programme normalisé (programMd) + corps déroulé (derouleJson) 1×/produit, mémoïsé, réutilise le figé sans re-LLM.
- persistDerouleSession réutilise le corps figé ; bilan/rapport formateur regénéré par session uniquement.
- _gen-session-pack appelle freeze 1×/productId (multi-produits géré par memo Map), programme via force:false, déroulé via frozenBody. generateNormalizedProgramme plus appelé par session.
- Convention inchangée (template déterministe lisant product.programMd figé).
- Test de puissance vert et probant (mutation = rouge).
- tsc vert.
- Dette prod documentée : `prisma migrate deploy` formel requis avant déploiement cloud (db push utilisé en local/sandbox).
</success_criteria>

<output>
After completion, create `.planning/quick/260618-rkj-figer-programme-deroule-pedagogique-au-n/260618-rkj-SUMMARY.md`
</output>
