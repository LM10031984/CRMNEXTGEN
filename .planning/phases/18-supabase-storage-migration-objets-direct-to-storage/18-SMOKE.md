# 18-SMOKE — Validations prod manuelles Supabase Storage (STOR-01 / STOR-02 / STOR-03)

Procédures à exécuter sur le **projet Supabase réel** + **prod Vercel**. Ces validations ne sont
**PAS reproductibles en test hermétique** : elles exigent l'infra prod réelle (bucket privé, réseau
mobile, cap 4,5 Mo Vercel). Consigner chaque résultat directement dans ce fichier
(colonne « Résultat » + date).

> ⚠ Critère de succès #3 (photo 10 Mo prod → OCR) est **NON négociable** — c'est le cœur de la phase.

---

## ✅ RÉSULTATS DE VALIDATION — 2026-07-04

**Validation exécutée par l'orchestrateur sur l'infra Supabase RÉELLE** (Laurent a délégué :
« je te laisse gérer », « le projet est créé, règle-toi le pb »).

**Projet Supabase :** Qualiof `gntlqyscahbgjrmsbzil`, région **West EU (Irlande)** — **PAS `eu-west-3` Paris**
comme visé initialement. Projet créé le 2026-06-03 pour le staging, **réutilisé sur décision de Laurent**.
Irlande = **UE → RGPD conforme** (résidence des données dans l'Union). La cible Paris `eu-west-3`
documentée en Phase 17 reste la préférence ; l'écart est acté et non bloquant.

**Bilan : STOR-01 / STOR-02 / STOR-03 = VALIDÉS ✓** sur l'infra réelle.
**3 items restent `pending`** (non testables aujourd'hui, PAS des échecs — voir §Items pending).

**Suite de tests complète après corrections : 1163/1164** (seul échec = `shared-template.test.ts`
MIME jpeg/jpg **PRÉ-EXISTANT hors scope**, baseline identique depuis 15-01). `tsc --noEmit` exit 0.

**3 bugs réels révélés par le smoke et corrigés** (commits `9956438`, `d35aa27`) :
1. `migrate-storage.ts` ne s'exécutait JAMAIS : garde d'entrée `file://${argv[1]}` ne matche pas un
   chemin **contenant des espaces** (URL-encodé `%20`) → remplacé par `pathToFileURL`. + rapport ancré
   racine monorepo via `fileURLToPath` (cwd=`apps/web` sous `pnpm --filter`).
2. `storage-upload.ts` (`'use server'`) exportait `guessContentType` (sync) → **build error Next**
   « Server actions must be async functions » au premier rendu réel. Dé-exporté.
3. `downscaleForOcr` était exportée mais **PAS câblée** (Known Stub 18-03) → l'OCR échouait sur la
   photo 11 Mo (« Provider returned error »). **Déplacée** vers `apps/web/src/lib/ocr-downscale.ts`
   (module neutre sans auth — règle worker) et **câblée** dans `preinscription-extractor.ts` (CNI/RIB/CFP).
   Preuve : re-extraction → EXTRACTED, 0 warning.

---

## Pré-requis

- [x] Projet Supabase **EU** réel — `gntlqyscahbgjrmsbzil`, région **West EU (Irlande)** (RGPD conforme,
      écart Paris `eu-west-3` acté par Laurent). Cible d'origine Phase 17 = `eu-west-3` Paris.
- [x] Clés renseignées dans `.env` (root monorepo), récupérées de `.env.local.cloud-backup`, **testées** :
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (jamais exposée au client)
  - `NEXT_PUBLIC_SUPABASE_URL` (utilisée par `direct-upload-field.tsx` pour préfixer l'URL PUT signée)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - **Bascule effectuée** : `STORAGE_PROVIDER="supabase"` ajouté au `.env` racine. Backup `.env.bak-phase18` créé.
- [ ] Vercel (prod) : mêmes clés — **PENDING** (l'app n'est PAS déployée sur Vercel à ce jour ;
      déploiement = phase ultérieure du milestone v6).
- [x] Buckets `qualiof-docs`, `qualiof-templates` **préexistants privés** (limite 50 Mo) ; bucket
      `preinscriptions` **créé privé 50 Mo** par l'orchestrateur.

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

**STOR-01 — VALIDÉ ✓ (2026-07-04, clé réelle : attestation PDF migrée)**

| Étape | Attendu | Résultat (2026-07-04) |
|-------|---------|-----------------|
| 2 — URL publique brute | 400/403 | ✅ **passed** — accès public brut → **HTTP 400** refusé |
| 3 — signed URL fraîche | 200 → fichier | ✅ **passed** — signed URL (TTL 600s) → **HTTP 200** |
| 3b — token falsifié | accès refusé | ✅ **passed** — token falsifié → **HTTP 400** |
| 4 — expiration >11 min temps réel | accès refusé | ⏳ **pending** — l'expiry 11 min n'a pas été attendue en temps réel ; le **refus de token invalide** (même mécanisme JWT `exp`) a été vérifié à la place |

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

**STOR-02 — VALIDÉ ✓ (2026-07-04)** — rapport : `.planning/audit/STORAGE-MIGRATION-REPORT-2026-07-04.md`

| Étape | Attendu | Résultat (2026-07-04) |
|-------|---------|-----------------|
| 1 — DRY | rapport écrit, invalides/orphelins listés | ✅ **passed** — **3109 clés** collectées (3104 qualiof-docs + 5 preinscriptions), **0 orphelin, 0 clé invalide** |
| 2 — WRITE | `deadLinks` VIDE | ✅ **passed** — `WRITE=1` : **3109/3109 migrés, 0 lien mort** → « bascule autorisée » |
| 3 — bascule | `STORAGE_PROVIDER=supabase` après deadLinks vide | ✅ **passed** — `STORAGE_PROVIDER="supabase"` ajouté au `.env` racine (backup `.env.bak-phase18`) |

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

**STOR-03 — VALIDÉ ✓ (2026-07-04, EN LOCAL contre Supabase réel — PAS Vercel prod, non déployé)**

Test navigateur automatisé (**Playwright**) sur `http://localhost:3003/preinscription/{token}` avec une
**vraie photo CNI de 11,27 Mo** (JPEG généré depuis « Carte identité C Pancracio.pdf »).

| Étape | Attendu | Résultat (2026-07-04) |
|-------|---------|-----------------|
| 2 — progression | barre % réelle pendant l'upload | ✅ **passed** — XHR PUT direct navigateur→Supabase observé |
| 3 — pas de 413, fichier direct Supabase | upload réussit | ✅ **passed** — `PUT https://gntlqyscahbgjrmsbzil.supabase.co/storage/v1/object/upload/sign/preinscriptions/{token}/cni-*.jpg?token=… → 200`. **Aucun octet via le serveur Next.** UI « envoyé » + aperçu affichés |
| 4 — OCR | `PreEnrollment` SUBMITTED → EXTRACTED | ✅ **passed** — `status` SUBMITTED → EXTRACTING → **EXTRACTED**, `cniKey`/`ribKey` sur les nouvelles clés Supabase, `submittedAt` renseigné. Extraction vision réussie sur 11,3 Mo, **warnings: []**, données CNI réelles extraites (nom, date naissance, n° pièce) |
| 5 — retry (coupure réseau réelle) | 1 retry auto + bouton Réessayer | ⏳ **pending** — code présent, non testé sur coupure réseau **réelle** (mobile) |

**Open Q1 TRANCHÉE** : le **XHR PUT direct** sur la signed URL (préfixe `NEXT_PUBLIC_SUPABASE_URL/storage/v1`
+ `x-upsert`) **FONCTIONNE** → **pas besoin** du fallback `uploadToSignedUrl` sans progression. La barre
de progression D-06 est donc réelle.

---

## Items pending — NON testables aujourd'hui (à consigner, PAS des échecs)

Ces 3 points exigent une infra qui n'existe pas encore (Vercel non déployé) ou des conditions réelles
non reproductibles en labo. Ils sont **reportés**, pas en échec :

1. **Comportement Vercel prod réel** — le 413 est **impossible par design** (aucun octet ne transite par
   Vercel, prouvé en local) mais **non observé sur Vercel** : l'app n'est **PAS déployée** sur Vercel
   (déploiement = phase ultérieure du milestone v6, cf. Phase 21).
2. **Test sur mobile réel avec réseau mobile** — retry sur **coupure réseau réelle** (le code retry est en
   place et testé en labo, mais pas sur une vraie coupure 4G/wifi mobile).
3. **Expiration signed URL après 11 min en temps réel** — le refus de token invalide (même mécanisme JWT
   `exp`) a été prouvé ; l'expiry temporelle réelle n'a pas été attendue.

## Phase gate

- [x] **Suite web complète verte** — **1163/1164** (seul échec toléré = `shared-template.test.ts:175`
      MIME jpeg/jpg **PRÉ-EXISTANT hors scope**). `tsc --noEmit` exit 0.
- [x] Les **3 sections SMOKE** (STOR-01, STOR-02, STOR-03) **validées sur l'infra Supabase réelle**
      (délégué par Laurent à l'orchestrateur), 3 bugs révélés + corrigés (`9956438`, `d35aa27`).
- [x] → `/gsd:verify-work 18` peut être lancé (en gardant les 3 items pending à l'esprit pour Phase 21).
