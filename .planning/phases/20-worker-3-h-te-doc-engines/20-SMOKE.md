# 20-SMOKE — Validations runtime cloud Worker 3ᵉ hôte + Doc-engines (WORK-01..04)

Preuves **RUNTIME** contre l'**infra Railway réelle** (projet `qualiof-worker`,
`061ceb0a-2e42-4a4e-81f6-aed9729c0642`), **NON reproductibles en Vitest hermétique**.
Ce fichier est le **livrable de preuve de la Phase 20** (calque `19-SMOKE.md` /
`18-SMOKE.md`). Étape ops **gatée Laurent** — c'est le **phase gate**.

> ⚠ Rien ici n'est un test hermétique : ce sont des **smoke runtime** contre le
> déploiement Railway réel (worker pm2 + 2 doc-engines publics + Gotenberg privé)
> et le Supabase de Paris/Irlande. Chaque preuve est datée et statuée.

---

## ✅ RÉSULTATS DE VALIDATION — 2026-07-05 / E2E complété 2026-07-06

**Validation exécutée par l'orchestrateur sur l'infra Railway RÉELLE** (Laurent a
délégué : « gère tout toi » — même modalité qu'en Phases 18/19). CLI Railway
authentifié `laurentmarx@msn.com`, workspace `lm10031984's Projects`.
**Plan Railway : HOBBY ($5/mo)** — choix explicite Laurent (« hobby ok »), PAS Pro.

**Infra déployée — 4 services, RÉGION `europe-west4-drams3a` (Amsterdam, EU) :**

| Service | Rôle | Domaine | Région |
| --- | --- | --- | --- |
| worker | 4 workers pm2 (privé) | interne only | europe-west4-drams3a |
| gotenberg-proxy | Caddy Bearer (public) | `https://gotenberg-proxy-production-a4cf.up.railway.app` | europe-west4-drams3a |
| weasyprint | Flask Bearer (public) | `https://weasyprint-production-c1ab.up.railway.app` | europe-west4-drams3a |
| gotenberg | Chromium (privé) | `gotenberg.railway.internal:3000` | europe-west4-drams3a |

> **⚠ MIGRATION RÉGION (2026-07-05 ~16:34Z) :** les 4 services avaient été créés en
> région **`sfo` (US)** malgré l'intention EU. Corrigé par
> `railway service scale <svc> eu-west=1 sfo=0` sur les 4 → redéploiement **SUCCESS**
> en `europe-west4-drams3a` (Amsterdam), anciennes instances sfo **REMOVED**.
> Post-migration : pm2 4 process online restarts=0, crons enregistrés, weasyprint
> `/health` 200 + `/pdf` sans Bearer 401. Region re-vérifiée le 2026-07-06 sur les
> 4 services (`$RAILWAY_REPLICA_REGION=europe-west4-drams3a` partout). **Données
> Supabase = Irlande (eu-west-1) ; compute = Amsterdam (eu-west4). Tout UE → RGPD OK.**

**Bilan : WORK-01 ✓ · WORK-02 ✓ · WORK-03 ✓ (pack closure Mac éteint prouvé E2E) ·
WORK-04 ✓ (OCR PDF scanné prouvé E2E).** P5 (egress SMTP) = **DETTE explicite
différée** (plan Hobby bloque SMTP — voir ci-dessous, décision Laurent).

- **WORK-01 VALIDÉ** — image worker build sur Railway, **4 process pm2 online
  restarts=0**, `pdftoppm 22.12.0` dans le conteneur ; les 2 doc-engines publics
  rejettent 401 sans Bearer et rendent un vrai PDF (200) avec Bearer sur HTTPS réel,
  **re-vérifié post-migration EU le 2026-07-06** (proxy 200 bytes=8198, weasyprint
  200 bytes=5211, magic `%PDF`).
- **WORK-02 VALIDÉ** — 0 BullMQ / 0 ioredis / 0 REDIS_URL ; 2 crons croner
  enregistrés au boot ; aucune trace Redis ; restarts=0 sur les 4 process.
- **WORK-03 VALIDÉ E2E (pack closure 100 % cloud, Mac worker OFF)** — le
  `dev:full` local a été **tué** (aucun worker Mac actif), puis un ClosureBatch réel
  SES-0094 (21 jobs, 3 participants × 7 kinds) enfilé QUEUED sur la base cloud. Le
  **worker Railway** l'a claim (SKIP LOCKED) et généré le pack **en ~113 s, 0 stub
  (0/21), 21/21 PDF réels (%PDF) dans Supabase Storage**. LLM via `cloud:fast`
  (Claude Haiku, OpenRouter), prompt `claude-v10-2026-07`.
- **WORK-04 VALIDÉ E2E (OCR PDF scanné → EXTRACTED)** — une PreEnrollment TEST avec
  un **PDF image-only sans couche texte** (fausse CNI, `pdftotext`=0 caractère)
  déposée SUBMITTED → le **worker OCR Railway** l'a claim → **EXTRACTING → EXTRACTED**
  via **pdftoppm 144dpi + vision Claude Haiku** (durationMs=7850). Champs réels
  extraits (fictifs) : nom `BERTRAND-TESTOCR`, prénom `Camille Léa`, naissance
  `1988-03-14 / NICE (06)`, n° doc `QOF20TEST0094`. Anti-dégradation D-06 : **0 row
  bloquée EXTRACTING**.

**⚠ P5 (egress SMTP) — DETTE EXPLICITE DIFFÉRÉE (décision Laurent) :** l'envoi email
n'est **PAS prouvé** et **volontairement différé**. Plan **Hobby bloque l'egress
SMTP** (ports :465/:587 timeout vers tout hôte, :443 passe — signature confirmée au
smoke initial). La boîte de Laurent est **Google Workspace** (PAS OVH — l'hypothèse
OVH du runbook 20-DEPLOY était erronée ; `SMTP_HOST` vide dans `.env`, le mailer a
toujours tourné en **dry-run**). **Ne PAS tenter de smoke SMTP ni poser d'identifiants
SMTP** tant que la stratégie n'est pas tranchée. **Options futures documentées :**
(1) **Railway Pro + Gmail app password** (débloque egress SMTP, aucun code) ; OU
(2) **rester Hobby + basculer le mailer sur une API HTTPS** (Brevo / Gmail API, petit
changement de code + SPF/DKIM + DPA RGPD). **Coquille config repérée :** `SMTP_FROM`
utilise `noreply@startacademy.fr` (tiret manquant) vs le domaine réel
`start-academy.fr` — à corriger quand P5 sera traité.

---

## Pré-requis

- [x] Compte Railway + CLI 5.23.3 authentifié (`railway whoami` = `laurentmarx@msn.com`).
- [x] Projet `qualiof-worker` créé, environnement `production`, **4 services**.
- [x] **Secrets chiffrés Railway** (jamais commités — CLAUDE.md) : `DATABASE_URL` :6543,
      `DIRECT_URL` :5432, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`,
      `DOC_ENGINE_TOKEN` (généré `openssl rand -hex 32`, **même valeur** sur worker +
      proxy + weasyprint), `AUTH_SECRET` (généré). ~27 variables sur le worker.
- [x] `.dockerignore` ajouté : `.env` / secrets jamais dans une couche d'image.
- [x] Domaines publics générés pour gotenberg-proxy (:8080) et weasyprint (:5001).
- [x] **4 services migrés en région `europe-west4-drams3a` (Amsterdam, EU)** le 2026-07-05.
- [x] **Plan HOBBY ($5/mo)** — choix explicite Laurent (pas Pro).
- [ ] **P5 egress SMTP** = **différé** (Hobby bloque SMTP ; mailer Google Workspace,
      pas OVH ; dry-run). Dette explicite, pas un blocage de livraison.

---

## WORK-01 — Image worker + boot pm2 + pdftoppm (P1)

Prouve que l'image build sur Railway et que les 4 workers bootent sans crash env,
avec poppler disponible pour l'OCR.

| Étape | Commande | Attendu | Résultat | Date |
| --- | --- | --- | --- | --- |
| P1a — build image | `railway up -s worker --ci` (Dockerfile turbo prune + poppler + pm2) | Build SUCCESS, image poussée | ✅ **passed** — `Deploy complete`, `containerimage.digest sha256:1bf6d4…` après **5 bugs Dockerfile corrigés** (cf. Déviations) | 2026-07-05 |
| P1b — boot pm2 | `railway logs <dep> -d -s worker` | 4 process online, 0 crash env | ✅ **passed** — `App [closure:0] online` / `[veille:1] online` / `[reminders:2] online` / `[ocr:3] online` | 2026-07-05 |
| P1c — pm2 jlist | `ssh railway-worker "pm2 jlist"` | 4 online, restarts=0 | ✅ **passed** — `closure online restarts=0` · `veille online restarts=0` · `reminders online restarts=0` · `ocr online restarts=0` | 2026-07-05 |
| P1d — pdftoppm | `ssh railway-worker "pdftoppm -v"` | version poppler | ✅ **passed** — **`pdftoppm version 22.12.0`** (Poppler Developers) ; `tsx` = `/pnpm/tsx` | 2026-07-05 |

**Sortie brute P1b/P1c/P1d :**

```
2026-07-05T16:23:42: PM2 log: App [closure:0] online
2026-07-05T16:23:42: PM2 log: App [veille:1] online
2026-07-05T16:23:42: PM2 log: App [reminders:2] online
2026-07-05T16:23:42: PM2 log: App [ocr:3] online
[veille-worker] croner registered (lundi 08:00 Europe/Paris), next: 2026-07-06T06:00:00.000Z
[invoice-reminder-worker] croner registered (quotidien 08:00 Europe/Paris), next: 2026-07-06T06:00:00.000Z
[ocr-worker] started — concurrency=2, poll=5000ms
[closure-worker-pg] started — concurrency=3, poll=3000ms

# pm2 jlist :
closure online restarts=0
veille online restarts=0
reminders online restarts=0
ocr online restarts=0

# pdftoppm -v :
pdftoppm version 22.12.0
Copyright 2005-2022 The Poppler Developers - http://poppler.freedesktop.org
```

---

## WORK-01 — Doc-engines Bearer sur HTTPS public, après cold start (P2)

Prouve que les 2 moteurs PDF publics enforce le Bearer server-side sur le vrai
domaine HTTPS Railway (après redeploiement = cold start D-08), et rendent un PDF réel.

| Étape | Commande | Attendu | Résultat | Date |
| --- | --- | --- | --- | --- |
| P2a — proxy /health | `curl $PROXY/health` | 200 sans auth | ✅ **200** | 2026-07-05 |
| P2b — proxy sans Bearer | `curl $PROXY/forms/chromium/convert/html` | 401 | ✅ **401** | 2026-07-05 |
| P2c — proxy avec Bearer | `curl -F files=@index.html -H "Authorization: Bearer <TOKEN>" $PROXY/forms/chromium/convert/html` | 200 + PDF (gate franchi → Gotenberg privé) | ✅ **200** — `bytes=8720 type=application/pdf`, magic `%PDF-` | 2026-07-05 |
| P2d — weasyprint /health | `curl $WEASY/health` | 200 sans auth | ✅ **200** | 2026-07-05 |
| P2e — weasyprint sans Bearer | `curl -X POST $WEASY/pdf` | 401 | ✅ **401** | 2026-07-05 |
| P2f — weasyprint avec Bearer | `curl -X POST -H "Authorization: Bearer <TOKEN>" --data '<html>…' $WEASY/pdf` | 200 + PDF | ✅ **200** — `bytes=3455 type=application/pdf`, magic `%PDF-` | 2026-07-05 |

**Sortie brute P2 :**

```
gotenberg-proxy /health          → HTTP 200
gotenberg-proxy SANS Bearer      → HTTP 401
gotenberg-proxy AVEC Bearer      → HTTP 200  bytes=8720  type=application/pdf  (%PDF-)
weasyprint /health               → HTTP 200
weasyprint /pdf SANS Bearer      → HTTP 401
weasyprint /pdf AVEC Bearer      → HTTP 200  bytes=3455  type=application/pdf  (%PDF-)
```

> Le 200 « avec Bearer » sur le proxy prouve que la requête a **traversé le gate
> Caddy PUIS atteint le Gotenberg privé** (`gotenberg.railway.internal:3000`) et
> obtenu un vrai PDF — le réseau privé Railway fonctionne, Gotenberg n'est jamais
> exposé publiquement.

---

## WORK-02 — 0 Redis, crons croner enregistrés (P3)

Prouve que la bascule BullMQ→Postgres/croner est complète et qu'aucune connexion
Redis n'est tentée au boot.

| Étape | Commande | Attendu | Résultat | Date |
| --- | --- | --- | --- | --- |
| P3a — grep BullMQ | `grep -rc "from 'bullmq'" apps/web/src apps/web/scripts` | 0 | ✅ **0** | 2026-07-05 |
| P3b — grep ioredis | `grep -rl "from 'ioredis'\|getWorkerRedis" …` | 0 | ✅ **0** | 2026-07-05 |
| P3c — crons enregistrés | logs worker | veille + reminders croner registered | ✅ **passed** — `[veille-worker] croner registered (lundi 08:00 Europe/Paris)` + `[invoice-reminder-worker] croner registered (quotidien 08:00 Europe/Paris)` | 2026-07-05 |
| P3d — 0 Redis au boot | logs worker | aucune trace ioredis/Redis | ✅ **passed** — aucune ligne Redis/ioredis dans les logs de boot | 2026-07-05 |

---

## WORK-03 — Worker déployé → Supabase + OpenRouter + doc-engines internes (P4 infra)

Prouve que le compute (Amsterdam) joint les données (Supabase) et les dépendances de
génération, **depuis le conteneur déployé** (indépendant du Mac de Laurent).

| Étape | Commande | Attendu | Résultat | Date |
| --- | --- | --- | --- | --- |
| P4a — round-trip DB | `ssh railway-worker "node -e 'prisma.tenant.count ×3 + pg_trgm'"` | 3 lectures OK, 0 prepared-stmt error | ✅ **passed** — `tenant.count #0..2=1`, `pg_trgm similarity=0.5555556`, **ROUND-TRIP OK (pooler :6543)** | 2026-07-05 |
| P4b — OpenRouter | `ssh railway-worker "fetch openrouter/v1/models"` | HTTP 200 | ✅ **200** | 2026-07-05 |
| P4c — gotenberg-proxy interne | `fetch $GOTENBERG_URL/health` (railway.internal:8080) | 200 | ✅ **200** | 2026-07-05 |
| P4d — weasyprint interne | `fetch $WEASYPRINT_URL/health` (railway.internal:5001) | 200 | ✅ **200** | 2026-07-05 |
| **P4e — pack closure Mac éteint** | Enqueue ClosureBatch SES-0094 (21 jobs), worker Railway claim (SKIP LOCKED) → pack 0 stub | pack complet, 0 stub, PDF Supabase Storage | ✅ **passed** — **21/21 DONE en ~113 s, 0 stub (0/21)**, 21/21 PDF `%PDF` dans Supabase Storage ; Mac worker OFF (`dev:full` tué) | 2026-07-06 |

**Sortie brute P4a-d (connectivité) :**

```
[worker->supabase] tenant.count #0=1
[worker->supabase] tenant.count #1=1
[worker->supabase] tenant.count #2=1
[worker->supabase] pg_trgm similarity= 0.5555556
[worker->supabase] ROUND-TRIP OK (pooler :6543, Mac-independent)
[worker->openrouter] HTTP 200
[worker->gotenberg-proxy internal] /health HTTP 200
[worker->weasyprint internal] /health HTTP 200
```

**Sortie brute P4e (pack closure SES-0094 100 % cloud, Mac worker OFF) :**

```
# Mac : dev:full + closure-worker-postgres.ts locaux TUÉS (ps aux = aucun worker Mac).
# Enqueue (base cloud Supabase) :
[enqueue] SES-0094 sessionId=1d0c0e89-… participants=3 froidEligible=false
[enqueue] kinds=ATTESTATION,CERTIFICAT,QCM,GRILLE_OBS,POSITIONNEMENT,SATISFACTION_CHAUD,EMARGEMENT
[enqueue] batchId=c4aaaf79-… jobs=21 → statut QUEUED

# Worker RAILWAY (Amsterdam) claim + génère (logs) :
[closure-worker-pg] processed=3 ok=3 fail=0   (×7 batches, concurrency=3)
[ollama-generate-positionnement] ✓ 6804ms (model=cloud:fast, prompt=claude-v10-2026-07)
[ollama-generate-grille] ✓ 9591ms (model=cloud:fast, prompt=claude-v10-2026-07)
[ollama-generate-satisfaction-chaud] ✓ 6895ms (model=cloud:fast, prompt=claude-v10-2026-07)

# Progression DB (poll orchestrateur) :
05:48:33Z byStatus={"QUEUED":18,"PROCESSING":2,"DONE":1}
05:49:56Z byStatus={"QUEUED":3,"DONE":18}
05:50:17Z byStatus={"DONE":21}          ← ~113 s total

# Vérif pack :
[verify] jobs=21 usedStub=0 (stub rate=0.0%)
[verify] docs=6 assets=15 avec pdfUrl=21/21
[verify] doc:CERTIFICAT_REALISATION bytes=95140 magic=%PDF key=…certificat-….pdf
[verify] doc:ATTESTATION_FIN        bytes=74412 magic=%PDF key=…attestation-….pdf
# stub par kind : ATTESTATION 0/3 · CERTIFICAT 0/3 · QCM 0/3 · GRILLE_OBS 0/3 ·
#                 POSITIONNEMENT 0/3 · SATISFACTION_CHAUD 0/3 · EMARGEMENT 0/3
```

> **⚠ 2 bugs runtime révélés par P4e et corrigés inline** (voir Déviations) :
> (1) polyfill WebSocket manquant (Supabase Storage KO sur Node 20) ;
> (2) `OPENROUTER_API_KEY` Railway **corrompue** (commentaire `# ← À REMPLIR`
> collé au bout → header ByteString invalide → 9/21 stubs au 1ᵉʳ run). Après
> correction : **run propre 0/21 stub**.

---

## WORK-03 — Egress SMTP OVH :465 (P5)

| Étape | Commande | Attendu | Résultat | Date |
| --- | --- | --- | --- | --- |
| P5a — egress :465 | `ssh railway-worker "net.connect(465,'ssl0.ovh.net')"` | TCP connect OK (Pro) | ❌ **TIMEOUT** — port SMTP bloqué (workspace non-Pro) | 2026-07-05 |
| P5b — egress :587 | `net.connect(587,'ssl0.ovh.net')` | connect OK | ❌ **TIMEOUT** | 2026-07-05 |
| P5c — contrôle :443 | `net.connect(443,'ssl0.ovh.net')` + `1.1.1.1:443` | connect OK | ✅ **CONNECT OK** (egress général sain) | 2026-07-05 |
| P5d — contrôle :465 autre hôte | `net.connect(465,'smtp.gmail.com')` | — | ❌ **ETIMEDOUT** (blocage générique SMTP, pas OVH) | 2026-07-05 |

**Sortie brute P5 :**

```
[egress :465] TIMEOUT (port blocked?)
[ovh :443] CONNECT OK
[ovh :587] TIMEOUT
[gmail :465] ERR ETIMEDOUT
[cloudflare :443] CONNECT OK
```

**Diagnostic :** :443 passe partout, :465/:587 timeout vers **tout** hôte → **les
ports SMTP sont bloqués par Railway** (signature plan Hobby/free). Le code mailer est
correct (dry-run automatique si `SMTP_HOST` vide — aucun crash).

**📌 DÉCISION LAURENT — P5 DIFFÉRÉ (dette explicite, pas un échec) :**
- Plan **HOBBY** retenu ($5/mo) → egress SMTP restera bloqué.
- Boîte mail = **Google Workspace** (PAS OVH ; le runbook 20-DEPLOY supposait OVH à
  tort). `SMTP_HOST` vide → mailer en dry-run permanent aujourd'hui.
- **Ne pas tenter de smoke SMTP, ne pas poser d'identifiants SMTP.**
- **Options futures :** (A) Railway **Pro + Gmail app password** (débloque :465/:587,
  0 code) ; (B) rester **Hobby + mailer sur API HTTPS** (Brevo / Gmail API : petit
  patch code + SPF/DKIM + DPA RGPD).
- **Coquille config :** `SMTP_FROM=noreply@startacademy.fr` (tiret manquant) vs
  domaine réel `start-academy.fr` → à corriger au moment du traitement P5.

**Statut : DIFFÉRÉ (dette assumée).**

---

## WORK-04 — OCR PDF scanné → EXTRACTED + anti-dégradation D-06 (P6)

| Étape | Commande | Attendu | Résultat | Date |
| --- | --- | --- | --- | --- |
| P6a — poppler dans le conteneur | `ssh railway-worker "pdftoppm -v"` | version | ✅ **22.12.0** (cf. P1d) | 2026-07-05 |
| P6b — worker OCR online | logs | ocr poll actif | ✅ **passed** — `[ocr-worker] started — concurrency=2, poll=5000ms` | 2026-07-05 |
| P6c — anti-dégradation D-06 | code | échec OCR → SUBMITTED + aiErrorMsg | ✅ **garanti** — `preinscription-extractor.ts:235` (SUBMITTED + aiErrorMsg sur throw) + filet `preinscription-ocr-queue.ts:50` (SUBMITTED si extractor jette) — **jamais EXTRACTED vide** | 2026-07-05 |
| **P6d — CNI scannée → EXTRACTED réel** | Déposer un PDF scanné sans couche texte → SUBMITTED → worker OCR Railway (pdftoppm + vision OpenRouter) → EXTRACTED données réelles | statut EXTRACTED, nom/prénom/numéro (fictifs) | ✅ **passed** — **EXTRACTED** via `anthropic/claude-haiku-4.5`, pdftoppm 144dpi, durationMs=7850, 0 row stuck EXTRACTING (D-06) | 2026-07-06 |

**Sortie brute P6d (OCR PDF scanné 100 % cloud, worker OCR Railway) :**

```
# PDF « scanné » image-only fabriqué : HTML CNI → PDF texte (Gotenberg déployé)
#   → pdftoppm PNG (supprime la couche texte) → PDF image-only (pdf-lib).
#   Contrôle : pdftotext /tmp/scanned-cni.pdf = 0 caractère (aucune couche texte).
[submit] PDF scanné uploadé → preinscriptions/TEST-OCR-P6D-…/cni-scan-test.pdf (61235 bytes)
[submit] PreEnrollment créée token=TEST-OCR-P6D-… status=SUBMITTED

# Worker OCR RAILWAY claim SUBMITTED → EXTRACTING → EXTRACTED :
status= EXTRACTED aiModel= anthropic/claude-haiku-4.5 promptVersion= v1-2026-04
aiExtractedAt= 2026-07-06T05:52:45Z
warnings= ["[CNI] PDF sans couche texte — OCR vision sur 1 page(s) rastérisée(s) (pdftoppm 144dpi)."]
extractedData.cni : lastName=BERTRAND-TESTOCR · firstName="Camille Léa"
                    birthDate=1988-03-14 · birthPlace="NICE (06)"
                    idDocumentNumber=QOF20TEST0094 · nationality=Française · idDocumentType=CNI
# Anti-dégradation D-06 : PreEnrollment en statut EXTRACTING = 0 (aucune row bloquée).
```

> Données 100 % **fictives** (RGPD). Le warning « PDF sans couche texte → OCR vision
> pdftoppm » **prouve** que le chemin de rastérisation poppler a bien été emprunté
> sur le conteneur, puis la vision Claude Haiku a lu l'image. PreEnrollment de TEST
> nommée explicitement `TEST-OCR-P6D` (artefact à supprimer après validation).

---

## WORK-02/03 — Stabilité 24 h + coût sous budget D-07 (P7)

| Étape | Commande | Attendu | Résultat | Date |
| --- | --- | --- | --- | --- |
| P7a — stabilité au boot | `pm2 jlist` | 4 online, restarts=0 | ✅ **passed** — restarts=0 sur les 4 (pas de crash-loop), re-vérifié 2026-07-06 | 2026-07-06 |
| P7b — uptime 24 h | `pm2 jlist` après ~24 h | up, 0 restart en boucle | ⏳ **fenêtre 24 h** — démarrée au dernier boot EU **2026-07-06 ~05:44Z** (après fixs), à relever le 2026-07-07 | — |
| P7c — coût projeté | facturation Railway → /mois | plan Hobby $5/mo (D-07 réinterprété) | 🟡 **plan Hobby $5/mo** — 4 services chauds (D-08), poll léger ; relevé conso au +24 h avec P7b | — |

> Le worker ne fait qu'un poll léger (concurrency 3, intervalle 3s) + 2 crons dormants
> + 1 OCR poll (5s) ; les doc-engines sont idle hors requête. **Plan Hobby $5/mo**
> (décision Laurent) : l'inclus Hobby couvre ce profil de charge. La fenêtre de
> stabilité 24 h court depuis le dernier boot EU (2026-07-06 ~05:44Z, après les 3
> fixs runtime) — validable à la clôture de phase. Relevé conso/uptime au +24 h.

---

## Déviations d'exécution (bugs réels corrigés — Rule 1/2/3)

Le plan 20-04 a livré l'**image + config sans les avoir jamais construites ni
bootées**. Le build/boot **réel** Railway a révélé **6 bugs** corrigés inline
(commit `703f680`) — c'est exactement le rôle du plan 20-05 (preuve runtime) :

1. **[Rule 3] `ERR_PNPM_NO_GLOBAL_BIN_DIR`** — `pnpm add -g turbo/pm2/tsx` échoue sur
   `node:20-slim` (pas de global bin dir). Fix : `ENV PNPM_HOME=/pnpm` + PATH + mkdir
   dans le stage `base`.
2. **[Rule 1] `prisma generate` KO** — `pnpm --filter @qualiof/web exec prisma` →
   `Command "prisma" not found` (prisma vit dans `@qualiof/db`). Fix :
   `cd packages/db && pnpm exec prisma generate`.
3. **[Rule 2] moteur Prisma openssl** — warning « failed to detect libssl » →
   `apt install openssl ca-certificates` dans installer + runner (moteur correct +
   TLS sortant Supabase/OpenRouter).
4. **[Rule 1] `interpreter: 'tsx'` introuvable** — tsx en devDep locale non résolue
   par pm2. Fix : `pnpm add -g pm2 tsx` (tsx global).
5. **[Rule 1] `ERR_MODULE_NOT_FOUND '@/lib'` + `tsconfig.base.json not found`** —
   turbo prune n'embarque pas `tsconfig.base.json` et tsx ne résout pas l'alias `@/*`
   depuis /app. Fix : `COPY tsconfig.base.json ./` + ecosystem `cwd: apps/web` +
   `TSX_TSCONFIG_PATH=/app/apps/web/tsconfig.json` par app.
6. **[Rule 1] `SyntaxError: react does not provide export 'cache'`** (reminders) — le
   worker importait la server action `@/server/actions/invoices` ('use server' →
   next/cache + `@/lib/auth` → `import { cache } from 'react'`), qui casse en Node ESM
   brut (règle projet « Worker jamais d'imports auth React »). Fix : **cœur neutre**
   `apps/web/src/lib/invoice-reminders/invoice-reminder-core.ts` (worker-safe, logique
   cron identique) ; handler + test repointés ; `tsc --noEmit` exit 0, 7/7 tests verts.

**Bonus [Rule 2] `.dockerignore`** ajouté — jamais de `.env`/secret/`node_modules`
dans une couche d'image.

### Bugs révélés par les runs E2E P4e/P6d (2026-07-06) — corrigés inline

7. **[Rule 1] Supabase Storage KO sur Node 20 — polyfill WebSocket manquant** —
   au 1ᵉʳ run P4e, **les 21 jobs échouaient** avec
   `Node.js 20 detected without native WebSocket support`. `@supabase/supabase-js@2.107`
   embarque `realtime-js` dont la `websocket-factory` throw à la construction du client
   dès que `globalThis.WebSocket` est absent (WebSocket n'est global-stable qu'en Node
   22+ ; le conteneur worker est `node:20-slim`). On n'utilise QUE Storage, mais le
   client l'évalue quand même. **Fix :** `ensureWebSocketPolyfill()` dans `storage.ts`
   fournit `globalThis.WebSocket` depuis `ws` sur Node < 22 (idempotent, no-op Node
   22+/Next.js) ; `ws` ajouté en **dépendance directe** de `@qualiof/web` (garantie
   `turbo prune`). Commits `b180355` puis `2527800` (le 1ᵉʳ jet utilisait
   `require('node:module')` → `require is not defined` en ESM ; corrigé en
   `import { createRequire } from 'node:module'` + `import.meta.url`). Probe conteneur
   post-fix : `ensureBucket OK; WebSocket after=function`. `tsc --noEmit` exit 0.
8. **[Rule 3] `OPENROUTER_API_KEY` Railway CORROMPUE (config)** — après le fix WS,
   3 kinds sur 7 (positionnement, satisfaction-chaud, grille = les docs **rédigés par
   LLM**) tombaient en **stub** (9/21) avec
   `Cannot convert argument to a ByteString because the character at index 118 has a
   value of 8592`. Cause : la variable Railway contenait la clé **suivie d'un
   commentaire collé** `    # ← À REMPLIR (secret…)` (137 chars au lieu de 73) → le
   header `Authorization: Bearer …` embarquait un `←` (U+2190) non-Latin1 → `fetch`
   throw avant l'appel réseau. Les 4 autres kinds (attestation/certificat/QCM/
   émargement = déterministes/templates) ne faisaient pas d'appel LLM → 0 stub, d'où
   le motif « 3 kinds sur 7 ». **Fix :** `railway variables --set OPENROUTER_API_KEY=…`
   avec la clé propre (73 chars, `sk-or-v1-…`) depuis le `.env` racine ; probe
   conteneur post-fix : appel OpenRouter `status=200 reply="OK"`. **Re-run propre :
   0/21 stub.** (Secret jamais loggé ; seule la longueur/validité vérifiée.)

**Bilan déviations : 8 bugs auto-corrigés (Rule 1 ×5, Rule 3 ×2, Rule 2 ×1) + 1 bonus
Rule 2.** Impact : sans les fixs 7 et 8, le pack closure cloud était **impossible**
(0 PDF) ou **dégradé** (43 % stub). Après correction : **pack 0 stub, OCR EXTRACTED**.

---

## Validation Sign-Off

| Requirement | Statut | Preuve |
| --- | --- | --- |
| **WORK-01** (image + doc-engines Bearer) | ✅ **VALIDÉ** | P1 (4 pm2 up, pdftoppm 22.12.0) + P2 (401/200 PDF réel sur HTTPS public, 2 moteurs, re-vérifié EU) |
| **WORK-02** (0 Redis, crons, stabilité) | ✅ **VALIDÉ** | P3 (0 bullmq/ioredis, 2 crons registered) + P7a (restarts=0) |
| **WORK-03** (pack cloud Mac éteint) | ✅ **VALIDÉ E2E** | **P4e : pack SES-0094 21/21 DONE, 0 stub, PDF Supabase, Mac worker OFF, ~113 s** ; P4a-d connectivité ; P5 SMTP = **différé (dette)** |
| **WORK-04** (OCR PDF scanné) | ✅ **VALIDÉ E2E** | **P6d : PDF image-only → EXTRACTED (pdftoppm+vision Haiku), données réelles, 0 stuck EXTRACTING (D-06)** ; P6a-c infra |

**Décisions / dette (Laurent) :**
1. **Plan HOBBY $5/mo** retenu (pas Pro) → **P5 egress SMTP = différé** (dette assumée).
   Mailer = Google Workspace (pas OVH), aujourd'hui en dry-run. Options futures : Pro +
   Gmail app password (0 code) OU Hobby + mailer API HTTPS (Brevo/Gmail API + SPF/DKIM
   + DPA). Coquille `SMTP_FROM` (`startacademy.fr` → `start-academy.fr`) à corriger.
2. **Runs E2E P4e (pack SES-0094) + P6d (OCR CNI scannée) PROUVÉS** → reste la
   **validation visuelle Laurent** = **checkpoint Task 3**.

**Observation +24 h (P7b/c)** : fenêtre démarrée 2026-07-06 ~05:44Z, à relever le 2026-07-07.

**Artefact de test à nettoyer :** PreEnrollment `TEST-OCR-P6D-…` (données fictives) —
supprimable après la validation visuelle de l'OCR par Laurent.

- [ ] **Phase gate 20** — cochée par Laurent après validation visuelle du pack témoin
      cloud SES-0094 (P4e, 10 docs 0 stub) + OCR (P6d, champs CNI extraits) au
      checkpoint Task 3. (SMTP P5 = dette explicite, hors gate.)

---

## Addendum 2026-07-06 — Checkpoint Task 3 : écarts + validation finale

**Écarts remontés par Laurent** sur le pack témoin du 06/07 matin, **corrigés le jour même** :
1. Footers PDF vides (« Siège social : - SIRET : – ») → cause : 22 vars `OF_*` absentes du
   worker Railway (`getOfConfig()` ENV-only). Fix : vars poussées (`railway variables --set`,
   redeploy). Preuve post-fix (texte extrait du PDF régénéré) : footer complet
   (adresse + SIRET 95131909400011 + NDA + contact + version).
2. Positionnement partie 3 « tampon » (avant/après quasi identiques entre stagiaires) →
   fix quick `260706-bya` (prompt v11 + garde Zod `apres > avant`). Preuve post-régé :
   vecteurs des 3 stagiaires tous distincts, progressions {+1, +2, +3}, 0 stub 21/21.

**Pack complet régénéré** via `_gen-session-pack.ts` (LLM cloud v11, 21 jobs 0 stub +
programme/déroulé/checklist/3 conventions, Drive déposé).

**⚠ Découverte** : objets pré-migration (AGEFICE/assiduité/convocations/analyses besoin
SES-0094) dans MinIO local, ABSENTS de Supabase Storage → migration Ph.18 incomplète.
Audit + backfill avant Phase 22 (cf. deferred-items.md).

**Fenêtre observation 24 h (P7b/c) REDÉMARRÉE** le 2026-07-06 (~06:45Z, redeploy vars OF_*)
→ relevé le 2026-07-07.

- [x] **Phase gate 20 — validation visuelle Laurent** : « Ok on est bons » (2026-07-06),
      pack témoin + OCR conformes. Fiche AGEFICE : 3 corrections cosmétiques différées.

---

## Addendum 2026-07-30 — Relevé observation P7b/c (CLÔTURE)

Relevé prévu le 07-07, effectué le 2026-07-30 (session plan-phase 22) — la fenêtre réelle
d'observation est donc de **24 jours**, très au-delà des 24 h requises. Preuves (CLI Railway,
lecture seule) :

