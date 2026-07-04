# QualiOF

## What This Is

QualiOF est un CRM/back-office métier pour **Start Academy**, organisme de formation Qualiopi spécialisé dans la formation IA des agents commerciaux immobilier. Il couvre tout le cycle de vie d'une formation — du lead à la fin de prestation — en automatisant la production des documents Qualiopi, le suivi de trésorerie OPCO/AGEFICE, et la gestion des apprenants multi-casquette (EI + Enseigne). L'outil est interne, déployé local sur Mac M-series avec Ollama, et n'est pas vendu à d'autres OF.

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

### Active

<!-- Milestone "Audit UX/QA + nouvelles features métier" — current scope. -->

**Bugs critiques de l'audit 2026-05-12 (court terme)**
- [ ] **BUG-01** : Vérifier et re-tester en runtime le bug "FileText is not defined" sur `/app/sessions/[id]` (suspecté faux positif — import présent ligne 4) — ✅ ou retire de la liste
- [ ] **BUG-02** : Investiguer + corriger le header sticky qui se décolle au scroll dashboard (suspect `min-h-screen` sur parent) — `components/layout/main-content.tsx`
- [ ] **BUG-03** : Ajouter redirects `/app/pre-inscriptions` → `/app/preinscriptions` et `/app/modeles` → `/app/templates` dans `next.config.mjs` (ou renommer)

**Responsive (court/moyen terme — bloque mobile/tablette)**
- [ ] **RESP-01** : Restaurer breakpoints Tailwind par défaut (sm/md/lg/xl) — déplacer `screens` dans `theme.extend` — `tailwind.config.ts`
- [ ] **RESP-02** : Sidebar responsive (hidden md:block desktop + drawer hamburger mobile)
- [ ] **RESP-03** : MainContent responsive (`ml-0 md:ml-64`)
- [ ] **RESP-04** : Audit grilles dashboard et fiches (KPI/Pipeline/Financeurs) pour reflow correct < 1456px
- [ ] **RESP-05** : Vérifier zones de saisie en mobile (formulaires apprenant, session, dossier)

**UX gaps de l'audit (moyen terme)**
- [ ] **UX-01** : Panneau aperçu notifications derrière la cloche "53" — `components/layout/notifications-bell.tsx` (modèle `Notification` + route `api/notifications` déjà présents)
- [ ] **UX-02** : Déconnexion dans dropdown sur avatar (Radix DropdownMenu) avec confirmation — `components/layout/top-bar.tsx`
- [ ] **UX-03** : CTA "Générer un document" dans onglet Documents fiche apprenant — `app/app/apprenants/[id]/`
- [ ] **UX-04** : CTA "Déposer un dossier AGEFICE" pré-rempli depuis fiche apprenant
- [ ] **UX-05** : Compteurs cliquables (Sessions/Heures) dans onglet Activité formation → drill-down
- [ ] **UX-06** : Sélecteur d'année sur bloc Budget AGEFICE fiche apprenant (cohérence avec page Budget AGEFICE globale)
- [ ] **UX-07** : Tooltip explicite sur badge orange "1" onglet Activité (sens du chiffre)
- [ ] **UX-08** : Protéger le bouton "Supprimer" fiche apprenant (double confirm + RGPD)
- [ ] **UX-09** : Afficher la liste des champs manquants directement (sans expand) sur badge "X champs à renseigner"
- [ ] **UX-10** : Breadcrumb sur pages profondes (fiche apprenant, fiche produit)
- [ ] **UX-11** : Hiérarchisation visuelle des 3-4 KPI prioritaires sur dashboard (densité actuelle anxiogène)
- [ ] **UX-12** : Harmoniser libellés codes financeurs (OPCOMMERCE vs OPCO_EP)
- [ ] **UX-13** : Audit contraste WCAG AA sur badges "ACTIVE" et navigation clavier sur listes

**Paramètres organisme (moyen terme)**
- [ ] **SET-01** : Édition SIRET / Déclaration d'activité / RCS dans Paramètres
- [ ] **SET-02** : Édition adresse + logo + mentions légales OF
- [ ] **SET-03** : Préférences globales (numérotation factures, signatures, etc.)

**Multi-utilisateurs + RBAC (moyen terme)**
- [ ] **RBAC-01** : Page Paramètres → Utilisateurs (liste, ajout, désactivation)
- [ ] **RBAC-02** : Invitation par email avec mot de passe défini à la première connexion
- [ ] **RBAC-03** : Permissions effectives par rôle dans la sidebar (cacher Factures pour FORMATEUR, etc.)
- [ ] **RBAC-04** : Guards systématiques dans server actions selon rôle (au-delà du `tenantId` actuel)
- [ ] **RBAC-05** : Audit log lisible des actions sensibles (`AuditLog` modèle déjà présent)

