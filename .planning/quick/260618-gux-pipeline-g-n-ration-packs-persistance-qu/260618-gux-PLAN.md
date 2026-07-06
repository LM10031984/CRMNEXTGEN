---
phase: 260618-gux
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/server/actions/convention-generator.ts
  - apps/web/src/server/actions/programme-generator.ts
  - apps/web/src/server/actions/generate-checklist-formation.ts
  - apps/web/src/lib/closure/generate-deroule-session.ts
  - apps/web/scripts/_gen-session-pack.ts
  - apps/web/src/lib/closure/__tests__/gen-session-pack-pure.test.ts
autonomous: true
requirements:
  - GUX-A   # Pack closure par participant via processClosureJobPayload en direct + gate froid
  - GUX-B   # Cœurs sans auth (convention/programme/checklist/déroulé-session) + persistance idempotente
  - GUX-C   # Sortie Drive arborescence validée, idempotente

must_haves:
  truths:
    - "Le script _gen-session-pack.ts s'exécute pour SES=CODE (ou liste) et persiste les docs d'une session terminée dans QualiOF (DB + MinIO) sans la queue Ollama"
    - "Le pack closure par participant (10 kinds, dont SATISFACTION_FROID conditionnel) est généré via processClosureJobPayload appelé EN DIRECT, AI_PROVIDER=openrouter (Claude)"
    - "SATISFACTION_FROID n'est PAS générée si la session est terminée depuis < 90 jours (isFroidEligible)"
    - "Convention (par participant), Programme (session), Checklist (session) et Déroulé pédagogique SESSION (doc racine) sont persistés via des CŒURS sans auth, idempotents"
    - "Les server actions wrappers existantes (generateConventionForParticipant, generateProgrammeForProduct/ForParticipant, generateChecklistForSession) compilent et conservent leur signature publique exacte (validateRequest préservé)"
    - "Les PDF persistés sont écrits dans le dossier Drive local synchronisé selon l'arborescence validée (racine session = Programme/Déroulé/Checklist ; sous-dossier par apprenant = Convention + docs pack)"
    - "L'écriture Drive est idempotente : les fichiers existants sont remplacés, jamais de '(1).pdf'"
    - "La génération PROD-0062 n'est PAS lancée par ce plan"
  artifacts:
    - path: "apps/web/src/server/actions/convention-generator.ts"
      provides: "Cœur generateConventionCore(tenantId, participantId, opts) sans auth + wrapper validateRequest inchangé en signature"
      contains: "generateConventionCore"
    - path: "apps/web/src/server/actions/programme-generator.ts"
      provides: "Cœur generateProgrammeForProductCore(tenantId, productId, opts) sans auth (utilisé par programme session via normalizedProgrammeMd) + wrappers inchangés"
      contains: "generateProgrammeForProductCore"
    - path: "apps/web/src/server/actions/generate-checklist-formation.ts"
      provides: "Cœur generateChecklistCore(tenantId, sessionId, opts) sans auth + wrapper inchangé"
      contains: "generateChecklistCore"
    - path: "apps/web/src/lib/closure/generate-deroule-session.ts"
      provides: "Cœur persistDerouleSession(tenantId, sessionId, opts) : génère + rend + upload MinIO + persiste PedagogicalAsset kind=DEROULE participantId=null via findFirst-then-update/create (PAS upsert compound key — NULL non géré par la clé composée Prisma/Postgres) → 1 seul asset déroulé-session, idempotent"
      exports: ["persistDerouleSession"]
    - path: "apps/web/scripts/_gen-session-pack.ts"
      provides: "Pipeline complet paramétrable SES=CODE|liste : pack closure direct + cœurs docs session + sortie Drive idempotente"
      min_lines: 120
    - path: "apps/web/src/lib/closure/__tests__/gen-session-pack-pure.test.ts"
      provides: "Tests purs : gate froid (kinds filtrés), helpers Drive (sanitize, noms FR, remplacement idempotent), arbo racine vs apprenant + test idempotence DB du déroulé session (Prisma mocké : 2× appels = 1 seul asset)"
      contains: "isFroidEligible"
  key_links:
    - from: "apps/web/scripts/_gen-session-pack.ts"
      to: "processClosureJobPayload"
      via: "import direct + appel par job (PAS enqueueClosureJob)"
      pattern: "processClosureJobPayload\\("
    - from: "apps/web/scripts/_gen-session-pack.ts"
      to: "ClosureBatch + ClosureJob"
      via: "prisma.closureBatch.create avec jobs nested (pattern _pack-temoin)"
      pattern: "closureBatch\\.create"
    - from: "apps/web/scripts/_gen-session-pack.ts"
      to: "MinIO → Drive"
      via: "downloadFile(DOCS_BUCKET, pdfUrl) puis fs.writeFileSync(driveDir, buf)"
      pattern: "downloadFile\\("
    - from: "apps/web/src/server/actions/convention-generator.ts (wrapper)"
      to: "generateConventionCore"
      via: "wrapper appelle le core APRÈS validateRequest"
      pattern: "generateConventionCore\\("
    - from: "apps/web/src/lib/closure/generate-deroule-session.ts"
      to: "PedagogicalAsset (kind=DEROULE, participantId=null)"
      via: "findFirst({where:{sessionId,participantId:null,kind:'DEROULE'}}) puis update({where:{id}}) sinon create — JAMAIS upsert compound key (NULL)"
      pattern: "findFirst\\("
