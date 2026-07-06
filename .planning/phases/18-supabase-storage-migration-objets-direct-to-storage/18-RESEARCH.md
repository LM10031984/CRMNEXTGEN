# Phase 18: Supabase Storage (migration objets + direct-to-storage) - Research

**Researched:** 2026-07-04
**Domain:** Object storage migration (MinIO/S3 → Supabase Storage) + direct-to-storage browser upload bypassing Vercel 4.5 MB body cap
**Confidence:** HIGH

## Summary

Cette phase n'est PAS une réécriture du stockage : l'adaptateur bi-provider `apps/web/src/lib/storage.ts` existe déjà et le switch applicatif est un simple `STORAGE_PROVIDER=supabase`. `ensureBucket` crée déjà les buckets Supabase en `public: false` avec `fileSizeLimit: 50 MiB`, `createSignedDownloadUrl` (Supabase natif, TTL 600 s) est implémenté. Les ~30 call sites passent tous par `uploadFile`/`downloadFile`. Le travail réel se concentre sur trois chantiers distincts : (1) **STOR-01** — valider que le bucket privé + les signed URLs fonctionnent réellement (accès non-signé refusé), (2) **STOR-02** — un script de migration idempotent DRY→WRITE qui copie chaque objet MinIO vers Supabase et vérifie 0 lien mort sur trois tables, (3) **STOR-03** — refonte des deux chemins d'upload CNI/RIB/CFP en **direct-to-storage** (le navigateur uploade directement vers Supabase via `createSignedUploadUrl` + `uploadToSignedUrl`), ce qui contourne le cap 4,5 MB body de Vercel.

Le point technique le plus délicat est le direct-to-storage. Aujourd'hui les deux chemins (formulaire public `/p/[token]` en base64, et admin `uploadApprenantDocs` en FormData) envoient le fichier À TRAVERS le serveur Next → cap 4,5 MB Vercel = échec 413 garanti sur une photo smartphone de 10 MB. La solution Supabase native est `createSignedUploadUrl(path)` côté serveur (service_role) → le client reçoit un token → `uploadToSignedUrl(path, token, file)` envoie DIRECTEMENT vers Supabase sans passer par Vercel. Le serveur est ensuite notifié (server action de confirmation) pour déclencher l'OCR.

**Primary recommendation :** Réutiliser `@supabase/supabase-js@2.107.0` déjà installé. STOR-01 = tests de signed URL. STOR-02 = script `apps/web/scripts/` calqué sur `calendar-backfill.ts` (DRY par défaut, `WRITE=1`, séquentiel, try/catch par objet, rapport daté). STOR-03 = pattern `createSignedUploadUrl` (serveur) + `uploadToSignedUrl` (client) + server action de confirmation qui recâble l'OCR. Les clés MinIO existantes sont déjà S3-safe (pas de refonte de nommage nécessaire, juste une vérification défensive).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STOR-01 | Buckets Supabase Storage privés opérationnels, `STORAGE_PROVIDER=supabase` testé, signed URLs vérifiées (TTL minutes) | `ensureBucket` crée déjà `public:false` + `fileSizeLimit:50MiB` (storage.ts:74-84) ; `createSignedDownloadUrl` natif Supabase TTL 600s (storage.ts:159-177). Reste : test qu'un accès non-signé au bucket privé est REFUSÉ (public URL → 400/403) et qu'une signed URL fraîche donne accès. Voir "Validation Architecture". |
| STOR-02 | Objets MinIO migrés (script idempotent DRY→WRITE), 0 lien mort sur `Person.ribKey` / `Document.pdfUrl` / `PedagogicalAsset.pdfUrl` | Pattern DRY→WRITE éprouvé (`calendar-backfill.ts`). Copie = `downloadFile(minio)` → `uploadFile(supabase, upsert:true)`. Vérif = pour chaque clé en base, `HEAD`/`getPublicUrl+exists` sur Supabase. Clés déjà S3-safe. Table de correspondance : identité 1:1 (mêmes clés), pas de remapping requis — voir "Runtime State Inventory" et "Common Pitfalls". |
| STOR-03 | Upload direct-to-storage CNI/RIB (signed upload URL côté client, contourne cap 4,5 MB Vercel), preuve : photo 10 MB + OCR déclenché | `createSignedUploadUrl` (serveur service_role) → `uploadToSignedUrl` (navigateur, direct vers Supabase). Recâblage OCR sur server action de confirmation post-upload. Downscale image serveur avant OCR (photo 10-50 MB dépasse limites vision). Voir "Code Examples" et "Architecture Patterns". |
</phase_requirements>

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 — Big-bang contrôlé :** migrer 100 % des objets MinIO→Supabase (script idempotent, mode DRY par défaut, WRITE explicite), vérifier 0 lien mort, PUIS switcher `STORAGE_PROVIDER=supabase`. Pas de double-lecture/fallback transitoire — tant que la vérif ne passe pas, l'app reste sur MinIO.
- **D-02 — Rétention MinIO :** MinIO reste intact (volume Docker conservé) jusqu'à validation manuelle explicite de Laurent. Sa suppression est une étape séparée hors phase, jamais automatique (règle « destructif = étape séparée », pg_dump avant tout WRITE destructif).
- **D-03 — Rapport archivé :** le script de vérification écrit un rapport daté dans un fichier (ex. `backups/` ou `.planning/audit/`) : total objets migrés par bucket, liens vérifiés par table, liste des orphelins. Trace réutilisable en audit Qualiopi.
- **D-04 — Orphelins (clé en base sans objet MinIO) :** listés dans le rapport, AUCUNE action automatique. Décision au cas par cas par Laurent. La bascule reste possible si les orphelins sont assumés.
- **D-05 — Limite de taille : 50 Mo par fichier** (alignée sur le `fileSizeLimit` du bucket). Remplace la limite actuelle de 10 Mo dans les 2 chemins d'upload.
- **D-06 — Progression :** barre de progression réelle (pourcentage par fichier) pendant l'upload — critique sur réseau mobile pour le formulaire public.
- **D-07 — Échec d'upload :** 1 retry automatique silencieux ; si nouvel échec, message clair en français + bouton « Réessayer », sans perdre les autres champs du formulaire.
- **D-08 — Périmètre : formulaire public `/p/[token]` ET écran admin** (`uploadApprenantDocs`) — les deux passent par Vercel donc subissent le cap 4,5 Mo. Même mécanique, composant partagé si possible.
- **D-09 — TTL court uniforme : 10 minutes** (`createSignedDownloadUrl` `expiresInSec = 600`), régénérée à chaque accès. Les documents restent cliquables à tout moment via l'app (lien frais à chaque clic) — seul le lien brut copié expire. Conforme RGPD et critère de succès #1.

