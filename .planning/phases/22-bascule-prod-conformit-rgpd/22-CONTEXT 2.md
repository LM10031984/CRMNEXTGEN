# Phase 22: Bascule prod + conformité RGPD - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Exécuter proprement la bascule vers la prod cloud : runbook + plan de rollback écrits AVANT la fenêtre, données finales vérifiées (audit d'écart local↔cloud + re-audit storage), équipe invitée (RBAC Phase 8), pack témoin SES-0094 en gate go/no-go, alertes coûts + backups confirmés actifs — pendant que la dette RGPD est soldée : registre des traitements + DPA documentés et audit des logs PII, AVANT que les PII prod ne circulent.

Requirements : CUT-01, CUT-02, RGPD-01.

**Réinterprétations de critères roadmap actées en discussion (le planner doit les suivre) :**
- « dump final restauré » → il n'y a PAS de dump/restore à refaire : la base cloud Supabase est la base vivante depuis la Phase 19 (`.env` local pointe le cloud). Le critère devient : **audit d'écart prouvant que le Postgres local Docker ne contient rien de plus récent que le dump du 2026-07-03, puis déclaration du cloud comme unique source de vérité.**
- « DNS pointé » → **déjà réglé** : décision Laurent Phase 21 = adresse officielle `https://qualiof.vercel.app`, domaine start-academy.fr abandonné/détaché. Aucune action DNS dans cette phase.
- « alertes coûts Upstash/Redis » → **Upstash n'existe plus** (Redis viré Phase 20, zéro référence code vérifiée). Alertes = OpenRouter, Supabase, Vercel, Railway.
- « DPA des 6 sous-traitants » → périmètre corrigé : **liste complète réelle ~7 entrées** (voir D-14).

</domain>

<decisions>
## Implementation Decisions

### Données & fenêtre de bascule (CUT-01)
- **D-01 :** **Audit d'écart local↔cloud puis cloud = seule vérité.** Comptages par table du Postgres local Docker vs base cloud ; preuve qu'aucune donnée créée en local après le dump du 2026-07-03 ; puis le cloud est déclaré unique source. Pas de re-dump (il écraserait le travail cloud depuis le 5 juillet : E2E, backfill storage, régénérations).
- **D-02 :** **Re-audit storage contre l'état FINAL avant bascule** : re-jouer l'audit DRY→(WRITE si écart)→re-audit avec `apps/web/scripts/migrate-storage.ts` + le pattern d'audit d'écart du 21-02. Baseline actuelle : 902/902 clés cloud résolvent Supabase (2026-07-06). MinIO n'est PAS purgé à cette étape.
- **D-03 :** **Fenêtre : dès que la phase est prête.** Pas de contrainte calendrier — on bascule quand runbook + pack témoin + RGPD sont verts.
- **D-04 :** **Rollback = retour au mode staging gardé** : re-flag `NEXT_PUBLIC_APP_ENV=staging` + `MAIL_DRY_RUN=true` sur Vercel (~5 min, réversible). La base cloud reste la vérité. PAS de rollback vers le Mac local (obsolète).
- **D-05 :** **Purge du local = dernier plan de la phase, APRÈS gate validé** : pg_dump d'archive + snapshot MinIO conservés, puis purge des conteneurs Docker locaux. Convention projet : destructif = étape séparée, liste finale + mot de validation utilisateur avant exécution, en tours distincts.

