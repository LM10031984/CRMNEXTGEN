# QualiOF

## What This Is

QualiOF est un CRM/back-office métier pour **Start Academy**, organisme de formation Qualiopi spécialisé dans la formation IA des agents commerciaux immobilier. Il couvre tout le cycle de vie d'une formation — du lead à la fin de prestation — en automatisant la production des documents Qualiopi, le suivi de trésorerie OPCO/AGEFICE, et la gestion des apprenants multi-casquette (EI + Enseigne). L'outil est interne, multi-utilisateurs (RBAC 6 rôles), génération IA via **Claude API (OpenRouter)** depuis v5/Phase 16 ; il tourne encore en local (Docker) avec un cap prod cloud Supabase+Vercel cadré pour v6. Il n'est pas vendu à d'autres OF.

## Current State (post-v5, 2026-07-04)

**Shipped v5 « Audit UX/QA + Features métier »** — 17 phases, 88 plans, 469 commits (2026-05-12 → 2026-07-04). L'app est fonctionnellement complète pour l'usage interne : responsive, RBAC, factures, veille, calendrier, centralisation documentaire, IA cloud (0 stub, pack ~3 min). Branche de travail : `cloud-migration`. Runtime : local Docker (Postgres/Redis/MinIO/Gotenberg/WeasyPrint) + `AI_PROVIDER=openrouter`.

