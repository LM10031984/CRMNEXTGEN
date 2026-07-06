# 20-DEPLOY — Runbook de provisioning Railway (3ᵉ hôte)

> **Pour qui ?** Ce runbook est écrit pour être suivi au **dashboard Railway** par un
> non-technicien (Laurent, D-01). Aucune commande à taper : tout se fait par clic
> et copier-coller de variables. L'exécution réelle (créer les services, coller les
> secrets, prouver 24 h Mac éteint) est le **plan 20-05** — ce document est la carte.

Le 3ᵉ hôte déplace **tout le compute long-vivant** de QualiOF (4 workers de fond +
2 moteurs PDF + rastérisation OCR poppler) du Mac de Laurent vers Railway, pour
qu'un pack closure et une pré-inscription IA se génèrent **bout-en-bout, Mac éteint**.
Les données restent sur Supabase Paris — seul le compute est à Amsterdam.

---

## 1. Compte + région

1. Créer (ou réutiliser) un compte Railway et **activer le plan Pro (~20 $/mo)**.
   - **Pro est OBLIGATOIRE**, pas un confort : Railway ne débloque l'egress SMTP
     (ports 465/587) que sur Pro. Sans Pro, les **relances factures OVH :465
     échouent silencieusement** (le mailer retourne `{ ok:false }`, aucun crash).
     Le plan Pro couvre aussi le budget cible D-07 (~20-25 €/mois).
2. Créer un projet Railway, ex. **`qualiof-worker`**, en région **`europe-west4`**
   (Amsterdam, EU — conforme RGPD/Qualiopi, cf `17-REGIONS.md`).
   - **Checklist anti-défaut-US (17-REGIONS D-01)** : sélectionner **`europe-west4`
     EXPLICITEMENT** à la création. Ne JAMAIS laisser la région par défaut (risque
     US silencieux). Vérifier la région affichée avant de valider.
   - Railway est **mutable** : la région se change à chaud sans downtime (hors volume
     attaché) — contrairement à Supabase qui est immuable. Mais on vise juste du
     premier coup.

---

## 2. Les 3 services du projet (+ 1 privé)

| Service | Source | Dockerfile | Port | Public ? |
| --- | --- | --- | --- | --- |
| **worker** | ce repo | `docker/worker/Dockerfile` | (aucun — 4 workers de fond) | non |
| **gotenberg-proxy** | ce repo | `docker/gotenberg-proxy/Dockerfile` | `PORT` (8080) | **OUI** (domaine public, Bearer) |
| **weasyprint** | ce repo | `docker/weasyprint/Dockerfile` | 5001 | **OUI** (domaine public, Bearer) |

- **worker** : image monorepo prunée + poppler + pm2 lançant 4 workers (closure
  Postgres, veille croner, relances croner, OCR poll). Pas de domaine public : il
  ne fait qu'appeler la base et les doc-engines.
- **gotenberg-proxy** : mini reverse-proxy Caddy qui valide le Bearer (Gotenberg 8
  ne parle QUE basic-auth, Pitfall 4) puis forward vers Gotenberg. Public car
  Vercel (Phase 21) l'attaquera par le domaine public.
- **weasyprint** : Flask qui enforce le Bearer server-side (`_enforce_bearer`).

**4ᵉ service privé — Gotenberg lui-même** : ajouter l'image publique
`gotenberg/gotenberg:8` comme service **privé** (pas de Dockerfile repo), écoute
`:3000`, joint par le proxy en `gotenberg.railway.internal:3000`. Non exposé.

**Réseau privé Railway** : les services d'un même projet se joignent en
`<service>.railway.internal` (IPv4+IPv6, chiffré). Le worker appelle les
doc-engines en interne ; Vercel (hors réseau Railway) les appellera par leur
domaine public en Phase 21.

---

## 3. Variables de service — worker (~15 clés)

À saisir dans **Railway → service worker → Variables**. Les valeurs cloud
proviennent des phases 16/18/19. Le boot est **fail-loud** (`packages/shared/src/env.ts`) :
une clé requise absente/malformée fait crasher le worker au démarrage (voulu).

