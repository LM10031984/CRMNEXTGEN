---
phase: quick-260706-bya
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/closure/qualiopi-prompts.ts
  - apps/web/src/lib/closure/ollama-generators.ts
  - apps/web/src/lib/closure/__tests__/positionnement-progression.test.ts
autonomous: true
requirements:
  - QUICK-260706-bya (fix positionnement partie 3 — progression variée + ancrage programme)

must_haves:
  truths:
    - "Le prompt positionnement n'impose plus '70% en niveau 4' ni un motif AVANT uniforme"
    - "Pour chaque compétence, APRÈS est toujours strictement supérieur à AVANT (progression = preuve Qualiopi)"
    - "AVANT peut démarrer à 3 sur une compétence où le profil du stagiaire a déjà de l'expérience, jamais à 4"
    - "APRÈS ne finit pas à 4 partout ; la progression varie (parfois +1, parfois +2/+3)"
    - "Le motif avant/après est ancré sur le profil (ancienneté/fonction) → distinct d'un stagiaire à l'autre"
    - "Un motif tampon 'tout 1 → tout 4' identique est rejeté par le schéma Zod"
    - "PROMPT_VERSION est bumpé (traçabilité AIGenerationJob.promptVersion)"
  artifacts:
    - path: "apps/web/src/lib/closure/qualiopi-prompts.ts"
      provides: "SYSTEM_PROMPT_POSITIONNEMENT réécrit + PROMPT_VERSION bumpé claude-v11-2026-07"
      contains: "claude-v11-2026-07"
    - path: "apps/web/src/lib/closure/ollama-generators.ts"
      provides: "user prompt positionnement (profil enrichi + consigne variée) + PositionnementSchema avec garde progression"
      contains: "apres > avant"
    - path: "apps/web/src/lib/closure/__tests__/positionnement-progression.test.ts"
      provides: "tests hermétiques du garde-fou de progression/anti-tampon"
      exports: []
  key_links:
    - from: "SYSTEM_PROMPT_POSITIONNEMENT (prompt)"
      to: "PositionnementSchema.superRefine (garde Zod)"
      via: "règles avant/après cohérentes prompt↔schéma"
      pattern: "apres > avant"
    - from: "generatePositionnementContent user prompt"
      to: "formation.programmeMd"
      via: "injection déjà présente du programme (ancrage compétences)"
      pattern: "programmeMd"
---

<objective>
Corriger le questionnaire de positionnement (partie 3 « auto-évaluation ») pour supprimer
le motif mécanique avant/après (les 3 stagiaires de SES-0094 sortaient tous 1→4 sur les 2
premières compétences — « fait faux » pour un auditeur, risque indicateur 2, même problème
connu que les satisfactions uniformes).

La variabilité DOIT venir du PROMPT et être verrouillée par le SCHÉMA Zod (garde-fou
déterministe), PAS d'un post-traitement aléatoire (`Math.random`/`Date.now` interdits dans
les générateurs). Deux leviers :
1. Réécrire `SYSTEM_PROMPT_POSITIONNEMENT` : progression VARIÉE et CRÉDIBLE, ancrée sur le
   profil (anti-jumelage), départ possible à 3, jamais tout à 4, mais TOUJOURS progression
   (après > avant) = preuve Qualiopi de l'acquis.
2. Durcir `PositionnementSchema` : imposer `apres > avant` par compétence + `avant ≤ 3` +
   rejet du motif tampon uniforme ; couvert par un test Vitest hermétique.

L'ancrage au programme est DÉJÀ en place (le user prompt de `generatePositionnementContent`
passe `formation.programmeMd`) — on le RENFORCE dans la consigne finale et on enrichit le
profil stagiaire (ancienneté/statut) pour donner au LLM une vraie base de différenciation.

