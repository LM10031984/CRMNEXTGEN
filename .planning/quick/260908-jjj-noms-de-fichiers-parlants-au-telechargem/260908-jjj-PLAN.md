# Quick 260908-jjj — Noms de fichiers parlants + ZIP « tous les documents » d'un apprenant

**Date :** 2026-09-08
**Branche :** `quick/260908-noms-docs-zip-apprenant` (worktree `files-lieu`, partie de `main` @ `9c21625`)
**Demande (Laurent, 2026-09-08) :** « quand on télécharge les documents, ça serait bien qu'ils aient
des noms plus parlants. Par exemple, pour Stéphane Rousseau, j'ai "Rousseau Stéphane 24-96-3C95". »
et « ça serait bien qu'il y ait un bouton pour télécharger tous les documents pour un apprenant ».

Deux des cinq améliorations listées le 08/09 ; Laurent a choisi de commencer par celles-ci.
Les trois autres (dépôt unique des pièces à la création, référentiel AGEFICE + n° de point
d'accueil, propagation du nom vers l'auto-entreprise) restent à faire ensuite.

## Cause racine du nom illisible

`/api/documents/[id]`, `/api/apprenants/[id]/docs/[kind]` et `/api/pedagogical-assets/[id]`
posent bien un `Content-Disposition` lisible — **mais uniquement sur la branche MinIO locale**.
En production (`STORAGE_PROVIDER=supabase`) ces routes répondent `302` vers une *signed URL*
Supabase : l'en-tête de la route n'est jamais appliqué et le navigateur retombe sur le nom
technique de l'objet stocké (slug + hash). D'où « …-9f136578.pdf » côté Laurent.

Supabase sait poser le nom lui-même : `createSignedUrl(path, ttl, { download: '<nom>' })`
(typé `download?: string | boolean` en `@supabase/storage-js@2.107.0`) → `?download=<nom>`.
Le nom doit donc être calculé **avant** la redirection et passé à la signature.

## Contraintes

1. **ASCII strict** pour le nom de fichier : il traverse une query string puis un en-tête HTTP.
   Un « é » ou une apostrophe s'y perdent selon le navigateur. `Piece-identite-Stephane-ROUSSEAU`
   reste parfaitement lisible.
2. **Jamais de nom vide** — un `?download=` vide fait réapparaître le nom technique.
3. **Parité des deux providers** : MinIO local garde le proxy + `Content-Disposition`, Supabase
   passe par l'option `download`. Même helper des deux côtés, un seul nom possible.
4. **Le ZIP apprenant ne réinvente rien** : il réutilise `resolveDocs()` (source unique de la
   navigation documentaire, Phase 9.3) et `archiver`, déjà employé par le ZIP de session.
5. **RGPD** — le ZIP apprenant embarque des documents Qualiopi, jamais les pièces d'identité,
   RIB ou attestations CFP (`resolveDocs` leur donne déjà `href: null`, on ne contourne pas).

## Découpage

### Tâche 1 — Helper de nommage (fait)

- `lib/docs/download-filename.ts` : `buildDownloadFilename({ docType, firstName, lastName,
  sessionCode, ext, suffix })` → `Certificat-de-realisation-Stephane-ROUSSEAU-SES-0110.pdf`.
  Format calqué sur ce que Laurent range à la main (`Convention-OPTIMMO-SES-0106.pdf`).
  Libellés dérivés de `DOC_TYPE_LABELS`, avec surcharges là où le libellé d'affichage ferait
  un mauvais nom (`CNI` → `Piece-identite`, `SATISFACTION_CHAUD` → `Satisfaction-a-chaud`).
- **verify :** `vitest run src/lib/docs/__tests__/download-filename.test.ts` — 18 tests, dont le
  cas témoin Stéphane Rousseau et l'assertion `encodeURIComponent(name) === name`.
- **done :** helper + tests verts.

### Tâche 2 — Câblage des trois routes de téléchargement

- `lib/storage.ts` : `createSignedDownloadUrl(bucket, key, ttl, downloadAs?)`.
- `/api/documents/[id]` : charge participant + session pour composer le nom (fait).
- `/api/apprenants/[id]/docs/[kind]` : `KIND_TO_LABEL` → `KIND_TO_DOC_TYPE`, nom avec l'extension
  réelle de la clé (fait). **C'est la route du cas signalé par Laurent.**
- `/api/pedagogical-assets/[id]` : idem, ancrage produit/session.
- **verify :** `tsc --noEmit` + les tests de routes existants.
- **done :** les trois routes passent un nom lisible à la signature ET dans l'en-tête.

### Tâche 3 — ZIP « tous les documents » d'un apprenant

- `server/actions/learner-docs-zip.ts` : `buildLearnerDocsZip(personId)` → parcourt les documents
  de l'apprenant via `resolveDocs`, ne garde que les versions courantes téléchargeables, range
  par session (`SES-0110/Certificat-de-realisation-….pdf`) et nomme l'archive
  `Documents-Stephane-ROUSSEAU-20260908.zip`.
- `/api/apprenants/[id]/zip` : route de téléchargement (auth + scope tenant, comme le ZIP session).
- Bouton dans la fiche apprenant, à côté des documents.
- **verify :** tests unitaires sur la construction des entrées (noms, dédoublonnage, exclusion des
  pièces sans `href`) + essai manuel de Laurent.
- **done :** un clic = une archive lisible de tous les documents de l'apprenant.

## Hors scope (assumé)

- Renommer les objets **déjà stockés** : inutile, le nom vu par l'utilisateur est désormais
  découplé de la clé de stockage. Les clés restent des slugs + hash (anti-collision).
- Le ZIP de session (`/api/closure/[batchId]/zip`) garde son nommage `slug/kind.pdf` — il sera
  aligné sur le helper seulement si Laurent le demande.