### Claude's Discretion
- Nommage des clés Supabase et table de correspondance ancienne→nouvelle clé (contraintes Supabase ≠ MinIO : `//`, caractères, préfixes) — flag [VERIFY] du roadmap.
- Modèle d'accès privé : service_role côté serveur (pas de policy S3 IAM JSON) ; RLS/policies bucket au choix du planner.
- Downscale/compression des images côté serveur avant OCR : une photo de 30-50 Mo dépasse les limites des modèles vision — l'OCR doit recevoir une image réduite, invisible pour l'apprenant.
- Mécanique de notification serveur post-upload (comment le serveur apprend que l'upload direct est terminé et déclenche l'OCR) : callback server action, polling, ou confirmation client.
- Servir les documents : redirect vers signed URL vs proxy — le cap ~4,5 Mo s'applique AUSSI aux réponses Vercel, le redirect 302 vers signed URL est probablement nécessaire pour les gros PDF.
- Aperçus CNI/RIB : `unoptimized`, jamais `next/image` sur PII.

### Deferred Ideas (OUT OF SCOPE)
- **Export des dossiers sessions vers le Drive entreprise de Laurent** (nouvelle capacité, sa propre phase) : synchroniser les documents vers Google Drive, choix de l'emplacement dans les paramètres, arborescence par session datée → sous-dossiers apprenants + programme/déroulé/checklist à la racine. À ajouter au roadmap (`/gsd:add-phase` ou backlog). NE PAS traiter dans Phase 18.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- **Multi-tenant obligatoire :** toute nouvelle server action DOIT scope par `user.tenantId`. Les clés d'objet sont préfixées `tenantId` (`apprenants/{tenantId}/{uuid}/{kind}.{ext}`). La server action `createSignedUploadUrl` doit valider le tenant AVANT de générer le token.
- **RGPD PII :** `Person.ribKey` = PII, bucket privé, signed URLs. Données sensibles séparées dans `SensitiveData`. Jamais de PII dans un bucket public.
- **GSD workflow :** aucune édition hors `/gsd:execute-phase`.
- **Routes :** ajouter un redirect 308 dans `next.config.mjs` pour toute nouvelle route (non applicable ici — pas de nouvelle route utilisateur, mais possible route API interne).
- **Server actions :** retour `{ ok, error }` discriminé, erreurs en français.
- **Tech stack figé :** Next.js 14.2.21 App Router + Prisma 5.22 + Zod 3.23. Ne pas introduire de nouvelle lib UI. `next/image` INTERDIT sur PII (utiliser `<img unoptimized>` équivalent — balise `<img>` native).
- **`packages/shared/src/env.ts`** = single source of truth des clés. `STORAGE_PROVIDER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` déjà déclarées et fail-loud (Phase 17). Toute nouvelle clé (ex. `NEXT_PUBLIC_SUPABASE_URL` si upload client) DOIT y passer + `turbo.json` globalEnv.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.107.0 (déjà installé) | Client Storage (buckets, signed URLs, upload/download) | Déjà consommé par `storage.ts`. Aucune nouvelle dépendance. |
| `@aws-sdk/client-s3` | 3.1038.0 (déjà installé) | Lecture MinIO pendant la migration (source) | Adaptateur MinIO existant, utilisé par le script de migration côté source. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sharp` | — (À VÉRIFIER si présent) | Downscale image serveur avant OCR (D-discrétion) | Si une photo 10-50 MB doit être réduite avant vision. **`sharp` n'est PAS dans package.json** (grep négatif) — le planner doit choisir : ajouter `sharp`, OU réutiliser un downscale existant, OU laisser l'OCR gérer (mais vision a des limites de taille). Voir Open Questions. |
| `tsx` | 4.21.0 (déjà installé) | Runner du script de migration | Pattern `calendar-backfill.ts`. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `createSignedUploadUrl` + `uploadToSignedUrl` (standard, ≤ recommandé 6 MB mais accepte jusqu'à 5 GB) | TUS resumable upload (`/storage/v1/upload/resumable` + Uppy/tus-js-client) | TUS = plus fiable > 6 MB, reprise sur coupure réseau, chunks. MAIS ajoute une dépendance client (Uppy/tus-js-client) et de la complexité. Pour une photo CNI 10-50 MB sur réseau mobile, TUS est techniquement plus robuste ; le signed upload standard suffit fonctionnellement (jusqu'à 5 GB) mais sans reprise sur coupure. **Recommandation : signed upload standard d'abord (D-07 couvre l'échec par 1 retry + bouton réessayer, aligné sur la simplicité), TUS = évolution si les échecs réseau mobile s'avèrent fréquents.** Le retry silencieux D-07 compense l'absence de reprise chunk. |
| Redirect 302 vers signed URL pour servir les docs | Proxy `downloadFile` (actuel) | Le proxy fait transiter le fichier par Vercel → cap 4,5 MB sur la RÉPONSE aussi → gros PDF cassés en prod. Le redirect 302 vers signed URL (D-discrétion) contourne ce cap. |

**Installation :** aucune installation requise pour le cœur. Si downscale retenu : `pnpm add sharp -F @qualiof/web` (à trancher au plan).

**Version verification :**
```bash
node -e "console.log(require('./apps/web/node_modules/@supabase/supabase-js/package.json').version)"  # → 2.107.0 (vérifié 2026-07-04)
```
`@supabase/supabase-js@2.107.0` supporte `createSignedUploadUrl` (depuis v2.x storage-v3, avril 2023) et `uploadToSignedUrl` — vérifié présent dans l'API.

## Architecture Patterns

### Recommended Project Structure
```
apps/web/scripts/
└── migrate-storage.ts          # NOUVEAU — DRY→WRITE, calqué sur calendar-backfill.ts

