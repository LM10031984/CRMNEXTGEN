---
phase: quick-260618-skk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/closure/ollama-generators.ts
  - apps/web/src/lib/closure/deroule-template.ts
  - apps/web/src/lib/closure/generate-deroule-session.ts
  - apps/web/src/lib/closure/__tests__/rapport-formateur-session-specifique.test.ts
autonomous: true
requirements:
  - SKK-01  # Tableau satisfaction formateur seedé par SESSION (notes varient par session)
  - SKK-02  # Narratifs rapport formateur ancrés sur les données RÉELLES de session
  - SKK-03  # Test de puissance/mutation : sessions différentes → rapport différent, corps/programme identiques

must_haves:
  truths:
    - "Deux sessions du même produit (apprenants/dates/lieu différents) produisent un tableau de satisfaction formateur aux notes DIFFÉRENTES"
    - "Deux sessions du même produit produisent des narratifs (adaptations/remarques/bilan) DIFFÉRENTS quand le LLM reçoit les données de session"
    - "Le CORPS du déroulé (jours[]) et le programme restent IDENTIQUES entre les deux sessions (figeage produit préservé)"
    - "Sans données de session (signature vide / titre seul), les notes et le prompt redeviennent identiques entre sessions → mutation détectée par le test"
    - "Si le LLM échoue, le rapport retombe sur les pools (ADAPTATIONS/REMARQUES/BILAN) — pas de stub silencieux, non-régression"
  artifacts:
    - path: "apps/web/src/lib/closure/ollama-generators.ts"
      provides: "generateRapportFormateur étendu avec un contexte session optionnel + prompt ancré sur faits concrets"
      contains: "SessionRapportCtx"
    - path: "apps/web/src/lib/closure/deroule-template.ts"
      provides: "renderDerouleHtml passe seed = sessionCode (pas sessionTitle) à renderBilanFormateur"
      contains: "ctx.sessionCode"
    - path: "apps/web/src/lib/closure/generate-deroule-session.ts"
      provides: "persistDerouleSession charge TOUS les participants + enseignes + dates + lieu et les transmet à generateRapportFormateur"
      contains: "buildSessionRapportCtx"
    - path: "apps/web/src/lib/closure/__tests__/rapport-formateur-session-specifique.test.ts"
      provides: "Test de puissance déterministe (LLM mocké reflétant les signaux de session) : sessions différentes → sorties différentes ; mutation → ROUGE"
      contains: "test de puissance"
  key_links:
    - from: "apps/web/src/lib/closure/deroule-template.ts:renderDerouleHtml"
      to: "renderBilanFormateur(seed)"
      via: "seed = ctx.sessionCode"
      pattern: "seed:\\s*ctx\\.sessionCode"
    - from: "apps/web/src/lib/closure/generate-deroule-session.ts:persistDerouleSession"
      to: "generateRapportFormateur(formation, sessionCtx)"
      via: "buildSessionRapportCtx puis passage en argument"
      pattern: "generateRapportFormateur\\([^)]*sessionCtx"
---

<objective>
Rendre le RAPPORT FORMATEUR du déroulé SPÉCIFIQUE à chaque session (anti copier-coller Qualiopi), sans toucher au figeage produit du corps/programme.

Deux causes distinctes, vérifiées sur PROD-0062 (4 sessions identiques mot pour mot) :
1. Le tableau « satisfaction formateur » (7 critères, notes 1-5) est seedé sur `ctx.sessionTitle` (= titre produit, identique toutes sessions) → `noteBySeed()` produit les MÊMES notes partout.
2. Les narratifs (adaptations/remarquesGroupe/bilan) sont générés par `generateRapportFormateur` qui ne reçoit QUE titre + durée + programmeMd (tous identiques entre sessions du même produit, programme figé) → narratifs génériques quasi identiques.

Purpose : conformité Qualiopi — un auditeur ne doit pas trouver deux déroulés de sessions différentes au rapport formateur identique.
Output : tableau satisfaction seedé par session + narratifs ancrés sur les faits réels de la session, le tout couvert par un test de puissance déterministe (zéro appel LLM réel).

