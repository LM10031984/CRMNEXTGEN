# Roadmap: QualiOF

## Overview

Milestone v5 "Audit UX/QA + Features métier" : structurer les 22 frictions de l'audit UX/QA 2026-05-12 + 4 nouvelles features métier en 12 phases (granularity fine), avec couverture 100% des 40 v1 requirements définis dans `REQUIREMENTS.md`. Démarrage par les bugs critiques bloquants démo, puis fondations responsive, puis UX gaps, puis paramètres + RBAC, puis nouvelles features (leads auto, Qualiopi blanc, factures, modules stub).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Smoke verification + bugs critiques** - Vérifier en runtime + fixer les 3 bugs critiques de l'audit (FileText, header sticky, routes 404)
- [x] **Phase 2: Responsive foundation** - Restaurer breakpoints Tailwind + sidebar/main responsive
- [x] **Phase 3: Responsive content layouts** - Dashboard + listings + fiches reflow correct par viewport
- [x] **Phase 4: TopBar UX** - Panneau notifications cloche + déconnexion dans dropdown avatar
- [x] **Phase 5: Fiche apprenant UX** - CTAs génération doc, drill-downs, breadcrumb, dialogs RGPD
- [x] **Phase 6: Dashboard hiérarchisation et a11y** - 4 KPI prioritaires + codes financeurs cohérents + WCAG AA
- [x] **Phase 7: Paramètres organisme éditables** - Sortir SIRET/logo/préfixe facture du read-only
- [x] **Phase 8: Multi-utilisateurs et RBAC** - Invitation users + permissions effectives par rôle
- [x] **Phase 9: Distribution leads automatique** - Auto-assignation Lead→Commercial + vue de charge
- [ ] **Phase 10: Audit Qualiopi blanc** - Simulation pré-audit 32 indicateurs + alertes dossiers incomplets
- [x] **Phase 11: Factures cycle complet** - Numérotation, paiements, relances, export comptable (completed 2026-05-21)
- [ ] **Phase 12: Modules stub Inscriptions et Modèles** - Trancher périmètre, livrer ou retirer

## Phase Details

### Phase 1: Smoke verification + bugs critiques
**Goal**: Vérifier en runtime les 3 bugs critiques de l'audit. Fixer ceux qui sont réels, retirer les faux positifs de la backlog avec preuve.
**Depends on**: Nothing (first phase)
**Requirements**: [BUG-01, BUG-02, BUG-03]
**Success Criteria** (what must be TRUE):
  1. Page `/app/sessions/[id]` boote sans `FileText is not defined` en runtime (clean build + capture browser).
  2. TopBar reste sticky au scroll sur dashboard, sessions list, fiche apprenant (captures avant/après).
  3. URLs naturelles `/app/pre-inscriptions` et `/app/modeles` redirigent (301) vers les vraies routes OU sont renommées.
  4. Test smoke ajouté pour `/app/sessions/[id]` qui valide rendu sans erreur.
**Plans**: TBD

### Phase 2: Responsive foundation
**Goal**: Restaurer les breakpoints Tailwind par défaut et rendre la sidebar + le main responsive.
**Depends on**: Phase 1
**Requirements**: [RESP-01, RESP-02, RESP-03]
**Success Criteria** (what must be TRUE):
  1. `tailwind.config.ts` : `screens` dans `theme.extend`, utilities `md:`/`lg:`/`xl:` actives.
  2. Sidebar : visible ≥ md (768px), drawer hamburger < md.
  3. MainContent : `ml-0 md:ml-64`, aucune zone du contenu cachée en mobile.
  4. Captures 390/768/1024/1440px : layout correct sur dashboard et apprenants list.
**Plans**: TBD