**Nouvelles features métier**
- ✓ **LEAD-01** : Distribution automatique Lead → Commercial (round-robin équilibré) + notif cloche + email — `server/actions/leads.ts` + `lib/lead-notifications.ts` + `lib/auto-assign-leads.ts` — Phase 9 (2026-05-18)
- ✓ **LEAD-02** : Vue de charge par commercial (leads ouverts, gagnés ce mois, taux conversion, temps moyen) — `app/app/leads/charge/page.tsx` + `lib/lead-load-stats.ts` — Phase 9 (2026-05-18)
- ✓ **CENTRAL-01** : Matrice visuelle stagiaire × document sur fiche session — pastilles 3 états (GENERATED / MANUAL_OK / MISSING) + bloc séparé docs session-only + tri/filtres sauvés localStorage — Phase 9.1 (2026-05-18)
- ✓ **CENTRAL-02** : Génération doc ciblée 1 stagiaire — action ⋮ par cellule (5 actions) + sélection multi via worker BullMQ closure-pack mode `single-participant` (kinds + force) — Phase 9.1 (2026-05-18)
- ✓ **CENTRAL-03** : Fiche apprenant timeline verticale par année + 3 PrioCard + bandeau alerte conditionnel — Phase 9.1 (2026-05-18)
- ✓ **CENTRAL-04** : Fiche produit 4 onglets URL-state Stats / Sessions / Apprenants formés / Programme — Phase 9.1 (2026-05-18)
- ✓ **CENTRAL-05** : Cross-navigation Airtable-style + Bug P0 « Programme dupliqué N fois » résolu structurellement (1 PDF session-wide + N statuts via `SessionParticipant.docStatus Json?`) — Phase 9.1 (2026-05-18)
- [ ] **QBLANC-01** : Audit Qualiopi blanc — checklist auto des 32 indicateurs (`QualiopiDocCatalog`) par session/apprenant
- [ ] **QBLANC-02** : Alertes dossiers incomplets avant fin de session
- [ ] **QBLANC-03** : Simulation passage audit Qualiopi (rapport téléchargeable)
- [ ] **FACT-01** : Stabiliser le module Factures (auditer ce qui marche / ce qui manque suite aux commits récents `feat(web): hub documents par inscrit + factures`)
- [ ] **FACT-02** : Numérotation factures séquentielle conforme + gestion avoirs
- [ ] **FACT-03** : Suivi paiements (`InvoicePayment` modèle existe) + relances impayés
- [ ] **FACT-04** : Export comptable (FEC ou format expert-comptable)

**Modules stub à clarifier (long terme)**
- [ ] **MOD-01** : Module "Inscriptions" — déterminer périmètre vs Sessions+Participants existant
- [ ] **MOD-02** : Module "Modèles de documents" — éditeur de templates ou simple liste lecture seule ?

### Out of Scope

<!-- Explicit boundaries with reasoning. -->

- **SaaS multi-OF / commercialisation externe** — Start Academy uniquement, pas de plan de revente. Le multi-tenant Prisma existe mais reste un seul tenant en prod. Permet de fixer plus tard si besoin sans payer la dette d'architecture.
- **Verticalisation autres secteurs qu'immobilier** — Vocabulaire et règles métier (AGEFICE 3000€/an, EI+Enseigne) sont conçus pour les agents commerciaux immobilier. Pas d'effort d'abstraction pour BTP, santé, etc.
- **Hébergement cloud / SaaS hosting** — Déploiement local-first sur Mac M-series (Ollama natif pour GPU Metal). Pas de plan AWS/GCP/Vercel court-moyen terme — coûts d'inférence LLM cloud incompatibles avec le modèle interne.
- **CI/CD GitHub Actions** — Tests locaux + code review humain suffisent à ce stade. Si l'équipe grossit, à reconsidérer.
- **Tests unitaires extensifs sur templates / composants** — ROI faible, brittle. Priorité aux tests d'intégration smoke + E2E Playwright sur les workflows clés.
- **Couverture i18n (anglais ou autres langues)** — Marché FR uniquement, vocabulaire métier FR figé.
- **Edge runtime / Vercel Edge** — Prisma + BullMQ nécessitent Node runtime, edge n'apporte rien ici.

## Context

**Stack technique** (cartographié dans `.planning/codebase/`):
- Monorepo pnpm + Turborepo, Next.js 14.2.21 App Router + RSC + Server Actions
- TypeScript strict, Prisma 5.22 + Postgres 16, Redis + BullMQ pour les jobs IA
- Ollama natif Mac avec 4 modèles (mistral-small:24b FAST, qwen3:30b-a3b REASONING, qwen2.5vl:7b VISION, nomic-embed-text)
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

- **Tech stack** : Next.js 14 App Router + Prisma + BullMQ + Ollama — figé. Pas de migration React Native ni Remix prévue.
- **Runtime** : Mac M-series local (Ollama natif Metal). Pas de production cloud court terme.
- **Performance LLM** : concurrency=3 sur worker closure, timeout 600s. Ne pas augmenter sans observer impact stub rate.
- **PDF rendering** : Gotenberg sans footer natif (illisible), footer en HTML dans body. Ne pas régresser ce pattern.
- **Multi-tenant** : Tenant table + tenantId FK partout. Toute nouvelle server action DOIT scope par tenantId.
- **RGPD** : `Person.ribKey` pointe vers MinIO (PII), bucket privé, signed URLs. Données sensibles séparées dans `SensitiveData`.
- **Budget** : pas de SaaS cloud, donc pas de coût d'infra externe. Coût = temps dev Laurent + LLM local.
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

*Last updated: 2026-07-04 — Phase 16 complete : migration IA Ollama → Claude API (OpenRouter). env boot-safe `openrouter`, veille/vision/closure routés `callLlm`, tiers D-01a (Haiku fast / Sonnet quality), prompts `claude-v10-2026-07`. Témoin SES-0093 : 0 stub, 16/16 docs, ~3 min, variété inter-stagiaires prouvée, approuvé Laurent. RGPD vision GO (dette : documentation DPA OpenRouter+Anthropic). Vérification 7/7. ⚠ Constraints « Runtime local sans cloud / timeout 600s » partiellement caduques (AI_PROVIDER=openrouter global, coût API réel) — à réviser au prochain milestone.*
