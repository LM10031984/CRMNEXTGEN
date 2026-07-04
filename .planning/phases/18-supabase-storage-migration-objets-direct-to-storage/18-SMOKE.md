# 18-SMOKE — Validations prod manuelles Supabase Storage (STOR-01 / STOR-02 / STOR-03)

Procédures à exécuter par **Laurent** sur le **projet Supabase réel** (`eu-west-3`, verrouillé Phase 17)
+ **prod Vercel**. Ces validations ne sont **PAS reproductibles en test hermétique** : elles exigent
l'infra prod réelle (bucket privé, réseau mobile, cap 4,5 Mo Vercel). Consigner chaque résultat
directement dans ce fichier (colonne « Résultat » + date).

> ⚠ Critère de succès #3 (photo 10 Mo prod → OCR) est **NON négociable** — c'est le cœur de la phase.

---

## Pré-requis

- [ ] Projet Supabase **EU `eu-west-3`** créé en respectant la **checklist anti-défaut-US**
      (`.planning/phases/17-fondations-cloud-r-gion-eu-env/17-REGIONS.md` §Checklist — région `eu-west-3`
      choisie AU MOMENT de la création, **immuable**, vérifier 2× avant Create ; défaut Supabase = us-east).
- [ ] Clés renseignées dans `.env` (root monorepo) :
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (jamais exposée au client)
  - `NEXT_PUBLIC_SUPABASE_URL` (utilisée par `direct-upload-field.tsx` pour préfixer l'URL PUT signée)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Vercel (prod) : mêmes clés en variables d'environnement, région `cdg1`.
- [ ] Buckets `qualiof-docs` et `preinscriptions` créés en **`public: false`** (`ensureBucket` le fait
      automatiquement au premier upload, `fileSizeLimit` 50 MiB).

---

## STOR-01 — Bucket privé + signed URL (accès non-signé refusé)

Prouve que le bucket est réellement privé et que seule une signed URL fraîche donne accès.

1. `STORAGE_PROVIDER=supabase`, uploader un objet test via l'app (formulaire public ou admin).
2. Ouvrir l'**URL PUBLIQUE brute** dans un navigateur :
   `{SUPABASE_URL}/storage/v1/object/public/qualiof-docs/{key}`
   → doit renvoyer **400/403** (bucket `public=false`). ✅ **accès non-signé REFUSÉ**.
3. Cliquer le doc dans l'app → **redirect 302** vers une signed URL fraîche (TTL 600 s) → le fichier s'affiche.
   ✅ **la signed URL donne accès**.
4. Attendre **11 min**, recopier l'ANCIENNE signed URL brute dans le navigateur → doit **expirer**
   (TTL 600 s dépassé). ✅ **expiration confirmée**.

| Étape | Attendu | Résultat (date) |
|-------|---------|-----------------|
| 2 — URL publique brute | 400/403 | |
| 3 — clic doc app | 302 → fichier s'affiche | |
| 4 — signed URL expirée (>11 min) | accès refusé | |

---

## STOR-02 — Migration 0 lien mort (DRY → WRITE gaté)

Prouve que la migration MinIO → Supabase ne laisse aucun lien mort sur les 8 champs / 2 buckets.

1. **MinIO en marche** (source). Lancer le DRY (défaut) :
   `pnpm --filter @qualiof/web storage:migrate`
   → lire le rapport `.planning/audit/STORAGE-MIGRATION-REPORT-*.md` : total par bucket, migrés (VIDE en DRY),
   clés invalides (Pitfall 1 : leading `/`, `//`, `%`, non-ASCII — listées sans upload), orphelins (objet absent MinIO).
2. **Feu vert Laurent** → exécuter le WRITE :
   `WRITE=1 pnpm --filter @qualiof/web storage:migrate`
   → vérifier dans le rapport que **`deadLinks` est VIDE**. ✅ **0 lien mort**.
3. Basculer `STORAGE_PROVIDER=supabase` **SEULEMENT** après `deadLinks` vide.
   MinIO **conservé** (D-02 — la suppression MinIO est une étape séparée hors phase).

| Étape | Attendu | Résultat (date) |
|-------|---------|-----------------|
| 1 — DRY | rapport écrit, `migrated` vide, invalides/orphelins listés | |
| 2 — WRITE | `deadLinks` VIDE | |
| 3 — bascule | `STORAGE_PROVIDER=supabase` après deadLinks vide | |

---

## STOR-03 — Photo 10 Mo prod → OCR (critère #3 NON négociable)

Prouve qu'une VRAIE photo CNI smartphone (~10 Mo) passe en prod **sans 413** et déclenche l'OCR.

1. Sur **mobile**, ouvrir le formulaire public `/p/[token]` en **PROD Vercel**.
2. Prendre une **VRAIE photo CNI ~10 Mo**, la déposer dans le champ « Pièce d'identité ».
   → observer la **barre de progression réelle** (pourcentage qui monte, D-06).
3. Vérifier : **PAS de 413**, l'upload réussit (le fichier part **DIRECTEMENT chez Supabase**, pas via Vercel —
   c'est le `XHR PUT` sur la signed URL de `direct-upload-field.tsx`).
4. Compléter les champs, cocher RGPD, **Soumettre** → vérifier en base que la `PreEnrollment` passe
   **`SUBMITTED`** puis **OCR déclenché** (statut évolue via `extractPreEnrollmentDocuments` fire-and-forget ;
   les champs se pré-remplissent côté admin). ✅
5. **Retry (D-07)** : recommencer un upload et **couper le réseau en plein upload** →
   1 **retry auto silencieux** → si nouvel échec, le bouton **« Réessayer »** apparaît, message français,
   et **les autres champs saisis ne sont PAS perdus**. ✅

| Étape | Attendu | Résultat (date) |
|-------|---------|-----------------|
| 2 — progression | barre % réelle pendant l'upload | |
| 3 — pas de 413 | upload réussit, fichier direct Supabase | |
| 4 — OCR | `PreEnrollment` SUBMITTED → extraction déclenchée | |
| 5 — retry | 1 retry auto puis bouton Réessayer, champs préservés | |

---

## Phase gate

- [ ] **Suite web complète verte** (baseline `1163/1164` + nouveaux tests plans 01/02/03 —
      seul échec toléré = `shared-template.test.ts:175` MIME jpeg/jpg **PRÉ-EXISTANT hors scope**).
- [ ] Les **3 sections SMOKE** (STOR-01, STOR-02, STOR-03) validées par Laurent sur l'infra réelle.
- [ ] → alors seulement lancer `/gsd:verify-work 18`.
