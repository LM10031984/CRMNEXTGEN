# Requirements — Milestone "Audit UX/QA + Features métier"

**Project:** QualiOF · **Milestone target:** v5 (post paliers 2.2/2.3/3/4)
**Defined:** 2026-05-12
**Source:** Audit UX/QA 2026-05-12 + memory + codebase verification

> See `PROJECT.md` for project context, Validated requirements (paliers 2.2-4), and Out of Scope.

---

## v1 Requirements (this milestone)

### 🔴 Bugs critiques (court terme — bloquants démo client)

- [x] **BUG-01** : Re-vérifier en runtime le "FileText is not defined" sur `/app/sessions/[id]`. **RESOLVED 2026-05-12** — faux positif confirmé via `rm -rf apps/web/.next && pnpm --filter @qualiof/web build` : build complet OK, page `/app/sessions/[id]` compile à 11.1 kB. Test smoke Vitest ancré (`apps/web/src/app/app/sessions/[id]/__tests__/page.smoke.test.ts`, 2 tests verts) pour empêcher régression future.
- [x] **BUG-02** : Corriger le header sticky qui se décolle au scroll. **FIXED 2026-05-12** — Fix #1 appliqué : retrait `min-h-screen` de `MainContent` (`apps/web/src/components/layout/main-content.tsx`) car le wrapper parent `app/app/layout.tsx` l'applique déjà. Le doublement cassait le contexte sticky du `<header>`. Vérification visuelle sticky par DevTools restante (cas de bascule Fix #2 documenté Plan 01-03).
- [x] **BUG-03** : Cohérence routes — redirects 308 ajoutés dans `apps/web/next.config.mjs` pour `/app/pre-inscriptions` → `/app/preinscriptions` et `/app/modeles` → `/app/templates` (incl. variantes `:path*`). **DONE 2026-05-12** — preuve curl runtime : `curl -sI :3002/app/pre-inscriptions` → `308 + location: /app/preinscriptions`, `curl -sI :3002/app/modeles` → `308 + location: /app/templates`. Convention naming documentée dans `CLAUDE.md > Routes (convention naming)`.

### 🟠 Responsive (cause racine identifiée)