Purpose: rendre les positionnements auditables (progression prouvée, motifs non jumeaux).
Output: prompt v11 + garde Zod de progression + tests. (La régénération de SES-0094 est une
ÉTAPE POST-PLAN gatée — voir success_criteria, elle N'EST PAS exécutée par ce plan.)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/closure/qualiopi-prompts.ts
@apps/web/src/lib/closure/ollama-generators.ts
@apps/web/src/lib/closure/positionnement-template.ts

<interfaces>
<!-- Contrats déjà en place — l'exécuteur s'appuie dessus, aucune exploration requise. -->

Type de contenu (positionnement-template.ts) — avant/apres sont DÉJÀ typés 1|2|3|4 :
```typescript
export interface PositionnementCompetence {
  label: string;
  avant: 1 | 2 | 3 | 4;
  apres: 1 | 2 | 3 | 4;
}
```

Schéma Zod actuel (ollama-generators.ts:166-182) — accepte 1..4 mais SANS garde de progression :
```typescript
const NiveauPositionnement = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const PositionnementSchema = z.object({
  objectifs_formation: z.string().min(10),
  demande_specifique: z.string().nullable().optional(),
  prerequis: z.string().min(10),
  competences: z.array(z.object({
    label: z.string().min(5),
    avant: NiveauPositionnement,
    apres: NiveauPositionnement,
  })).min(6).max(10),
  commentaires: z.string().nullable().optional(),
});
```

Profil disponible (ollama-generators.ts, StagiaireCtx) — `anciennete` et `professionalStatus`
existent mais NE SONT PAS injectés dans le user prompt du positionnement aujourd'hui :
```typescript
export interface StagiaireCtx {
  prenom: string; nom: string; entreprise: string | null;
  fonction: string | null; anciennete: string | null; diplomes: string | null;
  professionalStatus: string | null; civilite: string | null;
}
```

Pattern de garde Zod existant (référence de style) — `DerouleSequenceSchema.superRefine`
(ollama-generators.ts:280-308) : `ctx.addIssue({ code: 'custom', path: [...], message })`.
Un échec de schéma → `runOllamaJson` retente (MAX_ATTEMPTS=2) puis retombe sur le stub
(chaîne prompt→LLM→Zod→null→stub intacte). C'est le comportement voulu (fail-loud, pas de
tampon silencieux).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Réécrire SYSTEM_PROMPT_POSITIONNEMENT (progression variée) + bumper PROMPT_VERSION</name>
  <files>apps/web/src/lib/closure/qualiopi-prompts.ts</files>
  <action>
Deux modifications dans ce fichier.

1) `PROMPT_VERSION` (l.28) : bumper `'claude-v10-2026-07'` → `'claude-v11-2026-07'`.
   Ajouter une ligne au header daté (bloc de commentaire en tête, cf. la note « bumper
   PROMPT_VERSION et tracer dans AIGenerationJob.promptVersion ») expliquant : « v11
   (quick 260706-bya) — SYSTEM_PROMPT_POSITIONNEMENT : progression avant/après VARIÉE et
   crédible (fin de tampon 1→4), départ possible à 3, jamais tout à 4, motif ancré profil
   (anti-jumelage), progression stricte après > avant conservée = preuve Qualiopi ind.2. »

2) Réécrire le bloc « Règles strictes » de `SYSTEM_PROMPT_POSITIONNEMENT` (l.143-146) et le
   format de sortie des compétences (l.155). REMPLACER les deux règles fautives actuelles
   (« Niveaux AVANT : majoritairement 1 ou 2 … » et « Niveaux APRÈS : majoritairement 3 ou 4
   … JAMAIS de niveau 1 après. Au moins 70% en niveau 4. ») par des règles de PROGRESSION
   VARIÉE. Garder la 1re règle (compétences SPÉCIFIQUES au programme) et la dernière (ton
   naturel). Le nouveau bloc de règles doit imposer :

   - PROGRESSION OBLIGATOIRE : pour CHAQUE compétence, le niveau APRÈS est STRICTEMENT
     supérieur au niveau AVANT (apres > avant, sans aucune exception) — c'est la preuve
     Qualiopi de l'acquis. Jamais après ≤ avant, jamais de stagnation ni de régression.
   - Niveaux AVANT : entre 1 et 3, JAMAIS 4 (un stagiaire qui vient se former ne maîtrise
     pas déjà tout). Majoritairement 1 ou 2, MAIS 1 ou 2 compétences peuvent démarrer à 3
     quand le profil du stagiaire (ancienneté, fonction) rend une base crédible sur ce thème.
   - Niveaux APRÈS : entre 2 et 4, PAS uniforme. Ne PAS mettre 4 partout : certaines
     compétences finissent à 3 (maîtrise partielle réaliste), d'autres à 4. L'ampleur de la
     progression VARIE d'une compétence à l'autre (parfois +1, parfois +2, parfois +3).
   - ANTI-TAMPON / ANCRAGE INDIVIDUEL (anti-jumelage) : le MOTIF avant/après doit être PROPRE
     à ce stagiaire. Deux stagiaires d'une même session ne doivent JAMAIS produire des vecteurs
     avant/après identiques. Ancre les niveaux de départ et l'ampleur de la progression sur le
     profil réel (ancienneté, statut, fonction) : un profil expérimenté part de plus haut sur
     les compétences proches de son métier ; un profil junior part plus bas et progresse plus
     fort. INTERDIT : un motif « tout 1 → tout 4 » répété tel quel pour chaque stagiaire (ça
     fait faux pour un auditeur).

   Mettre à jour le schéma JSON du prompt : `"avant": 1|2|3, "apres": 2|3|4` et annoter la
   ligne « (6 à 8 compétences, avec apres > avant pour chacune) ».