---

<objective>
Construire un pipeline réutilisable `apps/web/scripts/_gen-session-pack.ts` qui, pour une session TERMINÉE (env `SES=CODE` ou liste), génère via Claude (openrouter), PERSISTE dans QualiOF (Document/PedagogicalAsset + MinIO, idempotent) et écrit les PDF dans le dossier Drive local synchronisé selon l'arborescence validée.

Différence avec le script témoin actuel (`_gen-temoin-cloud.ts`) : celui-ci génère tout en PDF /tmp SANS persistance. Le nouveau pipeline RÉUTILISE le worker (`processClosureJobPayload`) appelé EN DIRECT et des CŒURS sans auth extraits des server actions existantes, puis recopie les PDF depuis MinIO vers Drive.

Purpose : Laurent doit pouvoir lancer la génération de masse (PROD-0062 et autres sessions) avec persistance réelle + dépôt Drive, idempotent. CE PLAN CONSTRUIT et TESTE le pipeline. Il NE LANCE PAS la génération PROD-0062 (Laurent lancera après revue).

Output : 3 cœurs sans auth + 1 cœur déroulé-session + le script pipeline + tests purs (gate froid, helpers Drive). Branche cloud-migration, PAS de worktree.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Worker à réutiliser EN DIRECT (sans la queue)
@apps/web/src/lib/closure/worker.ts
@apps/web/src/lib/closure/types.ts

# Pattern ClosureBatch+ClosureJob + downloadFile MinIO
@apps/web/scripts/_pack-temoin-ses0032.ts

# Base de départ : génère tout via Claude SANS persistance (env cloud, KIND_FR, gate froid, conventionDate J-15)
@apps/web/scripts/_gen-temoin-cloud.ts
@apps/web/scripts/_complete-pack-ses0032.ts

# Server actions à refactorer en core + wrapper
@apps/web/src/server/actions/convention-generator.ts
@apps/web/src/server/actions/programme-generator.ts
@apps/web/src/server/actions/generate-checklist-formation.ts

# Helpers existants
@apps/web/src/lib/storage.ts
@apps/web/src/lib/closure/satisfaction-froid-eligibility.ts
@apps/web/src/lib/format-location.ts
@apps/web/src/lib/business-days.ts

# Test idempotence existant à NE PAS casser (s'appuie sur deleteMany inconditionnel)
@apps/web/src/server/actions/__tests__/generators-idempotent.test.ts

<interfaces>
<!-- Contrats clés — l'exécuteur les utilise directement, pas d'exploration. -->

Worker — réutiliser EN DIRECT (apps/web/src/lib/closure/worker.ts) :
```typescript
export async function processClosureJobPayload(
  payload: ClosureJobPayload,   // { jobId, batchId, tenantId, sessionId, participantId, kind }
  opts: ProcessJobOptions,      // { attemptsMade, maxAttempts, markProcessing? }
): Promise<void>;
// → render + upload MinIO + persistance idempotente Document(ATTESTATION/CERTIFICAT) | PedagogicalAsset(reste)
//   + maj ClosureJob.status='DONE' + documentId|pedagogicalAssetId. THROW si échec.
```

