---
phase: quick-260618-czs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/programme-normalize.ts
  - apps/web/src/lib/__tests__/programme-normalize.test.ts
  - apps/web/src/lib/closure/ollama-generators.ts
  - apps/web/src/lib/closure/qualiopi-prompts.ts
  - apps/web/scripts/_gen-temoin-cloud.ts
  - apps/web/src/lib/closure/attestation-template.ts
  - apps/web/src/lib/closure/certificat-template.ts
autonomous: true
requirements:
  - DOC-QUAL-01  # Normalisation programme (grille horaire figée + verbes évaluables)
  - DOC-QUAL-02  # Satisfaction froid+chaud : 1re personne + ancrage thème
  - DOC-QUAL-03  # Signature formateur réel sur attestation + certificat

must_haves:
  truths:
    - "Le programme rendu (Programme.pdf) affiche une grille horaire figée 9h-13h / 14h-18h = 8h pile pour une formation 1 jour (PROD-0062), pas les horaires SmartOF non conformes (9-11, 14h15…)."
    - "Le programme normalisé alimente À LA FOIS Programme.pdf ET Convention de formation.pdf (source unique, aucune divergence)."
    - "Les intitulés de contenu du programme normalisé commencent par des verbes d'action évaluables (Identifier, Appliquer, Analyser, Mettre en œuvre…), pas par des intitulés nominaux."
    - "Le contenu du programme normalisé ne contient aucun thème/module absent du programme source (fidélité stricte — décliner, pas enrichir)."
    - "Les champs libres des satisfactions froid ET chaud sont rédigés à la 1re personne du stagiaire (« j'applique », « ma pratique »), sans prénom en 3e personne, et ancrés au thème réel de la formation."
    - "L'attestation de fin de formation et le certificat de réalisation portent la signature (ou à défaut le nom + mention) du formateur réel de la session (ctx.sessionTrainers[0]), SANS jamais dupliquer l'image de signature déjà utilisée pour le représentant légal."
  artifacts:
    - path: "apps/web/src/lib/programme-normalize.ts"
      provides: "Grille horaire déterministe (buildHoraireScaffold) + post-traitement fidélité"
      exports: ["buildHoraireScaffold", "HORAIRE_MATIN_PROG", "HORAIRE_APREM_PROG"]
    - path: "apps/web/src/lib/closure/ollama-generators.ts"
      provides: "generateNormalizedProgramme(programMd, objectives, durationHours, titre) tier 'quality'"
      contains: "generateNormalizedProgramme"
    - path: "apps/web/src/lib/__tests__/programme-normalize.test.ts"
      provides: "Tests grille horaire déterministe + test de puissance fidélité"
  key_links:
    - from: "apps/web/scripts/_gen-temoin-cloud.ts"
      to: "generateNormalizedProgramme"
      via: "appel unique avant rendu Programme + Convention"
      pattern: "generateNormalizedProgramme"
    - from: "apps/web/src/lib/closure/attestation-template.ts"
      to: "ctx.sessionTrainers[0]"
      via: "bloc signature formateur (dédupliqué vs représentant légal)"
      pattern: "sessionTrainers"
    - from: "apps/web/src/lib/closure/certificat-template.ts"
      to: "ctx.sessionTrainers[0]"
      via: "bloc signature formateur (dédupliqué vs représentant légal)"
      pattern: "sessionTrainers"
---

<objective>
Corriger 3 défauts qualité révélés par la validation témoin SES-0087, sans toucher au worker Ollama (génération via Claude/OpenRouter en script direct).

1. **Normalisation du programme** (audit-critique) : aujourd'hui le programme et la convention recopient VERBATIM `TrainingProduct.programMd` (horaires SmartOF non conformes PROD-0062, intitulés sans verbes). On impose une grille horaire FIGÉE/DÉTERMINISTE (hardcodée) et on reformule le contenu en verbes évaluables via un générateur LLM (tier 'quality' = Sonnet) qui DÉCLINE sans inventer. Le résultat normalisé alimente À LA FOIS Programme.pdf ET Convention.pdf.
2. **Satisfaction froid + chaud** : forcer la 1re personne du stagiaire dans tous les champs libres + ancrage strict au thème réel (pas de prénom 3e personne, pas de domaine hors sujet).
3. **Signature formateur** : ajouter la signature du formateur réel (`ctx.sessionTrainers[0]`) sur attestation + certificat, cohérente avec l'émargement, SANS dupliquer l'image déjà utilisée pour le représentant légal.