CONTRAINTE ARCHITECTURE (locked, quick 260618-rkj) : le CORPS du déroulé (`jours[]`) et le PROGRAMME restent FIGÉS au niveau PRODUIT (`TrainingProduct.derouleJson` / `programMd`) et IDENTIQUES entre sessions. SEUL `rapportFormateur` (narratifs + notes du tableau) varie par session. NE PAS regénérer le corps par session. NE PAS toucher au figeage.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260618-rkj-figer-programme-deroule-pedagogique-au-n/260618-rkj-SUMMARY.md

# Fichiers source à modifier
@apps/web/src/lib/closure/ollama-generators.ts
@apps/web/src/lib/closure/deroule-template.ts
@apps/web/src/lib/closure/generate-deroule-session.ts
@apps/web/src/lib/closure/build-context.ts

<interfaces>
<!-- Contrats déjà en place dans le codebase — l'exécutant les utilise tels quels, sans exploration. -->

From apps/web/src/lib/closure/ollama-generators.ts (signature ACTUELLE à étendre, l.314) :
```typescript
export interface FormationCtx {
  titre: string;
  programmeMd: string;
  nombreHeures: number;
}

const RapportFormateurSchema = z.object({
  adaptations: z.string().min(10),
  remarquesGroupe: z.string().min(10),
  bilan: z.string().min(10),
});

export async function generateRapportFormateur(
  formation: FormationCtx,
  refTable = 'PedagogicalAsset',
  refId: string | null = null,
  tenantId: string | null = null,
): Promise<z.infer<typeof RapportFormateurSchema> | null>
// → construit `prompt` (titre + durée + programme) puis runOllamaJson(..., 'fast')
```

From apps/web/src/lib/closure/deroule-template.ts (renderDerouleHtml l.260-287) :
```typescript
// ⚠ BUG cause 1 : seed = ctx.sessionTitle (titre produit, identique toutes sessions)
renderBilanFormateur({
  trainerName: ctx.sessionTrainers.join(', '),
  signatureDataUrl: loadTrainerSignatureDataUrl(ctx.tenantId, ctx.sessionTrainers[0]),
  seed: ctx.sessionTitle,           // ← doit devenir ctx.sessionCode
  rapport: content.rapportFormateur ?? null,
})
// renderBilanFormateur(opts.seed) → noteBySeed(seed, i) → notes 1-5 du tableau (7 critères)
// La variante PRODUIT renderProductDerouleHtml garde seed = data.produitTitre (NE PAS toucher — pas de notion de session).
```

From apps/web/src/lib/closure/shared-template.ts (ClosureContext — champs DISPONIBLES, déjà peuplés par build-context.ts) :
```typescript
export interface ClosureContext {
  sessionCode: string;          // ← identifiant de SESSION (seed du tableau)
  sessionTitle: string;         // titre produit (identique toutes sessions)
  sessionStartDate: Date;
  sessionEndDate: Date;
  sessionLocation: string | null;
  sessionTrainers: string[];
  durationHours: number;
  // ...
}
```

From apps/web/src/lib/closure/generate-deroule-session.ts (persistDerouleSession l.41-93) :
```typescript
// Charge session + product + participants (take:1) ; construit ctx via buildClosureContextForParticipant.
// Branche frozenBody (chemin masse) : appelle generateRapportFormateur(formation, 'PedagogicalAsset', null, tenantId)
//   AVEC formation = { titre, programmeMd, nombreHeures } SEULEMENT (aucune donnée session).
// ⚠ participants chargés avec `take: 1` → il faut élargir pour compter + récupérer les enseignes.
```