Types (apps/web/src/lib/closure/types.ts) :
```typescript
// CLOSURE_DOC_KINDS = 9 kinds par-participant (DEROULE_PEDA EXCLU, c'est un doc session) :
// ATTESTATION, CERTIFICAT, QCM, GRILLE_OBS, ANALYSE_BESOIN, POSITIONNEMENT,
// SATISFACTION_CHAUD, SATISFACTION_FROID, EMARGEMENT
export interface ClosureJobPayload { jobId; batchId; tenantId; sessionId; participantId; kind: ClosureDocKind; }
```

Storage (apps/web/src/lib/storage.ts) :
```typescript
export const DOCS_BUCKET: string;
export function uploadFile(bucket, key, body, contentType?): Promise<{key;bucket;size}>;
export function downloadFile(bucket: string, key: string): Promise<Buffer>; // récupère PDF persisté pour Drive
```

Gate froid (apps/web/src/lib/closure/satisfaction-froid-eligibility.ts) :
```typescript
export function isFroidEligible(sessionEndDate: Date, now: Date): boolean; // true ssi ≥90j calendaires
```

Helpers (déjà existants, à réutiliser) :
```typescript
formatLocation(location): string | null;                 // lib/format-location.ts
subtractBusinessDaysISO(startIso, n): string;             // lib/business-days.ts (conventionDate J-15 ouvrés)
generateNormalizedProgramme(...): Promise<string | null>; // lib/closure/ollama-generators.ts (source unique prog+conv)
```

Prisma — stockage déroulé SESSION (packages/db/prisma/schema.prisma) :
```prisma
model PedagogicalAsset {
  id            String   @id @default(cuid())
  sessionId     String
  kind          PedagogicalKind   // DEROULE = déroulé pédagogique
  participantId String?           // null = niveau SESSION
  @@unique([sessionId, participantId, kind])  // ⚠ Postgres : NULL distinct → ne contraint PAS les lignes participantId=null
}
// (le worker mappe déjà DEROULE_PEDA → PedagogicalKind.DEROULE)
```
⚠ PIÈGE IDEMPOTENCE : l'index unique composé `@@unique([sessionId, participantId, kind])` ne déclenche PAS NULLS NOT DISTINCT en Postgres. Deux lignes (sessionId=X, participantId=NULL, kind=DEROULE) NE violent PAS la contrainte → doublon à chaque relance. De plus, `prisma.pedagogicalAsset.upsert({ where: { sessionId_participantId_kind: { ..., participantId: null } } })` est INVALIDE (le champ `where` typé string n'accepte pas `null`). → NE PAS utiliser upsert sur clé composée pour participantId=null. Utiliser findFirst-then-update/create (cf Task 1 §4).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extraire les CŒURS sans auth (convention / programme / checklist) + cœur déroulé SESSION persistant</name>
  <files>apps/web/src/server/actions/convention-generator.ts, apps/web/src/server/actions/programme-generator.ts, apps/web/src/server/actions/generate-checklist-formation.ts, apps/web/src/lib/closure/generate-deroule-session.ts</files>
  <action>
Pattern « core + wrapper » : pour chaque server action, extraire la logique render+MinIO+persist (Document idempotent) dans une fonction `core` qui prend `tenantId` (et les options existantes) en paramètre AU LIEU de lire `validateRequest()`. La server action existante devient un mince wrapper qui appelle `validateRequest()` PUIS le core avec `user.tenantId`. **La signature publique exportée de chaque server action DOIT rester identique** (de nombreux consommateurs : dispatch-generate-doc, closure-pack, qualiopi-matrix, sessions, participant-actions-menu, generate-*-button, prepare-training — cf STATE). Le fichier garde `'use server'`. Les cœurs ne sont PAS marqués `'use server'` mais exportés depuis le même fichier (fonctions async non-action). NE PAS toucher la logique métier (J-15 ouvrés, deleteMany inconditionnel convention, find-or-create programme, PRNG checklist seedé) — uniquement déplacer le corps après le point validateRequest.

