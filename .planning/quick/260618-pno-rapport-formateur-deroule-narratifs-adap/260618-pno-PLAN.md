---
phase: 260618-pno
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/closure/ollama-generators.ts
  - apps/web/src/lib/closure/qualiopi-prompts.ts
  - apps/web/src/lib/closure/deroule-template.ts
  - apps/web/src/lib/closure/__tests__/rapport-formateur-narratif.test.ts
autonomous: true
requirements:
  - RAPPORT-FORMATEUR-NARRATIF
must_haves:
  truths:
    - "Le rapport formateur du déroulé (adaptations / remarques groupe / bilan) est généré par LLM et ancré au programme réel de la formation"
    - "Quand un narratif LLM est fourni, renderBilanFormateur rend CE narratif et plus le pool générique codé en dur"
    - "Quand aucun narratif n'est fourni (échec LLM), renderBilanFormateur retombe sur les pools existants — pas de régression"
    - "Les 7 critères de ratings restent déterministes (inchangés)"
    - "Les 4 appelants de generateDerouleContent et les callers de renderDerouleHtml(ctx, deroule) compilent sans changement de signature"
  artifacts:
    - path: "apps/web/src/lib/closure/ollama-generators.ts"
      provides: "generateRapportFormateur + RapportFormateurSchema + champ rapportFormateur peuplé dans generateDerouleContent"
      contains: "generateRapportFormateur"
    - path: "apps/web/src/lib/closure/qualiopi-prompts.ts"
      provides: "SYSTEM_PROMPT_RAPPORT_FORMATEUR (ancrage programme strict)"
      contains: "SYSTEM_PROMPT_RAPPORT_FORMATEUR"
    - path: "apps/web/src/lib/closure/deroule-template.ts"
      provides: "rapportFormateur? dans DerouleContent + renderBilanFormateur accepte le narratif avec fallback pool"
      contains: "rapportFormateur"
    - path: "apps/web/src/lib/closure/__tests__/rapport-formateur-narratif.test.ts"
      provides: "Tests câblage narratif/fallback + test de puissance anti-prompts"
      contains: "renderDerouleHtml"
  key_links:
    - from: "generateDerouleContent"
      to: "generateRapportFormateur"
      via: "UN appel après assemblage des jours, peuple deroule.rapportFormateur"
      pattern: "generateRapportFormateur"
    - from: "renderDerouleHtml"
      to: "renderBilanFormateur"
      via: "passe content.rapportFormateur en opts.rapport (2 sites)"
      pattern: "rapport.*content\\.rapportFormateur|content\\.rapportFormateur"
---

<objective>
Remplacer les narratifs du « Rapport formateur » du déroulé pédagogique (adaptations/observations, remarques sur le groupe, bilan de la formation) par du texte GÉNÉRÉ par LLM et ANCRÉ au programme réel de la formation, au lieu des pools génériques codés en dur qui font fuiter des thèmes hors programme (ex. « prompts/IA » sur une formation Tracfin).

Purpose: Conformité Qualiopi — un auditeur ne doit jamais lire dans un rapport formateur une mention d'un sujet absent du programme. Les ratings 7 critères restent déterministes (inchangés). Les pools restent en place comme filet de sécurité (fallback si le LLM échoue).

Output: `generateRapportFormateur` (tier fast/Haiku) + schéma Zod + prompt système ancrage strict ; champ `rapportFormateur?` ajouté à `DerouleContent` et peuplé une seule fois par `generateDerouleContent` (après assemblage multi-jours) ; `renderBilanFormateur` câblé pour préférer le narratif fourni avec fallback pool ; tests câblage + test de puissance anti-« prompts ».
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@apps/web/src/lib/closure/deroule-template.ts
@apps/web/src/lib/closure/ollama-generators.ts
@apps/web/src/lib/closure/qualiopi-prompts.ts
@apps/web/scripts/_gen-temoin-cloud.ts

<interfaces>
<!-- Contrats existants à respecter EXACTEMENT — extraits du code, ne pas explorer. -->