Purpose: docs Qualiopi conformes pour l'audit (Samia ZIANI BCI 03/07).
Output: programme normalisé déterministe (cas 1 jour PROD-0062 prouvé), prompts satisfaction corrigés, attestation+certificat signés formateur (sans doublon de signature).

PÉRIMÈTRE : ne prouver que le cas 1 JOUR (8h, PROD-0062). Structurer pour extension multi-jours PLUS TARD (chunking par jour) mais NE PAS sur-implémenter le multi-jours ici (différé explicitement par Laurent).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

# Fichiers cœur (déjà lus par le planner — l'exécuteur les rouvrira)
@apps/web/src/lib/programme-template.ts
@apps/web/src/lib/convention-template.ts
@apps/web/src/lib/closure/qualiopi-prompts.ts
@apps/web/src/lib/closure/ollama-generators.ts
@apps/web/src/lib/closure/attestation-template.ts
@apps/web/src/lib/closure/certificat-template.ts
@apps/web/src/lib/closure/build-context.ts
@apps/web/src/lib/closure/shared-template.ts
@apps/web/src/lib/closure/emargement-template.ts
@apps/web/src/lib/closure/grille-obs-session-template.ts
@apps/web/src/lib/formation-horaires.ts
@apps/web/scripts/_gen-temoin-cloud.ts
@apps/web/src/lib/llm-client.ts

<interfaces>
<!-- Contrats clés extraits du codebase — l'exécuteur les utilise directement, pas de scavenger hunt. -->

ollama-generators.ts (pattern generator existant, à cloner pour Tâche 1) :
```typescript
// FormationCtx existant — réutilisé
export interface FormationCtx { titre: string; programmeMd: string; nombreHeures: number; }

// Runner partagé (signature exacte) — c'est l'API à réutiliser :
async function runOllamaJson<T>(
  taskName: string, systemPrompt: string, userPrompt: string,
  schema: z.ZodSchema<T>, refTable: string, refId: string | null,
  tenantId: string | null, modelOverride?: string, tier: LlmTier = 'fast',
): Promise<T | null>
// tier 'quality' → Sonnet quand AI_PROVIDER=openrouter (cf. resolveModel dans llm-client.ts)
// Le runner gère AIGenerationJob + retry + validation Zod + fallback null.
```

formation-horaires.ts (source unique horaire — à respecter, NE PAS dupliquer la règle ailleurs) :
```typescript
export const PAUSE_DEJEUNER = { start: '13h00', end: '14h00', durationMin: 60 } as const;
export const FORMATION_START = '9h00' as const;
export function getDayStartEnd(heuresParJour: number): { start; end; hasPause; pauseStart; pauseEnd };
```

emargement-template.ts (horaires figés Start Academy — à RÉUTILISER comme constantes de référence) :
```typescript
const HORAIRE_MATIN = '9h00–13h00';   // matin (4h)
const HORAIRE_APREM = '14h00–18h00';  // après-midi (4h) → total 8h pile
```

shared-template.ts (signature formateur — à réutiliser tel quel pour Tâche 3) :
```typescript
// Signature du FORMATEUR réel selon le nom :
export function loadTrainerSignatureDataUrl(tenantId?: string, trainerName?: string | null): string;
//   - "Jean-Guy" → signature-jean-guy.(jpg|png) (image PROPRE au formateur, distincte).
//   - "Laurent Marx" → loadSignatureDataUrl(tenantId,'pedago') = signature-laurent.png.
//     ⚠️ ATTENTION : C'EST EXACTEMENT LA MÊME IMAGE que le bloc dirigeant/pédago déjà posé
//        sur l'attestation (pedago) et le certificat (dirigeant → fallback signature-laurent.png).
//        Donc sur une session où Laurent est lui-même formateur (= SES-0087, notre TÉMOIN),
//        trainerSig === la signature du représentant légal déjà affichée. Afficher l'image
//        deux fois = DEUX signatures Laurent identiques côte à côte (défaut à éviter).
//   - non reconnu → '' (emplacement vide, pas de signature d'un autre).
export function loadSignatureDataUrl(tenantId?: string, role?: 'pedago'|'dirigeant'): string; // signature représentant légal
export function loadStampDataUrl(tenantId?: string): string; // tampon OF
export function escapeHtml(s): string;
export function formatDateFr(date): string;
// ClosureContext.sessionTrainers: string[] — [0] = formateur PRIMARY réel (cf. build-context.ts)
```