**v6 Phase 17 complete (2026-07-04)** — Fondations cloud : régions EU verrouillées par écrit (`17-REGIONS.md` : Supabase `eu-west-3` Paris irréversible, Vercel `cdg1`, worker EU, Upstash conditionnel), boot fail-loud réel sur 5 clés cloud (chokepoint `next.config.mjs` + 2 workers — `sharedEnv` n'était importé nulle part avant), `DOC_ENGINE_TOKEN` câblé en Bearer sur Gotenberg/WeasyPrint. CLOUDENV-01/02/03 validés (4/4 must-haves).

## Current Milestone: v6 Prod Cloud (Supabase + Vercel)

**Goal :** QualiOF tourne en production cloud multi-utilisateurs — l'équipe Start Academy travaille sans que le Mac de Laurent soit allumé.

**Target features :**
- App Next.js sur Vercel (dégel staging : flag `NEXT_PUBLIC_APP_ENV`, filigrane, garde PDF, vercel.json)
- Supabase région EU : Postgres (pooler :6543 app / :5432 migrations, `prisma migrate deploy`) + Storage S3-compatible (remplace MinIO + migration objets)
- Upstash Redis + 3ᵉ hôte (Railway/Fly) : 3 workers BullMQ (closure/veille/factures) + Gotenberg + WeasyPrint + poppler-utils
- Bascule prod : dump final, DNS, invitations utilisateurs, recalibrage worker (timeout 600s→~120s, concurrency)
- Conformité : documentation DPA en une fois (OpenRouter, Anthropic, Supabase, Vercel, Upstash, Railway) — engagée par le GO vision 2026-07-04
- Gaps v5 intégrés (décision 2026-07-04) : CI-01 (GitHub Actions lint+tsc+tests) + TEST-01/02 (E2E closure + smoke routes) comme filet avant bascule prod

**Hors scope v6 (backlog) :** QBLANC-01..03, DOC-01/02, AI-01, MOBILE-01.

**Key context :** LLM déjà cloud (Ph. 16) · restore Supabase prouvé (staging E1-E4, 5822=5822) · budget cible ~60-80 €/mois · plan directeur discuté 2026-07-04.

## Core Value

**Quatre piliers co-essentiels — tous doivent fonctionner** :

1. **Pack fin de formation 1-clic Qualiopi** — générer en ~12 min les 10 docs Qualiopi par stagiaire (attestation, certificat, grille obs, QCM, déroulé, etc.) sans ressaisie. C'est le différenciateur métier #1 face à Digiforma/Dendreo/Ypareo.
2. **Suivi trésorerie OPCO + AGEFICE** — visibilité CA prévu/signé/encaissé, DSO par dossier, budget AGEFICE par apprenant par année (règle `financingRequestDate`). Sans ce pilier, le commerce est aveugle.
3. **CRM 360° multi-casquette EI + Enseigne** — source unique `Person` + `Organization` reliés par `LegalLink`, qui résout proprement le cas dominant (agent commercial immobilier = EI propriétaire + salarié d'enseigne). Sans ce pilier, l'OF se noie en doublons.
4. **Pré-inscriptions IA self-service** — formulaire public tokenisé + OCR Ollama Vision (CNI/RIB/CFP) → auto-fill apprenant. Sans ce pilier, l'admin retape tout à la main.

Si l'un de ces quatre piliers casse, le reste de l'outil perd sa valeur.

## Requirements

### Validated

<!-- Shipped through paliers 2.2 → 4, confirmed working in production at Start Academy. -->

**Palier 2.2 — Pack fin de formation 1-clic**
- ✓ **PACK-01** : Génération auto du pack Qualiopi pour une session entière (10 docs/stagiaire) — `lib/closure/*` + worker BullMQ — palier 2.2
- ✓ **PACK-02** : 10 templates Qualiopi (attestation, certificat, grille obs, analyse besoin, QCM, déroulé, émargement, positionnement, satisfaction chaud/froid, checklist formation) — `lib/closure/*-template.ts` — palier 2.2
- ✓ **PACK-03** : 5 prompts système Qualiopi (QCM, AnalyseBesoin, Grille, Compétences, Déroulé) extraits de Qualiopi Gen — `lib/closure/qualiopi-prompts.ts` — palier 4
- ✓ **PACK-04** : LLM Ollama mistral-small:24b (FAST) + qwen3:30b-a3b (REASONING) — `lib/ai-ollama.ts` — palier 2.2
- ✓ **PACK-05** : PDF rendering Gotenberg (HTML→PDF) + WeasyPrint fallback, footer in-body `position:fixed bottom:0` 11pt — `lib/of-pdf-footer.ts` — palier 2.2+
- ✓ **PACK-06** : Concurrency=3, timeout 600s, stub rate 0% — `lib/closure/worker.ts` — palier 2.2 fix
- ✓ **PACK-07** : Validé E2E SES-0010, 5 personnes, 12 minutes — palier 2.2
- ✓ **PACK-08** : Auto-trigger pack à la clôture de session + email fin de pack — palier UX 2026-05-12

**Palier 3 — OPCO V2 (15/15 US)**
- ✓ **OPCO-01** : Workflow dossier OPCO avec états + transitions horodatées (pour DSO) — palier 3
- ✓ **OPCO-02** : Mode groupé — un dossier OPCO contient N submissions — palier 3 US-006
- ✓ **OPCO-03** : `dossierType` discriminant (employeur/OPCO/AGEFICE) — palier 3 US-008
- ✓ **OPCO-04** : Vue AGEFICE budget restant intégrée au dossier — palier 3 US-015
- ✓ **OPCO-05** : KPI DSO par dossier dans le tableau de bord — palier 3
- ✓ **OPCO-06** : Toasts audités QW4 — palier 3

**Palier 4 — AGEFICE + Pré-inscriptions IA + Qualiopi Gen**
- ✓ **AGEFICE-01** : Budget 3000€/an par apprenant, calculé sur `financingRequestDate` (date dépôt dossier) — `lib/budget-agefice-constants.ts` — palier 4
- ✓ **AGEFICE-02** : Fiche AGEFICE PDF générée via pdf-lib (92 champs auto-remplis) — `lib/agefice-form-fill.ts` — palier 4
- ✓ **AGEFICE-03** : Vue "Budget AGEFICE" globale par apprenant par année — palier 4
- ✓ **PRE-INS-01** : Form public tokenisé `/p/[token]` — palier 4
- ✓ **PRE-INS-02** : OCR Ollama Vision (qwen2.5vl:7b) sur CNI/RIB/CFP — `lib/preinscription-extractor.ts` — palier 4
- ✓ **PRE-INS-03** : Conversion pré-inscription → apprenant en 1 clic — `server/actions/preinscription-convert.ts` — palier 4
- ✓ **PRE-INS-04** : Relances email automatisées — `server/actions/preinscription-reminders.ts` — palier 4
- ✓ **QUALIOPI-01** : Templates 10 docs alignés Qualiopi Gen (style Start Academy) — palier 4

**Cross-cutting validés**
- ✓ **AUTH-01** : Auth Lucia v3 + Argon2 + rôles 6 niveaux (`UserRole`) — `lib/auth.ts`
- ✓ **CRM-01** : Modèle `Person`+`Organization`+`LegalLink` multi-casquette EI+Enseigne — `prisma/schema.prisma`
- ✓ **CRM-02** : Pattern systématique 2 LegalLinks pour agent commercial immobilier (EI propriétaire + employee d'enseigne)
- ✓ **CRM-03** : Wizard création apprenant avec auto-fill IA depuis CFP/CNI/RIB — `components/wizards/`
- ✓ **CRM-04** : Wizard création session avec date fin auto-calculée jours ouvrés FR — `lib/business-days.ts`
- ✓ **DASH-01** : Tableau de bord KPI riches (CA prévu/signé/à venir/facturé/encaissé, DSO, sessions, apprenants, heures, taux remplissage)
- ✓ **NAV-01** : Sidebar 3 sections (Essentiel/Suivi/Configuration) + collapsible — palier UX 2026-05-12
- ✓ **NAV-02** : Cmd+K command palette avec recherche universelle multi-entités — `lib/cmdk-recents.ts`
- ✓ **NAV-03** : Onglets fiche apprenant (Informations / Activité formation / Documents) avec query param `?tab=`
- ✓ **NAV-04** : Indicateur de complétude apprenant (88%) avec liste champs manquants
- ✓ **NAV-05** : Toasts sonner mounted globally + audit cohérence — palier 3 QW4
- ✓ **DATA-01** : Import legacy SmartOF via xlsx — `packages/db/scripts/import-smartof.ts`

**v5 Audit UX/QA + Features métier (2026-07-04)** — 51/61 requirements livrés et validés, détail dans `milestones/v5-REQUIREMENTS.md` :
- ✓ BUG-01..03, RESP-01..05, UX-01..13 (audit 2026-05-12 intégralement traité) — v5 Ph. 1-6
- ✓ SET-01..03, RBAC-01..05 (paramètres éditables + multi-utilisateurs) — v5 Ph. 7-8
- ✓ LEAD-01/02, CENTRAL-01..05, RECON (réconciliation 3 sources), NAVDOC — v5 Ph. 9-9.3
- ✓ FACT-01..04 (factures cycle complet), MOD-01/02 (stubs tranchés) — v5 Ph. 11-12
- ✓ VEILLE, GCAL (rappels/convocations), SESSION-TABS — v5 Ph. 13-15
- ✓ IA-CLOUD : migration Ollama → Claude API openrouter, tiers Haiku/Sonnet, prompts claude-v10, 0 stub — v5 Ph. 16 (remplace PACK-04/PACK-06 : plus de dépendance GPU locale, timeout à recalibrer)

### Active

<!-- Backlog post-v5 : Known Gaps v5 + périmètre v6 à cadrer via /gsd:new-milestone. -->

**Known Gaps v5 (reportés, à arbitrer au cadrage v6)**
- [ ] **QBLANC-01/02/03** : audit Qualiopi blanc in-app (urgence retombée — audit BCI réel passé 03/07/2026)
- [ ] **DOC-01/02** : export RGPD Art. 20 + suppression pseudonymisée Art. 17
- [ ] **TEST-01/02** : E2E Playwright closure + smoke routes protégées
- [ ] **AI-01** : embeddings recherche sémantique
- [ ] **MOBILE-01** : PWA formateurs terrain
- [ ] **CI-01** : GitHub Actions lint+tsc+tests
- [ ] **RGPD-DPA** : documenter les sous-traitants (OpenRouter, Anthropic — et Supabase/Vercel/Upstash dès v6) au registre des traitements — **prioritaire, engagé par le GO vision du 2026-07-04**

**v6 Prod Cloud (à formaliser via /gsd:new-milestone)**
- [ ] Vercel (app) + Supabase Postgres/Storage EU + Upstash Redis + 3ᵉ hôte workers/Gotenberg/WeasyPrint + bascule prod + monitoring coûts/latences

### Out of Scope

<!-- Explicit boundaries with reasoning. -->

- **SaaS multi-OF / commercialisation externe** — Start Academy uniquement, pas de plan de revente. Le multi-tenant Prisma existe mais reste un seul tenant en prod. Permet de fixer plus tard si besoin sans payer la dette d'architecture.
- **Verticalisation autres secteurs qu'immobilier** — Vocabulaire et règles métier (AGEFICE 3000€/an, EI+Enseigne) sont conçus pour les agents commerciaux immobilier. Pas d'effort d'abstraction pour BTP, santé, etc.
- ~~**Hébergement cloud / SaaS hosting**~~ — **INVALIDÉ 2026-07-04** : la Phase 16 (LLM → Claude API) a levé le blocant coût/GPU ; v6 = prod cloud Supabase+Vercel. (Le multi-OF/SaaS commercial reste hors scope.)
- **CI/CD GitHub Actions** — reconsidéré : CI-01 en backlog v6 (le passage cloud + multi-users justifie lint+tsc+tests sur PR).
- **Tests unitaires extensifs sur templates / composants** — ROI faible, brittle. Priorité aux tests d'intégration smoke + E2E Playwright sur les workflows clés.
- **Couverture i18n (anglais ou autres langues)** — Marché FR uniquement, vocabulaire métier FR figé.
- **Edge runtime / Vercel Edge** — Prisma + BullMQ nécessitent Node runtime, edge n'apporte rien ici.

## Context

**Stack technique** (cartographié dans `.planning/codebase/`):
- Monorepo pnpm + Turborepo, Next.js 14.2.21 App Router + RSC + Server Actions
- TypeScript strict, Prisma 5.22 + Postgres 16, Redis + BullMQ pour les jobs IA
- LLM : Claude API via OpenRouter (`callLlm` — Haiku fast / Sonnet quality, prompts claude-v10), Ollama conservé en fallback dev local uniquement (Phase 16, 2026-07-04)
- Auth Lucia v3 + Argon2, UI Radix + Tailwind + sonner + cmdk
- PDF via Gotenberg (Chromium) + WeasyPrint fallback, stockage MinIO

**Domaine métier** :
- Cible : agents commerciaux immobilier (auto-entrepreneurs + salariés enseigne)
- Financement dominant : AGEFICE (auto-entrepreneurs) + OPCO (salariés)
- 10 docs Qualiopi obligatoires par stagiaire (attestation, certificat, grille obs, etc.)
- 32 indicateurs Qualiopi à tracer (modèle `QualiopiDocCatalog` en place)

**Historique** (paliers livrés) :
- Palier 2.2 : Pack fin de formation 1-clic (validé E2E SES-0010 5pers/12min)
- Palier 2.3 : (couvert par mémoire mais non détaillé)
- Palier 3 : OPCO V2, 15/15 US livrées dont mode groupé, dossierType, vue AGEFICE
- Palier 4 : AGEFICE PDF, Pré-inscriptions IA, Qualiopi Gen templates
- Refonte UX 2026-05-12 : sidebar 3 sections, auto-trigger pack clôture, email fin de pack, session hub CTA contextuel, déroulé prompt v4

**Audit UX/QA 2026-05-12** : 22 frictions classées, dont 3 critiques (FileText, routes 404, header sticky) — vérification code montre que 2 sur 3 sont des faux positifs (FileText importé, routes correctes dans sidebar). Le vrai bug racine est dans `tailwind.config.ts:screens` qui supprime les breakpoints par défaut → cause majeure du non-responsive et du layout tronqué.

**Mémoire métier figée** (pas re-débattre) :
- AGEFICE/OPCO sont des financeurs, jamais des attributs directs de l'apprenant
- Budget AGEFICE 3000€/an se compte sur `financingRequestDate`, pas `session.startDate`
- Auto-entrepreneur = il paye lui-même ; Salarié = la structure paye
- Pattern dominant : EI + Enseigne (créer systématiquement 2 LegalLinks)
- Footer PDF : `position:fixed bottom:0` HTML 11pt dans body, **pas** le footer natif Gotenberg

## Constraints

- **Tech stack** : Next.js 14 App Router + Prisma + BullMQ + Claude API (OpenRouter) — figé. Pas de migration React Native ni Remix prévue.
- **Runtime** : local Docker aujourd'hui ; cap prod cloud v6 (Vercel + Supabase EU + 3ᵉ hôte workers). Le Mac reste le poste dev.
- **Performance LLM** : héritage local concurrency=3/timeout 600s — À RECALIBRER pour le cloud (latences observées 6-12 s/doc, témoin SES-0093). Surveiller stub rate ET coût OpenRouter.
- **PDF rendering** : Gotenberg sans footer natif (illisible), footer en HTML dans body. Ne pas régresser ce pattern.
- **Multi-tenant** : Tenant table + tenantId FK partout. Toute nouvelle server action DOIT scope par tenantId.
- **RGPD** : `Person.ribKey` pointe vers MinIO (PII), bucket privé, signed URLs. Données sensibles séparées dans `SensitiveData`.
- **Budget** : coût API OpenRouter à l'usage depuis Phase 16 (≈ centimes/pack) ; cible infra v6 ≈ 60-80 €/mois (Supabase+Vercel+Upstash+3ᵉ hôte).
- **Timeline** : pas de deadline produit externe ; cadence interne pilotée par retours formateurs/admin Start Academy.

## Key Decisions

<!-- Significant choices that affect future work. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Local-first + Ollama natif | Coût d'inférence cloud incompatible avec usage interne, GPU Metal Mac performant | ✓ Good — 0% stub rate après tuning |
| Monorepo pnpm + Turborepo | Préparer un éventuel app/mobile, isoler db et shared | ✓ Good |
| Next.js App Router + Server Actions | Moins de boilerplate qu'API REST, types end-to-end | ✓ Good |
| Lucia v3 (pas NextAuth/Clerk) | Contrôle total, pas de dépendance SaaS auth | ✓ Good |
| Prisma `Person`+`Organization`+`LegalLink` | Résout multi-casquette EI+Enseigne proprement | ✓ Good — pattern stable |
| BullMQ + worker séparé | Closure pack 12min ne peut pas bloquer Next.js request loop | ✓ Good |
| Gotenberg + WeasyPrint dual | Différents docs ont différents besoins (forms PDF vs HTML structuré) | ✓ Good |
| Footer PDF in-body fixed | Footer natif Gotenberg illisible à petite taille | ✓ Good — anti-pattern documenté |
| Tailwind `screens` top-level (current) | Probablement involontaire (override = breakpoints défaut tués) | ⚠️ Revisit — corriger dans le nouveau milestone (RESP-01) |
| 4 Core Values co-essentielles | Pack 1-clic + Trésorerie OPCO/AGEFICE + CRM 360° + Pré-inscriptions IA forment un tout indivisible | — Pending validation produit après milestone |
| Audience interne uniquement | Pas de plan SaaS B2B, pas d'effort architecture pour multi-OF | — Pending — pourrait évoluer si autres OF demandent |
| Migration IA → Claude via OpenRouter (Phase 16) | Fiabilité (0 stub), qualité (variété), cap cloud v6 ; passerelle `callLlm` existante réutilisée (pas de SDK Anthropic) ; Haiku=fast/Sonnet=quality | ✓ Good — témoin SES-0093 0 stub, pack ~3 min vs ~12, RGPD vision GO (dette DPA) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

*Last updated: 2026-07-04 after Phase 17 (fondations cloud région EU + env) — CLOUDENV-01/02/03 validés.*