| Variable | Valeur / source | Secret ? |
| --- | --- | --- |
| `DATABASE_URL` | Supabase transaction pooler **:6543** `?pgbouncer=true&connection_limit=1` (Phase 19) | oui |
| `DIRECT_URL` | Supabase session pooler **:5432** sans pgbouncer (Phase 19) | oui |
| `STORAGE_PROVIDER` | `supabase` (Phase 18) | non |
| `SUPABASE_URL` | URL projet Supabase (Phase 18) | non |
| `SUPABASE_SERVICE_ROLE_KEY` | clé service_role Supabase (Phase 18) | **OUI** |
| `NEXT_PUBLIC_SUPABASE_URL` | = `SUPABASE_URL` (publiable) | non |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé anon Supabase (publiable) | non |
| `OPENROUTER_API_KEY` | clé OpenRouter (Phase 16) | **OUI** |
| `DOC_ENGINE_TOKEN` | secret partagé worker/proxy/weasyprint — **même valeur partout** (`openssl rand -hex 32`) | **OUI** |
| `AUTH_SECRET` | min 32 chars — requis par le boot fail-loud même si le worker ne s'en sert pas (`env.ts:86`) | **OUI** |
| `SMTP_HOST` | `ssl0.ovh.net` (OVH) | non |
| `SMTP_PORT` | `465` | non |
| `SMTP_SECURE` | `true` | non |
| `SMTP_USER` | identifiant boîte OVH | non |
| `SMTP_PASS` | mot de passe boîte OVH | **OUI** |
| `SMTP_FROM` | `QualiOF <noreply@startacademy.fr>` | non |
| `GOTENBERG_URL` | `http://gotenberg-proxy.railway.internal:8080` (interne worker) | non |
| `WEASYPRINT_URL` | `http://weasyprint.railway.internal:5001` (interne worker) | non |
| `AI_PROVIDER` | `openrouter` (Phase 16, global) | non |

**Recalibrage cloud optionnel (WORK-03 / D-09)** — surcharge les défauts de
`ecosystem.config.cjs`, à ne toucher que si nécessaire (sous pooler
`connection_limit=1`, garder concurrency ~3) :
`QUEUE_CONCURRENCY` (3), `QUEUE_POLL_INTERVAL_MS` (3000), `OCR_CONCURRENCY` (2),
`OCR_POLL_INTERVAL_MS` (5000).

> **Sécurité (CLAUDE.md)** : les variables marquées **secret=OUI**
> (`SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `DOC_ENGINE_TOKEN`,
> `AUTH_SECRET`, `SMTP_PASS`) sont des **variables de service chiffrées Railway** —
> jamais en clair ailleurs, jamais commitées. `REDIS_URL` n'existe plus (Redis viré, D-03).

---

## 4. Variables des 2 doc-engines

- **gotenberg-proxy** (Caddy) :
  - `DOC_ENGINE_TOKEN` — **même valeur** que le worker (secret).
  - `GOTENBERG_UPSTREAM` = `gotenberg.railway.internal:3000` (le vrai Gotenberg privé).
  - `PORT` = `8080` (Railway l'injecte ; le Caddyfile écoute `:{$PORT:8080}`).
- **weasyprint** (Flask) :
  - `DOC_ENGINE_TOKEN` — **même valeur** que le worker (secret). `/health` reste
    exempté du Bearer (probe liveness Railway).

---

## 5. Preuves à produire (→ plan 20-05)

L'exécution réelle et sa preuve sont **le plan 20-05**. Critères de succès :

1. **Pack closure 100 % cloud, Mac éteint** — générer un pack fin de formation
   complet alors que le Mac de Laurent est hors ligne ; tous les workers tournent
   sur Railway.
2. **OCR PDF scanné** — déposer un PDF scanné sans couche texte (CNI iPhone
   « Scanner ») → le worker rastérise via **pdftoppm/poppler** → vision OpenRouter
   → `PreEnrollment` EXTRACTED avec données réelles. Sans poppler = warning explicite,
   PAS un EXTRACTED vide (D-06).
3. **Egress SMTP :465** — un envoi test OVH :465 depuis le worker aboutit (prouve
   que Railway Pro débloque bien l'egress).
4. **Doc-engines HTTPS Bearer** — 401 sans token / 200 avec, sur le domaine public
   du proxy Gotenberg et de WeasyPrint (Phase 20-03 a validé la config ; 20-05
   valide le HTTPS réel déployé).
5. **Stabilité 24 h + coût sous budget** — le worker tourne 24 h sans crash
   (`pm2-runtime` redémarre un worker mort sans tuer les autres) et le **coût
   mensuel projeté reste sous le budget D-07 (~20-25 €)**. C'est la preuve
   réinterprétée de WORK-02/D-04 (0 Redis → stabilité + coût, pas de comparaison Upstash).

---

## Récapitulatif

- **Plateforme** : Railway **Pro**, région **`europe-west4`** (Amsterdam, EU).
- **1 projet, 4 services** : worker (privé) + gotenberg-proxy (public) + weasyprint
  (public) + gotenberg (privé, image publique).
- **~15 variables** sur le worker (dont 5 secrets chiffrés), `DOC_ENGINE_TOKEN`
  partagé sur les 3 services.
- **Données** : Supabase Paris (`eu-west-3`) — inchangé. Seul le compute est à Amsterdam.