Dans apps/web/src/lib/closure/deroule-template.ts :
```typescript
export interface DerouleSequence { duree: string; objectifs: string; contenu: string; outils: string; exercice: string; evaluation: string; isPause?: boolean; }
export interface DerouleJour { theme: string; sequences: DerouleSequence[]; }
export interface DerouleContent { jours: DerouleJour[]; }  // ← à étendre avec rapportFormateur?

// Pools à PRÉSERVER (NE PAS supprimer) :
const ADAPTATIONS_POOL: readonly string[]      // ~ligne 66
const REMARQUES_GROUPE_POOL: readonly string[] // ~ligne 75
const BILAN_POOL: readonly string[]            // ~ligne 82
function pick(pool, seed): string              // ~ligne 105 (sélection déterministe par seed)

// Fonction PRIVÉE (non exportée) — signature actuelle, à étendre avec opts.rapport :
function renderBilanFormateur(opts: { trainerName?; signatureDataUrl?; seed? } = {}): string  // ~ligne 115
//   adaptation = pick(ADAPTATIONS_POOL, seed) ; remarques = pick(REMARQUES_GROUPE_POOL, ...) ; bilan = pick(BILAN_POOL, ...)
//   block('Remarques particulières sur le groupe', remarques)
//   block('Adaptations pédagogiques / observations de la formation', adaptation)
//   block('Bilan de la formation', bilan)
//   Les 7 critères (CRITERES_FORMATEUR + noteBySeed) restent INCHANGÉS.

// SIGNATURE PUBLIQUE À PRÉSERVER (callers + mock test intacts) :
export function renderDerouleHtml(ctx: ClosureContext, content: DerouleContent): string
//   appelle renderBilanFormateur({ trainerName, signatureDataUrl, seed: ctx.sessionTitle }) — ~ligne 267
export function renderProductDerouleHtml(data: ProductDerouleData, content: DerouleContent): string
//   appelle renderBilanFormateur({ seed: data.produitTitre }) — ~ligne 321
```

Dans apps/web/src/lib/closure/ollama-generators.ts :
```typescript
export interface FormationCtx { titre: string; programmeMd: string; nombreHeures: number; }

// SIGNATURE PUBLIQUE À PRÉSERVER (4 appelants) :
export async function generateDerouleContent(
  formation: FormationCtx, refTable = 'PedagogicalAsset',
  refId: string | null = null, tenantId: string | null = null,
): Promise<DerouleContent | null>
//   nbJours === 1 → return runOllamaJson(...) direct (~ligne 714)
//   nbJours > 1   → boucle par jour → assembleDeroule(partiels) (~ligne 762)

// Helper LLM central (privé) — à réutiliser pour generateRapportFormateur :
async function runOllamaJson<T>(
  taskName: string, systemPrompt: string, userPrompt: string,
  schema: z.ZodSchema<T>, refTable: string, refId: string | null,
  tenantId: string | null, modelOverride?: string, tier: LlmTier = 'fast',
): Promise<T | null>
//   retourne null sur échec (l'appelant fallback) ; logge AIGenerationJob si tenantId.

export function assembleDeroule(partiels: DerouleContent[]): DerouleContent  // pure
```

