# Rétrospective QualiOF

> Document vivant — une section par milestone, tendances en bas.

## Milestone: v5 — Audit UX/QA + Features métier

**Shipped:** 2026-07-04
**Phases:** 17 (1-16 + 9.1/9.2/9.3) | **Plans:** 88 | **Commits:** 469 (~8 semaines)

### What Was Built

Des 22 frictions de l'audit UX/QA au CRM complet : responsive + a11y, RBAC 6 rôles, paramètres organisme éditables, leads auto, centralisation Qualiopi 360° (Bug P0 programme dupliqué résolu structurellement), réconciliation base 3 sources, factures cycle complet, veille réglementaire, Google Calendar (1330 events), fiche session 5 onglets, et migration IA Ollama → Claude API (0 stub, pack ~3 min vs ~12).

### What Worked

- **Vérification goal-backward systématique** (gsd-verifier) — a attrapé des gaps réels à chaque phase ; le cycle planner→checker→revision (max 3) a produit des plans exécutables sans replanification lourde.
- **Test de puissance (mutation)** — convention établie Phase 9.3, appliquée jusqu'en Phase 16 (tiers/retry) : les tests prouvent qu'ils gardent quelque chose.
- **Témoin réel avant déclaration de victoire** — leçon « vu à l'œil, pas au hash » (SES-0087, SES-0093) : les migrations LLM ne se valident qu'en générant du vrai contenu.
- **Insertions décimales (9.1/9.2/9.3)** — le mécanisme a absorbé l'urgence Centralisation Qualiopi sans casser le roadmap.
- **Recherche avant plan sur les phases inconnues** — Phase 16 : la recherche a découvert que 90 % de l'infra existait (closure routait déjà via callLlm), divisant le périmètre réel par deux.

### What Was Inefficient

- **Phase 10 jamais exécutée** — restée « planned » 7 semaines pendant que le vrai besoin (audit blanc) se réglait hors-app en documents. Leçon : réévaluer les phases dont l'événement déclencheur approche (l'audit réel a rendu l'outil in-app non urgent).
- **Runs de génération parallèles → deadlocks** (leçon 2026-06-19, closureBatch.update) — coût réel en re-runs séquentiels de rattrapage.
- **Échec test pré-existant (shared-template MIME jpeg/jpg)** traîné de 15-01 à 16-06 en « connu, hors scope » — 8+ mentions dans les SUMMARY ; le fixer aurait coûté moins cher que le documenter à chaque plan.
- **REQ-16-XX phase-scoped vs REQUIREMENTS.md global** — chaque executor a re-découvert que mark-complete était no-op ; convention à clarifier.

### Patterns Established

- Tests hermétiques : jamais importer un module qui exécute `createEnv()` au chargement ; schémas purs isolés (`env-schemas.ts`).
- Worker-safe : cœurs sans auth, server action = wrapper (aucun import React/requireRole dans BullMQ).
- Changement observable tracé : `PROMPT_VERSION` (mistral v9 ↔ claude-v10) permet la régénération a posteriori ciblée.
- 1 doc = 1 endroit (Phase 15) ; convention figée → hardcode, pas de « smart calc » sur les valeurs métier.
- Destructif = étape séparée avec inventaire + mot utilisateur.

### Key Lessons

1. Un blocant structurel (LLM local) peut tomber en 1 phase quand l'abstraction (`callLlm`) a été posée en avance — investir dans les seams paye.
2. Le RGPD se décide au cadrage (D-02b), pas à l'implémentation — le gate checkpoint a fonctionné : code livré, prod gatée, décision tracée.
3. Les échecs de tests « connus » doivent être tués ou budgétés, pas ré-documentés.

### Cost Observations

- Model mix : opus (planner/executor/researcher) + sonnet (checker/verifier) — profil « quality ».
- Coût OpenRouter mesuré : ~7 jobs LLM / pack 2 stagiaires, 6-12 s/doc, quelques centimes.

## Cross-Milestone Trends

| Milestone | Phases | Plans | Durée | Fait marquant |
|-----------|--------|-------|-------|---------------|
| paliers 2.2→4 (pré-GSD) | — | — | — | Pack 1-clic, OPCO V2, AGEFICE, pré-inscriptions IA |
| v5 | 17 | 88 | ~8 sem. | Audit UX → CRM complet + IA cloud |