apps/web/src/lib/
└── storage.ts                  # ÉTENDRE — ajouter createSignedUploadUrl + objectExists (Supabase)

apps/web/src/server/actions/
├── upload-apprenant-docs.ts    # REFONTE — devient "générer signed upload URL" + "confirmer"
├── preinscription-public.ts    # REFONTE — idem pour /p/[token]
└── (nouveau) storage-upload.ts # partagé si mutualisation (D-08 "composant partagé si possible")

apps/web/src/components/
├── preinscriptions/public-form.tsx      # REFONTE upload → uploadToSignedUrl + progress
└── (nouveau) shared/direct-upload-field  # composant d'upload partagé public+admin (D-08)

apps/web/src/app/api/
├── documents/[id]/route.ts               # ÉVENTUEL — redirect 302 signed URL sur gros PDF
├── apprenants/[id]/docs/[kind]/route.ts  # idem
└── pedagogical-assets/[id]/route.ts      # idem
```

### Pattern 1: Direct-to-storage upload (le cœur de STOR-03)
**What:** Le navigateur uploade directement vers Supabase, jamais à travers Vercel. Trois temps : (1) serveur génère un signed upload URL/token, (2) client uploade vers Supabase, (3) client confirme au serveur qui déclenche l'OCR.
**When to use:** Tout upload de fichier utilisateur en prod Vercel (cap 4,5 MB body).
**Example:**
```typescript
// ── (1) SERVEUR : server action génère le token (scope tenant) ──
// Source: https://github.com/supabase/supabase (createSignedUploadUrl)
'use server';
export async function createApprenantUploadUrl(kind: 'CNI'|'RIB'|'CFP', ext: string) {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };
  const folder = randomUUID();
  const path = `apprenants/${user.tenantId}/${folder}/${kind.toLowerCase()}.${safeExt(ext)}`;
  await ensureBucket(DOCS_BUCKET);
  const { data, error } = await supabase().storage
    .from(DOCS_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (error) return { ok: false, error: `Préparation upload échouée : ${error.message}` };
  return { ok: true, path, token: data.token };  // token = signature, pas de credentials exposés
}

// ── (2) CLIENT : upload direct vers Supabase (bypass Vercel) ──
// Nécessite un client supabase browser (createClient avec ANON key ou juste le token).
// uploadToSignedUrl n'exige PAS de session auth — le token porte la signature.
const { error } = await supabaseBrowser.storage
  .from('qualiof-docs')
  .uploadToSignedUrl(path, token, file, { contentType: file.type });

