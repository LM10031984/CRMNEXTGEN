# 22-LOCAL-DECOMMISSION — Archivage + décommission du Docker local (D-05, CUT-01)

> **STATUT au 2026-08-12 : ARCHIVÉ, RIEN DÉTRUIT.** Les archives sont créées et
> vérifiées (checksums SHA-256). La purge est **EN ATTENTE du mot de validation
> écrit de Laurent** (« PURGE CONFIRMÉE » + option/exclusions) — convention projet :
> destructif = étape séparée, en tours distincts.

Pré-condition absolue vérifiée : `22-DATA-GAP-AUDIT.md` = **PASS final (2026-07-07)**
— le cloud Supabase est l'unique source de vérité, le local est FIGÉ au 2026-07-03
(+ artefacts 04/07 assumés). Pas de re-dump, jamais (D-01).

---

## 1. Archives (créées le 2026-08-12, AVANT toute destruction)

**Emplacement : `~/QualiOF-archives-locales/` (HORS repo, jamais commité).**

| Artefact | Taille | SHA-256 | Vérification |
| --- | --- | --- | --- |
| `qualiof-local-final-2026-08-12.dump` (pg_dump `-Fc` de la base locale `qualiof`, via `docker exec qualiof_postgres`) | **2,8 Mo** (> 1 Mo requis) | `d036d9dad9efc61d50f446e88a74ed1aec542ed1ae8cba771f16357df30f3cbf` | `pg_restore --list` exit 0 — **329 entrées TOC, 48 TABLE DATA** (= les 48 tables du schéma, cohérent audit 22-03), format CUSTOM gzip, archive datée `2026-08-12 10:48:14 UTC` |
| `minio-snapshot-2026-08-12.tar.gz` (tar gzip du volume `files_minio_data`, monté **read-only** via conteneur alpine) | **334 Mo** | `cfc13a8edb7d5c987bc7747d17e56763eb14dfaee13d4d9041b40682339280de` | `tar -tzf` = **11 381 entrées** (> 3000 requis) ; **5 266 objets métier** (`xl.meta` hors `.minio.sys`) : 5 261 `qualiof-docs` + 5 `preinscriptions` |
| `SHA256SUMS-2026-08-12.txt` | 201 o | — | fichier de contrôle (`shasum -a 256 -c` rejouable avant la purge) |

**Total archives : ~337 Mo.**

**Valeur historique** : la base locale contient SEULE l'historique de génération
16/06→04/07 (AIGenerationJob/ClosureBatch/ClosureJob/Document locaux, décision 22-03)
— cette archive est la **copie de sûreté définitive**. Le snapshot MinIO (5 266 objets
vs baseline cloud 902) préserve toutes les versions locales de juin. Les documents de
juin sont AUSSI sur le Drive de Laurent et ont été copiés dans le cloud
(report-docs-gap 30/07) : l'archive locale reste le filet.