- [x] **RESP-01** : Audit breakpoints Tailwind. **RESOLVED 2026-05-13** — diagnostic Phase 1 erroné. `tailwind.config.ts` a `screens: { '2xl': '1400px' }` dans `theme.container.screens` (scope utility container uniquement), les breakpoints sm/md/lg/xl/2xl par défaut sont intacts. CONCERNS.md sections #4/#5 + CLAUDE.md > Patterns to fix corrigés. Aucune modification de tailwind.config.ts nécessaire.
- [x] **RESP-02** : Sidebar responsive. **DONE 2026-05-13** — refactor : extraction `nav-config.ts` (NAV) + `sidebar-nav.tsx` (rendu réutilisable) + `mobile-nav-drawer.tsx` (Radix Dialog) + `mobile-menu-button.tsx`. Desktop : `<aside hidden md:flex>` (visible >= 768px). Mobile : bouton hamburger Lucide `Menu` dans TopBar `md:hidden` ouvre un drawer overlay. Une seule source de vérité NAV. Build Next.js OK.
- [x] **RESP-03** : MainContent responsive. **DONE 2026-05-13** — className passée à `ml-0 md:ml-64` (et variante collapsed `ml-0 md:ml-[64px]`). 1 ligne effective modifiée. Compilation OK, smoke test Phase 1 toujours vert (pas de régression).
- [x] **RESP-04** : Grids responsive complets. **DONE 2026-05-13** — dashboard `/app/page.tsx` densifié (4 grilles ajustées avec `xl:` pour viewports >= 1280px), 3 grids pages (`dossiers-opco/506`, `organisations/[id]:212`, `financeurs:130`) fixées, 13 grids dans 11 composants forms/wizards/panels passées en `grid-cols-1 sm:grid-cols-N`. 6 panels stats compactes (`grid-cols-3` KPI) gardées avec commentaire d'exemption documenté. Build clean, smoke test Phase 1 vert.
- [x] **RESP-05** : Listings responsive. **DONE 2026-05-13** — `<main>` padding `p-4 md:p-8` (gain +64px mobile). 5 pages list (apprenants, organisations, dossiers-opco, preinscriptions, leads) wrappées en `<div className="overflow-x-auto -mx-4 sm:mx-0">` (3 ajout du `-mx-4 sm:mx-0` à un wrapper existant, 2 wrap complet autour de `<DataTable />`). Composant `<DataTable />` inchangé. Sessions/Produits/Formateurs utilisent déjà un rendu card-based responsive natif (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`).

### 🟠 UX gaps de l'audit

- [x] **UX-01** : Panneau Notifications. **VALIDATED 2026-05-13** — `apps/web/src/components/layout/notifications-bell.tsx` (~125 lignes) implémente déjà un Radix DropdownMenu complet (items + icônes Lucide + sévérité info/warning/danger + drill-down + état vide + polling 60s + badge total). L'audit "On ne sait pas ce qu'il y a derrière" était obsolète. "Tout voir" / "Marquer comme lu" N/A : alertes DÉRIVÉES non persistées qui s'auto-résolvent.
- [x] **UX-02** : Déconnexion protégée. **DONE 2026-05-13** — nouveau composant `apps/web/src/components/layout/user-menu-button.tsx` : avatar = trigger Radix DropdownMenu (Paramètres + séparateur + Déconnexion rouge). Clic Déconnexion ouvre Radix Dialog confirmation + Annuler/Se déconnecter rouge qui submit `<form action={logoutAction}>`. `top-bar.tsx` refactorée : -import logoutAction, -form direct, -bloc text+avatar inline, +UserMenuButton. Pattern client subcomponent. Build OK + smoke vert.
- [x] **UX-03** : CTA "Générer un document". **DONE 2026-05-13** — bouton "Générer un document" toujours visible (à droite de l'en-tête de l'onglet Documents) dès que l'apprenant a au moins une participation. Lie vers onglet Activité avec ancre `#inscriptions-list`. Génération réelle déléguée aux menus Actions par-session existants (`<ParticipantActionsMenu>` + `<GenerateClosureForParticipantButton>`) qui couvrent les ~10 docs Qualiopi.
- [x] **UX-04** : CTA "Déposer un dossier AGEFICE". **DONE 2026-05-13** — bouton `FilePlus2` en bas du bloc BudgetAgefice (uniquement si sessions AGEFICE éligibles sans fiche). Lie vers la session pour déclencher la génération. Indique le nombre de sessions éligibles.
- [x] **UX-05** : Compteurs cliquables Activité. **DONE 2026-05-13** — KPI Sessions, Heures formées et AGEFICE désormais rendus en `<a href="#inscriptions-list">` ou `<a href="#budget-agefice">` (drill-down dans la même page, scroll smooth via `scroll-mt-20`). Hover état appliqué.
- [x] **UX-06** : Sélecteur d'année Budget AGEFICE. **DONE 2026-05-13** — chips année dans BudgetAgefice (currentYear + selected + availableYears déduits des participations AGEFICE). Click → `?ageficeYear=NNNN` sur l'URL, server component recalcule `consomme` + `sessions` pour l'année.
- [x] **UX-07** : Tooltip badge tabs. **DONE 2026-05-13** — `LearnerTabs` accepte un nouveau prop `badgeTitle?` rendu en `title=` + `aria-label=` sur le badge. Page apprenant passe "X inscription(s) en session" / "X document(s) généré(s)" pour les 2 onglets concernés.
- [x] **UX-08** : Bouton Supprimer. **VALIDATED 2026-05-13 — faux positif audit** : `DeleteEntityButton` (`components/forms/delete-entity-button.tsx`) avait DÉJÀ une modale de confirmation Radix Dialog + soft-delete par défaut (`force=false`) + hard-delete optionnel (`force=true`) avec checkbox explicite. Aucune modification nécessaire.
- [x] **UX-09** : Champs manquants visible direct. **DONE 2026-05-13** — `LearnerCompletenessBadge` refactorée : retiré `useState(open)` + bouton expand. Liste des champs manquants affichée systématiquement sous la barre de progression, en chips compactes coloriées par tone (catégorie + label, regroupées). Composant passé de client à server component.
- [x] **UX-10** : Breadcrumb composant réutilisable. **DONE 2026-05-13** — nouveau `apps/web/src/components/ui/breadcrumb.tsx` : prend `items: BreadcrumbItem[]`, dernier item = page courante (sans href, font-medium), précédents = liens. Intégré dans fiche apprenant (`Apprenants > NOM Prénom`). Réutilisable pour fiche produit + autres pages détail (à équiper en v6).
- [x] **UX-11** : Hiérarchisation KPI dashboard. **DONE 2026-05-13** — nouvelle section "À l'essentiel" en haut avec 4 PrioCard grand format (CA encaissé, AGEFICE consommé année courante, Sessions à venir, Taux remplissage). Les 14 KPI détaillés (CA prévu/signé/à venir/Facturé/Reste, Cashflow DSO/Factures attente, Performance Sessions/Apprenants/Heures/CA per X) wrappés dans `<CollapsibleSection id="dashboard-detailed">` (fermée par défaut, état persisté localStorage). Nouveau composant `apps/web/src/components/ui/collapsible-section.tsx`. Densité dashboard divisée par 3. **Plan 06-02 (2026-05-13)** : audit conformité OK (NO-OP sur `page.tsx`) + CollapsibleSection renforcée a11y (aria-label FR dynamique, aria-controls, aria-hidden sur icônes décoratives) — commit `b71b620`.
- [x] **UX-12** : Codes financeurs harmonisés. **DONE 2026-05-13** — helper `apps/web/src/lib/funder-codes.ts` (FUNDER_LABELS + formatFunderCode, label OF aligné CONTEXT.md D-02 sur "OF (auto-financé)" — commit `096bc28`) intégré dans 14 sites UI (organisations list/[id], dossiers-opco list/envoyer, sessions/[id], apprenants/[id], formateurs/[id], financeurs list/[code], legal-link-editor, gap-row, learner-quick-view-button, person-or-org-picker) — commit `4d98926`. BDD garde les codes raw (clés stables), seul le RENDU change. Plan 06-01.
- [x] **UX-13** : Audit a11y. **DONE 2026-05-13** — audit visuel + grep ciblé documenté dans `.planning/phases/06-dashboard-hierarchisation-et-a11y/06-A11Y-AUDIT.md` (138 lignes). 4 dimensions évaluées (contraste Badge variants, navigation clavier, aria-label boutons icon-only, anti-pattern div onClick). Verdict global PASS_AVEC_NOTES : Badge 7/7 variants ratio ≥ 4.5:1 WCAG AA (palette primary/emerald/amber/sky/red 50→700+ tous compliants), sidebar/DataTable/cmdk utilisent `<Link>` natifs (nav clavier OK), MobileMenuButton + NotificationsBell + UserMenuButton ont aria-label depuis Phase 2/4. Dette v6 listée (~4 X icon-only sans aria-label + 5 dialogs custom à migrer Radix). Task 2 NO-OP : `git diff badge.tsx` vide. Plan 06-03 — pas de commit code (audit doc gitignored).

### 🟡 Paramètres organisme

- [x] **SET-01** : Édition SIRET / Déclaration d'activité / RCS / forme juridique. **DONE 2026-05-15** — migration Tenant (legalForm String?) + tenantIdentitySchema Zod (SIRET Luhn via isValidSiret) + Server Action `updateTenantIdentity` + AuditLog action=`parameters.update` + UI section Identité avec inline edit + smoke test page. Plans 07-01 (a7d3572 + 851d1c7 + 1968c02) / 07-02 / 07-04.
- [x] **SET-02** : Édition adresse + logo + mentions légales + signatures. **DONE 2026-05-15** — migration Tenant (legalMentions @db.Text + logoPath + signaturePedagoPath + signatureDirigeantPath) + `tenantAddressSchema` + `updateTenantAddress` + `tenant-assets.ts` (uploadTenantLogo/uploadTenantSignature/resetTenantLogo/resetTenantSignature) + extension `loadAssetDataUrl(filenames, tenantId?)` avec `invalidateAssetCache` + cascade `programme-template.ts`/`convention-template.ts` (logoCache local supprimé) + UI sections Adresse & Logo&Signatures. Plans 07-01 / 07-02 / 07-03 / 07-04.
- [x] **SET-03** : Préférences (préfixe factures, RIB, expéditeur SMTP). **DONE 2026-05-15** — migration Tenant (invoicePrefix @default('FAC') + iban + bic + emailFrom) + `tenantBillingSchema` (IBAN FR + BIC regex, transform clean spaces) + `tenantEmailSchema` + `updateTenantBilling`/`updateTenantEmail` + `lib/numbering.ts` (`getNextInvoiceNumber` avec préfixe configurable, format `{prefix}-NNNNNN` 6 chiffres conservés) + UI sections Numérotation (AlertDialog discontinuité Pitfall 4) / RIB (`formatIban` helper) / Email. SMTP_PASSWORD reste en ENV (D-08 sécurité). Plans 07-01 / 07-02 / 07-04.

### 🟡 Multi-utilisateurs + RBAC

- [x] **RBAC-01** : Page Utilisateurs dans Paramètres. **DONE 2026-05-15** — page `/app/parametres/utilisateurs` ADMIN-only (requireRole). Liste users tenant (Email · Nom · Rôle · Statut · Dernière connexion · Actions), bouton "Inviter un utilisateur" (Radix Dialog + RHF + zodResolver), row actions DropdownMenu (Modifier rôle / Reset MDP / Désactiver|Réactiver / Renvoyer invitation). Self-protection (admin ne peut pas se désactiver ni se retirer ADMIN). Plans 08-02 + 08-04.
- [x] **RBAC-02** : Flow invitation par email. **DONE 2026-05-15** — server action `inviteUser` crée User (hashedPwd='') + UserInvitation (token random 32 hex, 7d expiry) en transaction + envoie email (template HTML + text dans `lib/mailer-templates/user-invitation.ts`). Route publique `/invitation/[token]` (Server Component force-dynamic, 3 états : expired / used / fresh). `acceptInvitation` server action atomique single-use (updateMany usedAt=null + expiresAt>now), Argon2 hash, lucia.createSession, redirect /app. AuditLog `users.invite` + `users.password.set`. Plans 08-02 + 08-03.
- [x] **RBAC-03** : Permissions effectives par rôle (sidebar filtrée). **DONE 2026-05-15** — `nav-config.ts` étendue (NavItem.allowedRoles?: UserRole[]), `filterNavForRole(NAV, role)` pure fn ; layout `app/app/layout.tsx` applique filtre côté serveur + propage `nav` en prop à Sidebar/SidebarNav/MobileNavDrawer (plus d'import statique NAV côté client). Matrice D-02 traduite en `packages/shared/src/constants/permissions.ts` (PERMISSIONS + canRead/canWrite/rolesWithAccess). Plans 08-01 + 08-04.
- [x] **RBAC-04** : Guards par rôle dans server actions sensibles. **DONE 2026-05-15** — helper `lib/rbac.ts` (`requireRole(allowed) → User`, `UnauthorizedError`, `ForbiddenError`). Appliqué dans tenant-settings (4 actions ADMIN), tenant-assets (4 actions ADMIN), invoices (3 mutations ADMIN+MANAGER+COMPTABLE), sessions (8 actions ADMIN+MANAGER+COMMERCIAL ; deleteSession ADMIN+MANAGER), sessions-create (2 actions ADMIN+MANAGER+COMMERCIAL), closure-pack (2 mutations ADMIN+MANAGER+FORMATEUR), dossiers-opco + bulk (4 actions ADMIN+MANAGER+COMMERCIAL+COMPTABLE), crud-edits deletes (4 deletes ADMIN+MANAGER). Total 32 calls `requireRole(...)` répartis sur 9 fichiers. validateRequest étendu pour invalider la session si user.disabledAt. Plans 08-01 + 08-06.
- [x] **RBAC-05** : AuditLog UI admin. **DONE 2026-05-15** — page `/app/parametres/historique` ADMIN-only, filtres URL state (qui/quand/action) + pagination offset 50/page + Radix Dialog diff modal (render 2 cols Avant/Après si shape before/after, sinon JSON pretty). Pure helper `buildAuditWhere`. login hooks ajoutés dans `app/login/actions.ts` : success → AuditLog `auth.login.success` + user.lastLoginAt updated ; failed (3 raisons : user_not_found / disabled / bad_password) → AuditLog `auth.login.failed`. Plans 08-02 + 08-05.

### 🟢 Nouvelles features métier

- [x] **LEAD-01** : Distribution automatique Lead → Commercial. **DONE 2026-05-16** — algo `autoAssignLead` Phase 9 read-only WIRÉ dans `server/actions/leads.ts` (createLead + reassignLead). Trigger automatique à la création (conditionné par `Tenant.autoAssignLeads`), trigger manuel via bouton "Réassigner" (AlertDialog Radix). Notification cloche persistée (`Notification` model NEW + type 'lead.assigned' + payload typé Zod `LeadAssignedPayloadSchema`) + email dry-run/SMTP (template `lead-assigned.ts` clone strict de `user-invitation.ts` Phase 8). AuditLog conventions `leads.auto_assigned` (system actorUserId=null), `leads.reassigned` (manuel actorUserId=user.id), `leads.distribution_config` (toggles ADMIN). 3 toggles Tenant `autoAssignLeads/notifyOnLeadAssignEmail/notifyOnLeadAssignBell` éditables via `/app/parametres/distribution-leads` (ADMIN). Plans 09-01..04.
- [x] **LEAD-02** : Vue de charge par commercial. **DONE 2026-05-16** — page `/app/leads/charge` ADMIN+MANAGER, 4 PrioCard globaux (leads en cours / gagnés ce mois / taux conversion / temps moyen) + tableau commercial × 4 KPI + camembert SVG inline (40 lignes, pas de Recharts). Helper pur `getCommercialsWithKpis(tenantId)` (`apps/web/src/lib/lead-load-stats.ts`) avec 3 `prisma.lead.groupBy` + 1 `$queryRaw` AVG en parallèle. Champ `Lead.wonAt` ajouté (set automatiquement par `updateLeadStatus` à la transition vers WON, Pitfall 3 résolu). Sidebar entrée "Vue de charge" sous "Leads" (allowedRoles=ADMIN+MANAGER). Plans 09-01 + 09-03.
- [x] **CENTRAL-01** : Matrice visuelle stagiaire × document sur fiche session — pastilles 3 états (GENERATED / MANUAL_OK / MISSING) + bloc séparé pour docs session-only (Déroulé/Grille obs/Checklist). Tri/filtres configurables sauvés par user (localStorage). RBAC : ADMIN+MANAGER write, autres read-only. **DONE 2026-05-18** — migration Prisma additive `phase091_participant_doc_status` (SessionParticipant.docStatus Json?) + helpers `lib/derive-cell-state.ts` + `lib/doc-scope.ts` (14 MATRIX_DOC_TYPES + 3 SESSION_ONLY + DOC_TYPE_LABELS FR, D-04 figée) + composant `<ParticipantDocMatrix>` Server orchestrateur + `<MatrixRow>` Client (checkbox + Link cross-nav) + `<MatrixFilters>` 4 contrôles useLocalStorageState key sessionId-scoped (R5) + `<SessionOnlyDocsBlock>` 3 cards horizontales + légende a11y. RBAC `requireRole(['ADMIN','MANAGER'])` sur 5 server actions (D-11). Plans 09.1-01 + 09.1-02 + 09.1-03.
- [x] **CENTRAL-02** : Génération doc ciblée 1 stagiaire — action ⋮ par cellule matrice (5 actions max : Générer / Re-générer / Upload signé / Télécharger / Supprimer) + sélection multi pour batch via job BullMQ closure-pack mode `single-participant`. 1-2 clics max (D-14). **DONE 2026-05-18** — 5 server actions tenant-scoped (markDocStatus / uploadSignedDoc / regenerateParticipantDoc / regenerateBatchParticipantDocs / deleteDocument) + AuditLog `documents.*` (4 actions) + `jsonb_set` raw atomique Pitfall 2 + extension `generateClosurePack(sessionId, { participantIds?, kinds?, force? })` mode single-participant (forceMono strict length===1 Pitfall 1) + 3 composants atomiques `<DocStatusBadge>` 6 variants + `<DocCellMenu>` Radix 5 actions filtrées + `<UploadSignedDocDialog>` RHF + 10 Mo + mime PDF + `<BatchRegenBar>` sticky bottom + DropdownMenu multi-select. Worker BullMQ INCHANGÉ (Decision C). Plans 09.1-02 + 09.1-03.
- [x] **CENTRAL-03** : Fiche apprenant refondue — timeline verticale par année (jalons 2026, 2025, 2024…) avec sessions cliquables (drill fiche session) + 3 PrioCard top (Heures totales / Sessions / Heures cette année) + bandeau alerte (docs manquants ou paiement en attente). **DONE 2026-05-18** — `<LearnerTimeline>` verticale + `<TimelineYearMarker>` (h3 sr-only + visuel aria-hidden D-09.1-J) + `<TimelineSessionCard>` Link cross-nav D-05 + `<LearnerPrioCards>` 3 cards clone-local Phase 6 + `<LearnerAlertsBanner>` early return null si 0 alertes (Phase 5 UX-09) + helper `lib/learner-stats.ts` 5 fonctions purs (groupParticipationsByYear / computeLearnerHours / detectLearnerAlerts / findFirstIncompleteSessionId / countParticipationFilledDocs). Plan 09.1-04.
- [x] **CENTRAL-04** : Fiche produit refondue — 4 onglets : Stats (4 PrioCard : Sessions réalisées / Apprenants formés total / Heures totales / CA cumulé) / Sessions (liste cliquable) / Apprenants formés (drill fiche apprenant) / Programme. **DONE 2026-05-18** — `<ProductTabs>` URL-state `?tab=stats|sessions|apprenants|programme` + 4 panels Server Components (`<ProductStatsTab>` 4 PrioCardLocal grid-cols-2 lg:grid-cols-4 / `<ProductSessionsTab>` table 4 cols / `<ProductLearnersTab>` table 3 cols / `<ProductProgrammeTab>` markdown brut + CTA `<GenerateProductProgrammeButton>`) + helper `lib/product-stats.ts` (Promise.all 5 queries parallèles tenantId scope defense-in-depth) + lazy load par tab côté Server. Plan 09.1-05.
- [x] **CENTRAL-05** : Cross-navigation Airtable-style + résolution Bug P0 — entités cliquables systématiquement (apprenant ↔ session ↔ produit ↔ doc) + Programme stocké 1× session-wide avec N statuts dérivés par-participant via `SessionParticipant.docStatus: Json?` (plus de duplication PDF, plus de confusion UI). **DONE 2026-05-18** — cross-nav `<Link href="/app/sessions/{id}">` câblée dans matrix-row (D-05 participant→fiche apprenant), timeline-session-card (apprenant→fiche session), product-sessions-tab (produit→fiche session), product-learners-tab (produit→fiche apprenant). Bug P0 résolu STRUCTURELLEMENT via `deriveCellState` priorité (participant manual > pedagogical asset > sessionDocs > productDocs) — 1 PDF productDoc lookup partagé pour N participants + N statuts par-participant via `docStatus[PROGRAMME]`. Anti-régression test ciblé `apps/web/src/lib/__tests__/derive-cell-state.test.ts:Test 1` commenté `// Bug P0 anti-régression` grep-able. Plans 09.1-01 + 09.1-03 + 09.1-04 + 09.1-05.

- [ ] **QBLANC-01** : Audit Qualiopi blanc — pour chaque session/apprenant, scoring des 32 indicateurs via `QualiopiDocCatalog` + détection des dossiers incomplets.
- [ ] **QBLANC-02** : Alertes proactives — notification 7j avant fin session si dossier Qualiopi incomplet, avec liste actions à faire.
- [ ] **QBLANC-03** : Simulation passage audit Qualiopi — rapport téléchargeable (PDF) avec verdict par indicateur, à présenter à l'auditeur.
- [x] **FACT-01** : Stabilisation Factures — audit du périmètre actuel (commits `feat(web): hub documents par inscrit + factures`), liste des gaps vs cycle de facturation complet, fix des gaps prioritaires. _(Plan 11-00 foundation : migration Prisma additive + 8 tests stubs Wave 0 ; en cours via Plans 11-01..11-08)_
- [x] **FACT-02** : Numérotation séquentielle factures (configurable préfixe/année/format) + gestion avoirs (NCN — note de crédit). _(Plan 11-00 foundation : Tenant.creditNotePrefix + Invoice.originalInvoiceId schema en place ; en cours via Plan 11-01 numbering + 11-05 createCreditNote)_
- [x] **FACT-03** : Suivi paiements — saisie encaissements via `InvoicePayment`, relances impayés automatiques (J+30, J+45 selon délais convention). _(Plan 11-00 foundation : Invoice.lastReminderAt + reminderCount + Tenant.invoiceReminderDays Int[] schema en place ; en cours via Plan 11-06 worker + sendReminder)_
- [x] **FACT-04** : Export comptable — FEC ou format expert-comptable (CSV/xlsx avec colonnes standard). _(Plan 11-00 foundation : tests stubs invoices-export.test.ts en place ; en cours via Plan 11-07 route API xlsx)_

### 📦 Modules stub à clarifier

- [ ] **MOD-01** : Module "Inscriptions" — décider du périmètre (vs Sessions+Participants existant). Soit vue agrégée par produit, soit module à supprimer.
- [ ] **MOD-02** : Module "Modèles de documents" — décider entre éditeur de templates customisables vs simple liste lecture seule des templates existants.

### 🟢 Veille Qualiopi intégrée (Phase 13 — INSERTED 2026-05-23)

- [x] **VEILLE-01** : Schéma Prisma `RegulatoryWatch` (tenantId, theme enum 23/24/25/26, title, url, source, frequency, responsable, exploitation, dateAdded, dateLastReviewed, status draft/active/archived, suggestedBy user/import/auto) + migration + import one-shot du xlsx existant (`C6.i23-24-25tableau veille.xlsx`, ~84 entrées).
- [x] **VEILLE-02** : Page `/app/veille` — 4 onglets par thème Qualiopi, tableau filtrable/triable, ajout/édition manuelle (Radix Dialog), édition inline du champ Exploitation, indicateur "X jours depuis dernière mise à jour" par thème (alerte rouge > 90j), boîte de réception "Suggestions auto" à valider/rejeter. RBAC ADMIN+MANAGER pour CRUD, LECTEUR consultation.
- [x] **VEILLE-03** : Export PDF audit Qualiopi (Gotenberg) — un PDF par thème avec sources/dates/exploitations + en-tête tenant, prêt à présenter à l'auditeur. Accès depuis `/app/veille`.
- [ ] **VEILLE-04** : Worker BullMQ cron hebdo — RSS aggregator des sources connues (Centre Inffo, Agefiph, Lefebvre Dalloz, Journal de l'Agence, etc.) + Ollama `mistral-small:24b` pour classifier le thème et proposer un brouillon d'exploitation, INSERT en `status=draft` `suggestedBy=auto`. AuditLog convention `regulatoryWatch.[verb]`.

---

## v2 Requirements (deferred — next milestone)

<!-- Items levés en discussion mais reportés au milestone suivant. -->

- [ ] **DOC-01** : Export complet RGPD (toutes données d'un apprenant) en 1 clic — Article 20 RGPD (portabilité)
- [ ] **DOC-02** : Suppression RGPD pseudonymisée (Article 17) — soft delete avec garde des artefacts comptables obligatoires
- [ ] **TEST-01** : Tests E2E Playwright sur le flow "création session → ajout 5 participants → trigger closure pack → vérif des 10 docs générés" (memory: SES-0010 12min — automatiser)
- [ ] **TEST-02** : Smoke tests d'intégration sur les routes protégées (boote la page + assert 200)
- [ ] **AI-01** : Embeddings sur Person + Session pour recherche sémantique (modèle `nomic-embed-text` déjà déclaré mais non câblé)
- [ ] **MOBILE-01** : App mobile native ou PWA pour formateurs sur le terrain (émargement, prise de notes pendant session)
- [ ] **CI-01** : GitHub Actions workflow — lint + tsc + tests sur PR

---

## Out of Scope

<!-- Voir PROJECT.md > Out of Scope pour les exclusions de fond (SaaS multi-OF, autres secteurs, cloud, edge runtime, i18n, etc.). -->

Spécifique à ce milestone :

- **Migration Next.js 15** — Next 14.2 est stable et fonctionnel, pas de pression à migrer. À reconsidérer si une dépendance critique l'exige.
- **Refonte design system complète** — Conserver Tailwind + Radix + sonner + cmdk existants. Fix ciblé tailwind config et grilles, pas refonte.
- **Nouveaux modèles Ollama** — Le quatuor actuel (mistral-small / qwen3 / qwen2.5vl / nomic) couvre le besoin. Ne pas ajouter.
- **Refactor architecture monorepo** — Garder apps/web + packages/db + packages/shared. Pas de séparation worker en app dédiée.
- **Internationalization** — FR uniquement, voir PROJECT.md.
- **Notifications push / SMS** — Email Nodemailer suffit. Pas d'intégration Twilio/SES/SendGrid.

---

## Traceability

| Phase | Name | Requirements covered |
|-------|------|----------------------|
| 1 | Smoke verification + bugs critiques | BUG-01, BUG-02, BUG-03 |
| 2 | Responsive foundation | RESP-01, RESP-02, RESP-03 |
| 3 | Responsive content layouts | RESP-04, RESP-05 |
| 4 | TopBar UX (notifications + déconnexion) | UX-01, UX-02 |
| 5 | Fiche apprenant UX (CTAs + drill-downs + breadcrumb) | UX-03, UX-04, UX-05, UX-06, UX-07, UX-08, UX-09, UX-10 |
| 6 | Dashboard hiérarchisation & cohérence & a11y | UX-11, UX-12, UX-13 |
| 7 | Paramètres organisme éditables | SET-01, SET-02, SET-03 |
| 8 | Multi-utilisateurs + RBAC | RBAC-01, RBAC-02, RBAC-03, RBAC-04, RBAC-05 |
| 9 | Distribution leads automatique | LEAD-01, LEAD-02 |
| 9.1 | Centralisation Qualiopi 360° (INSERTED) | CENTRAL-01, CENTRAL-02, CENTRAL-03, CENTRAL-04, CENTRAL-05 |
| 10 | Audit Qualiopi blanc | QBLANC-01, QBLANC-02, QBLANC-03 |
| 11 | Factures stabilisation & cycle complet | FACT-01, FACT-02, FACT-03, FACT-04 |
| 12 | Modules stub (Inscriptions + Modèles) | MOD-01, MOD-02 |
| 13 | Veille Qualiopi intégrée | VEILLE-01, VEILLE-02, VEILLE-03, VEILLE-04 |

**Coverage:** 49 / 49 v1 requirements mapped (100 %). *(+5 CENTRAL-* ajoutés 2026-05-18 via /gsd:insert-phase 9.1 ; +4 VEILLE-* ajoutés 2026-05-23 via /gsd:add-phase 13.)*

---

*Requirements defined: 2026-05-12*