// ── (3) CLIENT → SERVEUR : confirmation → OCR ──
await confirmApprenantUpload({ preEnrollmentId, kind, path });
```
**Note progress (D-06) :** `uploadToSignedUrl` du SDK v2 n'expose PAS nativement de callback de progression fin. Deux options : (a) TUS/Uppy (progress natif), (b) `XMLHttpRequest` sur l'URL signée avec `xhr.upload.onprogress`. Le planner doit trancher — voir Open Questions. Le `signedUrl` retourné contient l'URL complète PUT-able en `XHR`.

### Pattern 2: Migration idempotente DRY→WRITE (STOR-02)
**What:** Script séquentiel qui, pour chaque clé référencée en base, copie l'objet MinIO→Supabase puis vérifie l'existence. DRY par défaut, `WRITE=1` pour persister.
**When to use:** STOR-02.
**Example:**
```typescript
// Source: pattern local apps/web/scripts/calendar-backfill.ts
const WRITE = process.env.WRITE === '1';
// Collecter TOUTES les clés référencées (3 tables + PreEnrollment + SensitiveData + AgeficeProfile)
//   Person.ribKey (bucket DOCS)          — PII
//   Document.pdfUrl (bucket DOCS)
//   PedagogicalAsset.pdfUrl (bucket DOCS)
//   PreEnrollment.cniKey/ribKey/cfpKey (bucket PREINSCRIPTIONS)  ← AUSSI à migrer (OCR STOR-03)
//   SensitiveData.idDocumentUrl (bucket DOCS)  ← CNI apprenant, cf api route
//   AgeficeProfile.cfpAttestationKey (bucket DOCS) ← CFP, cf api route
//   Invoice.pdfUrl / Quote.pdfUrl (bucket DOCS) ← aussi des pdfUrl !
for (const { bucket, key } of allKeys) {  // SÉQUENTIEL — for...of await, JAMAIS Promise.all
  try {
    const buf = await downloadFromMinio(bucket, key);   // source = MinIO (S3 SDK direct)
    if (WRITE) await uploadToSupabase(bucket, key, buf); // upsert:true → idempotent
    report.migrated.push({ bucket, key, size: buf.length });
  } catch (e) {
    report.orphans.push({ bucket, key, error: String(e) }); // clé en base, objet absent
  }
}
// Vérif post-migration : pour chaque clé, objectExists(supabase, bucket, key) → 0 lien mort
// Écrit un rapport daté (D-03) dans .planning/audit/ ou backups/
```
**CRITIQUE :** le CONTEXT ne liste QUE `Person.ribKey` / `Document.pdfUrl` / `PedagogicalAsset.pdfUrl` dans le critère de succès, MAIS le code référence AUSSI `PreEnrollment.cniKey/ribKey/cfpKey`, `SensitiveData.idDocumentUrl`, `AgeficeProfile.cfpAttestationKey`, `Invoice.pdfUrl`, `Quote.pdfUrl`. Voir "Runtime State Inventory" — le planner DOIT décider si la migration couvre TOUTES les clés (recommandé : oui, sinon liens morts sur les pièces apprenants et factures).

### Pattern 3: Serving privé — redirect 302 vs proxy
**What:** Les routes API actuelles proxifient (`downloadFile` → stream buffer). En prod Vercel, un PDF > 4,5 MB casse la RÉPONSE.
**When to use:** Servir des objets Supabase en prod.
**Example:**
```typescript
// AVANT (proxy, cap 4,5 MB sur la réponse) :
const buffer = await downloadFile(DOCS_BUCKET, key);
return new NextResponse(new Uint8Array(buffer), { ... });

// APRÈS (redirect 302 vers signed URL fraîche, D-09 TTL 600s) :
const url = await createSignedDownloadUrl(DOCS_BUCKET, key, 600);
return NextResponse.redirect(url, 302);  // le navigateur va chercher le fichier DIRECT chez Supabase
```
**Attention Cache-Control :** les routes actuelles imposent `no-store` (doc régénéré = même id/URL, cf. leçon Laurent 2026-07-01). Le redirect préserve ce comportement (URL signée fraîche à chaque hit).

### Anti-Patterns to Avoid
- **`next/image` sur PII (CNI/RIB) :** INTERDIT (CLAUDE.md + flag roadmap). L'optimiseur Next met en cache l'image sur le CDN Vercel = fuite PII. Utiliser `<img>` natif (équivalent `unoptimized`).
- **Fallback double-lecture MinIO+Supabase :** INTERDIT (D-01). Big-bang contrôlé : soit MinIO, soit Supabase, jamais les deux en lecture simultanée.
- **`Promise.all` dans le script de migration :** INTERDIT (leçon mémoire « génération masse » — deadlocks/pertes). SÉQUENTIEL `for...of await`.
- **WRITE destructif automatique :** INTERDIT (D-02, règle « destructif = étape séparée »). La migration COPIE (non destructif), mais la suppression MinIO est hors phase.
- **Exposer `SUPABASE_SERVICE_ROLE_KEY` au client :** JAMAIS. Le service_role reste serveur. Le client n'a que le token signé (upload) ou l'URL signée (download). Si un client Supabase browser est nécessaire pour `uploadToSignedUrl`, utiliser l'ANON key (publiable) ou le token seul.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Upload direct navigateur→storage sécurisé | Presigned S3 PUT maison, CORS manuel | `createSignedUploadUrl` + `uploadToSignedUrl` (Supabase natif) | Gère signature, expiry, upsert, CORS. Le token porte la signature — pas d'exposition de credentials. |
| Signed download URL temporaire | Génération de token JWT maison | `createSignedUrl` (déjà dans `createSignedDownloadUrl`) | Natif, TTL paramétrable, révocable via rotation de clé. |
| Bucket privé + refus accès non-signé | Policies S3 IAM JSON | `createBucket({ public: false })` + service_role serveur | Supabase gère le privé nativement ; pas de policy IAM S3 (D-discrétion confirme : « pas de policy S3 IAM JSON »). |
| Vérification d'existence d'objet | `try downloadFile catch` (télécharge tout le fichier !) | `list()` avec `search` sur le préfixe, ou `createSignedUrl` (échoue si absent) — voir Pitfalls | Éviter de télécharger 50 MB juste pour tester l'existence pendant la vérif de 0 lien mort. |
| Progression d'upload | Estimation fake / spinner indéterminé | `XMLHttpRequest.upload.onprogress` sur l'URL signée, OU TUS/Uppy | D-06 exige un pourcentage RÉEL. Le `fetch` standard n'expose pas la progression d'upload. |

**Key insight :** Tout le stockage passe déjà par l'adaptateur `storage.ts`. La règle d'or : n'ajouter que `createSignedUploadUrl` et `objectExists` à cet adaptateur, ne jamais appeler `@supabase/supabase-js` hors de `storage.ts` (préserve l'interface unique, ~30 call sites intacts).

## Runtime State Inventory

> Phase de migration — inventaire des clés stockées référencées en base qui doivent survivre à la bascule.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data (clés en base → objet storage) | **Bucket DOCS (`qualiof-docs`) :** `Person.ribKey` (PII), `Document.pdfUrl` (String NON-null), `PedagogicalAsset.pdfUrl`, `SensitiveData.idDocumentUrl` (CNI apprenant, servi par `/api/apprenants/[id]/docs/cni`), `AgeficeProfile.cfpAttestationKey` (CFP), `Invoice.pdfUrl`, `Quote.pdfUrl`. **Bucket PREINSCRIPTIONS (`preinscriptions`) :** `PreEnrollment.cniKey` / `ribKey` / `cfpKey` (lus par l'OCR). | Migration COPIE chaque clé MinIO→Supabase (script D-01). ⚠ Le critère de succès CONTEXT ne cite que 3 tables mais 7+ champs référencent des objets — le planner DOIT décider du périmètre exact (recommandé : migrer TOUS pour éviter liens morts). |
| Live service config | **MinIO = Docker local**, volume conservé (D-02). Buckets Supabase créés à la volée par `ensureBucket` (idempotent) au premier upload OU par le script de migration. Pas de config UI/DB externe à synchroniser. | `STORAGE_PROVIDER=supabase` dans `.env` (root) après vérif 0 lien mort. Créer les buckets Supabase `preinscriptions` + `qualiof-docs` en `public:false` (fait par `ensureBucket`). |
| OS-registered state | None — pas de Task Scheduler / systemd / pm2 impliquant le stockage. Le worker closure uploade via `uploadFile` (adaptateur), non affecté. | None. |
| Secrets/env vars | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_PROVIDER` : déjà déclarés fail-loud (Phase 17, `env.ts:58-60`). Si upload client nécessite un client browser Supabase → **NOUVELLE clé `NEXT_PUBLIC_SUPABASE_URL` + ANON/publishable key** à déclarer dans `env.ts` (client) + `turbo.json` globalEnv. `S3_*` (MinIO) restent en place pour le script source. | Ajouter éventuellement `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` si `uploadToSignedUrl` via client browser (voir Open Questions — le token seul peut suffire sans client complet). |
| Build artifacts | None — pas d'egg-info/binaire. `@supabase/supabase-js` déjà dans le lockfile. | None. |