1) convention-generator.ts :
   - Créer `export async function generateConventionCore(tenantId: string, participantId: string, options?: { force?: boolean })` contenant TOUT le corps actuel à partir du `deleteMany` (l.41) jusqu'au `return`, en remplaçant chaque `user.tenantId` par `tenantId`. NE PAS appeler revalidatePath dans le core (le déplacer dans le wrapper). Conserver le `deleteMany` inconditionnel (le test generators-idempotent.test.ts en dépend).
   - `generateConventionForParticipant` devient : `const { user } = await validateRequest(); if (!user) return { ok:false, error:'Non authentifié' }; const r = await generateConventionCore(user.tenantId, participantId, options); revalidatePath(...session); revalidatePath(...apprenant si dispo); return r;`. ATTENTION : le wrapper a besoin du person.id pour revalidatePath apprenant ; soit le core retourne aussi `personId`, soit le wrapper refait un findFirst léger. Préférer : core retourne `{ ok, documentId?, error?, sessionId?, personId? }` et le wrapper revalide depuis ces champs. Ne PAS changer le shape vu par les appelants existants (ils lisent `ok`/`documentId`/`error` ; champs en plus = non-breaking).

2) programme-generator.ts :
   - Créer `export async function generateProgrammeForProductCore(tenantId: string, productId: string, opts?: { force?: boolean; programmeMdOverride?: string })`. Reprendre le corps de `generateProgrammeForProduct` (l.179+) en remplaçant `user.tenantId`. AJOUT IMPORTANT : si `opts.programmeMdOverride` est fourni, l'utiliser comme `produitProgrammeMd` au lieu de `product.programMd` (pour brancher `generateNormalizedProgramme` côté script — source unique programme+convention). Pas de revalidatePath dans le core.
   - `generateProgrammeForProduct` wrapper : validateRequest → generateProgrammeForProductCore(user.tenantId, productId, opts) → revalidatePath(`/app/produits/${productId}`) → return.
   - `generateProgrammeForParticipant` reste un wrapper inchangé (résout productId puis appelle generateProgrammeForProduct). Signature identique.

3) generate-checklist-formation.ts :
   - Créer `export async function generateChecklistCore(tenantId: string, sessionId: string, opts?: { force?: boolean })` avec le corps actuel (l.96+, garde le find-or-create + makeSeededRandom + buildZones). Pas de revalidatePath dans le core.
   - `generateChecklistForSession` wrapper : validateRequest → generateChecklistCore → revalidatePath → return.