### Phase 3: Responsive content layouts
**Goal**: Adapter les grilles internes (dashboard KPI, pipeline, listings, fiches) au viewport.
**Depends on**: Phase 2
**Requirements**: [RESP-04, RESP-05]
**Success Criteria** (what must be TRUE):
  1. Dashboard KPI tiles reflow `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.
  2. Fiches : 1 colonne en mobile, 2-3 en desktop.
  3. Listings : scroll horizontal ou affichage carte en mobile.
  4. QA captures 390/768/1024/1440 sur 6 écrans clés (dashboard, sessions list/détail, apprenants list/détail, dossier OPCO détail).
**Plans**: TBD

### Phase 4: TopBar UX
**Goal**: Combler 2 frictions visibles immédiatement après login (cloche notifications + bouton déconnexion).
**Depends on**: Nothing
**Requirements**: [UX-01, UX-02]
**Success Criteria** (what must be TRUE):
  1. Cloche ouvre Radix Popover avec 10 dernières notifications + "Tout voir" + "Marquer tout comme lu".
  2. Avatar ouvre Radix DropdownMenu (Profil / Paramètres / Déconnexion avec AlertDialog confirmation).
  3. Bouton "Déconnexion" direct retiré de la TopBar.
**Plans**: TBD

### Phase 5: Fiche apprenant UX
**Goal**: Combler les 8 manques UX de la fiche apprenant identifiés par l'audit.
**Depends on**: Nothing
**Requirements**: [UX-03, UX-04, UX-05, UX-06, UX-07, UX-08, UX-09, UX-10]
**Success Criteria** (what must be TRUE):
  1. CTA "Générer un document" toujours visible onglet Documents.
  2. Sélecteur année + bouton "Déposer dossier AGEFICE" pré-rempli dans bloc Budget AGEFICE.
  3. Compteurs Sessions/Heures cliquables, drill-down vers liste filtrée.
  4. Tooltip badge "1" onglet Activité formation.
  5. Bouton Supprimer remplacé par menu Actions (Archiver soft-delete + Supprimer destructif avec double-confirm).
  6. Liste des champs manquants directement visible sous badge "X champs à renseigner".
  7. Composant Breadcrumb réutilisable affiché en haut de fiche.
**Plans**: TBD

### Phase 6: Dashboard hiérarchisation et a11y
**Goal**: Réduire la densité anxiogène + harmoniser libellés financeurs + passer audit accessibilité.
**Depends on**: Nothing
**Requirements**: [UX-11, UX-12, UX-13]
**Success Criteria** (what must be TRUE):
  1. Dashboard : 4 KPI prioritaires en grand + 14 KPI secondaires dans section repliable fermée par défaut.
  2. Codes financeurs harmonisés via mapping user-friendly (OPCOMMERCE→OPCO Commerce, OPCO_EP→OPCO EP).
  3. Lighthouse a11y > 90 sur 4 écrans clés.
  4. Navigation clavier OK sur listes (Tab/Enter/Esc).
**Plans**:
- [x] 06-01-PLAN.md — UX-12 helper funder-codes + intégration UI (14 sites)
- [x] 06-02-PLAN.md — UX-11 hiérarchisation dashboard PrioCard + CollapsibleSection
- [x] 06-03-PLAN.md — UX-13 audit a11y + correctifs Badge si nécessaire
- [x] 06-04-PLAN.md — Bookkeeping ROADMAP/REQUIREMENTS/STATE + smoke build + tests

### Phase 7: Paramètres organisme éditables
**Goal**: Sortir Paramètres du read-only pour gérer infos légales, logo, préférences.
**Depends on**: Nothing
**Requirements**: [SET-01, SET-02, SET-03]
**Plans:** 5/5 plans complete
**Success Criteria** (what must be TRUE):
  1. Édition SIRET/Déclaration d'activité/RCS/forme juridique avec validation Zod.
  2. Upload logo + adresse + mentions légales + signatures alimente `lib/of-config.ts`.
  3. Préférences (préfixe factures, format dates, RIB OF, SMTP) éditables.
  4. AuditLog créé sur chaque modification.
**Plans**:
- [x] 07-01-PLAN.md — Migration Prisma Tenant (10 colonnes) + refactor of-config.ts async hybride BDD/ENV + cascade 12 callers + fix drift invoices.ts (commits a7d3572 + 851d1c7 + 1968c02)
- [x] 07-02-PLAN.md — Zod schemas (packages/shared/src/schemas/tenant.ts) + Server Actions tenant-settings (updateTenantIdentity/Address/Billing/Email) + helpers computeDiff/logTenantSettingsChange + lib/numbering.ts (getNextInvoiceNumber) + AuditLog 'parameters.update' (commits cb8154f + ce18809 + 6881d9b)
- [x] 07-03-PLAN.md — tenant-assets.ts (upload/reset logo + 2 signatures) + extension loadAssetDataUrl(tenantId) + invalidateAssetCache + cascade programme/convention templates (logoCache local supprimé)
- [x] 07-04-PLAN.md — UI Paramètres : page Server Component refactorée + 6 sections édition inline (SettingsSection + 6 form components) + helper formatIban + AlertDialog discontinuité préfixe + smoke test page
- [x] 07-05-PLAN.md — Bookkeeping fin de phase (REQUIREMENTS/ROADMAP/STATE + smoke build/tests + commentaire .env.example fallback + 6 auto-fixes tsc en Wave 4)

### Phase 8: Multi-utilisateurs et RBAC
**Goal**: Activer la gestion d'utilisateurs et appliquer effectivement les 6 rôles.
**Depends on**: Phase 7
**Requirements**: [RBAC-01, RBAC-02, RBAC-03, RBAC-04, RBAC-05]
**Success Criteria** (what must be TRUE):
  1. Page Utilisateurs (liste, ajout, désactivation, reset MDP) accessible depuis Paramètres.
  2. Flow invitation email tokenisé → première connexion crée hashedPwd.
  3. Sidebar filtrée selon `user.role` (matrice documentée).
  4. Guards par rôle dans server actions sensibles selon `packages/shared/src/constants/permissions.ts`.
  5. AuditLog UI accessible aux ADMIN avec filtres.
**Plans:** 6/6 plans complete
**Plans**:
- [x] 08-01-PLAN.md — Foundation: migration Prisma User+UserInvitation + permissions matrix D-02 + rbac.ts (requireRole/hasRole/UnauthorizedError/ForbiddenError) + auth.ts disabledAt + Zod schemas user
- [x] 08-02-PLAN.md — Server actions tenant-users.ts (inviteUser/disableUser/enableUser/resetUserPassword/changeUserRole/resendInvitation) + email templates (user-invitation, user-password-reset) + logUserAction helper
- [x] 08-03-PLAN.md — Public /invitation/[token] page + SetPasswordForm + acceptInvitation server action (atomic single-use)
- [x] 08-04-PLAN.md — UI page /app/parametres/utilisateurs (UsersTable + InviteUserButton + UserRowActions + ChangeRoleDialog) + sidebar filterNavForRole + propagation nav en prop
- [x] 08-05-PLAN.md — UI page /app/parametres/historique (AuditLogFilters URL state + AuditDiffModal) + login hooks auth.login.success/failed + lastLoginAt + buildAuditWhere pure fn
- [x] 08-06-PLAN.md — Apply requireRole sur server actions sensibles (tenant-settings/assets/invoices/sessions/sessions-create/closure-pack/dossiers-opco/dossiers-opco-bulk/crud-edits) + bookkeeping fin de phase

### Phase 9: Distribution leads automatique
**Goal**: Auto-assigner Lead → Commercial selon règles configurables + vue de charge.
**Depends on**: Nothing
**Requirements**: [LEAD-01, LEAD-02]
**Success Criteria** (what must be TRUE):
  1. Paramètres › Distribution leads : configuration des règles (round-robin, zone, enseigne, historique).
  2. Création de Lead → `assignedTo` rempli automatiquement, fallback MANAGER.
  3. Vue "Charge par commercial" (leads ouverts, taux conversion, temps moyen).
  4. Notification cloche + email à l'assignation.
**Plans:** 5/5 plans complete
**Plans**:
- [x] 09-01-PLAN.md — Foundation : migration Prisma (Notification + Lead.wonAt + 3 toggles Tenant) + Zod schemas leads + helpers purs (getCommercialsWithKpis + renderLeadAssignedEmail)
- [x] 09-02-PLAN.md — Server actions leads.ts (createLead/reassignLead/updateLeadStatus) + distribution-leads-config.ts + helper notifyLeadAssigned + extension audit-log.ts (logLeadEvent)
- [x] 09-03-PLAN.md — UI pages : /app/leads/charge ADMIN+MANAGER + /app/leads/[id] + /app/leads/new + 5 composants leads/* (pie SVG + table + reassign + status-select + create-form)
- [x] 09-04-PLAN.md — Page paramètres /app/parametres/distribution-leads ADMIN + extension cloche TopBar (kind lead.assigned + markNotificationRead) + sidebar (Vue de charge + Distribution leads)
- [x] 09-05-PLAN.md — Bookkeeping (REQUIREMENTS/ROADMAP/STATE + smoke build/tests + 09-SMOKE.md + 09-SUMMARY.md)

### Phase 09.1: Centralisation Qualiopi 360° (INSERTED)
**Goal**: Centraliser visuellement les documents Qualiopi par session/apprenant/produit ; permettre re-génération ciblée 1 stagiaire ; refondre fiches apprenant (timeline année) et produit (4 onglets) ; cross-navigation Airtable-style.
**Depends on**: Phase 9
**Requirements**: [CENTRAL-01, CENTRAL-02, CENTRAL-03, CENTRAL-04, CENTRAL-05]
**Success Criteria** (what must be TRUE):
  1. Fiche session : matrice visuelle stagiaire × document avec pastilles 3 états (GENERATED/MANUAL_OK/MISSING) + bloc séparé docs session-only + tri/filtres sauvés.
  2. Action ⋮ par cellule (5 actions max) + sélection multi : re-générer doc ciblé pour 1 stagiaire OU batch via job BullMQ closure-pack mode single-participant.
  3. Fiche apprenant : timeline verticale par année + 3 PrioCard (Heures totales / Sessions / Heures cette année) + bandeau alerte docs manquants ou paiement en attente.
  4. Fiche produit : 4 onglets Stats / Sessions / Apprenants formés / Programme.
  5. Cross-navigation cliquable systématique : apprenant ↔ session ↔ produit ↔ doc. Auditeur Qualiopi trouve un doc en 1-2 clics depuis fiche session.
  6. Bug P0 « Programme dupliqué N fois » résolu : 1 PDF stocké session-wide, N statuts dérivés par-participant.
**Plans:** 6/6 plans complete

Plans:
- [x] 09.1-01-PLAN.md — Foundation : migration Prisma + schémas Zod + helpers purs doc-scope/derive-cell-state/document-audit (Bug P0 anti-régression test)
- [x] 09.1-02-PLAN.md — 5 server actions qualiopi-matrix tenant-scoped + extension closure-pack (kinds+force) + 3 composants atomiques (DocStatusBadge / DocCellMenu / UploadSignedDocDialog)
- [x] 09.1-03-PLAN.md — Fiche session refondue : ParticipantDocMatrix + SessionOnlyDocsBlock + MatrixFilters + BatchRegenBar + AttendanceDetailDrawer + useLocalStorageState
- [x] 09.1-04-PLAN.md — Fiche apprenant refondue : LearnerTimeline + 3 PrioCard + AlertsBanner + helper learner-stats
- [x] 09.1-05-PLAN.md — Fiche produit refondue : ProductTabs 4 onglets URL-state + helpers product-stats Promise.all
- [x] 09.1-06-PLAN.md — Bookkeeping + smoke build + 8 flows DevTools 09.1-SMOKE.md


### Phase 10: Audit Qualiopi blanc
**Goal**: Simuler un audit Qualiopi avant passage réel + alerter sur dossiers incomplets.
**Depends on**: Nothing
**Requirements**: [QBLANC-01, QBLANC-02, QBLANC-03]
**Success Criteria** (what must be TRUE):
  1. Page Qualiopi blanc : score global + détail 32 indicateurs.
  2. Pour chaque session : checklist auto 10 docs Qualiopi + scoring + drill-down.
  3. Notification cloche + email 7j avant fin de session si dossier incomplet.
  4. Bouton "Télécharger rapport audit blanc" → PDF (Gotenberg) avec verdict par indicateur.
**Plans**: TBD

### Phase 11: Factures cycle complet
**Goal**: Module Factures fonctionnel bout en bout — création, numérotation, paiements, relances, export comptable.
**Depends on**: Nothing
**Requirements**: [FACT-01, FACT-02, FACT-03, FACT-04]
**Plans:** 10/10 plans complete
**Success Criteria** (what must be TRUE):
  1. Audit du périmètre actuel documenté : gaps listés.
  2. Numérotation séquentielle préfixe configurable + gestion avoirs NCN.
  3. Suivi paiements (InvoicePayment) + relances email J+30/J+45.
  4. Export comptable FEC ou xlsx générique.
**Plans**:
- [x] 11-00-foundation-tests-stubs-migration-PLAN.md — Migration Prisma additive (Invoice +3 cols, Tenant +2 cols, 2 index, self-FK) + 8 fichiers tests stubs Wave 0 (Nyquist Dimension 8)
- [x] 11-01-numerotation-avoirs-PLAN.md — Helper getNextCreditNoteNumber atomique transactional (séquence AVO-NNNNNN distincte de FAC-NNNNNN, CGI art. 289)
- [x] 11-02-audit-log-invoice-PLAN.md — Module lib/invoice-audit.ts (logInvoiceEvent clone Phase 9.1 D-Phase9.1-02 — 4ème instance entity-namespaced)
- [x] 11-03-mailer-template-relances-PLAN.md — Template email 2 niveaux (J+30 amical / J+45 ferme + mention légale art. L441-10)
- [x] 11-04-tenant-settings-reminderdays-PLAN.md — Zod schemas centralisés + page Paramètres section Facturation ADMIN-only (creditNotePrefix + invoiceReminderDays)
- [x] 11-05-create-credit-note-PLAN.md — Server action createCreditNote + Radix Dialog client + extension template PDF mode AVOIR + intégration fiche facture
- [x] 11-06-worker-relances-PLAN.md — Worker BullMQ daily cron 8h Paris + sendInvoiceReminder server action hybride cron/manual + bouton UI fiche facture
- [x] 11-07-export-xlsx-PLAN.md — Helper buildInvoiceExportRows + route API /api/factures/export RBAC ADMIN+COMPTABLE (12 colonnes, avoirs négatifs)
- [x] 11-08-page-liste-factures-PLAN.md — Refonte /app/factures (4 PrioCard KPI + filtres + table + bouton Exporter) + backfill logInvoiceEvent 3 actions existantes
- [x] 11-09-cross-nav-blocks-PLAN.md — LearnerInvoicesBlock + SessionInvoicesBlock (cross-nav Airtable D-07)

### Phase 12: Modules stub Inscriptions et Modèles
**Goal**: Trancher périmètre des 2 modules placeholder, livrer ou retirer.
**Depends on**: Nothing
**Requirements**: [MOD-01, MOD-02]
**Success Criteria** (what must be TRUE):
  1. Inscriptions : décision documentée (vue agrégée OU retrait avec redirect).
  2. Modèles de documents : décision documentée (éditeur templates OU liste read-only OU retrait).
  3. Plus aucun item de sidebar ne renvoie sur une page placeholder.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order. Phase 2 depends on 1, Phase 3 on 2, Phase 8 on 7. Toutes les autres sont parallélisables après leurs dépendances.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Smoke verification + bugs critiques | 4/4 | Complete    | 2026-05-12 |
| 2. Responsive foundation | 4/4 | Complete    | 2026-05-13 |
| 3. Responsive content layouts | 5/5 | Complete    | 2026-05-13 |
| 4. TopBar UX | 3/3 | Complete    | 2026-05-13 |
| 5. Fiche apprenant UX | 8/8 | Complete    | 2026-05-13 |
| 6. Dashboard hiérarchisation et a11y | 3/3 | Complete    | 2026-05-13 |
| 7. Paramètres organisme éditables | 5/5 | Complete    | 2026-05-15 |
| 8. Multi-utilisateurs et RBAC | 6/6 | Complete    | 2026-05-16 |
| 9. Distribution leads automatique | 5/5 | Complete    | 2026-05-16 |
| 9.1. Centralisation Qualiopi 360° (INSERTED) | 6/6 | Complete    | 2026-05-18 |
| 10. Audit Qualiopi blanc | 0/TBD | Not started | - |
| 11. Factures cycle complet | 10/10 | Complete    | 2026-05-21 |
| 12. Modules stub Inscriptions et Modèles | 0/TBD | Not started | - |
| 13. Veille Qualiopi intégrée | 5/6 | In Progress|  |

### Phase 13: Veille Qualiopi intégrée

**Goal:** Couvrir le critère 6 Qualiopi (indicateurs 23/24/25/26) via une veille intégrée dans QualiOF, 100% locale (RSS + Ollama, 0 coût API), avec exploitation tracée et export PDF audit.
**Requirements**: [VEILLE-01, VEILLE-02, VEILLE-03, VEILLE-04]
**Depends on:** Nothing (peut être priorisée avant Phase 12)
**Success Criteria** (what must be TRUE):
  1. Table Prisma `RegulatoryWatch` (tenantId, theme enum 23/24/25/26, title, url, source, frequency, responsable, exploitation, dateAdded, dateLastReviewed, status draft/active/archived, suggestedBy user/import/auto).
  2. Import one-shot du xlsx existant (`C6.i23-24-25tableau veille.xlsx`) → ~50 entrées historiques + 34 récentes en BDD.
  3. Page `/app/veille` : 4 onglets par thème, tableau filtrable, ajout/édition manuelle, édition inline du champ Exploitation, indicateur "X jours depuis dernière mise à jour" par thème, boîte de réception suggestions auto à valider/rejeter.
  4. Export PDF audit (Gotenberg) : un PDF par thème avec sources/dates/exploitations, prêt à présenter à l'auditeur Qualiopi.
  5. Worker BullMQ cron hebdo : RSS aggregator des sources connues + Ollama (mistral-small:24b) pour classifier le thème et proposer un brouillon d'exploitation, INSERT en `status=draft` `suggestedBy=auto`.
  6. RBAC : ADMIN + MANAGER pour CRUD veille, LECTEUR pour consultation. AuditLog convention `regulatoryWatch.[verb]`.
**Plans:** 5/6 plans executed

Plans:
- [ ] TBD (run /gsd:plan-phase 13 to break down)

---

*Roadmap created: 2026-05-12 · Granularity: fine · 13 phases · 44 requirements*