From apps/web/src/lib/closure/qualiopi-prompts.ts (SYSTEM_PROMPT_RAPPORT_FORMATEUR — garde anti hors-sujet à CONSERVER) :
```text
RÈGLE DE VOIX ABSOLUE : première personne, jamais de prénom.
ANCRAGE STRICT AU THÈME : narratifs UNIQUEMENT sur le contenu RÉEL du programme. N'introduis AUCUN thème hors programme.
LONGUEUR : 1 à 2 phrases par champ. Réponds UNIQUEMENT en JSON { "adaptations", "remarquesGroupe", "bilan" }.
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1 : Seed du tableau satisfaction = sessionCode + signature étendue de generateRapportFormateur (contexte session)</name>
  <files>apps/web/src/lib/closure/deroule-template.ts, apps/web/src/lib/closure/ollama-generators.ts</files>
  <action>
DEUX corrections atomiques (ne touchent à aucun appelant — Task 2 les câble) :

(A) CAUSE 1 — Seed du tableau satisfaction formateur (deroule-template.ts) :
- Dans `renderDerouleHtml` (l.277-282), remplacer `seed: ctx.sessionTitle` par `seed: ctx.sessionCode` (correction 1 : le seed des 7 notes doit être l'identifiant de SESSION, pas le titre produit). `noteBySeed`/`hashSeed` restent inchangés (notes déjà cohérentes : majorité 4-5, parfois 3, via `r < 5 ? 5 : r < 9 ? 4 : 3`).
- NE PAS toucher `renderProductDerouleHtml` (variante PRODUIT, l.300-341) : son `seed: data.produitTitre` est correct (pas de notion de session au niveau produit).
- Conserver `trainerName`, `signatureDataUrl`, `rapport` inchangés.

(B) CAUSE 2 — Étendre `generateRapportFormateur` (ollama-generators.ts l.314) pour recevoir un contexte session optionnel :
- Ajouter et EXPORTER une interface `SessionRapportCtx` :
  ```typescript
  export interface SessionRapportCtx {
    nbApprenants: number;
    enseignes: string[];        // brandName/legalName distincts des apprenants (peut être vide)
    dateDebut: Date | null;
    dateFin: Date | null;
    lieu: string | null;
    // Résultats agrégés déjà disponibles à l'étape d (pack closure étape c généré AVANT) — tous optionnels.
    qcmScoreMoyen?: number | null;       // 0-100
    satisfactionMoyenne?: string | null; // ex. "Très bien" / libellé agrégé
    positionnementProgressed?: boolean | null;
  }
  ```
- Insérer `sessionCtx?: SessionRapportCtx | null` en NOUVEAU paramètre. IMPORTANT pour ne pas casser les appelants existants : l'ajouter en DERNIER paramètre (après `tenantId`), valeur par défaut `null`. Signature finale :
  ```typescript
  export async function generateRapportFormateur(
    formation: FormationCtx,
    refTable = 'PedagogicalAsset',
    refId: string | null = null,
    tenantId: string | null = null,
    sessionCtx: SessionRapportCtx | null = null,
  ): Promise<z.infer<typeof RapportFormateurSchema> | null>
  ```
- Construire un bloc `faitsSession` dans le `prompt` UNIQUEMENT si `sessionCtx` fourni — lignes factuelles compactes, filtrées sur les valeurs non nulles, ex. :
  `Cette session précise : {nbApprenants} apprenant(s){enseignes.length ? `, issus de {enseignes.join(', ')}` : ''}` puis dates (`du {dateDebut} au {dateFin}` via toLocaleDateString fr-FR), lieu, et les résultats agrégés présents (score QCM moyen, satisfaction, progression positionnement).
- Insérer `faitsSession` dans le prompt AVANT la consigne de rédaction, avec une DIRECTIVE explicite : « Ancre tes trois narratifs sur CES FAITS CONCRETS de la session (effectif, profils/enseignes, période, résultats) pour qu'ils soient DISTINCTS d'une session à l'autre, tout en restant STRICTEMENT dans le périmètre du programme ci-dessus (aucun thème hors programme). »
- CONSERVER intégralement la garde anti hors-sujet existante (le bloc `hasProgramme ? ... : ...` ancrant strictement sur le programme/titre) — la nouvelle directive s'AJOUTE, ne remplace rien.
- NE PAS modifier `SYSTEM_PROMPT_RAPPORT_FORMATEUR` (la règle de voix + ancrage thème reste la source de vérité ; on enrichit seulement le user prompt).
- `tier` reste `'fast'`, `RapportFormateurSchema` inchangé.
  </action>
  <verify>
    <automated>cd "/Users/laurentmarx/Documents/CRM Next gen/files/apps/web" && pnpm exec tsc --noEmit</automated>
  </verify>
  <done>
- `renderDerouleHtml` passe `seed: ctx.sessionCode` ; `renderProductDerouleHtml` inchangé.
- `SessionRapportCtx` exporté ; `generateRapportFormateur` accepte un 5e paramètre `sessionCtx` optionnel rétro-compatible (appelants existants compilent sans changement).
- Le prompt inclut le bloc `faitsSession` + directive d'ancrage session seulement si `sessionCtx` fourni ; garde anti hors-programme conservée.
- `tsc --noEmit` vert.
  </done>
</task>

<task type="auto">
  <name>Task 2 : persistDerouleSession charge TOUS les participants + enseignes + dates + lieu et les transmet</name>
  <files>apps/web/src/lib/closure/generate-deroule-session.ts</files>
  <action>
Câbler la branche `frozenBody` (chemin de génération de masse) pour alimenter `generateRapportFormateur` avec un `SessionRapportCtx`.

- Élargir le `prisma.trainingSession.findFirst` (l.58-68) : remplacer le `participants: { ..., take: 1 }` par un chargement qui couvre les DEUX besoins :
  - garder un participant pour `buildClosureContextForParticipant` (rendu déroulé — le premier de la liste),
  - charger TOUS les participants éligibles (`enrollmentStatus in PRE_ENROLLED|CONFIRMED|ATTENDED`) pour le `count` + collecter les enseignes via `person.legalLinks.organization.brandName/legalName` (rôles `EI_SELF|AGENT_COMMERCIAL|DIRIGEANT|SALARIE`, mêmes rôles que `build-context.ts`). Inclure `location` n'est PAS requis ici car `ctx.sessionLocation` est déjà résolu par `buildClosureContextForParticipant` — RÉUTILISER `ctx.sessionLocation`, `ctx.sessionStartDate`, `ctx.sessionEndDate` plutôt que recharger (le `ctx` est déjà construit l.76).
  - Conserver `firstParticipant = participants[0]` pour le contexte de rendu ; le garde-fou « Aucun participant inscrit » reste.
- Ajouter une fonction PURE locale `buildSessionRapportCtx(participants, ctx): SessionRapportCtx` (exportée pour testabilité) qui :
  - `nbApprenants = participants.length`,
  - `enseignes` = ensemble (dédupliqué, ordre stable) des `brandName ?? legalName` du `legalLinks[0]` de chaque participant (filtrer null/vides),
  - `dateDebut = ctx.sessionStartDate ?? null`, `dateFin = ctx.sessionEndDate ?? null`, `lieu = ctx.sessionLocation ?? null`.
  - Les champs résultats agrégés (`qcmScoreMoyen`, `satisfactionMoyenne`, `positionnementProgressed`) restent `undefined` pour l'instant (le pack closure étape c est déjà généré mais l'agrégation lecture n'est pas l'objet de ce quick — laisser optionnels, le prompt les omet proprement). NE PAS inventer de requêtes lourdes : se limiter à ce qui est déjà chargé.
- Dans la branche `if (opts?.frozenBody)` (l.87-93) : construire `const sessionCtx = buildSessionRapportCtx(participants, ctx);` puis appeler `generateRapportFormateur(formation, 'PedagogicalAsset', null, tenantId, sessionCtx)`. Comportement inchangé sinon (fallback sur le corps figé si rapport null → pas de stub).
- La branche rétro-compat (sans `frozenBody`, l.94-101) appelle `generateDerouleContent` qui appelle `generateRapportFormateur` SANS sessionCtx — c'est acceptable (chemin legacy non utilisé par la masse). NE PAS modifier `generateDerouleContent` dans ce quick (hors scope ; rétro-compat préservée par le défaut `null`).
- Respecter les conventions : module lib pur (PAS `'use server'`), n'importe JAMAIS `@/lib/auth` (déjà le cas). `buildSessionRapportCtx` est pure (zéro IO).
  </action>
  <verify>
    <automated>cd "/Users/laurentmarx/Documents/CRM Next gen/files/apps/web" && pnpm exec tsc --noEmit</automated>
  </verify>
  <done>
- `persistDerouleSession` charge tous les participants éligibles + leurs enseignes ; `firstParticipant` toujours utilisé pour le rendu.
- `buildSessionRapportCtx` exportée, pure, renvoie `nbApprenants` + `enseignes` dédupliquées + dates/lieu issus de `ctx`.
- Branche `frozenBody` appelle `generateRapportFormateur(..., sessionCtx)`.
- `tsc --noEmit` vert.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3 : Test de puissance/mutation — sessions différentes → rapport différent, corps/programme identiques</name>
  <files>apps/web/src/lib/closure/__tests__/rapport-formateur-session-specifique.test.ts</files>
  <behavior>
Test DÉTERMINISTE, zéro Ollama/Claude réel (LLM mocké reflétant les signaux de session reçus). Couvre les DEUX causes + l'invariant figeage.

- Test 1 (CAUSE 1 — notes du tableau) : `renderDerouleHtml(ctxA, content)` vs `renderDerouleHtml(ctxB, content)` où `ctxA.sessionCode = 'SES-A'` et `ctxB.sessionCode = 'SES-B'` (même `sessionTitle`, même `content` corps figé). Extraire la suite des 7 notes mises en évidence du tableau (cellules avec `font-weight: 700` / `background` BRAND_DARK) → la séquence de notes de A DIFFÈRE de celle de B. MUTATION : repasser le seed à `sessionTitle` (identique) → les deux séquences redeviennent ÉGALES → le test vire ROUGE (prouve que le seed=sessionCode garde l'invariant). Documenter la mutation en commentaire.
- Test 2 (CAUSE 2 — narratifs LLM) : mocker `generateRapportFormateur` (ou son runner) pour qu'il REFLÈTE le `sessionCtx` reçu — ex. renvoyer `{ adaptations: `nb=${sessionCtx?.nbApprenants} enseignes=${sessionCtx?.enseignes.join('|')}`, remarquesGroupe: `date=${sessionCtx?.dateDebut?.toISOString()}`, bilan: `lieu=${sessionCtx?.lieu}` }`. Appeler la construction du sessionCtx via `buildSessionRapportCtx(participantsA, ctxA)` et `(participantsB, ctxB)` avec apprenants/dates/lieu DIFFÉRENTS → les narratifs produits DIFFÈRENT. MUTATION : appeler avec `sessionCtx = null` (équivaut à « revenir au titre seul », aucune donnée session) pour les deux → narratifs IDENTIQUES → assertion `notToEqual` vire ROUGE. Documenter.
- Test 3 (INVARIANT figeage — non-régression) : `content.jours` (corps) et le bloc programme rendu sont STRICTEMENT IDENTIQUES entre le rendu de la session A et de la session B (extraire les blocs `Jour N` du HTML → égalité). Prouve qu'on n'a pas régressé le figeage produit (260618-rkj).
- Test 4 (fallback non-régression) : si le mock LLM renvoie `null`, `renderDerouleHtml` utilise les pools (`ADAPTATIONS_POOL`/`REMARQUES_GROUPE_POOL`/`BILAN_POOL`) — au moins un narratif de pool présent dans le HTML (réutiliser l'assertion existante de `rapport-formateur-narratif.test.ts`).
  </behavior>
  <action>
- Créer `apps/web/src/lib/closure/__tests__/rapport-formateur-session-specifique.test.ts` (vitest), pattern des tests existants (`rapport-formateur-narratif.test.ts` pour le rendu HTML ; `gen-session-pack-pure.test.ts` pour les mocks `vi.mock('@qualiof/db' | '@/lib/storage' | '@/lib/pdf-render' | '../build-context' | '../ollama-generators')`).
- Pour les Tests 1 et 3 : tester le RENDU via `renderDerouleHtml` (fonction pure, pas de mock IO nécessaire — `ctx` minimal casté `as unknown as ClosureContext` avec `sessionCode`, `sessionTitle`, `sessionTrainers: []`, `sessionStartDate`, `sessionEndDate`, `tenantId`). Helper local `extractHighlightedNotes(html): number[]` (regex sur les cellules surlignées) et `extractJourBlocks(html): string[]`.
- Pour le Test 2 : tester la chaîne `buildSessionRapportCtx` → `generateRapportFormateur` MOCKÉ. Mocker `../ollama-generators` partiel : implémentation de `generateRapportFormateur` qui lit son 5e argument `sessionCtx` et renvoie un objet reflétant ses champs (déterministe). Importer `buildSessionRapportCtx` depuis `../generate-deroule-session`. Construire deux jeux de participants factices (enseignes/dates/lieu via `ctx`) → vérifier `notToEqual`. MUTATION = passer `null`.
- Convention test de puissance (feedback_test_de_puissance_mutation) : pour chaque assertion d'invariant, AJOUTER un commentaire `// MUTATION : <action> → ce test DOIT virer ROUGE` décrivant comment casser et restaurer. Prouver manuellement (cf. vérification ci-dessous) qu'au moins le Test 1 vire rouge sous mutation.
- TS strict : mocks typés `vi.fn(async (..._a: unknown[]) => ...)` si spread (cf. déviation Rule 1 du quick 260618-rkj). Pas d'`any` non maîtrisé.
- NE PAS régresser `freeze-product-assets.test.ts` ni `rapport-formateur-narratif.test.ts` (fichiers distincts, ne pas les modifier).
  </action>
  <verify>
    <automated>cd "/Users/laurentmarx/Documents/CRM Next gen/files/apps/web" && pnpm exec vitest run rapport-formateur-session-specifique freeze-product-assets rapport-formateur-narratif gen-session-pack-pure 2>&1 | tail -30</automated>
  </verify>
  <done>