4) Nouveau fichier `apps/web/src/lib/closure/generate-deroule-session.ts` (PAS 'use server', module lib pur côté serveur) :
   - `export async function persistDerouleSession(tenantId: string, sessionId: string, opts?: { force?: boolean }): Promise<{ ok: boolean; assetId?: string; pdfUrl?: string; error?: string }>`.
   - Logique (s'inspirer de _gen-temoin-cloud.ts l.144-153 et _complete-pack-ses0032.ts l.38-48) : charger session+product+trainers+1er participant (buildClosureContextForParticipant a besoin d'un participantId pour le ctx de rendu du déroulé). Appeler `generateDerouleContent(formation, 'PedagogicalAsset', null, tenantId)`, rendre via `renderDerouleHtml(ctx, deroule)` → `renderHtmlToPdfWeasy`. hash sha256, key MinIO `deroules/${session.code}/${hash.slice(0,8)}.pdf`, uploadFile.
   - **Persistance idempotente — MÉCANISME OBLIGATOIRE (findFirst-then-update/create, PAS upsert compound key)** :
     - Le déroulé session = `PedagogicalAsset` avec `participantId: null` et `kind: 'DEROULE'` (niveau SESSION, cohérent avec le worker qui mappe DEROULE_PEDA → PedagogicalKind.DEROULE).
     - ⚠ NE PAS utiliser `upsert({ where: { sessionId_participantId_kind: { sessionId, participantId: null, kind } } })`. Deux raisons : (a) en Postgres l'index unique composé ne déclenche pas NULLS NOT DISTINCT → la contrainte n'empêche PAS deux lignes participantId=NULL → doublon ; (b) le `where` composé Prisma typé string REFUSE `null` (erreur de type / requête invalide).
     - Mécanisme correct :
       ```typescript
       const existing = await prisma.pedagogicalAsset.findFirst({
         where: { sessionId, participantId: null, kind: 'DEROULE' },
         select: { id: true, fileUrl: true /* ou champ pdf existant */ },
       });
       if (existing && !opts?.force) {
         return { ok: true, assetId: existing.id, pdfUrl: existing.fileUrl ?? undefined };
       }
       const asset = existing
         ? await prisma.pedagogicalAsset.update({ where: { id: existing.id }, data: { /* fileUrl/hash/etc maj */ } })
         : await prisma.pedagogicalAsset.create({ data: { tenantId, sessionId, participantId: null, kind: 'DEROULE', /* fileUrl, etc */ } });
       return { ok: true, assetId: asset.id, pdfUrl: /* ... */ };
       ```
       (Adapter les noms de colonnes PDF/hash à ceux réellement présents dans le modèle PedagogicalAsset.)
     - Garantie : appelé 2× sur la même session, ce code produit UN SEUL asset (le 2e appel trouve l'existant → update si force, sinon réutilise). En mode non-force, si l'asset existe déjà, le réutiliser SANS régénérer le LLM (court-circuit après findFirst).
   - Si LLM renvoie null → `{ ok:false, error:'déroulé contenu null (LLM)' }` (pas de stub silencieux pour un doc Qualiopi).
  </action>
  <verify>
    <automated>cd "/Users/laurentmarx/Documents/CRM Next gen/files" && pnpm --filter @qualiof/web exec tsc --noEmit 2>&1 | grep -v "redirect-308.test.ts\|sessions.ts:804" | grep -E "error TS" | head -20; echo "EXIT_TSC_FILTERED=$?"</automated>
  </verify>
  <done>
Les 3 cœurs (generateConventionCore, generateProgrammeForProductCore, generateChecklistCore) + persistDerouleSession sont exportés et compilent. Les 4 server actions wrappers conservent leur signature publique (validateRequest préservé, shape { ok, documentId?, error? } intact). tsc --noEmit ne produit AUCUNE nouvelle erreur (hors WIP toléré redirect-308.test.ts ×6 + sessions.ts:804). Le déroulé session persiste en PedagogicalAsset kind=DEROULE participantId=null via findFirst-then-update/create (PAS upsert compound key) → idempotent, 1 SEUL asset déroulé-session quel que soit le nombre de relances.
  </done>
</task>

<task type="auto">
  <name>Task 2: Script pipeline _gen-session-pack.ts (pack closure direct + cœurs docs session + sortie Drive idempotente)</name>
  <files>apps/web/scripts/_gen-session-pack.ts</files>
  <action>
Créer `apps/web/scripts/_gen-session-pack.ts` paramétrable. S'inspirer fortement de `_gen-temoin-cloud.ts` (structure, KIND_FR, gate froid, conventionDate) et `_pack-temoin-ses0032.ts` (ClosureBatch+ClosureJob+downloadFile) mais avec PERSISTANCE réelle + sortie Drive.

STRUCTURE :
1) En tête (AVANT tout import LLM) : copier le bloc env cloud de _gen-temoin-cloud.ts l.9-16 (AI_PROVIDER=openrouter + clés depuis ../../.env.local.cloud-backup OPENROUTER_API_KEY/MODEL_FAST/MODEL_QUALITY).
2) Params : `const CODES = (process.env.SES ?? '').split(/[\s,]+/).filter(Boolean);` — supporte 1 code ou une liste. Si vide → throw message clair. `const DRY_RUN = process.env.DRY_RUN === '1';` (optionnel : si DRY_RUN, ne PAS écrire dans Drive, juste persister DB/MinIO et logger l'arbo prévue). `const DRIVE_BASE = process.env.DRIVE_BASE ?? '<chemin Drive fourni dans requirements>';` (la constante exacte du chemin Google Drive du brief).
3) Pour CHAQUE code de session (boucle) :
   a) Charger la session (même include que _gen-temoin-cloud.ts l.54-68 : location, product, trainers.person, participants enrollmentStatus IN PRE_ENROLLED/CONFIRMED/ATTENDED + person.legalLinks.organization + sponsorOrg).
   b) Garde : si la session n'est pas terminée (endDate > now) → logger un warning et **continuer quand même** la persistance (le brief dit « session TERMINÉE » mais le pipeline doit rester robuste ; ne PAS bloquer). Le gate froid s'applique de toute façon.
   c) **Pack closure par participant via processClosureJobPayload EN DIRECT** :
      - froidEligible = isFroidEligible(session.endDate, new Date()). kinds = CLOSURE_DOC_KINDS, filtrer SATISFACTION_FROID si !froidEligible (NE PAS créer le job).
      - Créer ClosureBatch + ClosureJob (nested create) comme _pack-temoin l.30-37, MAIS totalDocs = kinds.length × parts.length (avec kinds filtré).
      - Pour chaque job : appeler `await processClosureJobPayload({ jobId: j.id, batchId, tenantId, sessionId, participantId: j.participantId, kind: j.kind }, { attemptsMade: 0, maxAttempts: 1, markProcessing: true })`. **PAS** d'enqueueClosureJob (le worker Ollama ne doit pas prendre les jobs). try/catch par job (le worker throw en cas d'échec) → logger ✗ et continuer (défensif, comme le témoin).
   d) **Docs niveau session via les CŒURS** :
      - Programme SESSION : `const normalizedProgrammeMd = (await generateNormalizedProgramme(p.programMd ?? '', objectives, p.durationHours, p.title, tenantId)) ?? (p.programMd ?? '')` puis `await generateProgrammeForProductCore(tenantId, p.id, { force: true, programmeMdOverride: normalizedProgrammeMd })`. (Source unique programme+convention — réutilise le normalisé.)
      - Convention par participant : pour chaque part, `await generateConventionCore(tenantId, part.id)`. (Le core utilise déjà conventionDate J-15 ouvrés.)
      - Checklist SESSION : `await generateChecklistCore(tenantId, sessionId, { force: true })`.
      - Déroulé SESSION : `await persistDerouleSession(tenantId, sessionId, { force: true })`.
      - Récupérer le pdfUrl retourné par chaque core (documentId/pdfUrl/assetId) pour la copie Drive.
   e) **Sortie Drive (sauf DRY_RUN)** :
      - Dossier session : `${DRIVE_BASE}/${sanitize(product.title)} (${formatDateFR(session.startDate)})` où formatDateFR = JJ-MM-AAAA. mkdir récursif.
      - RACINE du dossier session : Programme.pdf, Déroulé pédagogique.pdf, Checklist de préparation.pdf (récupérés depuis MinIO via downloadFile(DOCS_BUCKET, pdfUrl) à partir des pdfUrl retournés par les cores ; pour le déroulé : pdfUrl de l'asset). JAMAIS Programme/Déroulé chez l'apprenant.
      - Sous-dossier par apprenant : `${sessionDir}/${sanitize(`${prénom} ${nom}`)}` → Convention de formation.pdf + les docs du pack closure (noms FR via KIND_FR map identique à _gen-temoin-cloud.ts l.35-45). Satisfaction à froid.pdf SEULEMENT si froidEligible.
      - Pour récupérer le PDF de chaque doc pack : requêter les ClosureJob du batch (select kind, documentId, pedagogicalAssetId) puis résoudre pdfUrl via Document/PedagogicalAsset (pattern _pack-temoin l.67-70), downloadFile, writeFileSync.
      - **Idempotence Drive** : writeFileSync écrase par défaut → JAMAIS de '(1).pdf'. Lieu via formatLocation pour tout libellé de lieu si besoin.
   f) Log récap par session : OK / stub / échec + chemin Drive.