Ne toucher à AUCUN autre prompt système du fichier (garde-fous métier des autres docs intacts).
  </action>
  <verify>
    <automated>cd "apps/web" && grep -q "claude-v11-2026-07" src/lib/closure/qualiopi-prompts.ts && grep -q "apres > avant" src/lib/closure/qualiopi-prompts.ts && ! grep -q "70% en niveau 4" src/lib/closure/qualiopi-prompts.ts && pnpm exec tsc --noEmit && echo PROMPT_OK</automated>
  </verify>
  <done>PROMPT_VERSION = claude-v11-2026-07 ; règles avant∈1..3 / après∈2..4 avec après>avant et anti-tampon présentes ; l'ancienne règle « 70% en niveau 4 » a disparu ; tsc exit 0.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: User prompt (profil + consigne variée) + garde Zod de progression + tests</name>
  <files>apps/web/src/lib/closure/ollama-generators.ts, apps/web/src/lib/closure/__tests__/positionnement-progression.test.ts</files>
  <behavior>
    Le garde-fou de PositionnementSchema doit :
    - Test 1 (accepte varié) : compétences avec avant∈{1,2,3}, après>avant, deltas mixtes
      (ex: [1→3, 2→4, 3→4, 1→2, 2→3, 1→4]) → parse OK.
    - Test 2 (rejette stagnation/régression) : une compétence avec après === avant (ex: 2→2)
      OU après < avant (ex: 3→2) → parse échoue (issue sur `apres`).
    - Test 3 (rejette avant=4) : une compétence avant=4 → parse échoue (issue sur `avant`).
    - Test 4 (rejette tampon uniforme) : les 6 compétences toutes 1→4 (avants identiques ET
      deltas identiques) → parse échoue (issue anti-tampon sur `competences`).
    - Test 5 (accepte progression uniforme des DELTAS mais avants variés) : garde LÉGÈRE —
      si les avants varient OU les deltas varient, ça passe (on ne bloque QUE le motif
      totalement plat). Ex: [1→2, 2→3, 3→4, 1→2, 2→3, 1→2] (avants variés) → parse OK.
  </behavior>
  <action>
Dans `apps/web/src/lib/closure/ollama-generators.ts` :

A) `PositionnementSchema` (l.167-182) — exporter le schéma (`export const PositionnementSchema`)
   pour le rendre testable, et lui AJOUTER un `.superRefine((data, ctx) => { … })` (calqué
   sur le style de `DerouleSequenceSchema`) qui :
   - pour chaque compétence i : si `avant >= 4` → addIssue path `['competences', i, 'avant']`
     (« AVANT ne peut pas valoir 4 — le stagiaire vient se former ») ; si `apres <= avant` →
     addIssue path `['competences', i, 'apres']` (« APRÈS doit être strictement supérieur à
     AVANT — progression obligatoire »).
   - anti-tampon (garde LÉGÈRE) : construire `new Set(comps.map(c => c.avant))` et
     `new Set(comps.map(c => c.apres - c.avant))` ; si les DEUX sets ont taille 1 (tous les
     avant identiques ET tous les deltas identiques) → addIssue path `['competences']`
     (« Motif avant/après uniforme (tampon) — varie les niveaux de départ ou l'ampleur de la
     progression »). NE PAS bloquer davantage (éviter les stubs : toute vraie variation passe).
   IMPORTANT : c'est une VALIDATION déterministe (pas de Math.random/Date.now).