### Sortie du staging & sorties externes (CUT-01/CUT-02)
- **D-06 :** **Emails réels APRÈS pack témoin validé, avec rapport préalable des envois en attente.** Séquence : flag production → pack témoin go/no-go → SI vert : rapport des relances qui partiraient (relances factures worker Railway — attention règle payeur : l'auto-entrepreneur est son propre payeur, une relance facture peut toucher un apprenant) → validation Laurent → MAIL_DRY_RUN=false (Vercel ET worker Railway). **Exigence forte Laurent : JAMAIS d'envoi de masse vers les apprenants sans action explicite / case à cocher.** État vérifié : convocations/docs = boutons manuels ; email pack closure → admin déclencheur uniquement ; crons relances préinscriptions/OPCO = endpoints `CRON_SECRET` NON branchés (zéro cron Vercel — les laisser débranchés).
- **D-07 :** **Token Google Calendar porté sur le cloud** : le refresh token (`files/secrets/google-token.json`) devient une variable d'env chiffrée Vercel (sensitive), le code lit l'env avec fallback fichier. La garde staging de `sync-session.ts` se lève naturellement avec le flag production. Objectif v6 respecté : calendar sans le Mac de Laurent.
- **D-08 :** **Levée du filigrane STAGING + bandeau** : automatique via `NEXT_PUBLIC_APP_ENV=production` (aucun code — vérifier seulement en preuve post-bascule que les PDF sortent sans filigrane et les emails partent réels).

### Équipe & gate go/no-go (CUT-01/CUT-02)
- **D-09 :** **Petite équipe de départ, liste à préciser** : le plan inclut un point d'arrêt (checkpoint human-action) où Laurent fournit noms + emails + rôles RBAC avant l'envoi des invitations via le flux existant `tenant-users.ts`. Invitations envoyées APRÈS gate go/no-go validé.
- **D-10 :** **Pack témoin = SES-0094** (témoin habituel Phases 20/21) : régénération complète, critères connus — 0 stub, footer 22 vars OF_*, docs Qualiopi conformes, aucun 404 sur les preuves.
- **D-11 :** **Alertes coûts : seuils standards, email à laurent@start-academy.fr.** Ordres de grandeur ~1,5× le coût attendu (OpenRouter ~10 €/mois, Supabase plan 25 $/mois, Vercel 30 $/mois plan+add-on, Railway ~20-25 €/mois) ; mécanique exacte par plateforme à discrétion de Claude selon ce que chaque dashboard permet.
- **D-12 :** **Backups = Supabase natifs daily + vérification région EU** (research flag roadmap). Le pg_dump cron vers stockage hors vendor reste au backlog (Future Requirements).

### RGPD & registre des traitements (RGPD-01)
- **D-13 :** Le gate RGPD/DPA **précède** l'activation du flux PII prod (D-02b hérité Phase 16) : registre + DPA documentés et validés avant la levée des gardes.
- **D-14 :** **Périmètre sous-traitants = liste complète réelle (~7)** : OpenRouter, Anthropic, Supabase, Vercel, Railway + **Google** (Calendar : noms sessions/formateurs dans les events ; Drive : programmes) + **fournisseur SMTP** (emails apprenants/payeurs). Upstash SORT de la liste (plus utilisé). Le requirement RGPD-01 est satisfait par sur-couverture.
- **D-15 :** **Registre en Markdown versionné dans le repo + export imprimable** (ex. `docs/rgpd/REGISTRE-TRAITEMENTS.md` + fiches DPA par sous-traitant, génération PDF propre pour auditeur Qualiopi/CNIL). Emplacement exact à discrétion du planner.
- **D-16 :** **Claude rédige tout, Laurent valide** en tant que responsable de traitement. Les fiches DPA référencent les DPA publics de chaque fournisseur (localisation données, finalités, durées). Toute incertitude juridique signalée explicitement — pas d'invention.
- **D-17 :** **Audit logs PII = audit + corrections ciblées** : passer tous les `console.*` du worker et des générateurs, corriger ceux qui logguent du PII brut (logger des IDs, jamais nom/CNI/RIB). Pas de logger centralisé (backlog).

### Bug env Vercel (folded — découvert en discussion)
- **D-18 :** **Bug PROD-0674 (auto-fill IA produit) : fix immédiat hors phase + sanity check env au runbook.** Cause racine identifiée : le `.env` racine contient des commentaires inline (` # ← À REMPLIR`, etc.) que dotenv strippe en local, mais les 50 variables Vercel posées par API en 21-04 ont probablement embarqué ces suffixes → `OPENROUTER_API_KEY` avec `←` (char 8592) dans le header `Authorization` → erreur ByteString. Le worker Railway (vars posées à la main) est propre — c'est pourquoi les packs E2E passaient. Actions : ① nettoyage immédiat des variables Vercel polluées + redéploiement + re-test auto-fill (fait à la suite de cette session) ; ② le runbook de bascule gagne une étape « sanity check env » (aucune valeur avec espace/`#`/non-ASCII) ; ③ au passage, le label d'erreur périmé `Erreur Ollama` de `ai-fill-product.ts:297` peut être corrigé (cosmétique, discrétion planner).

### Claude's Discretion
- Structure exacte du runbook de bascule (modèles : `20-DEPLOY.md`, `21-DEPLOY-VERCEL.md` — non-technicien, dashboard-first).
- Mécanique précise des alertes coûts par plateforme (ce que chaque dashboard/API permet).
- Emplacement exact et gabarit du registre RGPD + méthode d'export PDF.
- Implémentation du portage token Google (nom de variable, fallback fichier, validation t3-env).
- Script/méthode de l'audit d'écart local↔cloud (comptages par table) et du sanity check env.
- Liste exacte des `console.*` à corriger (audit).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & héritage de décisions
- `.planning/ROADMAP.md` §Phase 22 — goal, success criteria, research flags (backups EU, scrubber logs, destructif = étape séparée, gate RGPD avant PII).
- `.planning/phases/21-app-vercel-filet-ci-tests/21-CONTEXT.md` — D-01 (un seul projet Vercel staging→prod), D-02 (gardes sorties), D-03 (base cloud = vérité), déferrés Phase 22 (purge MinIO, retrait filigrane, invitations).
- `.planning/phases/16-migration-ia-ollama-vers-claude-api/16-CONTEXT.md` — D-02b : gate RGPD/DPA bloquant avant PII prod (OCR vision CNI/RIB → OpenRouter/Anthropic).

### Runbooks modèles & preuves existantes
- `.planning/phases/21-app-vercel-filet-ci-tests/21-DEPLOY-VERCEL.md` — runbook Vercel (50 vars, WAF, §9 evidence) : modèle de forme + inventaire des variables à sanity-checker.
- `.planning/phases/20-worker-3-h-te-doc-engines/20-DEPLOY.md` — runbook Railway 3 services, ~15 vars worker (5 secrets), pattern non-technicien dashboard-first.
- `.planning/audit/STORAGE-BACKFILL-REPORT-2026-07-06.md` — baseline storage (899→902 clés, 0 lien mort, cause racine SES-0094) ; à re-jouer contre l'état final (D-02).
- `apps/web/scripts/migrate-storage.ts` — script idempotent DRY→WRITE réutilisé pour le re-audit final.

### Code touché par la bascule
- `packages/shared/src/env.ts` — `NEXT_PUBLIC_APP_ENV` (ligne ~113) ; y ajouter la variable token Google si D-07 passe par t3-env.
- `apps/web/src/lib/mailer.ts` — `MAIL_DRY_RUN` (ligne 53) + dry-run auto si `SMTP_HOST` vide.
- `apps/web/src/lib/calendar/sync-session.ts` — garde staging ligne 84 (early-return) ; se lève avec le flag production.
- `files/secrets/google-token.json` — refresh token OAuth (scope calendar seul) à porter en env Vercel (D-07).
- `apps/web/src/lib/invoice-reminders/invoice-reminder-core.ts` — relances factures automatiques (worker Railway, cron daily 8h) : source du rapport des envois en attente (D-06).
- `apps/web/src/app/api/cron/preinscription-reminders/route.ts` + `apps/web/src/app/api/cron/opco-submission-reminders/route.ts` — endpoints cron externes `CRON_SECRET`, NON branchés : les laisser débranchés (D-06).
- `apps/web/src/server/actions/tenant-users.ts` — flux d'invitation utilisateurs existant (D-09).
- `apps/web/src/lib/llm-client.ts` — construction des headers OpenRouter (lignes 136-141) : cause du bug ByteString (D-18).
- `apps/web/src/server/actions/ai-fill-product.ts` — ligne 297 : label « Erreur Ollama » périmé (D-18 ③).

### Conformité
- `.planning/phases/17-fondations-cloud-r-gion-eu-env/17-REGIONS.md` — régions EU verrouillées + dérogation Supabase Irlande (eu-west-1) définitive : base de la section localisation du registre.
- `CLAUDE.md` (racine files/) — contraintes RGPD projet (PII bucket privé, signed URLs, SensitiveData).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Runbooks 20-DEPLOY.md / 21-DEPLOY-VERCEL.md : pattern non-technicien éprouvé, inventaires de variables complets — le runbook de bascule est largement une composition de ces deux-là.
- `migrate-storage.ts` (DRY→WRITE idempotent) + pattern d'audit d'écart 21-02 : re-audit storage final = ré-exécution, pas de nouveau code.
- Flux invitations `tenant-users.ts` + RBAC 6 rôles (Phase 8) : les invitations équipe = utilisation, pas de développement.
- Teardown E2E + suite Playwright 21-05/21-06 : re-jouables comme smoke post-bascule si besoin.
- SES-0094 : témoin établi avec critères de validation connus (footer 22 vars OF_*, 0 stub).

### Established Patterns
- Gardes staging TOUTES pilotées par `NEXT_PUBLIC_APP_ENV` + `MAIL_DRY_RUN` : la bascule est un changement de variables, pas de code (sauf portage token Google D-07).
- Destructif = étape séparée avec validation utilisateur explicite (convention projet, D-05).
- Laurent délègue l'exécution technique (API/CLI/dashboards) à Claude sur autorisation explicite — pattern 21-04 ; l'exploitation quotidienne reste sans CLI.
- PRs cloud-migration→main = MERGE COMMIT, jamais squash (leçon 21-04).
- Secrets jamais en clair dans le repo : env vars chiffrées (sensitive) sur Vercel/Railway, secrets GitHub chiffrés.

### Integration Points
- Vercel projet `qualiof` (team laurents-projects-3806ab87) : 50 vars env dont plusieurs à corriger (D-18) et à faire évoluer (flag, MAIL_DRY_RUN, token Google, NEXT_PUBLIC_APP_URL/OPENROUTER_SITE_URL → déjà sur qualiof.vercel.app).
- Worker Railway (3 services, europe-west4) : MAIL_DRY_RUN à basculer aussi (D-06) ; relevé stabilité 24 h attendu 2026-07-07 ~08h45 (fin de vérif Phase 20) — à confirmer avant bascule.
- Supabase projet `gntlqyscahbgjrmsbzil` (eu-west-1) : dashboard backups + région à vérifier (D-12).
- Phase 20 : verify-work 20 encore dû (relevé 24 h) — dépendance d'entrée de la fenêtre de bascule.

</code_context>

<specifics>
## Specific Ideas

- **Exigence forte emails (Laurent, répétée 2×) :** « je veux avoir l'option à cocher pour prévenir les apprenants, je ne veux pas qu'ils reçoivent plein de mails ». Aucun envoi de masse à l'activation ; rapport des envois en attente + validation avant MAIL_DRY_RUN=false ; toute évolution future d'envoi vers apprenants derrière opt-in explicite.
- Le pack témoin doit être comparable aux runs précédents (SES-0094, mêmes critères) — pas un nouveau protocole.
- Runbook lisible par un non-technicien (pattern Phase 20) : Laurent doit pouvoir suivre/rejouer la bascule sans CLI.

</specifics>

<deferred>
## Deferred Ideas

- **pg_dump cron vers stockage hors vendor** — backlog (déjà en Future Requirements), non requis pour la bascule (D-12).
- **Logger centralisé masquant les champs sensibles** — l'audit ciblé D-17 suffit ; garde-fou global = chantier futur.
- **Branchement des crons relances préinscriptions/OPCO** (cron externe + CRON_SECRET) — volontairement débranchés à la bascule ; à activer plus tard avec le même principe opt-in/rapport préalable que D-06.
- **Domaine custom éventuel** (ex. app.start-academy.fr) — abandonné en Phase 21 ; si réactivé un jour : STAGING_BASE_URL + NEXT_PUBLIC_APP_URL/OPENROUTER_SITE_URL à re-pointer, zéro code.
- **Staging persistant** (2ᵉ projet Supabase + previews Vercel) — Future Requirements, hors v6.

</deferred>

---

*Phase: 22-bascule-prod-conformit-rgpd*
*Context gathered: 2026-07-06*