4) Fin : prisma.$disconnect().

Helpers à définir dans le script : `sanitize` (cf _gen-temoin-cloud.ts l.52 : retire / \\ : * ? " < > |), `formatDateFR(d: Date): string` → `JJ-MM-AAAA` (UTC, padStart). KIND_FR map (copier l.35-45). Garder un style défensif (try/catch par doc, on continue si échec).

NE PAS lancer PROD-0062 (le script attend SES en env, ne hardcode aucun produit/session).
  </action>
  <verify>
    <automated>cd "/Users/laurentmarx/Documents/CRM Next gen/files" && pnpm --filter @qualiof/web exec tsc --noEmit 2>&1 | grep -v "redirect-308.test.ts\|sessions.ts:804" | grep -E "error TS" | head -20; echo "DONE_TSC"; grep -c "processClosureJobPayload\|enqueueClosureJob\|downloadFile\|generateConventionCore\|generateProgrammeForProductCore\|generateChecklistCore\|persistDerouleSession\|isFroidEligible" apps/web/scripts/_gen-session-pack.ts</automated>
  </verify>
  <done>
_gen-session-pack.ts compile (tsc clean hors WIP toléré). Le script : (1) lit SES en env (1 code ou liste), throw si absent ; (2) appelle processClosureJobPayload EN DIRECT (grep confirme present + enqueueClosureJob ABSENT) ; (3) gate froid via isFroidEligible (SATISFACTION_FROID non créée si <90j) ; (4) appelle les 4 cœurs (convention/programme-core/checklist-core/persistDerouleSession) ; (5) recopie les PDF depuis MinIO (downloadFile) vers Drive selon l'arbo validée (racine = Programme/Déroulé/Checklist, sous-dossier apprenant = Convention + pack), writeFileSync écrasant (idempotent). PROD-0062 jamais hardcodé.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Tests purs (gate froid + helpers Drive) + test idempotence DB déroulé session + smoke pipeline</name>
  <files>apps/web/src/lib/closure/__tests__/gen-session-pack-pure.test.ts</files>
  <behavior>
    - Test 1 (gate froid) : isFroidEligible(endDate, now) → false si endDate à -89j, true à -90j et -120j. La liste kinds filtrée NE contient PAS SATISFACTION_FROID quand !froidEligible, la contient sinon. Test de puissance : si on retire le filtre `.filter(k => k !== 'SATISFACTION_FROID')`, le test vire ROUGE.
    - Test 2 (sanitize) : remplace / \\ : * ? " < > | par '-', collapse espaces. Ex `Vente & "négo"/2026` → pas de caractère interdit.
    - Test 3 (formatDateFR) : Date 2026-03-09 → '09-03-2026' (padStart, UTC, pas de décalage de fuseau).
    - Test 4 (arbo) : un helper pur `buildSessionPaths(driveBase, productTitle, startDate, [{prenom,nom}])` retourne { rootDir, rootFiles: ['Programme.pdf','Déroulé pédagogique.pdf','Checklist de préparation.pdf'], learnerDirs } — Programme/Déroulé NE figurent PAS dans learnerDirs (jamais chez l'apprenant). Idempotence : appeler 2× retourne les MÊMES chemins (déterministe, pas de suffixe (1)).
    - Test 5 (idempotence DB déroulé session — Prisma mocké) : avec un `prisma.pedagogicalAsset` mocké, appeler `persistDerouleSession` 2× sur la même session. 1er appel : findFirst → null → `create` appelé 1×, PAS d'update. 2e appel (force) : findFirst → renvoie l'asset existant → `update({where:{id}})` appelé, `create` PAS rappelé. Bilan : `create` appelé EXACTEMENT 1× sur les 2 appels → 1 seul asset. Mocker aussi le LLM/render/upload pour isoler la branche persistance. Test de puissance : si on remplace la branche par un `create` inconditionnel, le 2e appel rappelle `create` → 2 assets → test ROUGE.
  </behavior>
  <action>
Extraire dans le script (ou dans un petit module pur importable, ex `apps/web/scripts/gen-session-pack-helpers.ts` si plus propre — au choix de l'exécuteur, garder testable sans IO) les helpers PURS : `sanitize`, `formatDateFR`, `buildSessionPaths` (calcul des chemins racine + sous-dossiers apprenant, SANS aucun fs/prisma), et la fonction de filtrage des kinds selon froidEligible. Le module pur ne doit RIEN importer qui déclenche le LLM ou Prisma (sinon le test charge tout le pipeline). Écrire les tests RED d'abord (comportements ci-dessus), puis brancher les helpers depuis le script principal (le script importe ces helpers purs).

Pour le Test 5 (idempotence DB déroulé session) : mocker `@qualiof/db` (prisma.pedagogicalAsset.findFirst / create / update) + les dépendances IO/LLM de `generate-deroule-session.ts` (generateDerouleContent, renderDerouleHtml/renderHtmlToPdfWeasy, uploadFile) via `vi.mock`, de sorte que SEULE la branche persistance soit exercée. Asserter que `create` n'est appelé qu'UNE fois sur 2 invocations de `persistDerouleSession` (1ère = create, 2e = update car findFirst renvoie l'existant). Ce test garantit que le mécanisme findFirst-then-update/create (et non un create inconditionnel ou un upsert compound key sur NULL) tient l'idempotence DB du déroulé session.

Vérifier que la suite Vitest complète reste verte. Lancer un smoke tsc final. NE PAS exécuter le script contre une vraie session dans ce plan (pas de génération PROD-0062 ni d'écriture Drive réelle ici — la validation E2E sur 1 participant est laissée à Laurent / optionnelle).
  </action>
  <verify>
    <automated>cd "/Users/laurentmarx/Documents/CRM Next gen/files" && pnpm --filter @qualiof/web exec vitest run gen-session-pack-pure generators-idempotent 2>&1 | tail -25</automated>
  </verify>
  <done>
Tests purs verts (gate froid filtre SATISFACTION_FROID, sanitize, formatDateFR JJ-MM-AAAA, buildSessionPaths racine vs apprenant + idempotence). Test idempotence DB déroulé session vert : `persistDerouleSession` appelé 2× → `create` appelé EXACTEMENT 1× (2e appel = update via findFirst), prouvant qu'UN seul asset déroulé-session est créé (mécanisme findFirst-then-update/create, pas upsert compound key NULL). Test de puissance confirmé sur le gate froid (retrait du filtre → rouge) ET sur l'idempotence DB (create inconditionnel → 2 assets → rouge). generators-idempotent.test.ts TOUJOURS vert (les wrappers préservent le deleteMany inconditionnel via le core). tsc clean hors WIP toléré.
  </done>
</task>

</tasks>

<verification>
- `pnpm --filter @qualiof/web exec tsc --noEmit` : 0 nouvelle erreur (hors WIP toléré redirect-308.test.ts ×6 + sessions.ts:804).
- `pnpm --filter @qualiof/web exec vitest run` : suite verte, dont generators-idempotent.test.ts (non régressé) et le test d'idempotence DB du déroulé session.
- grep : `processClosureJobPayload` présent dans le script, `enqueueClosureJob` ABSENT.
- Les 4 server actions exportent toujours leur signature publique d'origine (consommateurs non cassés).
- Le déroulé SESSION persiste en PedagogicalAsset kind=DEROULE participantId=null, idempotent via findFirst-then-update/create (PAS upsert compound key sur NULL) → 1 seul asset quel que soit le nombre de relances.
- Aucune génération PROD-0062 lancée. Aucun fichier WIP de Laurent touché (ROADMAP/STATE/produits[id]/edit-product-button/session-location-picker/crud-edits/tsbuildinfo). Pas de réintroduction colonne formateur sur attestation/certificat. PAS de migration de schéma (idempotence purement applicative).
</verification>

<success_criteria>
- Pipeline `_gen-session-pack.ts` opérationnel et paramétrable (SES=CODE|liste, DRY_RUN optionnel).
- Pack closure par participant via processClosureJobPayload EN DIRECT (Claude/openrouter), gate froid respecté.
- 4 cœurs sans auth réutilisables ; wrappers server actions intacts et fonctionnels.
- Persistance idempotente DB (Document/PedagogicalAsset) + MinIO, déroulé session inclus via findFirst-then-update/create (1 seul asset, pas de doublon en relance, pas d'upsert compound key sur NULL).
- Sortie Drive arborescence validée + idempotente (remplacement, pas de '(1).pdf').
- Commits atomiques sur cloud-migration. Pas de worktree. PROD-0062 NON lancé. Pas de migration de schéma.
</success_criteria>

<output>
After completion, create `.planning/quick/260618-gux-pipeline-g-n-ration-packs-persistance-qu/260618-gux-SUMMARY.md`
</output>
