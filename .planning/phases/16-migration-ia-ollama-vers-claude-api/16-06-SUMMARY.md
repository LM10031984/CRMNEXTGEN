---
phase: 16-migration-ia-ollama-vers-claude-api
plan: 06
subsystem: ai
tags: [claude, openrouter, pack-temoin, rgpd, closure, witness, checkpoint]

# Dependency graph
requires:
  - phase: 16-migration-ia-ollama-vers-claude-api (16-01..16-05)
    provides: env boot-safe openrouter + veille/vision/closure routés callLlm + tiers D-01a + prompts claude-v10
provides:
  - "Pack témoin réel SES-0093 généré via Claude (openrouter) : 0 stub, 16/16 docs, tiers D-01a conformes, variété inter-stagiaires prouvée (hashes distincts) — APPROUVÉ par Laurent"
  - "Gate RGPD vision tranché : GO (vision cloud prod autorisée) — dette de conformité : documentation DPA OpenRouter+Anthropic à produire (hors code)"
  - "16-WITNESS.md : trace complète pré-checks + témoin + décision RGPD"
affects: [phase-completion, milestone-v6-cloud, preinscriptions-ocr]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Witness pack = validation observable de bout en bout (leçon « vu à l'œil, pas au hash ») avant de déclarer une migration LLM terminée"

key-files:
  created:
    - .planning/phases/16-migration-ia-ollama-vers-claude-api/16-WITNESS.md
  modified:
    - .env (AI_PROVIDER=openrouter + 7 clés OPENROUTER_* — hors git, backup .env.bak-phase16)

key-decisions:
  - "Laurent a choisi la bascule GLOBALE AI_PROVIDER=openrouter (pas un scope témoin) — l'appli locale entière route vers Claude"
  - "RGPD vision : GO opérationnel, documentation DPA = dette de conformité niveau organisme (registre des traitements)"
  - "Témoin généré par l'agent sur demande explicite de Laurent (au lieu du protocole manuel :3010) via _gen-session-pack.ts, sortie Desktop (Drive réel non touché)"

status: complete
requirements: [REQ-16-07]
---

# Plan 16-06 — Pack témoin Claude + gate RGPD : SUMMARY

## Ce qui a été fait

- **Task 1 (pré-checks, 2026-07-03/04)** : suite web 1141/1141 pertinents verts (1 échec pré-existant `shared-template.test.ts` MIME, hors phase), tsc exit 0, suite shared 106/106 hermétique, 0 `callOllama` résiduel dans veille/vision, clé OpenRouter câblée dans `.env` (choix explicite Laurent « copier + basculer tout », backup `.env.bak-phase16`).
- **Task 2 (pack témoin, 2026-07-04)** : SES-0093 (72h IA immobilier, 2 stagiaires) généré via `_gen-session-pack.ts` → `~/Desktop/Pack-temoin-SES-0093`. **0 stub, 16/16 docs, 0 erreur** (ClosureBatch COMPLETED). `AIGenerationJob` : 7 jobs done, provider=openrouter, promptVersion=claude-v10-2026-07, 6× cloud:fast (5,9-9,3 s) + 1× cloud:quality (11,5 s rapport formateur). Hashes distincts entre stagiaires sur QCM/grille/positionnement/satisfaction. Pack complet en ~3 min (vs ~12 min/5 pers. local). **APPROUVÉ par Laurent.**
- **Task 3 (gate RGPD vision)** : **GO** — OCR CNI/RIB via Claude autorisé en prod. Dette de conformité consignée : documenter le DPA (OpenRouter + Anthropic sous-traitants) au registre des traitements.

## Écarts

- Le protocole prévoyait la génération manuelle par Laurent via `:3010` ; sur sa demande explicite, l'agent a lancé la génération par script (même moteur `processClosureJobPayload`, persistance DB+MinIO réelle) et Laurent a validé les PDF ouverts dans le Finder. Aucun impact sur la valeur probante.

## Trace

Voir `16-WITNESS.md` (pré-checks, métriques, hashes, décisions datées).
