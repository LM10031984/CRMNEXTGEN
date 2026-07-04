# Phase 18: Supabase Storage (migration objets + direct-to-storage) - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Le stockage objets passe de MinIO (Docker local) à Supabase Storage privé sans casser un seul lien PII, et le chemin d'upload des pièces apprenants (CNI/RIB/CFP) est refondu en direct-to-storage (le navigateur envoie directement vers Supabase via signed upload URL) pour survivre au cap 4,5 MB body de Vercel — préserve le pilier #4 Pré-inscriptions IA.

Exigences : STOR-01 (buckets privés + signed URLs testés), STOR-02 (migration idempotente DRY→WRITE, 0 lien mort sur `Person.ribKey` / `Document.pdfUrl` / `PedagogicalAsset.pdfUrl`), STOR-03 (photo 10 MB passe l'upload en prod + OCR déclenché, pas de 413).

</domain>

<decisions>
## Implementation Decisions

### Bascule et filet de sécurité
- **D-01 — Big-bang contrôlé :** migrer 100 % des objets MinIO→Supabase (script idempotent, mode DRY par défaut, WRITE explicite), vérifier 0 lien mort, PUIS switcher `STORAGE_PROVIDER=supabase`. Pas de double-lecture/fallback transitoire — tant que la vérif ne passe pas, l'app reste sur MinIO.
- **D-02 — Rétention MinIO :** MinIO reste intact (volume Docker conservé) jusqu'à validation manuelle explicite de Laurent. Sa suppression est une étape séparée hors phase, jamais automatique (règle « destructif = étape séparée », pg_dump avant tout WRITE destructif).

### Vérification post-migration
- **D-03 — Rapport archivé :** le script de vérification écrit un rapport daté dans un fichier (ex. `backups/` ou `.planning/audit/`) : total objets migrés par bucket, liens vérifiés par table (`Person.ribKey`, `Document.pdfUrl`, `PedagogicalAsset.pdfUrl`), liste des orphelins. Trace réutilisable en audit Qualiopi.
- **D-04 — Orphelins (clé en base sans objet MinIO) :** listés dans le rapport, AUCUNE action automatique. Décision au cas par cas par Laurent (régénérer le doc ou nettoyer la ligne). La bascule reste possible si les orphelins sont assumés.

### Upload direct-to-storage (CNI/RIB/CFP)
- **D-05 — Limite de taille : 50 Mo par fichier** (alignée sur le `fileSizeLimit` du bucket). Remplace la limite actuelle de 10 Mo dans les 2 chemins d'upload.
- **D-06 — Progression :** barre de progression réelle (pourcentage par fichier) pendant l'upload — critique sur réseau mobile pour le formulaire public.
- **D-07 — Échec d'upload :** 1 retry automatique silencieux ; si nouvel échec, message clair en français + bouton « Réessayer », sans perdre les autres champs du formulaire.
- **D-08 — Périmètre : formulaire public `/p/[token]` ET écran admin** (`uploadApprenantDocs`) — les deux passent par Vercel donc subissent le cap 4,5 Mo. Même mécanique, composant partagé si possible.

### Accès aux documents (signed URLs)
- **D-09 — TTL court uniforme : 10 minutes** (valeur déjà dans le code, `createSignedDownloadUrl` `expiresInSec = 600`), régénérée à chaque accès. Point clarifié avec Laurent : les documents restent cliquables à tout moment via l'app (lien frais à chaque clic) — seul le lien brut copié expire. Confirmé après clarification, conforme RGPD et au critère de succès #1.

### Claude's Discretion
- Nommage des clés Supabase et table de correspondance ancienne→nouvelle clé (contraintes Supabase ≠ MinIO : `//`, caractères, préfixes) — flag [VERIFY] du roadmap.
- Modèle d'accès privé : service_role côté serveur (pas de policy S3 IAM JSON) ; RLS/policies bucket au choix du planner.
- Downscale/compression des images côté serveur avant OCR : une photo de 30-50 Mo dépasse les limites des modèles vision — l'OCR doit recevoir une image réduite, invisible pour l'apprenant.
- Mécanique de notification serveur post-upload (comment le serveur apprend que l'upload direct est terminé et déclenche l'OCR) : callback server action, polling, ou confirmation client.
- Servir les documents : redirect vers signed URL vs proxy — attention, le cap ~4,5 Mo s'applique AUSSI aux réponses Vercel, le redirect 302 vers signed URL est probablement nécessaire pour les gros PDF.
- Aperçus CNI/RIB : `unoptimized`, jamais `next/image` sur PII (flag roadmap).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Périmètre et exigences
- `.planning/ROADMAP.md` — section Phase 18 : goal, success criteria, research flags ([VERIFY] volume objets MinIO, contraintes nommage clés, RLS/service_role, TTL PII, `unoptimized` sur previews)
- `.planning/REQUIREMENTS.md` — STOR-01, STOR-02, STOR-03 (lignes 14-18)

### Code existant (source de vérité des patterns)
- `apps/web/src/lib/storage.ts` — adaptateur bi-provider MinIO/Supabase DÉJÀ en place (`uploadFile`/`downloadFile`/`ensureBucket`/`createSignedDownloadUrl`, switch `STORAGE_PROVIDER`), buckets `preinscriptions` + `qualiof-docs` (50 MiB limit côté Supabase)
- `packages/shared/src/env.ts` — clés cloud validées fail-loud Phase 17 (`STORAGE_PROVIDER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- `apps/web/src/server/actions/upload-apprenant-docs.ts` — chemin admin actuel (buffer serveur, 10 Mo max) à refondre
- `apps/web/src/server/actions/preinscription-public.ts` — chemin public actuel (buffer serveur, 10 Mo max) à refondre
- `apps/web/src/lib/preinscription-extractor.ts` — OCR vision déclenché après upload (STOR-03 : doit continuer à fonctionner)
- `apps/web/src/app/api/documents/[id]/route.ts` + `api/apprenants/[id]/docs/[kind]/route.ts` + `api/pedagogical-assets/[id]/route.ts` — routes qui servent les objets aujourd'hui (proxy `downloadFile`)
- `CLAUDE.md` — contraintes : multi-tenant `tenantId` partout, `Person.ribKey` = PII bucket privé signed URLs

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/src/lib/storage.ts` : l'abstraction bi-provider existe déjà — la bascule applicative est un switch d'env (`STORAGE_PROVIDER=supabase`), PAS une réécriture. `ensureBucket` crée déjà les buckets Supabase en `public: false` avec `fileSizeLimit: 50 MiB`.
- `createSignedDownloadUrl` déjà implémenté côté Supabase (10 min par défaut), jette une erreur côté MinIO (les routes API proxifient le download en local).
- Pattern DRY→WRITE déjà éprouvé (backfill calendar Phase 14, régé masse certificats) : `--write` / `WRITE=1` explicite.

### Established Patterns
- ~30 call sites passent tous par `uploadFile`/`downloadFile` — aucun accès S3/Supabase direct hors adaptateur. Toute refonte doit préserver cette interface.
- 2 buckets : `preinscriptions` (formulaire public) et `qualiof-docs` (docs Qualiopi, pièces apprenants `apprenants/{tenantId}/{uuid}/{kind}.{ext}`).
- Server actions retournent `{ ok, error }` discriminé ; erreurs en français.
- Multi-tenant : clés préfixées `tenantId`, toute nouvelle action scope par `user.tenantId`.

### Integration Points
- Le direct-to-storage introduit un NOUVEAU chemin : signed upload URL générée côté serveur (action/route) → upload navigateur → confirmation → OCR. Les limites de taille actuellement en dur (10 Mo) dans les 2 actions d'upload passent à 50 Mo.
- L'OCR (`preinscription-extractor`) lit l'objet via `downloadFile` après upload — le déclenchement doit être re-câblé sur la confirmation d'upload direct.
- Vercel cap 4,5 Mo s'applique aux requêtes ET aux réponses : les routes proxy actuelles devront rediriger (302) vers signed URLs pour les gros fichiers en prod.

</code_context>

<specifics>
## Specific Ideas

- Critère de succès non négociable : une VRAIE photo CNI de 10 Mo prise au smartphone passe en prod et déclenche l'OCR — pas de 413, pas d'échec silencieux.
- Laurent veut que les documents soient accessibles à tout moment (contrôle Qualiopi) — satisfait par la régénération du lien à chaque clic, PAS par des liens permanents.
- Messages d'erreur upload en français, formulaire public ne perd jamais les champs déjà saisis.

</specifics>

<deferred>
## Deferred Ideas

- **Export des dossiers sessions vers le Drive entreprise de Laurent** (nouvelle capacité, sa propre phase) : pouvoir copier/synchroniser les documents vers Google Drive, avec choix de l'emplacement dans les paramètres de l'app. Arborescence souhaitée : dossier par session datée → sous-dossiers apprenants avec leurs docs, et à la racine du dossier session : programme, déroulé pédagogique, checklist. Description donnée par Laurent pendant la discussion TTL du 2026-07-04 — à ajouter au roadmap (`/gsd:add-phase` ou backlog).

</deferred>

---

*Phase: 18-supabase-storage-migration-objets-direct-to-storage*
*Context gathered: 2026-07-04*
