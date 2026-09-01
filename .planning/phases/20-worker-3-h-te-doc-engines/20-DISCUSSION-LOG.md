# Phase 20: Worker 3ᵉ hôte + doc engines - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-05
**Phase:** 20-worker-3-h-te-doc-engines
**Areas discussed:** Hébergeur, Redis, OCR pré-inscriptions, Budget + disponibilité

---

## Hébergeur (Railway vs Fly)

| Option | Description | Selected |
|--------|-------------|----------|
| Railway (Recommandé) | Dashboard visuel simple, déploiement Docker direct, DNS privé *.railway.internal, logs lisibles | |
| Fly.io | Souvent moins cher, région Paris (cdg) native, pilotage CLI (flyctl) plus technique | |
| Autre (libre) | « Aucune idée je ne connais pas ça et est-ce qu'on peut pas tout avoir dans Supabase ? » | ✓ |

**Follow-up :** explication que Supabase ne peut pas héberger workers long-vivants ni Gotenberg/WeasyPrint (Edge Functions courtes, pas de conteneurs, pas de poppler/Chromium). Question de confirmation Railway posée :

| Option | Description | Selected |
|--------|-------------|----------|
| Oui, Railway (Recommandé) | Dashboard visuel, zéro CLI, budget OK | |
| Tu décides au vu de la recherche | Recherche compare Railway/Fly, Claude tranche seul | ✓ |

**User's choice:** Délégation à Claude après recherche.
**Notes:** Contrainte capturée : exploitation quotidienne sans CLI, dashboard simple = critère n°1.

---

## Redis

| Option | Description | Selected |
|--------|-------------|----------|
| Tout Postgres, 0 Redis (Recommandé) | Porter cron veille/factures sur planificateur interne ; un service de moins ; cohérent décision v6 | ✓ |
| Redis co-localisé sur l'hôte | Garder BullMQ tel quel, petit Redis ~5-10€/mois | |
| Upstash (Redis serverless) | Facturé à la commande, risque facture avec polling BullMQ | |

**User's choice:** Tout Postgres, 0 Redis.
**Notes:** WORK-02 tranché « ni Upstash ni co-localisé » ; preuve 24 h réinterprétée en stabilité worker sans Redis + coût projeté sous budget.

---

## OCR pré-inscriptions (pilier #4)

| Option | Description | Selected |
|--------|-------------|----------|
| OCR traité par le worker (Recommandé) | Rasterisation + vision en job de fond sur le 3ᵉ hôte (poppler installé), qualité identique | ✓ |
| Dégradation texte-seul assumée | Échec propre avec message « saisie manuelle requise » sur PDF scannés | |

**User's choice:** OCR relocalisé sur le worker.
**Notes:** Jamais de dégradation silencieuse (WORK-04).

---

## Budget + disponibilité

| Option | Description | Selected |
|--------|-------------|----------|
| ~20-25€/mois, toujours chaud (Recommandé) | Tout allumé en permanence, pas de latence de réveil, stabilité 24 h facile à prouver | ✓ |
| ~10€/mois, cold start toléré | Services endormis, 1er PDF après pause = 30-60 s | |
| Jusqu'à 50€/mois si ça simplifie | Marge confortable, optimisation ultérieure | |

**User's choice:** ~20-25 €/mois, toujours chaud.
**Notes:** Critère « après un cold start » se lit désormais « après redéploiement/restart ».

---

## Claude's Discretion

- Choix final Railway vs Fly (cadré : simplicité d'exploitation prime, budget 20-25 €/mois).
- Enforcement Bearer server-side sur Gotenberg/WeasyPrint.
- Architecture image Docker (turbo prune, pm2-runtime × 3 vs services séparés).
- Mécanisme cron interne, valeurs timeout/concurrency, déclencheur job OCR.
- Egress SMTP OVH :465, dette dotenv-cli Phase 19, sort des deps bullmq/ioredis.

## Deferred Ideas

- Rien de nouveau — Phase 21 (Vercel prod, région Supabase Paris vs Irlande) déjà actée ; Upstash conditionnel de 17-REGIONS devenu caduc.