emargement-template.ts (pattern signature « certifié exact » — modèle à reproduire sur attestation/certificat) :
```html
<p>Certifié exact par {trainer}, formateur.</p>
<p>Fait à <strong>{lieu}</strong>, le <strong>{dateFin}</strong>.</p>
<img src="{loadTrainerSignatureDataUrl(...)}" /> {tampon}
```

ATTENTION attestation/certificat actuels : ils posent DÉJÀ une signature, mais celle du
dirigeant/pédago (Laurent via loadSignatureDataUrl(ctx.tenantId,'dirigeant'|'pedago')),
PAS celle du formateur réel de la session. Tâche 3 = AJOUTER le bloc formateur
(ctx.sessionTrainers[0]) — ne pas retirer la signature dirigeant/pédago existante —
en DÉDUPLIQUANT l'image (cf. warning : la signature Laurent-formateur EST la signature
représentant légal).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Normalisation déterministe du programme + générateur LLM (cas 1 jour)</name>
  <files>apps/web/src/lib/programme-normalize.ts, apps/web/src/lib/__tests__/programme-normalize.test.ts, apps/web/src/lib/closure/ollama-generators.ts</files>
  <behavior>
    Helper pur `buildHoraireScaffold(durationHours)` dans programme-normalize.ts :
    - Test grille 8h : retourne un échafaudage 1 jour avec EXACTEMENT matin 9h00–13h00 (4h) + déjeuner 13h00–14h00 + après-midi 14h00–18h00 (4h). Somme TRAVAIL = 8h pile.
    - Test pauses internes : la pause café matin (~10h45, 15 min) et après-midi (~15h45, 15 min) sont DANS les blocs (n'allongent pas la journée au-delà de 18h00).
    - Test ceil : durationHours=8 → 1 jour ; structurer la fonction pour que nbJours = ceil(N/8) soit calculable (multi-jours NON implémenté/NON prouvé ici — un seul jour rendu pour N≤8, throw ou marqueur « multi-jours non supporté » documenté au-delà).
    - Test déterminisme : 2 appels avec mêmes args → résultat strictement identique (aucun random, aucun calcul « malin » sur la valeur métier).
    Test de puissance fidélité sur `enforceProgrammeFidelity(normalizedMd, sourceModulesTitles)` (post-traitement pur) :
    - HEURISTIQUE FIGÉE (à implémenter ET tester telle quelle) : pour chaque section du markdown normalisé, on extrait ses **tokens significatifs** = mots de **≥ 4 lettres après retrait des stop-words FR** (de, des, les, une, pour, avec, dans, sur, par, aux, etc., insensible à la casse/accents). Une section est signalée « orpheline » (extraneous) si AUCUN de ses tokens significatifs ne recoupe AUCUN token significatif des titres/contenus de modules source. Comportement NON bloquant : retourne `{ ok:false, extraneous:[...] }` mais l'appelant ne fait que `warn` (cf. Task 1 action point 4).
    - GREEN : un programme normalisé qui ne contient QUE des thèmes dérivés des modules source passe (`ok:true`, `extraneous:[]`).
    - RED (puissance) : injecter dans une sortie normalisée simulée un terme étranger sans aucun token commun avec la source (ex « architecture transformer ») → la fonction DOIT le détecter (`ok:false`, section listée dans `extraneous`). Casser la détection (ex : forcer `ok:true`) DOIT faire virer le test au rouge.
  </behavior>
  <action>
    Créer `apps/web/src/lib/programme-normalize.ts` :
    - `export const HORAIRE_MATIN_PROG = '9h00–13h00'` et `HORAIRE_APREM_PROG = '14h00–18h00'` (importer/aligner sur les constantes émargement + formation-horaires.ts — NE PAS réinventer la règle horaire ; réutiliser PAUSE_DEJEUNER de formation-horaires.ts).
    - `export function buildHoraireScaffold(durationHours: number)` : grille FIGÉE/DÉTERMINISTE. Pour N≤8 → 1 jour {matin 9h00–13h00, pause déjeuner 13h00–14h00, après-midi 14h00–18h00, pauses café internes ~10h45 et ~15h45 de 15 min}. nbJours = Math.ceil(N/8). PÉRIMÈTRE : ne supporter QUE 1 jour ici ; pour nbJours>1, retourner un scaffold 1-jour + un flag `multiDayDeferred: true` (extension chunking par jour différée — ne PAS sur-implémenter). HARDCODE les horaires en const, AUCUN calcul élégant sur la valeur métier (cf. feedback « pas de smart calc sur convention métier »).
    - `export function enforceProgrammeFidelity(normalizedMd, sourceModuleTitles: string[])` : post-traitement pur. HEURISTIQUE EXACTE À IMPLÉMENTER (figée, cf. <behavior>) : tokeniser titres de section normalisés ET modules source en mots de ≥ 4 lettres APRÈS retrait des stop-words FR (liste constante en haut de fichier, normalisation casse + accents). Une section dont AUCUN token significatif ne recoupe AUCUN token significatif de la source est « orpheline ». Retour structuré `{ ok: boolean, extraneous: string[] }` (extraneous = titres des sections orphelines). NON bloquant côté appelant.
    - Reformulation des verbes : exposer une liste blanche de verbes évaluables (Identifier, Appliquer, Analyser, Mettre en œuvre, Construire, Argumenter…) réutilisée par le prompt ET vérifiable.

    Ajouter dans `apps/web/src/lib/closure/ollama-generators.ts` :
    - Schéma Zod `NormalizedProgrammeSchema` (programmeMd: string min, ou structure jours[]→sections[] selon ton choix de rendu markdown — privilégier un markdown plat réutilisable directement par renderProgrammeHtml/renderConventionHtml qui font marked.parse).
    - `export async function generateNormalizedProgramme(programMd: string, objectives: string[], durationHours: number, titre: string): Promise<string | null>` :
      1. Construit l'échafaudage horaire via buildHoraireScaffold (injecté DANS le prompt user comme grille IMPOSÉE — le LLM ne calcule PAS la grille).
      2. systemPrompt = nouveau `SYSTEM_PROMPT_NORMALIZE_PROGRAMME` (créé ici dans qualiopi-prompts.ts) qui : décline le contenu source sur la grille SANS rien inventer ni retirer (réutiliser l'esprit « décliner pas enrichir » de SYSTEM_PROMPT_DEROULE), reformule chaque intitulé en verbe d'action évaluable, et NE TOUCHE PAS aux horaires (fournis, à recopier tels quels).
      3. Appelle `runOllamaJson('generate-normalized-programme', systemPrompt, userPrompt, schema, 'PedagogicalAsset', null, tenantId?, undefined, 'quality')`. tenantId optionnel (script témoin passe session.tenantId).
      4. Post-traitement : applique enforceProgrammeFidelity ; si thèmes étrangers détectés (`ok:false`), log un warn listant `extraneous` (ne PAS bloquer le témoin — on veut voir le rendu) ; renvoie le markdown normalisé (chaîne) prêt pour marked.parse.
      5. Si LLM null → retourner null (l'appelant fallback sur programMd brut).
    - Ajouter `SYSTEM_PROMPT_NORMALIZE_PROGRAMME` dans qualiopi-prompts.ts (export + commentaire). NE PAS bumper PROMPT_VERSION dans cette tâche si Task 2 le fait aussi — coordonner : un seul bump en fin (cf. Task 2).

    Multi-jours : laisser un commentaire `// TODO multi-jours : chunking par jour (différé Laurent 2026-06-18)`. Ne rien implémenter de plus.
  </action>
  <verify>
    <automated>cd "apps/web" && pnpm --filter @qualiof/web test src/lib/__tests__/programme-normalize.test.ts</automated>
  </verify>
  <done>buildHoraireScaffold(8) déterministe = 9h00–13h00 + 14h00–18h00 = 8h pile (test vert) ; enforceProgrammeFidelity utilise la tokenisation ≥4 lettres + stop-words FR ; test de puissance fidélité RED quand on casse la détection (terme étranger « architecture transformer » non détecté) ; generateNormalizedProgramme exporté avec signature (programMd, objectives, durationHours, titre) tier 'quality' ; SYSTEM_PROMPT_NORMALIZE_PROGRAMME exporté. tsc clean (hors 6 erreurs redirect-308 préexistantes).</done>
</task>

<task type="auto">
  <name>Task 2: Satisfaction froid+chaud (1re personne + ancrage thème) + branchement témoin source unique</name>
  <files>apps/web/src/lib/closure/qualiopi-prompts.ts, apps/web/src/lib/closure/ollama-generators.ts, apps/web/scripts/_gen-temoin-cloud.ts</files>
  <action>
    **2a — Prompts satisfaction (qualiopi-prompts.ts)** :
    Dans `SYSTEM_PROMPT_SATISFACTION_CHAUD` ET `SYSTEM_PROMPT_SATISFACTION_FROID`, ajouter une RÈGLE DE VOIX ABSOLUE (s'inspirer du bloc « RÈGLE DE VOIX ABSOLUE » de SYSTEM_PROMPT_ANALYSE_BESOIN mais INVERSÉE — ici c'est le stagiaire qui parle) :
    - Tous les champs libres (chaque `commentaire` de section + `remarques` = « Appréciations et réclamations ») sont rédigés à la PREMIÈRE PERSONNE du stagiaire (« j'applique », « j'ai pu », « ma pratique », « mon activité », « mes clients »). JAMAIS de 3e personne, JAMAIS de prénom (« Laurence a… » est INTERDIT — c'est SON questionnaire).
    - ANCRAGE STRICT AU THÈME : les commentaires doivent se référer UNIQUEMENT au thème réel de la formation (titre + programme fournis dans le prompt user). INTERDICTION d'introduire un autre domaine (ex : si la formation porte sur Tracfin, ne JAMAIS mentionner « IA immobilière »). Test simple : si une phrase pourrait appartenir à une formation sur un autre sujet, elle est INTERDITE.
    - Conserver les règles ratings existantes (≥90% Très bien/Bien, jamais Mauvais, recommandation Oui).
    Bumper `PROMPT_VERSION` (ex `qualiopi-gen-v8-2026-06-18`) — UN SEUL bump couvrant aussi le nouveau SYSTEM_PROMPT_NORMALIZE_PROGRAMME de Task 1.

    **2b — User-prompts satisfaction (ollama-generators.ts)** :
    Dans `generateSatisfactionChaudContent` (~585) et `generateSatisfactionFroidContent` (~610), renforcer le user-prompt : rappeler explicitement « Rédige les commentaires à la 1re personne, en restant strictement sur le thème de la formation "${formation.titre}" ; n'introduis aucun autre domaine. » Le programme est déjà passé — c'est l'ancrage. NE PAS changer la signature ni le tier (ces 2 generators restent 'fast' par défaut — ne pas forcer 'quality').

    **2c — Branchement source unique dans le script témoin (_gen-temoin-cloud.ts)** :
    AVANT le rendu du bloc « 1) Programme » (~ligne 94), appeler UNE FOIS :
    ```ts
    const { generateNormalizedProgramme } = await import('../src/lib/closure/ollama-generators');
    const normalizedProgrammeMd =
      (await generateNormalizedProgramme(p.programMd ?? '', Array.isArray(p.objectives) ? (p.objectives as string[]) : [], p.durationHours, p.title))
      ?? (p.programMd ?? '');  // fallback brut si LLM échoue
    ```
    Puis :
    - Programme.pdf : remplacer `produitProgrammeMd: p.programMd ?? ''` par `produitProgrammeMd: normalizedProgrammeMd`.
    - Convention de formation.pdf (dans la boucle apprenants, ~ligne 168) : remplacer `produitProgrammeMd: p.programMd ?? ''` par `produitProgrammeMd: normalizedProgrammeMd`.
    Ainsi Programme ET Convention consomment la MÊME source normalisée (plus de divergence). NE PAS toucher au déroulé (qui consomme déjà p.programMd via generateDerouleContent — hors scope ici, garde son propre ancrage).
  </action>
  <verify>
    <automated>cd "apps/web" && pnpm --filter @qualiof/web exec tsc --noEmit 2>&1 | grep -v "redirect-308" | grep -E "error TS" | head -5 ; echo "EXIT_TSC_OK_IF_EMPTY_ABOVE"</automated>
  </verify>
  <done>Les 2 prompts satisfaction imposent 1re personne + ancrage thème (grep « PREMIÈRE PERSONNE » et « aucun autre domaine » présents dans CHAUD et FROID) ; user-prompts renforcés ; PROMPT_VERSION bumpé une fois ; _gen-temoin-cloud.ts appelle generateNormalizedProgramme UNE fois et alimente Programme.pdf ET Convention.pdf avec normalizedProgrammeMd (grep « normalizedProgrammeMd » ≥3 occurrences) ; tsc clean (hors redirect-308). Vérif rendu = manuel au re-render témoin (prompts purs non testables unitairement).</done>
</task>

<task type="auto">
  <name>Task 3: Signature formateur réel sur attestation + certificat (sans doublon de signature)</name>
  <files>apps/web/src/lib/closure/attestation-template.ts, apps/web/src/lib/closure/certificat-template.ts</files>
  <action>
    **D'ABORD vérifier l'état actuel** : attestation-template.ts et certificat-template.ts posent déjà une signature, mais c'est celle du REPRÉSENTANT LÉGAL / dirigeant / pédago (Laurent via `loadSignatureDataUrl(ctx.tenantId,'pedago'|'dirigeant')`), PAS celle du formateur réel de la session. Le bloc formateur (`ctx.sessionTrainers[0]`) est ABSENT. → on l'AJOUTE (on ne retire pas le bloc dirigeant/pédago existant).

    **⚠️ ANTI-DOUBLON — point central de cette tâche (warning checker)** :
    `loadTrainerSignatureDataUrl(ctx.tenantId, trainer)` ne retourne PAS `''` pour Laurent Marx : il retourne `loadSignatureDataUrl(ctx.tenantId,'pedago')`, c'est-à-dire EXACTEMENT la même image que celle déjà affichée pour le représentant légal. Sur SES-0087 (Laurent formateur — notre témoin), afficher l'image formateur reproduirait DEUX signatures Laurent identiques côte à côte. À PROHIBER.
    Règle de dédup à coder dans CHAQUE template :
    - Calculer la dataURL du représentant légal effectivement affichée dans le bloc existant (variable déjà présente : `loadSignatureDataUrl(ctx.tenantId,'pedago')` pour l'attestation, `loadSignatureDataUrl(ctx.tenantId,'dirigeant')` pour le certificat — réutiliser EXACTEMENT la même variable que le bloc existant, ne pas la recalculer différemment).
    - Calculer `const trainer = ctx.sessionTrainers[0] ?? null;` et `const trainerSig = trainer ? loadTrainerSignatureDataUrl(ctx.tenantId, trainer) : '';`
    - `const trainerSigIsDuplicate = trainerSig !== '' && trainerSig === <dataURL représentant légal>;`
    - Dans la colonne formateur :
      - si `trainer` null → ne pas afficher la colonne (edge case session sans formateur).
      - si `trainerSig === ''` (formateur non reconnu) → afficher NOM + mention « Le formateur — {nom} » SANS image (emplacement nom seul).
      - si `trainerSigIsDuplicate` (= Laurent formateur ET représentant légal) → afficher NOM + mention « Le formateur — {nom} » SANS dupliquer l'image (on ne réaffiche PAS la même signature).
      - sinon (image formateur DISTINCTE, ex Jean-Guy) → afficher l'`<img class="tampon" src="${trainerSig}" .../>` + nom.

    **attestation-template.ts** :
    - Importer `loadTrainerSignatureDataUrl` depuis './shared-template' (loadSignatureDataUrl est déjà importé/utilisé pour le bloc pédago existant — réutiliser la même valeur).
    - Appliquer la règle de dédup ci-dessus en comparant `trainerSig` à la signature pédago déjà affichée.
    - Ajouter une 2e colonne `.col` formateur dans le `.signature-block` (déjà flex/gap → s'aligne auto). Réutiliser exactement les classes existantes (.signature-block .col .label .role img.tampon).

    **certificat-template.ts** :
    - Même ajout, mais comparer `trainerSig` à la signature `dirigeant` déjà affichée (c'est le rôle utilisé sur le certificat). Mêmes classes, même garde edge case, même règle anti-doublon.

    Cohérence émargement : le formateur réel est identifié sur chaque doc (nom toujours, image si DISTINCTE et reconnue). Sur les sessions Jean-Guy → vraie 2e signature distincte ; sur les sessions Laurent-formateur → nom + mention sans réafficher la signature déjà présente. Pas de mention « certifié exact » obligatoire ici (spécifique émargement).
  </action>
  <verify>
    <automated>cd "apps/web" && grep -l "loadTrainerSignatureDataUrl" src/lib/closure/attestation-template.ts src/lib/closure/certificat-template.ts && grep -l "trainerSigIsDuplicate" src/lib/closure/attestation-template.ts src/lib/closure/certificat-template.ts && pnpm --filter @qualiof/web exec tsc --noEmit 2>&1 | grep -v "redirect-308" | grep -E "error TS" | head -5 ; echo "EXIT_TSC_OK_IF_EMPTY_ABOVE"</automated>
  </verify>
  <done>attestation-template.ts et certificat-template.ts importent loadTrainerSignatureDataUrl, lisent ctx.sessionTrainers[0], et ajoutent une colonne formateur dans .signature-block AVEC règle anti-doublon (`trainerSigIsDuplicate`) : image formateur affichée UNIQUEMENT si distincte de la signature du représentant légal ; sinon NOM + mention « Le formateur — {nom} » sans image. Bloc dirigeant/pédago existant conservé. tsc clean (hors redirect-308). Vérif visuelle = manuel au re-render témoin (SES-0087 = Laurent formateur → AUCUNE double signature identique).</done>
</task>

</tasks>

<verification>
- `pnpm --filter @qualiof/web test src/lib/__tests__/programme-normalize.test.ts` → vert (grille déterministe + test de puissance fidélité tokens ≥4 lettres / stop-words FR).
- `pnpm --filter @qualiof/web exec tsc --noEmit` → aucune NOUVELLE erreur (ignorer les 6 erreurs redirect-308.test.ts préexistantes documentées STATE.md).
- Re-render témoin manuel (Laurent) : `SES=SES-0087 tsx scripts/_gen-temoin-cloud.ts` (provider openrouter via .env.local.cloud-backup) → ouvrir /tmp/qualiof-gen/... :
  - Programme.pdf : grille 9h-13h / 14h-18h, intitulés en verbes, contenu fidèle à PROD-0062.
  - Convention de formation.pdf (Article 3) : MÊME programme normalisé que Programme.pdf.
  - Satisfaction à chaud/froid.pdf : commentaires à la 1re personne, ancrés au thème, sans prénom 3e personne ni domaine hors sujet.
  - Attestation + Certificat.pdf : le formateur réel apparaît (nom toujours) à côté du représentant légal ; sur SES-0087 (Laurent formateur), la signature Laurent N'EST PAS affichée deux fois (mention « Le formateur — Laurent Marx » sans image dupliquée).
</verification>

<success_criteria>
- Grille horaire programme FIGÉE/DÉTERMINISTE prouvée unitairement pour le cas 1 jour (8h, PROD-0062), structurée pour extension multi-jours (non implémentée).
- Source programme UNIQUE : Programme.pdf et Convention.pdf consomment le même markdown normalisé.
- Fidélité de contenu vérifiée (test de puissance : un thème inventé sans token commun ≥4 lettres est détecté).
- Satisfaction froid ET chaud : 1re personne + ancrage thème imposés dans les prompts système + user.
- Attestation + certificat identifient le formateur réel de la session (cohérent émargement) SANS jamais dupliquer l'image de signature du représentant légal (cas Laurent-formateur = nom + mention seuls ; cas formateur distinct type Jean-Guy = vraie 2e signature).
- Worker Ollama, generators per-session non concernés, PedagogicalAsset upsert, WIP non committé de Laurent : INTOUCHÉS.
- Commits atomiques sur cloud-migration (1 par tâche). Pas de worktree.
</success_criteria>

<output>
After completion, create `.planning/quick/260618-czs-corrections-qualit-docs-qualiopi-program/260618-czs-SUMMARY.md`
</output>
</content>
</invoke>