B) `generatePositionnementContent` (l.689-728) :
   - enrichir `stagiaireBlock` (l.696-703) en ajoutant, après entreprise, deux lignes filtrées :
     `stagiaire.professionalStatus ? \`Statut professionnel : ${stagiaire.professionalStatus}\` : null`
     et `stagiaire.anciennete ? \`Ancienneté dans le métier : ${stagiaire.anciennete}\` : null`.
   - réécrire la consigne finale du user prompt (l.715, celle qui dit aujourd'hui
     « niveaux AVANT (majoritairement 1-2) et niveaux APRÈS (majoritairement 4) ») par :
     « Génère 6-8 compétences spécifiques au PROGRAMME ci-dessus (chaque libellé reprend un
     thème réel du programme). Attribue à chacune un niveau AVANT (1 à 3, jamais 4) et un
     niveau APRÈS STRICTEMENT supérieur (après > avant, toujours). Fais VARIER la progression
     (parfois +1, parfois +2/+3), ne finis pas tout à 4, et ancre les niveaux de départ sur le
     profil réel du stagiaire (ancienneté, fonction) pour que son motif avant/après soit
     DISTINCT de celui des autres stagiaires de la session. »
   - Conserver `genderDirective(stagiaire.civilite)` en fin. NE PAS changer le `tier` ('fast'/
     Haiku conservé : le défaut venait du prompt « 70% en 4 », pas du modèle — l'escalade vers
     'quality' reste un plan B documenté si le témoin post-régen montre encore de l'uniformité).

C) Créer `apps/web/src/lib/closure/__tests__/positionnement-progression.test.ts` : importer
   `PositionnementSchema`, couvrir les 5 comportements décrits ci-dessus via
   `PositionnementSchema.safeParse(...)` sur des objets complets (objectifs_formation/prerequis
   ≥10 car, 6 compétences). Test hermétique pur (aucun appel LLM, aucun mock DB). Utiliser un
   helper `base(competences)` qui remplit les champs texte obligatoires et injecte le tableau.
  </action>
  <verify>
    <automated>cd "apps/web" && pnpm exec vitest run src/lib/closure/__tests__/positionnement-progression.test.ts && pnpm exec tsc --noEmit</automated>
  </verify>
  <done>PositionnementSchema exporté + superRefine (après>avant, avant≤3, anti-tampon léger) ; user prompt injecte statut/ancienneté et impose une progression variée ancrée profil ; 5 tests verts ; tsc exit 0.</done>
</task>

</tasks>

<verification>
- `grep -q "claude-v11-2026-07" apps/web/src/lib/closure/qualiopi-prompts.ts` (version bumpée).
- `! grep -q "70% en niveau 4" apps/web/src/lib/closure/qualiopi-prompts.ts` (ancienne règle retirée).
- `cd apps/web && pnpm exec vitest run src/lib/closure/__tests__/positionnement-progression.test.ts` (garde-fou prouvé).
- `cd apps/web && pnpm exec tsc --noEmit` exit 0 (web).
- Test de puissance (convention projet) au gate : au choix — inverser `apres <= avant` en
  `apres < avant` dans le superRefine → Test 2 doit passer AU ROUGE (une stagnation 2→2
  n'est plus rejetée) → restaurer → 5/5. Mutation NON commitée.
</verification>

<success_criteria>
- `SYSTEM_PROMPT_POSITIONNEMENT` n'impose plus de plancher « 70% en niveau 4 » ni de motif AVANT
  uniforme ; il impose progression stricte + variée + ancrée profil (anti-jumelage).
- `PositionnementSchema` garantit après>avant, avant≤3 et rejette le motif tampon plat.
- `PROMPT_VERSION = claude-v11-2026-07` (traçable dans `AIGenerationJob.promptVersion`).
- Suite Vitest positionnement verte + tsc vert.

ÉTAPE POST-PLAN GATÉE (NON exécutée par ce plan — cf. « destructif/cloud réel = étape séparée ») :
Après merge, Laurent (ou l'orchestrateur sur délégation) régénère le pack témoin :

    SES=SES-0094 tsx apps/web/scripts/_gen-session-pack.ts

(le script bascule AI_PROVIDER=openrouter et lit `.env.local.cloud-backup` ; footers OF_* déjà
corrigés sur Railway ; génération EN DIRECT depuis le Mac via OpenRouter). CONTRÔLE DE VARIABILITÉ
post-run à faire dans les 3 rawJson des PedagogicalAsset POSITIONNEMENT de SES-0094 (Pierre /
Charlotte / Yannick) :
  1. 0 stub (les 3 générés par LLM, promptVersion = claude-v11-2026-07).
  2. Progression stricte partout : après > avant sur chaque compétence des 3 stagiaires.
  3. Motifs DISTINCTS : les vecteurs (avant,après) des 3 stagiaires NE SONT PAS identiques.
  4. Au moins 3 valeurs de progression (delta après−avant) distinctes sur l'ensemble des 3.
  5. Plus de « tout 1→4 » sur les 2 premières compétences.
Si le témoin montre encore de l'uniformité malgré le prompt v11 : plan B = bumper le tier
positionnement 'fast'→'quality' (Sonnet) dans `generatePositionnementContent`.
</success_criteria>

<output>
After completion, create `.planning/quick/260706-bya-fix-positionnement-partie-3-progression-/260706-bya-SUMMARY.md`
</output>