> Note d'écart attendu : la baseline « ~3 109 objets » (Phase 18) date d'AVANT les
> régénérations de masse locales de juin — 5 266 > 3 109 est cohérent et voulu
> (c'est précisément l'historique que l'archive protège).

---

## 2. Liste finale à purger (noms RÉELS relevés le 2026-08-12 — rien n'est encore détruit)

### 2.1 Conteneurs (5 — `docker ps -a`, tous Up 7 days)

| Conteneur | Image | Rôle | Note |
| --- | --- | --- | --- |
| `qualiof_postgres` | `postgres:16-alpine` | Base locale (figée 03/07) | Archivée (pg_dump ci-dessus) |
| `qualiof_minio` | `minio/minio:latest` | Storage local (5 266 objets) | Archivé (snapshot ci-dessus) |
| `qualiof_redis` | `redis:7-alpine` | File BullMQ **legacy** | ⚠ Redis « viré » de l'app depuis v6 (Postgres SKIP LOCKED) et déjà retiré du `docker-compose.yml` — le conteneur tourne encore à vide (volume 547 ko). Aucune donnée à archiver. |
| `qualiof_gotenberg` | `gotenberg/gotenberg:8` | Rendu PDF Chromium **dev local** | Sans état (stateless) — la prod utilise le doc-engine Railway |
| `qualiof_weasyprint` | `files-weasyprint:latest` (build local) | Rendu PDF Qualiopi **dev local** | Sans état — la prod utilise le doc-engine Railway |

**`qualiof_ollama` : N'EXISTE PAS** — le service est en profile `full` du compose,
jamais démarré sur cette machine (Ollama tournait en natif brew ; l'app est sur
OpenRouter depuis Phase 16). Rien à purger côté conteneur/volume Ollama Docker.

### 2.2 Volumes (3 — `docker volume ls`, préfixe compose `files_`)

| Volume | Taille | Contenu |
| --- | --- | --- |
| `files_postgres_data` | 94,21 Mo | Données Postgres locales (archivées) |
| `files_minio_data` | 375,1 Mo | Objets MinIO (archivés) |
| `files_redis_data` | 546,6 ko | Résidus Redis legacy (rien à garder) |

**`ollama_data` : jamais créé** (service jamais démarré).

### 2.3 Images (après suppression des conteneurs)

| Image | Taille |
| --- | --- |
| `gotenberg/gotenberg:8` | 2,42 Go |
| `postgres:16-alpine` | 389 Mo |
| `files-weasyprint:latest` | 367 Mo |
| `minio/minio:latest` | 227 Mo |
| `redis:7-alpine` | 63 Mo |
| **Sous-total images** | **~3,47 Go** |

+ **build cache Docker** (build `files-weasyprint`) : 483,7 Mo récupérables
(`docker builder prune`).

### 2.4 Espace total récupérable estimé

Images ~3,47 Go + volumes ~470 Mo + couches conteneurs ~145 Mo + build cache
~484 Mo ≈ **~4,5 Go**.

### 2.5 HORS PÉRIMÈTRE — à NE PAS toucher

- **Tous les conteneurs/volumes `supabase_*_Train-my-agent`** (12 conteneurs,
  3 volumes) : **AUTRE PROJET** sur la même machine — exclus de toute commande de purge
  (aucun `docker system prune -a` global ; suppressions **ciblées uniquement**).
- `alpine:latest` (14,6 Mo) : image outil tirée pour le snapshot — générique,
  conservée (inoffensive).

---

## 3. Dépendances vérifiées (la purge ne casse RIEN en prod)

| Dépendance | Vérification (2026-08-12) |
| --- | --- |
| **App Vercel** (`qualiof.vercel.app`) | Env 100 % cloud (Supabase DB + Storage, OpenRouter, doc-engines Railway avec `DOC_ENGINE_TOKEN`) — aucune URL locale posée (audits 21-04/22-04/22-06) |
| **Worker Railway** | Env 100 % cloud — file de jobs = Postgres Supabase SKIP LOCKED (Redis inutilisé), storage Supabase, IA OpenRouter |
| **`.env` racine local** (dev) | `DATABASE_URL`/`DIRECT_URL` = **Supabase cloud** (Phase 19) ; `STORAGE_PROVIDER=supabase` + `SUPABASE_URL` = **cloud** (Phase 18) ; `S3_ENDPOINT`/`REDIS_URL`/`OLLAMA_URL` pointent encore localhost mais sont **MORTS** (provider supabase, Redis viré, IA OpenRouter) |
| ⚠ **Seul impact réel : dev local PDF** | `GOTENBERG_URL` du `.env` = `localhost:3001` (conteneur local) ; `WEASYPRINT_URL` absent (défaut code = localhost:5001). Après purge, le rendu PDF du dev local (port 3010) ne fonctionnera plus **jusqu'à re-pointer ces URLs vers les doc-engines Railway (+ `DOC_ENGINE_TOKEN`)** — ou re-provisionner ponctuellement les 2 conteneurs depuis `docker-compose.yml` (conservé au repo). `pnpm dev:full` perd de toute façon ses services locaux : nouveau mode dev = **services cloud**. |

---

## 4. Ce qui est CONSERVÉ (jamais purgé)

- **`~/QualiOF-archives-locales/`** : les 2 archives + `SHA256SUMS-2026-08-12.txt`
  (chemins, tailles et checksums en §1) — filet définitif de l'historique local.
- **Le repo git** (`~/Documents/CRM Next gen/files`, branche `cloud-migration`),
  y compris **`docker-compose.yml`** (permet de re-provisionner un environnement
  local complet si besoin : `docker compose up -d` + restore du dump + untar MinIO).
- **`.env` racine** (gitignoré) — déjà pointé cloud.
- **`files/secrets/`** (`oauth-client.json`, `google-token.json`) — fallback Google
  du dev local (le portage env-first 22-02 lit l'env d'abord, ces fichiers restent
  le fallback all-or-nothing).
- Les backups antérieurs (`.env.bak-*`, dumps de phases précédentes) là où ils sont.

---

## 5. Gate D-05 — mot de validation (EN ATTENTE)

- **Liste présentée le** : 2026-08-12
- **Mot de validation attendu** : « **PURGE CONFIRMÉE** » (+ option : purge totale /
  partielle avec exclusions / report) — sans ce mot exact, rien n'est détruit.
- **Mot reçu** : _(à remplir — tour distinct)_
- **Exécution de la purge (Task 3)** : _(à remplir — tour distinct, preuves
  avant/après `docker ps -a`, `docker volume ls`, `docker system df`, re-vérification
  des checksums, non-régression cloud `/login` 200 + script lecture cloud)_