- Nouveau fichier de test présent, 4 tests verts.
- Tests existants `freeze-product-assets.test.ts`, `rapport-formateur-narratif.test.ts`, `gen-session-pack-pure.test.ts` toujours verts (non-régression).
- Test de puissance prouvé : mutation seed `sessionCode → sessionTitle` fait virer le Test 1 ROUGE, puis restauration → vert (à exécuter une fois et documenter dans le SUMMARY).
- `tsc --noEmit` + `vitest run` (les 4 fichiers ciblés) verts. Aucun appel LLM réel.
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && pnpm exec tsc --noEmit` → 0 erreur.
- `pnpm exec vitest run rapport-formateur-session-specifique freeze-product-assets rapport-formateur-narratif gen-session-pack-pure` → tous verts (nouveaux + non-régression).
- Test de puissance manuel (1 fois) : muter `seed: ctx.sessionCode` → `seed: ctx.sessionTitle` dans `renderDerouleHtml` → relancer le test → Test 1 ROUGE → restaurer → vert. Documenter dans le SUMMARY.
- Aucune génération de masse, aucun appel Ollama/Claude réel lancé.
- Figeage produit (260618-rkj) préservé : aucune modification de `freeze-product-assets.ts` ni regénération du corps par session.
</verification>

<success_criteria>
- CAUSE 1 résolue : le tableau satisfaction formateur est seedé sur `sessionCode` → notes différentes entre 2 sessions du même produit.
- CAUSE 2 résolue : `generateRapportFormateur` reçoit un `SessionRapportCtx` (effectif + enseignes + dates + lieu) ancrant les narratifs sur des faits concrets distincts par session, dans le périmètre du programme (garde anti hors-sujet conservée).
- `persistDerouleSession` charge tous les participants éligibles + enseignes et transmet le contexte session.
- Pools conservés comme fallback non-régression.
- Test de puissance déterministe en place et prouvé (sessions différentes → rapport différent ; corps/programme identiques ; mutation → ROUGE).
- TS strict vert, conventions projet respectées (kebab-case, lib pur sans `@/lib/auth`).
</success_criteria>

<output>
After completion, create `.planning/quick/260618-skk-rapport-formateur-deroule-specifique-par/260618-skk-SUMMARY.md`
</output>
