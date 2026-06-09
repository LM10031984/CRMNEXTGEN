# Sprint 1 — Sécurité & Compliance

Date : 2026-06-09

Objectif : passer le MVP avancé de QualiOF à un niveau "production SaaS Premium" sur les axes sécurité, RGPD et robustesse. Cinq chantiers livrés dans ce sprint.

---

## 1. Hardening uploads (storage)

**Problème** : la validation des fichiers uploadés (CNI / RIB / CFP / signature)
faisait confiance au `Content-Type` envoyé par le client — trivialement
falsifiable. Les chemins MinIO étaient devinables à partir du token public de
pré-inscription (`{token}/cni-{timestamp}.pdf`).

**Livré** :
- [apps/web/src/lib/file-validation.ts](../apps/web/src/lib/file-validation.ts)
  Validation magic-bytes côté serveur (PDF / JPEG / PNG). Liste blanche par
  type de pièce. Bornes min/max paramétrables. Zéro dépendance externe.
- [apps/web/src/lib/storage-key.ts](../apps/web/src/lib/storage-key.ts)
  Chemins UUID v4 non-prédictibles + segment `YYYY-MM` pour les politiques
  de rétention futures.
- [apps/web/src/server/actions/preinscription-public.ts](../apps/web/src/server/actions/preinscription-public.ts)
  Intégration de la validation + clés UUID + détection MIME réelle.
- Tests : [file-validation.test.ts](../apps/web/src/lib/__tests__/file-validation.test.ts) — 11 cas verts.

**Sécurité gagnée** : un attaquant ne peut plus deviner les URLs des fichiers
même s'il connaît le token public, et ne peut plus uploader un .exe en
prétendant que c'est un PDF.

---

## 2. Chiffrement at-rest des données sensibles (pgcrypto)

**Problème** : `SensitiveData.socialSecurityNb` (N° de Sécurité sociale,
donnée article 9 RGPD) était stocké **en clair** dans Postgres. Un dump BDD
ou un accès non autorisé exposait directement les SSN.

**Livré** :
- Migration Prisma [20260609140000_enable_pgcrypto](../packages/db/prisma/migrations/20260609140000_enable_pgcrypto/migration.sql)
  Active l'extension `pgcrypto` (déjà dispo sur Postgres 16 et Supabase managé).
- [packages/db/src/crypto.ts](../packages/db/src/crypto.ts) — helpers
  `encryptSensitive` / `decryptSensitive` / `decryptSensitiveBatch` /
  `isEncrypted`. Algo `pgp_sym_encrypt_armor` avec AES-256 + SHA-512.
  Stockage en PGP armored (ASCII) → pas de changement de type Prisma.
- [packages/db/scripts/encrypt-existing-sensitive-data.ts](../packages/db/scripts/encrypt-existing-sensitive-data.ts)
  Migration data idempotente — chiffre les valeurs existantes en place.
- Adaptations writers :
  - [crud-edits.ts](../apps/web/src/server/actions/crud-edits.ts) `createPerson`
  - [preinscription-convert.ts](../apps/web/src/server/actions/preinscription-convert.ts) `convertPreEnrollment`
  - Suppression de la duplication clair dans `AgeficeProfile.paFields`
- Adaptations readers :
  - [agefice-generator.ts](../apps/web/src/server/actions/agefice-generator.ts) déchiffre on-demand pour le PDF
  - [apprenants/[id]/page.tsx](../apps/web/src/app/app/apprenants/[id]/page.tsx)
    déchiffre + ajoute une **vraie garde RBAC** (ADMIN/MANAGER) sur
    l'affichage du SSN — auparavant la garde n'était que cosmétique.

**Mise en service** :
```bash
# 1. Générer une clé maître
openssl rand -hex 32

# 2. Ajouter dans .env
DATA_ENCRYPTION_KEY="<la clé générée>"

# 3. Appliquer la migration Prisma
pnpm --filter @qualiof/db prisma migrate dev

# 4. Chiffrer les valeurs existantes
pnpm --filter @qualiof/db encrypt:sensitive
```

**⚠️ En prod** :
- Backup la clé séparément du dump Postgres (sinon = chiffrement inutile).
- Sans `DATA_ENCRYPTION_KEY`, l'app refuse de lire/écrire les données chiffrées.

---

## 3. Rate-limit (anti-brute force + anti-spam)

**Problème** : aucun rate-limit sur le login (brute-force possible) ni sur
l'endpoint public `/preinscription/{token}` (spam d'extractions IA).

**Livré** :
- [apps/web/src/lib/rate-limit.ts](../apps/web/src/lib/rate-limit.ts)
  Helper Redis (script Lua INCR+EXPIRE atomique), réutilise `ioredis` déjà
  installé pour BullMQ. **Fail-open** si Redis tombe (logué) — choix conscient
  pour ne pas tout bloquer en cas d'incident Redis.
- Profils standard exportés : `LOGIN` (5 / 15 min), `PREENROLLMENT_SUBMIT`
  (10 / heure), etc.
