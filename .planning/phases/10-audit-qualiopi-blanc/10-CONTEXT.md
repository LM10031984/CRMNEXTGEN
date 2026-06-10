# Phase 10: Audit Qualiopi blanc — Context

**Gathered:** 2026-05-25
**Status:** Ready for planning
**Source:** /gsd:discuss-phase 10 — 4 décisions critiques tranchées par utilisateur (Laurent) + 8 défauts Claude documentés

**Contexte temporel critique :** Audit Qualiopi réel programmé **2026-07-03** par Samia ZIANI (BCI France, FM13-3 V5) pour renouvellement RNQ V9 du certificat N° CW202324-1795 (valide jusqu'au 2026-07-23). Cette feature DOIT être démo-able à l'auditrice — c'est un asset différenciateur. Audit blanc manuel déjà livré le 2026-05-30 dans `.planning/audit/AUDIT-BLANC-RNQ-V9.md` (423 lignes, top 5 risques identifiés).

<domain>
## Phase Boundary

Construire la **feature "Audit Qualiopi blanc"** dans QualiOF : page de scoring des 21 indicateurs applicables Start Academy (sur 32 RNQ V9), checklist auto par session, alertes 7j avant fin de session si dossier incomplet, et export PDF rapport audit avec verdict par indicateur — utilisable comme outil de pilotage permanent ET démo à l'auditrice le 03/07.

**Inclus dans Phase 10 :**
- Catalogue 21 indicateurs applicables `lib/qualiopi-indicators-catalog.ts` (réutilise convention Phase 12 "catalogue centralisé code-driven")
- Modèle Prisma `QualiopiBlancEntry` (verdict + preuve + commentaire par indicateur)
- Page `/app/audit-qualiopi-blanc` : vue scoring global + détail par ind + drill-down session
- Checklist auto par session (réutilise matrice docs Phase 9.1 `qualiopi-matrix`)
- Worker BullMQ daily : alertes 7j avant fin session (clone Phase 11 invoice-reminder-worker)
- Notifications cloche + email (réutilise pattern Phase 9 Lead notifications + nodemailer)
- Export PDF rapport audit blanc (WeasyPrint + footer paged)
- AuditLog convention `qualiopiBlanc.*` (8e instance one-helper-per-entity après `regulatoryWatch.*` Phase 13)

**Hors scope :**
- Référentiels autres que RNQ V9 (Qualiopi Bilan / VAE / Apprentissage / RNCP-RS)
- Multi-tenant audit configuration (Start Academy mono-tenant, hardcoder les 21 ind applicables)
- Génération automatique de plans d'action correctifs (V2)
- Intégration directe France Compétences API (V2)
- Comparaison historique (versions d'audits blancs successifs)

</domain>

<decisions>
## Implementation Decisions

### Décisions utilisateur (Laurent) — 2026-05-25

- **D-01 — Scope V1 : 21 indicateurs applicables uniquement** (hardcode, pas de flag `applicable` par tenant). Catalogue `lib/qualiopi-indicators-catalog.ts` liste les 21 ind valides Start Academy : **1, 2, 4, 5, 6, 9, 10, 11, 12, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 32** (selon mémoire `project_audit_qualiopi_03_07_2026.md`). Les 11 N/A (3, 7, 8, 13, 14, 15, 16, 20, 29 + 2 marginaux) sont volontairement omis. Si Start Academy active RNCP demain → retour code pour ajouter.

- **D-02 — Source verdict : hybride auto + override manuel.** Les indicateurs liés aux docs Qualiopi (Ind 9 programme, Ind 11 évaluation, Ind 12 émargement/assiduité, Ind 30 satisfaction) sont **calculés automatiquement** depuis la matrice docs `qualiopi-matrix` (Phase 9.1). Les indicateurs **humains** (Ind 1 site web, Ind 2 résultats chiffrés, Ind 4 analyse besoin, Ind 5 prérequis, Ind 6 PSH, Ind 10 modalités, Ind 17 contenu, Ind 18 méthodes, Ind 19 évaluations péda, Ind 21 CV formateurs, Ind 22 compétences perso, Ind 23/24/25/26 veille, Ind 27 sous-traitance, Ind 28 réclamations, Ind 31 améliorations, Ind 32 indicateurs perf) = saisie manuelle ADMIN+MANAGER avec champs `status` (CONFORME / NON_CONFORME / EN_COURS / NA) + `preuve` (text + optionnel doc upload MinIO) + `commentaire`.

- **D-03 — Notifications 7j : email + cloche pour ADMIN+MANAGER.** Worker BullMQ daily clone strict du pattern Phase 11 `invoice-reminder-worker`. Pour chaque session dont `endDate` ∈ [now+6j, now+7j] ET dont la matrice docs < 100% complet → créer 1 Notification cloche (type `qualiopiBlanc.sessionIncomplete`) pour tous les users role ∈ {ADMIN, MANAGER} du tenant + envoyer 1 email récap (clone pattern email Phase 11). Pattern Worker Safety obligatoire : `lib/qualiopi-blanc/core.ts` séparé de server actions auth.

- **D-04 — Scope complet livré d'un bloc.** Pas de phasage interne V1.0/V1.1. Page + scoring hybride + worker alertes + PDF rapport = tout dans Phase 10. Estimation ~5-8j, deadline interne **avant 2026-06-26** pour avoir 1 semaine de tests avant l'audit du 03/07.

### Défauts Claude (à respecter sauf override planner)

- **D-05 — Route `/app/audit-qualiopi-blanc`** (FR kebab-case, mot explicite distinct de `/app/veille` Phase 13). Sidebar entry `Audit Qualiopi blanc`, icône `ShieldCheck` ou `ClipboardCheck` (lucide-react), section "Pilotage" ou "Conformité" (à créer si pas existante). RBAC ADMIN+MANAGER pour édition, LECTEUR consultation read-only.

- **D-06 — Modèle Prisma `QualiopiBlancEntry`** (1 row par couple tenant × indicateur, donc 21 rows par tenant) :
  ```
  id, tenantId, indicatorNumber Int (1..32), status enum (CONFORME|NON_CONFORME|EN_COURS|NA),
  preuve String? (text), preuveDocumentId String? (FK Document MinIO),
  commentaire String?, lastUpdatedBy String? (FK User),
  autoCalculated Boolean (true si statut dérivé matrix docs, false si manual override),
  updatedAt DateTime, createdAt DateTime,
  @@unique([tenantId, indicatorNumber])
  ```
  Indexes : `[tenantId, status]`, `[tenantId, autoCalculated]`.

- **D-07 — Catalogue `lib/qualiopi-indicators-catalog.ts`** réutilise convention Phase 12 (catalogue code-driven). Chaque entrée :
  ```ts
  { number: 1, label: "Information publique", description: "...", criterion: 1, source: 'auto'|'manual', dependsOnDocType?: DocType[], niveauAttendu: string, sanctionNC: string }
  ```
  21 entries hardcodées. Helpers `getByCategory()`, `getByCriterion()`, `getById()`, `countByStatus()`.

- **D-08 — Mapping QualiopiDocCatalog enrichi** : compléter le champ `qualiopiIndicator` du seed existant pour couvrir les 4 ind auto-calculables (9, 11, 12, 30). Déjà partiel (5 docs mappent vers Ind 7/9/11/12/30). Migration légère + seed update.

- **D-09 — Structure PDF rapport** : 1ère page = en-tête (tenant + SIRET + NDA + date + auditrice prévue), synthèse globale (score X/21 + répartition CONFORME/NON_CONFORME/EN_COURS/NA + top 3 risques). 21 pages suivantes = 1 par indicateur (niveau attendu, sanction NC potentielle, verdict actuel, preuve, commentaire, recommandation auto si NON_CONFORME). Pattern WeasyPrint CSS Paged Media + footer `renderOfPagedFooter` (mémoire `feedback_footer_pdf_qualiof.md`).

- **D-10 — AuditLog `qualiopiBlanc.*`** (8e instance one-helper-per-entity). Verbes : `entry_updated` (changement statut/preuve/commentaire), `auto_recalculated` (worker maj automatique depuis matrix), `exported` (PDF généré), `notification_sent` (alerte 7j envoyée). Helper `apps/web/src/lib/qualiopi-blanc-audit.ts` clone strict `regulatoryWatch-audit.ts` Phase 13.

- **D-11 — Réutilisation matrice docs Phase 9.1** : le composant `qualiopi-matrix` (`apps/web/src/components/sessions/qualiopi-matrix/*`) calcule déjà la complétude par session. Le calcul "session incomplète" du worker D-03 = somme docs MANDATORY manquants depuis cette matrice. Ne PAS réimplémenter.

- **D-12 — Notification model existant** : table `Notification` (id, tenantId, userId, type String, payload Json, readAt, createdAt) est extensible. Ajouter type `qualiopiBlanc.sessionIncomplete` avec payload `{ sessionId, sessionLabel, endDate, missingDocsCount, missingIndicatorsCount, drillDownUrl }`. Pattern Lead notifications Phase 9 à cloner.

### Claude's Discretion (à décider par planner si besoin)

- Choix exact entre `ShieldCheck` vs `ClipboardCheck` vs `FileSearch` (icône sidebar)
- Layout exact page (tableau 21 lignes vs cartes par critère 1-7 vs onglets par critère)
- Format exact des recommandations auto sur PDF NON_CONFORME (texte libre vs structure type Issue + Recommandation + Délai)
- Choix entre 1 PDF unique vs 1 PDF par critère (8 PDFs)
- Détail UI pour saisie de "preuve" (textarea simple vs WYSIWYG vs upload doc MinIO obligatoire)
- Précision du worker daily : heure d'exécution exacte (7h / 8h / 9h Europe/Paris ?)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements
- `.planning/REQUIREMENTS.md` — QBLANC-01, QBLANC-02, QBLANC-03 (3 requirements)
- `.planning/ROADMAP.md` — Phase 10 section avec 4 success criteria

### Audit blanc déjà livré (source de vérité métier)
- `.planning/audit/AUDIT-BLANC-RNQ-V9.md` (423 lignes, audit blanc manuel 2026-05-30, top 5 risques, mapping ind par ind avec niveaux attendus + sanctions NC + recommandations)
- `/Users/laurentmarx/Documents/CRM Next gen/Plan_Audit_start-academy_wr2511-04784-v1_4334.pdf` (Plan d'audit officiel BCI)
- `/Users/laurentmarx/Documents/CRM Next gen/guide_qualiopi_0.pdf` (Guide RNQ V9 Janvier 2024 Ministère du Travail)

### Memory utilisateur
- `~/.claude/projects/-Users-laurentmarx-Documents-CRM-Next-gen/memory/project_audit_qualiopi_03_07_2026.md` — confirmations Laurent (21 ind applicables, sous-traitance Lafitte+Ourmières → Ind 27 critique, plan 5 semaines)

### Code patterns à cloner
- `apps/web/src/components/sessions/qualiopi-matrix/*` — matrice docs Phase 9.1 (calcul complétude session × participant)
- `apps/web/src/lib/closure/queue.ts` + `worker.ts` — pattern BullMQ Phase 11
- `apps/web/scripts/invoice-reminder-worker.ts` ou équivalent Phase 11 — pattern worker daily cron + alerte email
- `apps/web/src/lib/regulatoryWatch-audit.ts` — pattern AuditLog 8 verbes (Phase 13, à cloner pour `qualiopi-blanc-audit.ts`)
- `apps/web/src/lib/veille-audit-template.ts` + `apps/web/src/server/actions/veille-export.ts` — pattern WeasyPrint export PDF + Document MinIO (Phase 13)
- `apps/web/src/lib/templates-catalog.ts` — pattern catalogue code-driven (Phase 12, à cloner pour `qualiopi-indicators-catalog.ts`)
- `apps/web/src/components/notifications/*` ou pattern Lead notifications Phase 9 — cloche + email
- `apps/web/src/lib/of-paged-footer.ts` — footer paged WeasyPrint (mémoire `feedback_footer_pdf_qualiof.md`)
- `apps/web/src/lib/rbac.ts` — pattern requireRole (ADMIN+MANAGER+LECTEUR)
- `apps/web/src/lib/mailer.ts` — nodemailer transport (mode dry-run si SMTP_HOST empty)

### Prisma schemas existants
- `packages/db/prisma/schema.prisma` — models `QualiopiDocCatalog`, `Document`, `Notification`, `Session`, `SessionParticipant`, `Attendance`, `Tenant`

### Worker safety (CRITICAL)
- `~/.claude/projects/-Users-laurentmarx-Documents-CRM-Next-gen/memory/feedback_worker_no_react_imports.md` — workers BullMQ NE DOIVENT PAS importer server actions auth. Pattern obligatoire `lib/qualiopi-blanc/core.ts` séparé de `actions/qualiopi-blanc.ts` wrapper.

### Prisma migration
- `~/.claude/projects/-Users-laurentmarx-Documents-CRM-Next-gen/memory/feedback_prisma_migrate_deploy.md` — migration Prisma → `prisma migrate dev` puis `prisma migrate deploy` (prod). Sandbox = `prisma db push --skip-generate`.

### Workflow conventions
- `./CLAUDE.md` — routes FR kebab-case, redirect 308 obligatoire pour variantes naturelles, multi-tenant `tenantId` scope, PDF footer body fix
- `.planning/STATE.md` — section "Workflow Conventions" : (1) renommage de route (Phase 12), (2) catalogue centralisé `lib/<feature>-catalog.ts` (Phase 12) — Phase 10 = 2ème application de la convention catalogue

### Port dev
- `~/.claude/projects/-Users-laurentmarx-Documents-CRM-Next-gen/memory/feedback_qualiof_port_3010.md` — instance dev tourne sur localhost:3010

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Composant qualiopi-matrix Phase 9.1** : 5 fichiers dans `apps/web/src/components/sessions/qualiopi-matrix/` (participant-doc-matrix, doc-status-badge, batch-regen-bar, doc-cell-menu, matrix-row). Calcule déjà la complétude par session × participant. Réutilisé tel quel pour D-11.
- **QualiopiDocCatalog seed** : 13+ entrées existantes avec `qualiopiIndicator` mapping (Ind 7, 9, 11, 12, 30 déjà mappés). À compléter pour D-08.
- **Pattern Worker BullMQ Phase 11** : cron daily, alertes email, Notification cloche.
- **Pattern catalogue code-driven Phase 12** : `lib/templates-catalog.ts` 27 entrées. Convention documentée dans STATE.md > Workflow Conventions. Phase 10 = 2ème application.
- **Pattern WeasyPrint Phase 13** : `lib/veille-audit-template.ts` + footer paged. Réutilisable pour D-09.
- **Pattern AuditLog Phase 13** : `lib/regulatoryWatch-audit.ts` 8 verbes. Helper à cloner pour `qualiopi-blanc-audit.ts`.
- **Pattern Notification Phase 9** : Lead notifications avec cloche + email. Type extensible.
- **Pattern RBAC Phase 8** : `requireRole(['ADMIN','MANAGER','LECTEUR'])` + sidebar filter.

### Established Patterns
- **Worker Safety** : `lib/<feature>/core.ts` séparé de `actions/<feature>.ts` wrapper (mémoire `feedback_worker_no_react_imports`). Convention à respecter D-03.
- **Multi-tenant** : toute query Prisma scopée par `tenantId: user.tenantId`. Convention non-négociable CLAUDE.md.
- **PDF Footer** : `position:fixed bottom:0` à 11pt dans body (mémoire `feedback_footer_pdf_qualiof`). Pour WeasyPrint = CSS Paged Media `@page { @bottom-center { content: ... } }`.
- **Sidebar nav-config role filter** : `allowedRoles: ['ADMIN','MANAGER','LECTEUR']` pour cette page.

### Integration Points
- `apps/web/src/components/layout/nav-config.ts` — entrée sidebar à ajouter (section Pilotage ou Configuration)
- `apps/web/src/app/app/audit-qualiopi-blanc/page.tsx` — nouvelle route
- `packages/db/prisma/schema.prisma` — modèle `QualiopiBlancEntry` + enum `QualiopiBlancStatus` + relation Tenant
- `packages/db/prisma/seed.ts` — enrichir QualiopiDocCatalog (D-08)
- `apps/web/scripts/qualiopi-blanc-worker.ts` — nouveau worker entrypoint
- `apps/web/src/lib/qualiopi-blanc/core.ts` + `actions/qualiopi-blanc.ts` + `queue.ts` + `worker.ts` + `prompts/notification-email.ts`
- `apps/web/src/lib/qualiopi-indicators-catalog.ts` — catalogue 21 ind
- `apps/web/src/lib/qualiopi-blanc-audit.ts` — helper AuditLog 4 verbes
- `apps/web/src/lib/qualiopi-blanc-pdf-template.ts` — template HTML WeasyPrint

</code_context>

<specifics>
## Specific Ideas

- D-09 PDF rapport : peut inclure dans la 1ère page un encart "Action correctrice recommandée" auto-générée pour chaque NC, exploitable directement par Laurent pour son plan d'action. Cf. AUDIT-BLANC-RNQ-V9.md §"Synthèse exécutive — Top 5 risques" pour structure type.

- D-02 indicateurs auto-calculables (4 sur 21) à valider :
  - **Ind 9 (Programme)** : 100% sessions ayant doc `PROGRAMME` généré = CONFORME ; sinon EN_COURS
  - **Ind 11 (Évaluation acquis + Attestation fin)** : 100% participants ayant docs `EVALUATION_ACQUIS` + `ATTESTATION_FIN` = CONFORME
  - **Ind 12 (Émargement + Assiduité)** : 100% participants ayant docs `EMARGEMENT` (≥ 2 cases/jour) + `ASSIDUITE` = CONFORME
  - **Ind 30 (Satisfaction)** : ≥ 90% sessions closes avec `SATISFACTION` rempli = CONFORME (cf. mémoire `feedback_regles_docs_qualiopi`)

- D-03 worker timing : `'0 9 * * *'` daily 9h Europe/Paris (après cron veille Phase 13 qui est lundi 8h, pas de conflit). jobId fixe `'daily-qualiopi-blanc-alerts'`.

- D-10 helper AuditLog : 4 verbes suffisent (entry_updated, auto_recalculated, exported, notification_sent). Pas besoin des 8 verbes Phase 13 (pas de workflow inbox/approve/reject ici).

- Mémoires utilisateur clés :
  - `feedback_qcm_partage_par_session.md` : 1 QCM par session — Ind 11 calcul = présence QCM session (pas par participant)
  - `feedback_regles_docs_qualiopi.md` : par-stagiaire vs par-session, satisfaction ≥ 90%, émargement 2 cases/jour
  - `feedback_logique_financeur.md` : pas d'attribut direct apprenant pour financeur (impact ind 27 sous-traitance ? non, c'est différent)

</specifics>

<deferred>
## Deferred Ideas

- **Multi-référentiel** (Qualiopi Bilan/VAE/Apprentissage/RNCP-RS) — Start Academy mono-référentiel AF L.6313-1-1°, autres reportés sans deadline
- **Plans d'action correctifs auto-générés** (V2 — tableau Tasks avec deadlines, assignés à utilisateurs)
- **API France Compétences** (V2 — vérif certifications RNCP automatiquement)
- **Comparaison historique** (versions d'audits blancs successifs, courbe de progrès)
- **Multi-tenant flag `applicable`** par indicateur si Start Academy ouvre à d'autres OFs (revertable depuis hardcode si besoin v6)
- **Sondage NPS auditeurs** post-audit blanc (feedback pour itération du référentiel interne)
- **Export Excel + CSV** du rapport audit (PDF V1 suffisant)
- **Partage public audit blanc** (sur le site start-academy.fr pour transparence — pas d'intérêt direct)

</deferred>

---

*Phase: 10-audit-qualiopi-blanc*
*Context gathered: 2026-05-25 via /gsd:discuss-phase 10 — 4 décisions critiques + 8 défauts Claude*
*Deadline interne : 2026-06-26 (1 semaine de tests avant audit officiel 2026-07-03 par Samia ZIANI BCI)*