**Table de correspondance ancienne→nouvelle clé :** **Identité 1:1**. Les clés MinIO existantes sont déjà S3-safe (`apprenants/{tenantId}/{uuid}/{kind}.{ext}`, `{token}/{kind}-{stamp}.{ext}`, clés PDF closure). Supabase suit les règles de nommage AWS S3 → aucun remapping requis. **Vérification défensive** dans le script : aucune clé ne doit commencer par `/`, contenir `//`, `%`, ou des caractères non-ASCII/accentués (sinon `InvalidKey` à l'upload Supabase). Grep préventif recommandé avant WRITE. Voir Pitfall 1.

## Common Pitfalls

### Pitfall 1: Clés invalides Supabase (`InvalidKey`)
**What goes wrong:** Un upload Supabase échoue avec `InvalidKey` si la clé commence par `/`, contient `//` (segment vide), `%`, ou des caractères non-ASCII (accents, umlauts).
**Why it happens:** Supabase applique les règles de nommage AWS S3, plus strictes que MinIO qui tolère plus. Les clés `{token}/{kind}-{stamp}.{ext}` et `apprenants/{tenantId}/{uuid}/...` sont sûres, MAIS un nom de fichier utilisateur mal assaini pourrait injecter des accents (le code actuel `safeExt` ne garde que l'extension, pas le nom — donc SÛR aujourd'hui).
**How to avoid:** Le script de migration grep préventivement toutes les clés en base contre `/^\//`, `//`, `%`, `[^\x00-\x7F]` et les liste dans le rapport AVANT WRITE. Pour les nouveaux uploads, conserver la génération de clé côté serveur (jamais le nom brut du fichier).
**Warning signs:** Erreur `Supabase upload failed : Invalid key` dans le rapport de migration.

### Pitfall 2: 413 masqué / échec silencieux sur photo smartphone
**What goes wrong:** Une photo CNI 10 MB passe le formulaire mais échoue en prod Vercel (413 body too large) parce que le fichier transite encore par le serveur.
**Why it happens:** Tant que l'upload passe par une server action (base64 ou FormData), le body traverse Vercel → cap 4,5 MB. Le critère de succès #3 est NON négociable.
**How to avoid:** `uploadToSignedUrl` envoie DIRECT navigateur→Supabase, jamais par Vercel. Vérifier qu'AUCUN octet du fichier ne transite par une server action après refonte (seuls le token et la confirmation passent par Vercel).
**Warning signs:** 413 en prod, ou upload qui marche en local (pas de cap) mais casse en prod.

### Pitfall 3: OCR reçoit une image trop grosse pour le modèle vision
**What goes wrong:** Une photo 30-50 MB uploadée avec succès fait échouer l'OCR (limites de taille des modèles vision OpenRouter/Anthropic).
**Why it happens:** Le direct-to-storage permet maintenant des fichiers jusqu'à 50 MB (D-05), mais les modèles vision plafonnent bien en dessous (typiquement ~5-20 MB / limites de dimension).
**How to avoid:** Downscale/compression serveur AVANT d'envoyer à l'OCR (D-discrétion). Le serveur `downloadFile` l'objet, le réduit (sharp ou équivalent), puis appelle `callLlm({ imageBuffer })`. Invisible pour l'apprenant (l'original 50 MB reste en storage).
**Warning signs:** OCR retourne vide/erreur sur les gros fichiers alors que les petits marchent.

### Pitfall 4: OCR jamais déclenché après refonte
**What goes wrong:** L'upload direct réussit mais l'OCR ne tourne pas — le déclenchement fire-and-forget (`Promise.resolve().then(extractPreEnrollmentDocuments)`) était couplé à la server action d'upload, supprimée dans la refonte.
**Why it happens:** Aujourd'hui `submitPreEnrollmentForm` uploade PUIS déclenche l'OCR dans la même action. Avec le direct-to-storage, l'upload et la soumission sont découplés.
**How to avoid:** La server action de CONFIRMATION post-upload (étape 3 du pattern) doit rebrancher `extractPreEnrollmentDocuments(pe.id)` / le chemin admin. Test de non-régression : upload direct → confirmation → OCR déclenché (STOR-03).
**Warning signs:** `PreEnrollment.status` reste `SUBMITTED`, jamais `EXTRACTED`.

### Pitfall 5: Réponse Vercel > 4,5 MB sur le serving de gros PDF
**What goes wrong:** Un PDF closure volumineux servi via `/api/documents/[id]` (proxy `downloadFile`) casse la réponse en prod.
**Why it happens:** Le cap 4,5 MB Vercel s'applique aux RÉPONSES aussi, pas seulement aux requêtes.
**How to avoid:** Redirect 302 vers signed URL (Pattern 3) au lieu de streamer le buffer. Le navigateur récupère le fichier direct chez Supabase.
**Warning signs:** PDF tronqué / erreur 500 en prod sur les gros documents, OK en local.

### Pitfall 6: `objectExists` qui télécharge tout le fichier
**What goes wrong:** La vérif de 0 lien mort (STOR-02) qui fait `try downloadFile catch` télécharge 50 MB × N objets = lent et coûteux.
**Why it happens:** `downloadFile` récupère le contenu complet.
**How to avoid:** Utiliser `supabase.storage.from(bucket).list(prefix, { search })` (métadonnées seules) ou tenter `createSignedUrl` (échoue vite si absent, sans transfert). Ajouter une fonction `objectExists` à l'adaptateur.
**Warning signs:** Vérif de migration très lente / factures de bande passante.

## Code Examples

### Ajouter createSignedUploadUrl à l'adaptateur (storage.ts)
```typescript
// Source: https://github.com/supabase/supabase createSignedUploadUrl (storage-v3)
// À ajouter dans apps/web/src/lib/storage.ts (Supabase branch)
export async function createSignedUploadUrl(
  bucket: string,
  key: string,
): Promise<{ path: string; token: string; signedUrl: string }> {
  if (PROVIDER !== 'supabase') {
    throw new Error('createSignedUploadUrl : Supabase uniquement (MinIO local = upload serveur)');
  }
  await ensureBucket(bucket);
  const { data, error } = await supabase()
    .storage.from(bucket)
    .createSignedUploadUrl(key, { upsert: true });
  if (error) throw new Error(`Supabase signed upload URL failed : ${error.message}`);
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}
```

### Vérifier l'existence d'un objet sans le télécharger (STOR-02 vérif)
```typescript
// Source: https://github.com/supabase/supabase storage list API
export async function objectExists(bucket: string, key: string): Promise<boolean> {
  if (PROVIDER !== 'supabase') { /* MinIO : HeadObjectCommand */ }
  const idx = key.lastIndexOf('/');
  const prefix = idx >= 0 ? key.slice(0, idx) : '';
  const name = idx >= 0 ? key.slice(idx + 1) : key;
  const { data, error } = await supabase().storage.from(bucket).list(prefix, { search: name });
  if (error) throw new Error(`Supabase list failed : ${error.message}`);
  return (data ?? []).some((o) => o.name === name);
}
```

### Upload client avec progression réelle via XHR (D-06)
```typescript
// Source: pattern XHR upload progress sur URL signée Supabase
function uploadWithProgress(signedUrl: string, file: File, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('Erreur réseau pendant l\'upload'));
    xhr.send(file);
  });
}
// NB : vérifier le format d'URL/headers attendu par Supabase signed upload (le token peut devoir
// aller dans un header x-upsert / authorization). uploadToSignedUrl du SDK encapsule cela —
// le planner doit soit utiliser le SDK (pas de progress) soit répliquer ses headers en XHR.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Upload serveur (base64/FormData à travers Next) | Direct-to-storage (signed upload URL, navigateur→Supabase) | Standard Supabase depuis storage-v3 (avril 2023) | Contourne le cap 4,5 MB Vercel — indispensable STOR-03. |
| Proxy `downloadFile` pour servir les fichiers | Redirect 302 vers signed URL | Recommandé serverless (Vercel cap réponse) | Gros PDF servis sans transiter par Vercel. |
| MinIO local Docker (S3 SDK) | Supabase Storage privé (SDK supabase-js) | Migration v6 cloud | Fin de la dépendance au Mac de Laurent. |

**Deprecated/outdated :**
- L'upload base64 du formulaire public (`fileToBase64` dans `public-form.tsx`) : à retirer — base64 gonfle de +33 % ET transite par Vercel. Remplacé par upload direct du `File` brut.
- Limite 10 Mo en dur (`MAX_FILE_SIZE_MB = 10` dans les 2 actions) : passe à 50 Mo (D-05), et la validation se fait côté client + `fileSizeLimit` du bucket.

## Open Questions

1. **Client Supabase browser vs token seul pour `uploadToSignedUrl`**
   - What we know : `uploadToSignedUrl(path, token, file)` du SDK nécessite un client Supabase. Ce client peut être initialisé avec l'ANON key (publiable, sûre côté client).
   - What's unclear : peut-on uploader avec le seul `signedUrl` en PUT XHR (pour la progression D-06) sans instancier de client browser ? Les headers exacts (`authorization`, `x-upsert`) attendus par l'endpoint signé.
   - Recommendation : le planner teste les deux au Wave 0 — SDK `uploadToSignedUrl` (simple, pas de progress) OU XHR sur `signedUrl` (progress réel D-06). Probablement XHR requis pour D-06. Déclarer `NEXT_PUBLIC_SUPABASE_URL` + ANON key dans `env.ts` si client browser retenu.

2. **Downscale image avant OCR : lib à choisir**
   - What we know : `sharp` n'est PAS dans package.json. Les modèles vision plafonnent sous 50 MB.
   - What's unclear : ampleur réelle du problème (les CNI/RIB font-elles vraiment 30-50 MB ? une photo smartphone ~10 MB peut passer sans downscale selon le modèle).
   - Recommendation : mesurer d'abord. Si downscale nécessaire, `sharp` est le standard Node. Alternative : `@napi-rs/canvas` ou resize côté client avant upload (mais on perd l'original haute def). Trancher au plan.

3. **Volume d'objets MinIO (sizing migration) — flag [VERIFY] roadmap**
   - What we know : ~70 sessions × 1330 events calendar, générations de masse 2025+2026, 243 certificats régénérés → probablement plusieurs milliers d'objets (10 docs/stagiaire × N stagiaires × N sessions + pièces apprenants).
   - What's unclear : nombre exact et taille totale — non mesurable sans accès au MinIO en marche.
   - Recommendation : le script de migration en mode DRY COMPTE et affiche total objets + taille par bucket AVANT tout WRITE (D-03). Séquentiel + délai anti-throttle (pattern `calendar-backfill.ts` SESSION_DELAY_MS).

4. **Périmètre exact des clés à migrer**
   - What we know : le critère de succès CONTEXT cite 3 tables ; le code en référence 7+ (voir Runtime State Inventory).
   - What's unclear : Laurent veut-il migrer TOUT (recommandé) ou seulement les 3 tables du critère ?
   - Recommendation : migrer TOUTES les clés référencées (sinon liens morts sur pièces apprenants/factures après bascule). Le rapport D-03 liste par table — Laurent tranche les orphelins (D-04).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@supabase/supabase-js` | STOR-01/02/03 | ✓ | 2.107.0 | — |
| `@aws-sdk/client-s3` (lecture MinIO source) | STOR-02 migration | ✓ | 3.1038.0 | — |
| MinIO (Docker local, source de migration) | STOR-02 | ⚠ à vérifier en marche | — | Le script échoue proprement si MinIO down (try/catch par objet → rapport). |
| Projet Supabase Storage EU (cible) | STOR-01/02/03 | ✗ (à créer, région `eu-west-3` verrouillée Phase 17) | — | **BLOQUANT** : nécessite un projet Supabase provisionné + `SUPABASE_URL`/`SERVICE_ROLE_KEY` réels. La création peut être le premier acte de la phase (checklist anti-défaut-US, 17-REGIONS.md). |
| `sharp` (downscale OCR, optionnel) | STOR-03 (si gros fichiers) | ✗ | — | Downscale client, ou pas de downscale si le modèle vision accepte la taille. À trancher (Open Q2). |

**Missing dependencies with no fallback:**
- **Projet Supabase EU réel + clés** : la phase ne peut pas être VALIDÉE (STOR-01 signed URL, STOR-03 upload prod) sans un projet Supabase Storage créé en `eu-west-3`. Le code peut être écrit et testé unitairement (mocks) sans, mais les critères de succès #1 et #3 exigent le projet réel. Le planner doit intégrer sa création (ou confirmer qu'il existe).

**Missing dependencies with fallback:**
- `sharp` : fallback = downscale client ou aucun downscale (mesurer d'abord, Open Q2).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `pnpm --filter @qualiof/web exec vitest run <path>` |
| Full suite command | `pnpm --filter @qualiof/web exec vitest run` (baseline 1145/1146 — seul échec pré-existant `shared-template.test.ts:175` MIME jpeg/jpg, hors scope) |

**NB pattern projet :** les tests DOIVENT être hermétiques — mocker `@/lib/storage` (et `@supabase/supabase-js`) car `storage.ts` importe `sharedEnv` qui exécute `createEnv()` au load (fail-loud). Précédent : 16-03/17-02 ont mocké `@/lib/storage` pour préserver l'hermeticité. Le harness ne charge pas `.env` en test.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STOR-01 | `ensureBucket` crée `public:false` + `fileSizeLimit:50MiB` ; `createSignedDownloadUrl` renvoie URL TTL 600s | unit (mock supabase-js) | `pnpm --filter @qualiof/web exec vitest run src/lib/__tests__/storage.test.ts` | ❌ Wave 0 |
| STOR-01 | Accès non-signé au bucket privé REFUSÉ ; signed URL fraîche donne accès | integration (projet Supabase réel) | manuel/smoke — nécessite projet réel | ❌ manuel-only (documenter dans un SMOKE.md) |
| STOR-02 | Script collecte les clés des N tables, DRY ne write pas, mapping 1:1, détecte clés invalides | unit (mock prisma + storage) | `pnpm --filter @qualiof/web exec vitest run scripts/__tests__/migrate-storage.test.ts` | ❌ Wave 0 |
| STOR-02 | `objectExists` renvoie true/false sans télécharger | unit (mock supabase list) | idem storage.test.ts | ❌ Wave 0 |
| STOR-03 | `createSignedUploadUrl` scope tenant + génère token | unit (mock supabase + validateRequest) | `pnpm --filter @qualiof/web exec vitest run src/server/actions/__tests__/storage-upload.test.ts` | ❌ Wave 0 |
| STOR-03 | server action de confirmation recâble l'OCR (`extractPreEnrollmentDocuments` appelé) | unit (mock extractor) | idem | ❌ Wave 0 |
| STOR-03 | Photo 10 MB → upload direct → 0 x 413 → OCR déclenché | e2e/manuel (prod Vercel) | manuel-only (critère de succès #3, prod réelle) | ❌ manuel-only (SMOKE.md) |

**Justification manuel-only :** STOR-01 (refus accès non-signé) et STOR-03 (photo 10 MB en prod, pas de 413) sont des propriétés d'INFRASTRUCTURE prod — non reproductibles en test unitaire hermétique. Elles vont dans un `18-SMOKE.md` avec procédure manuelle (Laurent valide sur prod). Le reste (logique de clé, scope tenant, recâblage OCR, mapping migration) est testable en unit avec mocks.

### Sampling Rate
- **Per task commit:** `pnpm --filter @qualiof/web exec vitest run <path du fichier de test touché>`
- **Per wave merge:** `pnpm --filter @qualiof/web exec vitest run` (suite web complète, baseline 1145/1146)
- **Phase gate:** suite complète verte + `18-SMOKE.md` validé manuellement par Laurent (STOR-01 refus non-signé, STOR-03 photo 10 MB prod) avant `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `apps/web/src/lib/__tests__/storage.test.ts` — couvre STOR-01/02 (`createSignedUploadUrl`, `objectExists`, `ensureBucket` params) avec mock `@supabase/supabase-js`
- [ ] `apps/web/scripts/__tests__/migrate-storage.test.ts` — couvre STOR-02 (collecte clés, DRY, détection clé invalide, rapport) avec mock prisma + storage
- [ ] `apps/web/src/server/actions/__tests__/storage-upload.test.ts` — couvre STOR-03 (scope tenant, token, confirmation → OCR) avec mock validateRequest + storage + extractor
- [ ] `18-SMOKE.md` — procédure manuelle STOR-01 (accès non-signé refusé) + STOR-03 (photo 10 MB prod → OCR)
- [ ] Framework install : néant — Vitest déjà en place.

## Sources

### Primary (HIGH confidence)
- Context7 `/supabase/supabase` — `createSignedUploadUrl` / `uploadToSignedUrl` / resumable TUS uploads / file size limits (6 MB recommandé, 5 GB standard, 50 GB TUS) / AWS S3 key naming compliance
- Code local (source de vérité des patterns) : `apps/web/src/lib/storage.ts`, `upload-apprenant-docs.ts`, `preinscription-public.ts`, `preinscription-extractor.ts`, les 3 routes API `/api/documents|apprenants|pedagogical-assets`, `public-form.tsx`, `calendar-backfill.ts` (pattern DRY→WRITE), `packages/shared/src/env.ts`, `packages/db/prisma/schema.prisma`
- `.planning/config.json` — `nyquist_validation: true`, `commit_docs: false`, `granularity: fine`

### Secondary (MEDIUM confidence)
- Supabase Docs Storage Quickstart / error-codes — règles de nommage AWS S3, erreur `InvalidKey` (non-ASCII, `%`, `//`, leading slash)
- WebSearch (vérifié contre docs Supabase) — caractères S3-safe autorisés, InvalidKey sur accents/umlauts, double slash problématique

### Tertiary (LOW confidence)
- TTL par défaut du signed upload URL Supabase (~2 h) — non confirmé précisément par la doc fetchée ; à vérifier en Wave 0 si pertinent (le TTL download D-09 = 600s est explicite et confirmé dans le code).

## Metadata

**Confidence breakdown:**
- Standard stack : HIGH — libs déjà installées, versions vérifiées, adaptateur existant lu ligne par ligne.
- Architecture (direct-to-storage, migration, serving) : HIGH — patterns Supabase confirmés Context7 + code local existant qui les prépare.
- Pitfalls : HIGH — dérivés directement du code lu (cap Vercel, clés, OCR couplé) et des règles Supabase (InvalidKey).
- Progression d'upload (D-06) : MEDIUM — le SDK n'expose pas nativement la progression ; XHR/TUS requis, à trancher au plan (Open Q1).
- Downscale OCR : MEDIUM — `sharp` absent, ampleur du besoin non mesurée (Open Q2).

**Research date:** 2026-07-04
**Valid until:** 2026-08-04 (30 jours — Supabase Storage API stable ; re-vérifier si `@supabase/supabase-js` bumpé majeur).