- Intégration :
  - [login/actions.ts](../apps/web/src/app/login/actions.ts) — clé combinée
    `IP + email` (bloque l'attaque ciblée ET distribuée).
  - [preinscription-public.ts](../apps/web/src/server/actions/preinscription-public.ts)
    — clé par IP.

---

## 4. RGPD — Export & Effacement

**Problème** : impossible de répondre aux demandes RGPD (Article 20 portabilité,
Article 17 effacement) sans script SQL maison à chaque fois.

**Livré** : [apps/web/src/server/actions/rgpd.ts](../apps/web/src/server/actions/rgpd.ts)

- **`exportLearnerData(personId)`** — Art. 20
  - Génère un ZIP contenant `data.json` (Person + SensitiveData déchiffré +
    LegalLinks + Sessions + Invoices + Documents + PreEnrollments + AuditLog)
    + tous les PDFs liés (attestations, certificats, conventions, CNI, RIB, CFP).
  - Stocké dans le bucket docs (clé retournée dans `zipKey`). La route
    signed-URL avec auth + TTL viendra en Sprint 2 RGPD-UX (le storage
    adapter de cette branche n'expose pas encore `getFileSignedUrl`).
  - AuditLog avec hash SHA-256 du ZIP (preuve d'intégrité), **sans** logger
    de PII.
  - RBAC : ADMIN uniquement.

- **`eraseLearnerData({ personId, reason, confirmPersonId })`** — Art. 17
  - **Anonymisation** (pas DELETE) car contraintes Qualiopi de rétention
    4 ans des enregistrements pédagogiques + comptable 10 ans pour les
    factures.
  - Neutralise : Person (noms→ANONYMISÉ, email/phone/birthDate→null),
    PreEnrollment (PII vidée), SensitiveData (DELETE), InternalComment (DELETE).
  - Conserve : SessionParticipant, Attendance, Document PDF émis, Invoice.
  - Anti-fat-finger : `confirmPersonId` doit matcher + `reason` ≥ 10 chars.
  - AuditLog avec marker anonyme et raison.

**À venir Sprint 2** : UI dédiée RGPD sur fiche apprenant (boutons Export /
Anonymiser) + notification email auto à l'apprenant après erase.

---

## 5. Backup Postgres automatisé

**Problème** : aucun backup automatisé. Volume Docker = perdu si la machine
crève.

**Livré** :
- Service `postgres-backup` dans [docker-compose.yml](../docker-compose.yml)
  Image éprouvée `prodrigestivill/postgres-backup-local:16` avec :
  - pg_dump compressé gzip, schédule `@daily` (02h00 UTC)
  - Rotation : 7 daily / 4 weekly / 6 monthly
  - Volume Docker dédié `postgres_backups`
  - Healthcheck intégré
- Script de restauration : [scripts/restore-db.sh](../scripts/restore-db.sh)
  Usage : `./scripts/restore-db.sh list | latest | <fichier>`.
  Rename atomique en fin de restore, ancienne BDD conservée sous
  `qualiof_old_YYYYMMDDHHMMSS` pour rollback.

**Démarrage** :
```bash
docker compose up -d postgres-backup
# Premier backup déclenché à 02h. Pour tester maintenant :
docker exec qualiof_pg_backup /backup.sh
```

**⚠️ Limites volontaires** (choix Laurent 2026-06-09) :
- Stocké uniquement sur volume Docker local — perdu si la machine est détruite.
- À envisager pour passer en pleine prod : pousser le dump quotidien vers
  MinIO/Supabase Storage ou un bucket S3 distant.

---

## Récap fichiers créés / modifiés

| Type | Chemin |
|---|---|
| Nouveau | `apps/web/src/lib/file-validation.ts` |
| Nouveau | `apps/web/src/lib/storage-key.ts` |
| Nouveau | `apps/web/src/lib/rate-limit.ts` |
| Nouveau | `apps/web/src/lib/__tests__/file-validation.test.ts` |
| Nouveau | `apps/web/src/server/actions/rgpd.ts` |
| Nouveau | `packages/db/src/crypto.ts` |
| Nouveau | `packages/db/scripts/encrypt-existing-sensitive-data.ts` |
| Nouveau | `packages/db/prisma/migrations/20260609140000_enable_pgcrypto/migration.sql` |
| Nouveau | `scripts/restore-db.sh` |
| Nouveau | `docs/SPRINT-1-SECURITE.md` |
| Modifié | `apps/web/src/server/actions/preinscription-public.ts` |
| Modifié | `apps/web/src/server/actions/preinscription-convert.ts` |
| Modifié | `apps/web/src/server/actions/crud-edits.ts` |
| Modifié | `apps/web/src/server/actions/agefice-generator.ts` |
| Modifié | `apps/web/src/app/app/apprenants/[id]/page.tsx` |
| Modifié | `apps/web/src/app/login/actions.ts` |
| Modifié | `packages/db/src/index.ts` |
| Modifié | `packages/db/package.json` |
| Modifié | `docker-compose.yml` |
| Modifié | `.env.example` |

## Reste à faire (Sprint 2)

- UI RGPD dédiée (boutons sur fiche apprenant + log des exports précédents)
- Implémenter `deleteFile(bucket, key)` dans le storage adapter pour finaliser
  la purge des fichiers RGPD (actuellement queued en AuditLog mais non purgés
  physiquement)
- Backup push vers stockage distant (Sprint 2 "Robustesse prod")
- Observabilité (pino + Sentry + healthcheck) — Sprint 2 dédié
