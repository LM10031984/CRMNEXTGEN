# Milestones

## v5 Audit UX/QA + Features métier (Shipped: 2026-07-04)

**Phases completed:** 17 phases (1-16 + 9.1/9.2/9.3), 88 plans, 133 tasks
**Timeline:** 2026-05-12 → 2026-07-04 (~8 semaines, 469 commits)
**Archives:** `milestones/v5-ROADMAP.md` · `milestones/v5-REQUIREMENTS.md`

**Delivered:** QualiOF passe d'un back-office mono-utilisateur avec bugs d'audit à un CRM Qualiopi complet : responsive, RBAC multi-utilisateurs, factures cycle complet, veille réglementaire, centralisation documentaire 360°, Google Calendar, fiche session en onglets — et génération IA migrée d'Ollama local vers Claude API (cloud-ready).

**Key accomplishments:**

- **Fondations UX/QA** (Ph. 1-6) : responsive complet (sidebar, grilles, listings), TopBar notifications + déconnexion, fiche apprenant refondue, dashboard hiérarchisé WCAG AA — les 22 frictions de l'audit 2026-05-12 traitées.
- **Multi-utilisateurs RBAC** (Ph. 7-8) : paramètres organisme éditables (logo/signatures propagés à tous les PDF), invitations Argon2+Lucia, 6 rôles, 32 server actions gardées, page Historique AuditLog.
- **Distribution leads automatique** (Ph. 9) : auto-assignation Lead→Commercial, notifications cloche+email, vue de charge 4 KPI.
- **Centralisation Qualiopi 360°** (Ph. 9.1-9.3) : matrice docs session × stagiaire (Bug P0 « programme dupliqué » résolu structurellement), timeline apprenant, navigation documentaire unifiée 6 sources, réconciliation base 3 sources (Airtable+SmartOF+Tréso).
- **Factures cycle complet** (Ph. 11) : numérotation, avoirs AVO-, relances cron daily, export xlsx comptable.
- **Veille Qualiopi intégrée** (Ph. 13) : worker RSS+LLM, classification auto par indicateur, export PDF audit.
- **Google Calendar** (Ph. 14) : rappels/convocations automatisés, 1330 events backfillés, idempotence prouvée en prod.
- **Fiche session 5 onglets** (Ph. 15) + **Migration IA → Claude API** (Ph. 16) : app entière en `AI_PROVIDER=openrouter` (Haiku fast / Sonnet quality, prompts claude-v10), pack témoin 0 stub en ~3 min vs ~12, RGPD vision GO.

### Known Gaps

Acceptés à la clôture (décision Laurent 2026-07-04) — repartent en backlog, arbitrables au cadrage du milestone suivant :

- **QBLANC-01/02/03** — Audit Qualiopi blanc in-app (scoring 32 indicateurs, alertes J-7, rapport PDF). Phase 10 jamais exécutée ; le besoin pratique a été couvert hors-app (`.planning/audit/AUDIT-BLANC-RNQ-V9.md`) et le vrai audit BCI a eu lieu le 03/07/2026.
- **DOC-01/02** — Export RGPD portabilité (Art. 20) + suppression pseudonymisée (Art. 17).
- **TEST-01/02** — E2E Playwright flow closure + smoke tests routes protégées.
- **AI-01** — Embeddings recherche sémantique (nomic-embed-text déclaré, non câblé).
- **MOBILE-01** — PWA/app formateurs terrain.
- **CI-01** — GitHub Actions lint+tsc+tests.

Dettes techniques additionnelles : documentation DPA (OpenRouter+Anthropic — et bientôt Supabase/Vercel), échec pré-existant `shared-template.test.ts` (MIME jpeg/jpg), worker timeout/concurrency à recalibrer cloud, produits figés pré-claude-v10 (contenu mistral tracé par promptVersion).

---