Pattern prompt système (style à cloner — voir SYSTEM_PROMPT_SATISFACTION_CHAUD/_FROID ~ligne 142/170 de qualiopi-prompts.ts) :
- « RÈGLE DE VOIX ABSOLUE : c'est LE FORMATEUR qui parle, à la PREMIÈRE PERSONNE. »
- « ANCRAGE STRICT AU THÈME : ... UNIQUEMENT le thème réel (titre + programme). Test simple : si une phrase pourrait appartenir à une autre formation, elle est INTERDITE (ex : Tracfin → ne JAMAIS mentionner prompts/IA). »
- « Réponds UNIQUEMENT en JSON, sans markdown ni explication, au format suivant : { ... } »
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Générateur LLM generateRapportFormateur + prompt système ancré</name>
  <files>apps/web/src/lib/closure/qualiopi-prompts.ts, apps/web/src/lib/closure/ollama-generators.ts</files>
  <behavior>
    - RapportFormateurSchema valide un objet { adaptations: string (min 10), remarquesGroupe: string (min 10), bilan: string (min 10) } et rejette un objet auquel il manque un champ.
    - generateRapportFormateur est exporté async, signature (formation: FormationCtx, refTable = 'PedagogicalAsset', refId: string | null = null, tenantId: string | null = null): Promise<{ adaptations; remarquesGroupe; bilan } | null>.
    - (Câblage LLM réel = vérif témoin runtime post-build, PAS testé unitairement — contrainte projet.)
  </behavior>
  <action>
    1. Dans qualiopi-prompts.ts, ajouter et exporter `SYSTEM_PROMPT_RAPPORT_FORMATEUR` en clonant le STYLE de SYSTEM_PROMPT_SATISFACTION_CHAUD (~ligne 142). Contenu :
       - Rôle : « Tu es un formateur professionnel qui remplit son rapport de fin de formation, APRÈS avoir animé la formation. »
       - VOIX : 1ère personne du formateur (« j'ai animé », « le groupe », « j'ai adapté »). Pas de 3e personne, pas de prénom.
       - ANCRAGE STRICT : adaptations/observations + remarques sur le groupe + bilan DOIVENT se référer UNIQUEMENT au contenu RÉEL du programme fourni dans le prompt (titre « {titre} » + programme). N'introduire AUCUN thème hors programme. Test simple : si une phrase pourrait appartenir à une autre formation, elle est INTERDITE — ex : si le programme ne traite pas de « prompts / IA », ne JAMAIS les mentionner (cas Tracfin).
       - LONGUEUR : 1 à 2 phrases par champ, plausible et naturel.
       - Format de sortie JSON STRICT : `{ "adaptations": "string", "remarquesGroupe": "string", "bilan": "string" }`, sans markdown ni explication.
    2. Dans ollama-generators.ts :
       - Importer `SYSTEM_PROMPT_RAPPORT_FORMATEUR` dans le bloc d'import depuis './qualiopi-prompts' (~ligne 18-29).
       - Ajouter un schéma Zod dédié `const RapportFormateurSchema = z.object({ adaptations: z.string().min(10), remarquesGroupe: z.string().min(10), bilan: z.string().min(10) });` (près des autres schémas, après DerouleSchema ~ligne 294).
       - Exporter `generateRapportFormateur(formation: FormationCtx, refTable = 'PedagogicalAsset', refId: string | null = null, tenantId: string | null = null): Promise<z.infer<typeof RapportFormateurSchema> | null>`. Le user prompt fournit titre + durée + programme (clone du bloc prompt de generateDerouleContent ~ligne 698-706, avec instruction « tu remplis ton rapport APRÈS cette formation »). Appeler `runOllamaJson('generate-rapport-formateur', SYSTEM_PROMPT_RAPPORT_FORMATEUR, prompt, RapportFormateurSchema, refTable, refId, tenantId, undefined, 'fast')` — tier 'fast' = Haiku en cloud (PAS 'quality' : c'est un texte court). modelOverride undefined.
    NE PAS toucher : DerouleSchema, generateDerouleContent (Task 2), worker, WIP Laurent, colonne formateur attestation/certificat.
  </action>
  <verify>
    <automated>cd "/Users/laurentmarx/Documents/CRM Next gen/files" && pnpm --filter @qualiof/web exec tsc --noEmit 2>&1 | grep -v "redirect-308\|sessions.ts:804\|shared-template" | grep -i "error TS" | grep -i "ollama-generators\|qualiopi-prompts" || echo "PASS: pas d'erreur tsc sur les fichiers touchés"</automated>
  </verify>
  <done>SYSTEM_PROMPT_RAPPORT_FORMATEUR exporté (ancrage strict + voix formateur 1ère pers.) ; RapportFormateurSchema (3 champs min 10) ; generateRapportFormateur exporté tier 'fast', renvoie {adaptations, remarquesGroupe, bilan} | null ; tsc clean sur les 2 fichiers.</done>
</task>

<task type="auto">
  <name>Task 2: Étendre DerouleContent + peupler rapportFormateur une fois dans generateDerouleContent</name>
  <files>apps/web/src/lib/closure/deroule-template.ts, apps/web/src/lib/closure/ollama-generators.ts</files>
  <action>
    1. Dans deroule-template.ts, étendre l'interface `DerouleContent` (~ligne 52) :
       ```typescript
       export interface DerouleContent {
         jours: DerouleJour[];
         /** Narratifs du rapport formateur générés par LLM (ancrés au programme).
          *  Absent si la génération a échoué → renderBilanFormateur fallback sur les pools. */
         rapportFormateur?: { adaptations: string; remarquesGroupe: string; bilan: string };
       }
       ```
    2. Dans ollama-generators.ts, dans `generateDerouleContent` (~ligne 684) : peupler `rapportFormateur` via UN SEUL appel `generateRapportFormateur`, généré UNE fois — PAS par jour. Refactor en 2 points pour respecter la signature publique (return type DerouleContent | null inchangé) :
       - Branche `nbJours === 1` (~ligne 714) : remplacer le `return runOllamaJson(...)` direct par `const deroule = await runOllamaJson(...); if (!deroule) return null; const rapport = await generateRapportFormateur(formation, refTable, refId, tenantId); return rapport ? { ...deroule, rapportFormateur: rapport } : deroule;`
       - Branche multi-jours (~ligne 761) : après `assembleDeroule(partiels)`, faire `const deroule = assembleDeroule(partiels); const rapport = await generateRapportFormateur(formation, refTable, refId, tenantId); return rapport ? { ...deroule, rapportFormateur: rapport } : deroule;`
       Si la génération du rapport échoue (null) → champ ABSENT (spread sans la clé) : le render fera fallback pool. NE PAS faire échouer le déroulé entier si le rapport échoue.
    NE PAS modifier la signature de generateDerouleContent ni de renderDerouleHtml.
  </action>
  <verify>
    <automated>cd "/Users/laurentmarx/Documents/CRM Next gen/files" && pnpm --filter @qualiof/web exec tsc --noEmit 2>&1 | grep -v "redirect-308\|sessions.ts:804\|shared-template" | grep -i "error TS" || echo "PASS: tsc clean (hors préexistants)"</automated>
  </verify>
  <done>DerouleContent a un champ optionnel rapportFormateur ; generateDerouleContent peuple ce champ via UN appel generateRapportFormateur dans les 2 branches (mono + multi-jours), généré une seule fois après assemblage ; échec rapport → champ absent, déroulé non avorté ; signatures publiques inchangées ; tsc clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Câbler renderBilanFormateur (narratif > pool) + renderDerouleHtml + tests de puissance</name>
  <files>apps/web/src/lib/closure/deroule-template.ts, apps/web/src/lib/closure/__tests__/rapport-formateur-narratif.test.ts</files>
  <behavior>
    - renderDerouleHtml(ctx, content) avec content.rapportFormateur = { adaptations: 'ADAPT_DISTINCTIF_XYZ', remarquesGroupe: 'REMARQUE_DISTINCTIVE_XYZ', bilan: 'BILAN_DISTINCTIF_XYZ' } → le HTML rendu CONTIENT ces 3 chaînes distinctives.
    - Test de puissance : avec un narratif distinctif fourni, le HTML NE CONTIENT PAS le texte caractéristique du pool (ex. la chaîne « prompts » de ADAPTATIONS_POOL[1] « approfondir l'usage des prompts ») — preuve que le pool est bien remplacé, pas concaténé.
    - renderDerouleHtml(ctx, content) SANS rapportFormateur → le HTML CONTIENT un texte issu des pools (fallback) : la chaîne « Bilan de la formation » est présente ET au moins un narratif de pool est rendu (ex. assert que le HTML contient l'un des BILAN_POOL via une sous-chaîne stable comme « Objectifs pédagogiques atteints » OU « Formation menée à son terme » OU « Ensemble des objectifs traités »).
    - Les 7 critères restent rendus dans les 2 cas (assert présence de « Questionnaire de satisfaction du formateur »).
  </behavior>
  <action>
    1. Dans deroule-template.ts, étendre la signature PRIVÉE de `renderBilanFormateur` (~ligne 115) avec un param `rapport?: { adaptations: string; remarquesGroupe: string; bilan: string } | null` :
       ```typescript
       function renderBilanFormateur(
         opts: { trainerName?: string | null; signatureDataUrl?: string | null; seed?: string;
                 rapport?: { adaptations: string; remarquesGroupe: string; bilan: string } | null } = {},
       ): string {
       ```
       Puis remplacer les 3 `pick(...)` par : `const adaptation = opts.rapport?.adaptations ?? pick(ADAPTATIONS_POOL, seed); const remarques = opts.rapport?.remarquesGroupe ?? pick(REMARQUES_GROUPE_POOL, ...); const bilan = opts.rapport?.bilan ?? pick(BILAN_POOL, ...);`
       NE PAS supprimer les pools ni les const ADAPTATIONS_POOL/REMARQUES_GROUPE_POOL/BILAN_POOL/pick. Le bloc des 7 critères (CRITERES_FORMATEUR + noteBySeed) reste INCHANGÉ — déterministe.
    2. Dans renderDerouleHtml (~ligne 267), passer le narratif : `renderBilanFormateur({ trainerName: ctx.sessionTrainers.join(', '), signatureDataUrl: loadTrainerSignatureDataUrl(ctx.tenantId, ctx.sessionTrainers[0]), seed: ctx.sessionTitle, rapport: content.rapportFormateur ?? null })`.
       (renderProductDerouleHtml ~ligne 321 : variante produit, pas de rapport LLM → laisser inchangé OU passer rapport: null explicitement. Choix : inchangé suffit, le fallback pool reste actif.)
    3. Créer le test `apps/web/src/lib/closure/__tests__/rapport-formateur-narratif.test.ts` (pattern vitest, voir parse-programme-to-deroule.test.ts). Construire un `ctx` minimal castable (`{ sessionTitle: 'Lutte anti-blanchiment Tracfin', sessionTrainers: [], tenantId: 't1', ... } as any` — renderDerouleHtml tolère les champs renderInfoBox via cast) et un `content: DerouleContent` minimal (1 jour, 5 séquences valides). 3 tests :
       (a) narratif fourni → HTML contient les 3 chaînes distinctives ;
       (b) test de puissance → HTML NE contient PAS « prompts » (pool ADAPTATIONS) quand narratif fourni ;
       (c) sans narratif → HTML contient un narratif de pool + « Questionnaire de satisfaction du formateur ».
       Si loadTrainerSignatureDataUrl / renderBrandHeader font des IO disque, vi.mock './shared-template' partiellement OU passer sessionTrainers: [] (signature absente → branche `<div height:20mm>`). Vérifier d'abord si renderDerouleHtml s'exécute sans mock ; sinon mock minimal de loadTrainerSignatureDataUrl → null.
  </action>
  <verify>
    <automated>cd "/Users/laurentmarx/Documents/CRM Next gen/files" && pnpm --filter @qualiof/web exec vitest run rapport-formateur-narratif 2>&1 | tail -20</automated>
  </verify>
  <done>renderBilanFormateur préfère opts.rapport.* et fallback pool si absent ; pools NON supprimés ; 7 critères inchangés ; renderDerouleHtml passe content.rapportFormateur ; 3 tests verts dont le test de puissance (« prompts » absent quand narratif fourni). tsc clean.</done>
</task>

</tasks>

<verification>
1. `pnpm --filter @qualiof/web exec tsc --noEmit` — aucune NOUVELLE erreur (ignorer préexistants : redirect-308.test.ts ×6, sessions.ts:804, shared-template.test.ts Test6 jpeg).
2. `pnpm --filter @qualiof/web exec vitest run rapport-formateur-narratif` — 3 tests verts.
3. Suite Vitest complète apps/web verte (pas de régression sur deroule).
4. Aucune génération LLM réelle lancée (contenu = vérif témoin runtime post-build, hors scope tests).
5. Signatures publiques inchangées : generateDerouleContent (4 appelants) + renderDerouleHtml(ctx, deroule).
</verification>

<success_criteria>
- Le rapport formateur du déroulé est généré par LLM (generateRapportFormateur, tier fast) et ancré au programme réel, plus aucun thème hors programme.
- DerouleContent.rapportFormateur peuplé une seule fois par generateDerouleContent (mono + multi-jours), après assemblage.
- renderBilanFormateur rend le narratif fourni, sinon fallback pool (pools préservés).
- Test de puissance : le texte « prompts » du pool n'apparaît pas quand un narratif distinctif est fourni.
- Ratings 7 critères déterministes inchangés.
- tsc + Vitest verts (hors préexistants documentés).
- Commits atomiques sur cloud-migration (1 par tâche), pas de worktree.
</success_criteria>

<output>
After completion, create `.planning/quick/260618-pno-rapport-formateur-deroule-narratifs-adap/260618-pno-SUMMARY.md`
</output>