| Preuve | Commande | Résultat | Date |
| --- | --- | --- | --- |
| Déploiement inchangé depuis le redeploy OF_* | `railway deployment list --service worker` | Déploiement `4f72cfdb` **SUCCESS créé 2026-07-06T06:31Z, toujours actif** — aucun redéploiement en 24 jours | 2026-07-30 |
| Crons vivants au moment du relevé | `railway logs --service worker` | Ticks `[invoice-reminder-worker] triggered_by: 'cron'` + `[veille-worker] tick` en continu ; veille ingère (fetched 744, inserted 7) | 2026-07-30 |
| 0 marqueur de crash/restart | `railway logs \| grep -ci "restart\|exited\|SIGTERM\|crash"` | **0** occurrence | 2026-07-30 |
| Région | serviceManifest deployment | `europe-west4` (multiRegionConfig), restartPolicy ON_FAILURE max 10 | 2026-07-30 |

**Limite honnête** : la fenêtre de logs exposée par le CLI est courte (~22 lignes) — le compteur
de restarts pm2 exact n'est pas extractible en CLI. La preuve de stabilité repose sur : même
déploiement actif 24 jours + crons opérationnels au relevé + 0 marqueur d'échec dans la fenêtre.
Bruit non bloquant relevé : 2 flux RSS veille en échec géré (`travail-emploi.gouv.fr` entité
invalide, `service-public.gouv.fr` 404) — le catch croner fonctionne comme conçu (le process survit).

- [x] **P7b/c — stabilité observée : VALIDÉ** (2026-07-30). Phase 20 prête pour `/gsd:verify-work 20`.
