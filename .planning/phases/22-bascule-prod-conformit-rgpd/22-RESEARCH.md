# Phase 22: Bascule prod + conformité RGPD - Research

**Researched:** 2026-07-06
**Domain:** Cutover production cloud (Vercel/Supabase/Railway) + registre RGPD/DPA + audit logs PII
**Confidence:** HIGH (code local vérifié) / MEDIUM (mécaniques dashboards cloud, DPA fournisseurs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Réinterprétations de critères roadmap actées en discussion (le planner doit les suivre) :**
- « dump final restauré » → il n'y a PAS de dump/restore à refaire : la base cloud Supabase est la base vivante depuis la Phase 19 (`.env` local pointe le cloud). Le critère devient : **audit d'écart prouvant que le Postgres local Docker ne contient rien de plus récent que le dump du 2026-07-03, puis déclaration du cloud comme unique source de vérité.**
- « DNS pointé » → **déjà réglé** : décision Laurent Phase 21 = adresse officielle `https://qualiof.vercel.app`, domaine start-academy.fr abandonné/détaché. Aucune action DNS dans cette phase.
- « alertes coûts Upstash/Redis » → **Upstash n'existe plus** (Redis viré Phase 20, zéro référence code vérifiée). Alertes = OpenRouter, Supabase, Vercel, Railway.
- « DPA des 6 sous-traitants » → périmètre corrigé : **liste complète réelle ~7 entrées** (voir D-14).

#### Données & fenêtre de bascule (CUT-01)
- **D-01 :** **Audit d'écart local↔cloud puis cloud = seule vérité.** Comptages par table du Postgres local Docker vs base cloud ; preuve qu'aucune donnée créée en local après le dump du 2026-07-03 ; puis le cloud est déclaré unique source. Pas de re-dump (il écraserait le travail cloud depuis le 5 juillet : E2E, backfill storage, régénérations).
- **D-02 :** **Re-audit storage contre l'état FINAL avant bascule** : re-jouer l'audit DRY→(WRITE si écart)→re-audit avec `apps/web/scripts/migrate-storage.ts` + le pattern d'audit d'écart du 21-02. Baseline actuelle : 902/902 clés cloud résolvent Supabase (2026-07-06). MinIO n'est PAS purgé à cette étape.
- **D-03 :** **Fenêtre : dès que la phase est prête.** Pas de contrainte calendrier — on bascule quand runbook + pack témoin + RGPD sont verts.
- **D-04 :** **Rollback = retour au mode staging gardé** : re-flag `NEXT_PUBLIC_APP_ENV=staging` + `MAIL_DRY_RUN=true` sur Vercel (~5 min, réversible). La base cloud reste la vérité. PAS de rollback vers le Mac local (obsolète).
- **D-05 :** **Purge du local = dernier plan de la phase, APRÈS gate validé** : pg_dump d'archive + snapshot MinIO conservés, puis purge des conteneurs Docker locaux. Convention projet : destructif = étape séparée, liste finale + mot de validation utilisateur avant exécution, en tours distincts.

#### Sortie du staging & sorties externes (CUT-01/CUT-02)
- **D-06 :** **Emails réels APRÈS pack témoin validé, avec rapport préalable des envois en attente.** Séquence : flag production → pack témoin go/no-go → SI vert : rapport des relances qui partiraient (relances factures worker Railway — attention règle payeur : l'auto-entrepreneur est son propre payeur, une relance facture peut toucher un apprenant) → validation Laurent → MAIL_DRY_RUN=false (Vercel ET worker Railway). **Exigence forte Laurent : JAMAIS d'envoi de masse vers les apprenants sans action explicite / case à cocher.** État vérifié : convocations/docs = boutons manuels ; email pack closure → admin déclencheur uniquement ; crons relances préinscriptions/OPCO = endpoints `CRON_SECRET` NON branchés (zéro cron Vercel — les laisser débranchés).
- **D-07 :** **Token Google Calendar porté sur le cloud** : le refresh token (`files/secrets/google-token.json`) devient une variable d'env chiffrée Vercel (sensitive), le code lit l'env avec fallback fichier. La garde staging de `sync-session.ts` se lève naturellement avec le flag production. Objectif v6 respecté : calendar sans le Mac de Laurent.
- **D-08 :** **Levée du filigrane STAGING + bandeau** : automatique via `NEXT_PUBLIC_APP_ENV=production` (aucun code — vérifier seulement en preuve post-bascule que les PDF sortent sans filigrane et les emails partent réels).

#### Équipe & gate go/no-go (CUT-01/CUT-02)
- **D-09 :** **Petite équipe de départ, liste à préciser** : le plan inclut un point d'arrêt (checkpoint human-action) où Laurent fournit noms + emails + rôles RBAC avant l'envoi des invitations via le flux existant `tenant-users.ts`. Invitations envoyées APRÈS gate go/no-go validé.
- **D-10 :** **Pack témoin = SES-0094** (témoin habituel Phases 20/21) : régénération complète, critères connus — 0 stub, footer 22 vars OF_*, docs Qualiopi conformes, aucun 404 sur les preuves.
- **D-11 :** **Alertes coûts : seuils standards, email à laurent@start-academy.fr.** Ordres de grandeur ~1,5× le coût attendu (OpenRouter ~10 €/mois, Supabase plan 25 $/mois, Vercel 30 $/mois plan+add-on, Railway ~20-25 €/mois) ; mécanique exacte par plateforme à discrétion de Claude selon ce que chaque dashboard permet.
- **D-12 :** **Backups = Supabase natifs daily + vérification région EU** (research flag roadmap). Le pg_dump cron vers stockage hors vendor reste au backlog (Future Requirements).

#### RGPD & registre des traitements (RGPD-01)
- **D-13 :** Le gate RGPD/DPA **précède** l'activation du flux PII prod (D-02b hérité Phase 16) : registre + DPA documentés et validés avant la levée des gardes.
- **D-14 :** **Périmètre sous-traitants = liste complète réelle (~7)** : OpenRouter, Anthropic, Supabase, Vercel, Railway + **Google** (Calendar : noms sessions/formateurs dans les events ; Drive : programmes) + **fournisseur SMTP** (emails apprenants/payeurs). Upstash SORT de la liste (plus utilisé). Le requirement RGPD-01 est satisfait par sur-couverture.
- **D-15 :** **Registre en Markdown versionné dans le repo + export imprimable** (ex. `docs/rgpd/REGISTRE-TRAITEMENTS.md` + fiches DPA par sous-traitant, génération PDF propre pour auditeur Qualiopi/CNIL). Emplacement exact à discrétion du planner.
- **D-16 :** **Claude rédige tout, Laurent valide** en tant que responsable de traitement. Les fiches DPA référencent les DPA publics de chaque fournisseur (localisation données, finalités, durées). Toute incertitude juridique signalée explicitement — pas d'invention.
- **D-17 :** **Audit logs PII = audit + corrections ciblées** : passer tous les `console.*` du worker et des générateurs, corriger ceux qui logguent du PII brut (logger des IDs, jamais nom/CNI/RIB). Pas de logger centralisé (backlog).

#### Bug env Vercel (folded — découvert en discussion)
- **D-18 :** **Bug PROD-0674 (auto-fill IA produit) : fix immédiat hors phase + sanity check env au runbook.** Cause racine identifiée : le `.env` racine contient des commentaires inline (` # ← À REMPLIR`, etc.) que dotenv strippe en local, mais les 50 variables Vercel posées par API en 21-04 ont probablement embarqué ces suffixes → `OPENROUTER_API_KEY` avec `←` (char 8592) dans le header `Authorization` → erreur ByteString. Le worker Railway (vars posées à la main) est propre — c'est pourquoi les packs E2E passaient. Actions : ① nettoyage immédiat des variables Vercel polluées + redéploiement + re-test auto-fill (fait à la suite de cette session) ; ② le runbook de bascule gagne une étape « sanity check env » (aucune valeur avec espace/`#`/non-ASCII) ; ③ au passage, le label d'erreur périmé `Erreur Ollama` de `ai-fill-product.ts:297` peut être corrigé (cosmétique, discrétion planner).

### Claude's Discretion
- Structure exacte du runbook de bascule (modèles : `20-DEPLOY.md`, `21-DEPLOY-VERCEL.md` — non-technicien, dashboard-first).
- Mécanique précise des alertes coûts par plateforme (ce que chaque dashboard/API permet).
- Emplacement exact et gabarit du registre RGPD + méthode d'export PDF.
- Implémentation du portage token Google (nom de variable, fallback fichier, validation t3-env).
- Script/méthode de l'audit d'écart local↔cloud (comptages par table) et du sanity check env.
- Liste exacte des `console.*` à corriger (audit).

### Deferred Ideas (OUT OF SCOPE)
- **pg_dump cron vers stockage hors vendor** — backlog (déjà en Future Requirements), non requis pour la bascule (D-12).
- **Logger centralisé masquant les champs sensibles** — l'audit ciblé D-17 suffit ; garde-fou global = chantier futur.
- **Branchement des crons relances préinscriptions/OPCO** (cron externe + CRON_SECRET) — volontairement débranchés à la bascule ; à activer plus tard avec le même principe opt-in/rapport préalable que D-06.
- **Domaine custom éventuel** (ex. app.start-academy.fr) — abandonné en Phase 21 ; si réactivé un jour : STAGING_BASE_URL + NEXT_PUBLIC_APP_URL/OPENROUTER_SITE_URL à re-pointer, zéro code.
- **Staging persistant** (2ᵉ projet Supabase + previews Vercel) — Future Requirements, hors v6.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CUT-01 | Runbook bascule + plan rollback écrits AVANT la fenêtre ; données finales vérifiées (audit d'écart, réinterprétation D-01), invitations équipe (RBAC Phase 8) | §Architecture (ordre des gates, gabarit runbook), §Code Examples (audit d'écart, sanity check env, portage Google 3 valeurs), `tenant-users.ts:inviteUser` existant vérifié |
| CUT-02 | Pack témoin post-bascule = gate go/no-go ; alertes coûts + backups daily confirmés actifs | §Alertes coûts par plateforme (Vercel Spend Management, Railway soft/hard limits, OpenRouter auto top-up OFF + key limits, Supabase spend cap), §Backups Supabase (même région que le projet = eu-west-1, preuve dashboard), SES-0094 critères connus |
| RGPD-01 | Registre des traitements complet + DPA documenté (~7 sous-traitants réels D-14) + audit `console.*` sans PII brut, AVANT circulation PII prod | §Registre RGPD (gabarit, 7 fiches, URLs DPA vérifiées, caveat OpenRouter enterprise-only), §Audit logs PII (~103 fichiers scannés, occurrences identifiées dont `mailer.ts:79`), §Pitfalls 6-8 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **GSD workflow obligatoire** : toute modification passe par `/gsd:execute-phase` / plans — pas d'édit direct hors workflow.
- **Multi-tenant** : toute nouvelle server action DOIT scoper par `tenantId` (scripts d'audit inclus s'ils écrivent).
- **RGPD projet** : `Person.ribKey` = PII bucket privé, signed URLs, données sensibles dans `SensitiveData` — le registre doit refléter ces mesures techniques existantes.
- **Secrets jamais en clair dans le repo** : env vars chiffrées (sensitive) Vercel/Railway — le portage Google (D-07) suit ce pattern ; `files/secrets/` est gitignored et le reste.
- **Footer PDF** : in-body `position:fixed bottom:0` — l'export PDF du registre (D-15) réutilise le pipeline `pdf-render.ts` existant, pas de nouveau moteur.
- **Destructif = étape séparée** (mémoire projet) : D-05 le codifie déjà — liste finale + mot de validation + tours distincts + pg_dump avant.
- **Routes françaises kebab-case** : non concerné (pas de nouvelle route dans cette phase).
- **PRs cloud-migration→main = MERGE COMMIT, jamais squash** (leçon 21-04).

## Summary

Cette phase est à ~80 % de l'**opérations + documentation**, pas du développement : la bascule est un changement de variables d'environnement (`NEXT_PUBLIC_APP_ENV=production` + `MAIL_DRY_RUN=false` sur Vercel ET Railway), encadré par un runbook composé des deux runbooks existants (20-DEPLOY, 21-DEPLOY-VERCEL). Le seul vrai code nouveau : (1) portage des credentials Google Calendar en env — **attention, ce sont 2 fichiers / 3 valeurs** (`oauth-client.json` : client_id + client_secret, `google-token.json` : refresh_token), pas 1 seul comme le suggère D-07 ; (2) le script d'audit d'écart local↔cloud (comptages 47 modèles Prisma + max(createdAt/updatedAt) vs 2026-07-03) ; (3) corrections ciblées de `console.*` loggant du PII.

**Découverte critique pour D-06** : `sendInvoiceReminderCron` (`invoice-reminder-core.ts:149-167`) **incrémente `reminderCount` et pose `lastReminderAt` MÊME en dry-run**. Le cron Railway tourne quotidiennement à 8h en dry-run depuis la Phase 20 → des niveaux de relance ont été « consommés » sans qu'aucun email ne parte (traçable via `AuditLog` action `invoices.reminder_sent` avec `diff.dryRun=true`). Le « rapport des envois en attente » doit intégrer cet état, et une décision de remédiation (reset des compteurs brûlés à blanc ?) doit être soumise à Laurent. Bonus D-17 : `mailer.ts:79` loggue l'email du destinataire en clair dans les logs Railway à chaque dry-run.

Côté conformité : les DPA de Supabase, Vercel, Railway, Anthropic, OVH et Google sont publics/self-service ; **OpenRouter est l'exception** — DPA signé réservé au tier enterprise, mais politique par défaut de non-rétention des prompts + réglages ZDR côté compte : la fiche DPA doit documenter cette limite honnêtement (D-16). Les backups Supabase daily (Pro, 7 jours) sont stockés **dans la même région que le projet** (eu-west-1 Irlande → EU ✓), à confirmer visuellement au dashboard comme preuve.

**Primary recommendation :** Structurer les plans dans l'ordre des gates : ① audits pré-bascule (écart data + storage + sanity env) + portage Google + fixes logs PII (parallélisables), ② registre RGPD complet (gate bloquant D-13), ③ bascule flags + pack témoin SES-0094 go/no-go, ④ rapport relances → validation → MAIL_DRY_RUN=false + invitations + alertes/backups, ⑤ purge du local (destructif, dernier plan, checkpoint).

## Standard Stack

### Core (aucune nouvelle dépendance)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `googleapis` | ^173.0.0 (déjà en place, `apps/web/package.json:49`) | Client Calendar OAuth — portage env D-07 | Déjà utilisé par `google-client.ts` |
| `@t3-oss/env-nextjs` | 0.11.1 | Validation des 3 nouvelles vars Google (optionnelles, fallback fichier) | Pattern env.ts existant |
| `marked` + `pdf-render.ts` (Gotenberg) | en place | Export PDF du registre RGPD (D-15) | Pipeline HTML→PDF interne éprouvé, footer in-body |
| `tsx` | 4.21.0 | Scripts d'audit (écart data, sanity env, rapport relances) | Pattern scripts projet |
| Prisma / `pg` via PrismaClient | 5.22.0 | Comptages par table (2 datasources : locale + cloud) | Déjà là |

**Installation :** `pnpm install` — rien à ajouter. **Ne PAS ajouter** de lib de génération PDF (md-to-pdf, puppeteer…) : le pipeline Gotenberg existe.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 2 PrismaClient (URLs locale/cloud) pour l'audit d'écart | `psql`/`pg_dump` host | psql/pg_dump ABSENTS du PATH Mac (vérifié) — passer par `docker exec qualiof-postgres pg_dump` pour l'archive D-05, Prisma/`$queryRaw` pour les comptages |
| Export PDF registre via pdf-render.ts | Impression navigateur | Acceptable en dépannage, mais pdf-render donne un PDF reproductible commitable pour l'auditeur |
| Alertes coûts via dashboards (D-11) | APIs billing | Les 4 dashboards suffisent (voir §Patterns) ; API = sur-ingénierie pour 4 alertes one-shot |

## Architecture Patterns

### Ordre des gates (chaîne de dépendance de la phase)

```
[Wave 1 — pré-bascule, parallélisable]
  A. Audit d'écart local↔cloud (D-01)          — script lecture seule
  B. Re-audit storage final (D-02)              — migrate-storage.ts DRY, re-jeu 21-02
  C. Sanity check env Vercel/Railway (D-18 ②)   — non-ASCII / # / espaces
  D. Portage Google 3 vars + fallback (D-07)    — seul vrai code + tests
  E. Audit console.* PII + fixes ciblés (D-17)  — dont mailer.ts:79
  F. Registre RGPD + 7 fiches DPA (D-14..D-16)  — docs/rgpd/, GATE BLOQUANT

[Gate RGPD validé par Laurent (D-13)] ──► [Wave 2 — bascule]
  G. Runbook exécuté : NEXT_PUBLIC_APP_ENV=production (Vercel)
     (MAIL_DRY_RUN reste true partout à ce stade)
  H. Pack témoin SES-0094 go/no-go (D-10) — 0 stub, footer 22 OF_*, 0 404
     + preuve D-08 : PDF sans filigrane, pas de bandeau

[Gate go/no-go vert] ──► [Wave 3 — sorties réelles]
  I. Rapport des relances en attente (D-06 + découverte dry-run brûlé)
     → checkpoint validation Laurent
  J. MAIL_DRY_RUN=false sur Vercel ET Railway
  K. Invitations équipe (checkpoint : noms/emails/rôles fournis par Laurent, D-09)
  L. Alertes coûts 4 plateformes + preuve backups Supabase EU (D-11/D-12)

[Tout vert] ──► [Wave 4 — destructif, plan séparé]
  M. pg_dump archive (docker exec) + snapshot MinIO → purge conteneurs locaux (D-05)
     checkpoint : liste finale + mot de validation utilisateur, tours distincts
```

### Pattern 1 : Runbook composé, non-technicien, dashboard-first
**What :** Le runbook de bascule = composition de `20-DEPLOY.md` (Railway, tableau de vars, langage dashboard) et `21-DEPLOY-VERCEL.md` (Vercel, §9 evidence datée). Sections attendues : pré-requis (verify-work 20 clos, relevé 24 h du 07-07), sanity check env, les 3 flips de variables, preuves à collecter à chaque étape, plan de rollback (D-04 : re-flag staging ~5 min), et numéros de section référençables depuis les plans.
**When to use :** Écrire le runbook AVANT la fenêtre (critère CUT-01 littéral).

### Pattern 2 : Portage secrets fichier → env avec fallback
**What :** 3 variables serveur optionnelles dans `env.ts` (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`), lues en priorité par `google-client.ts`, fallback `files/secrets/*.json` (dev local inchangé). ⚠ `google-client.ts` est WORKER-SAFE (n'importe que node:fs/path + googleapis) — importer `sharedEnv` depuis `@qualiof/shared/env` est acceptable (le worker l'importe déjà au boot), mais NE PAS importer de module auth-gated. Ajouter les 3 clés à `turbo.json` globalEnv + `.env.example`.
**Example :** voir §Code Examples.

### Pattern 3 : Rapport-avant-envoi (D-06)
**What :** Script lecture seule qui reproduit la requête du cron relances (`invoice-reminder-core.ts` : R2 `issueDate >= REMINDER_START_DATE` 2026-05-19, `reminderCount < maxLevel`, dedup 24 h `lastReminderAt`, destinataire via `getReminderRecipientEmail`) et sort la liste : facture, payeur, email destinataire, niveau qui partirait, **+ historique des relances dry-run brûlées** (requête `AuditLog` `action='invoices.reminder_sent'` avec `diff.dryRun=true`). Sortie = tableau markdown pour validation Laurent.
**Why :** règle payeur — un auto-entrepreneur est son propre payeur → une relance facture PEUT toucher un apprenant ; Laurent doit voir la liste nominative avant le flip.

### Pattern 4 : Alertes coûts — mécanique par plateforme (vérifiée 2026-07)
| Plateforme | Mécanique | Réglage recommandé (D-11 ~1,5×) | Où |
|------------|-----------|-------------------------------|-----|
| **Vercel** | Spend Management (Pro) : montant + notifications web/email à seuils, option pause automatique | Budget ~45 $ ; alertes email ; **NE PAS activer l'auto-pause** (couperait la prod) | Team Settings → Billing → Spend Management (rôle Owner/Billing) |
| **Railway** | Usage Limits : « custom email alert » (soft) + « hard limit » (coupe les workloads, min 10 $) | Soft alert ~35 € ; **hard limit ABSENT ou très haut** (couperait worker+doc-engines) | Workspace → Usage → Set Usage Limits (admin) |
| **Supabase** | Spend cap (Pro) ON par défaut = plafonne au plan 25 $ ; emails d'usage | Vérifier spend cap ON (comportement par défaut du plan Pro) — c'est déjà un plafond dur sans couper la DB | Org → Billing |
| **OpenRouter** | Pas de « budget mensuel » : contrôle = **Auto Top-Up OFF** (le solde prépayé devient plafond dur) + credit limit par clé API + alerte de solde dashboard | Auto top-up OFF, solde ~15 €, limite sur la clé de prod | openrouter.ai → Credits + Keys |

**Confiance MEDIUM** sur les libellés exacts d'écrans — les dashboards évoluent ; le plan doit dire « configurer l'équivalent de X » + capture en preuve, pas un chemin de clics figé.

### Pattern 5 : Registre RGPD versionné
**What :** `docs/rgpd/REGISTRE-TRAITEMENTS.md` (registre art. 30 : traitements, finalités, catégories de données/personnes, durées, mesures techniques — reprendre les mesures existantes : bucket privé, signed URLs TTL minutes, `SensitiveData`, RBAC 6 rôles, région EU) + `docs/rgpd/dpa/<fournisseur>.md` (7 fiches : rôle, données transmises, localisation, lien DPA public, garanties de transfert, points ouverts). Export PDF via le pipeline interne. Sources de localisation : `17-REGIONS.md` (Supabase eu-west-1 Irlande DÉFINITIVE, Vercel cdg1, Railway europe-west4).

### Anti-Patterns to Avoid
- **Re-dump / restore de la base** : interdit (D-01) — écraserait le travail cloud depuis le 5 juillet.
- **Runbook en langage CLI** : Laurent doit pouvoir rejouer au dashboard (pattern 20-DEPLOY).
- **Activer l'auto-pause Vercel ou un hard limit Railway bas** : une alerte coût ne doit jamais pouvoir éteindre la prod toute seule.
- **Logger centralisé / scrubber générique** : explicitement différé — corrections ciblées uniquement (D-17).
- **Inventer des clauses DPA** : citer les documents publics, signaler les trous (D-16).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Re-audit storage final | Nouveau script d'audit | `apps/web/scripts/migrate-storage.ts` (DRY→WRITE idempotent) + pattern d'écart 21-02 | Éprouvé 2× (18-02, 21-02), rapport type existe (`STORAGE-BACKFILL-REPORT-2026-07-06.md`) |
| Invitations équipe | Flux d'invitation custom | `tenant-users.ts:inviteUser` + `resendInvitation` (RBAC Phase 8) | Existant, testé — utilisation, pas développement |
| Pack témoin | Nouveau protocole de validation | SES-0094, critères Phases 20/21 (0 stub, footer 22 OF_*, 0 404) | Comparabilité inter-phases exigée (CONTEXT §specifics) |
| Backups | pg_dump cron custom | Backups Supabase natifs daily (Pro, 7 j) | pg_dump hors vendor explicitement différé (D-12) |
| Export PDF registre | Nouvelle lib PDF | `marked` → `renderHtmlToPdf` (pdf-render.ts) | Pipeline interne, footer conforme |
| Opt-in emails apprenants | Nouveau mécanisme | Existant : `notifyLearners` checkbox (défaut `false`, `session-calendar-sync-toggle.tsx:37`), convocations = boutons manuels, crons CRON_SECRET débranchés | L'état vérifié D-06 couvre déjà l'exigence — la phase PROUVE, ne construit pas |

**Key insight :** presque tout le « travail » de cette phase est de la ré-exécution d'assets existants avec collecte de preuves. Le seul développement net : portage Google (~30 lignes + tests), script d'audit d'écart, script rapport relances, fixes console.*.

## Runtime State Inventory

Phase de bascule/migration → inventaire obligatoire :

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | ① Postgres local Docker (47 modèles) — obsolète après audit d'écart D-01 ; ② MinIO local (~3109 objets baseline locale) — snapshot puis purge D-05 ; ③ **`Invoice.reminderCount`/`lastReminderAt` pollués par les dry-runs quotidiens Railway depuis Phase 20** (voir Pitfall 1) — décision de remédiation à soumettre à Laurent ; ④ events Google Calendar (1330, Phase 14) — inchangés, cloud-side | ① déclaration cloud=vérité ; ② pg_dump archive via `docker exec` + snapshot MinIO AVANT purge ; ③ data migration éventuelle (reset compteurs) gated Laurent ; ④ aucune |
| Live service config | ① Vercel projet `qualiof` : 50 vars (flips `NEXT_PUBLIC_APP_ENV`, `MAIL_DRY_RUN`, +3 vars Google, vars D-18 nettoyées à re-vérifier) ; ② Railway 3 services : `MAIL_DRY_RUN` à flipper (redeploy automatique au changement de var) ; ③ Supabase dashboard : spend cap + backups à vérifier/prouver ; ④ 4 dashboards : alertes coûts à créer | patches dashboard/API documentés au runbook, preuves datées |
| OS-registered state | Aucun (pas de launchd/cron Mac lié à la prod ; `dev:full` = process manuel dev). Conteneurs Docker locaux (postgres, minio, gotenberg, weasyprint, ollama) = seul état machine, purgés en D-05 | purge D-05, étape destructive séparée |
| Secrets/env vars | ① `files/secrets/oauth-client.json` (client_id+client_secret) + `google-token.json` (refresh_token) → 3 vars Vercel sensitive (D-07) — **fichiers conservés en local comme fallback dev** ; ② vars Vercel « sensitive » NON relisibles par API (voir Pitfall 2) ; ③ `CRON_SECRET` : endpoints volontairement débranchés — aucune action | pose des 3 vars + code fallback ; sanity check à la pose (pas de re-lecture possible après) |
| Build artifacts | Aucun — pas de rename ; images Docker worker inchangées (le flip MAIL_DRY_RUN ne rebuild pas, Railway redéploie la même image) | aucune |

## Common Pitfalls

### Pitfall 1 : Les relances dry-run ont consommé les niveaux de relance (CRITIQUE pour D-06)
**What goes wrong :** `invoice-reminder-core.ts` lignes 149-167 : `sendMail()` retourne `{ok:true, dryRun:true}` puis le code **incrémente quand même `reminderCount` et pose `lastReminderAt`**, et loggue l'event avec `diff.dryRun`. Le cron Railway tourne tous les jours à 8h depuis la Phase 20 en dry-run.
**Why it happens :** le dry-run est géré au niveau mailer, pas au niveau métier.
**How to avoid :** le rapport D-06 doit lister (a) ce qui partirait au prochain run réel ET (b) les relances déjà « brûlées » à blanc (`AuditLog` où `diff.dryRun=true`). Décision Laurent : reset des compteurs pollués (data migration ciblée) ou acceptation. Sans ça, le flip `MAIL_DRY_RUN=false` produira soit des silences (maxLevel atteint à blanc), soit un rapport faux.
**Warning signs :** factures en retard avec `reminderCount>0` mais aucun email réellement parti.

### Pitfall 2 : Les vars Vercel « sensitive » ne sont pas relisibles
**What goes wrong :** le sanity check env (D-18 ②) ne peut PAS relire la valeur déchiffrée des variables posées en sensitive via API/CLI.
**How to avoid :** deux voies complémentaires : (a) pour les vars non-sensitive : `vercel env pull --environment=production` + scan regex (`[^\x20-\x7E]`, `#`, espaces de fin) ; (b) pour les sensitive : re-pose depuis une source assainie (parser dotenv qui strippe les commentaires inline — leçon PROD-0674, 2 incidents) + vérification comportementale (re-test auto-fill produit, déjà fait post-D-18 ① — à re-prouver au runbook).
**Warning signs :** erreur `ByteString` fetch — l'index pointe le caractère fautif du header.

### Pitfall 3 : Le portage Google = 3 valeurs, pas 1
**What goes wrong :** D-07 ne mentionne que `google-token.json`, mais `google-client.ts:38-48` lit AUSSI `oauth-client.json` (client_id + client_secret) — porter le seul refresh_token ferait crasher le client sur Vercel (fichier absent).
**How to avoid :** 3 vars env (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`), optionnelles dans env.ts, fallback fichiers pour le dev local. Tester le fallback ET le chemin env (mock fs).
**Warning signs :** `ENOENT .../secrets/oauth-client.json` au premier sync post-bascule.

### Pitfall 4 : La levée de la garde calendar peut notifier des invités
**What goes wrong :** `sync-session.ts:99-109` — les apprenants et le formateur sont TOUJOURS dans `attendees` ; `sendUpdates='all'` (Google emaille les invités) si session future ET `notifyLearners=true`. En levant la garde staging, un sync manuel avec la case cochée envoie de vrais emails Google.
**How to avoid :** l'état est déjà conforme (checkbox défaut `false`, sessions passées → `'none'` automatique) — le plan doit le PROUVER (grep + capture) dans la preuve D-06/D-08, et le runbook doit avertir Laurent que la case « notifier les apprenants » devient réelle post-bascule.
**Warning signs :** apprenants recevant des invitations Google inattendues après la bascule.

### Pitfall 5 : Une alerte coût mal configurée peut éteindre la prod
**What goes wrong :** Vercel Spend Management a une option « pause all projects » au plafond ; Railway hard limit coupe TOUS les workloads (worker + Gotenberg + WeasyPrint) ; OpenRouter auto top-up OFF = plafond dur → packs closure en échec si solde à sec.
**How to avoid :** alertes email uniquement (soft) ; pas d'auto-pause Vercel ; pas de hard limit Railway (ou ≥3× le budget) ; OpenRouter : auto top-up OFF est le bon choix (plafond voulu) mais documenter au runbook « si packs en échec HTTP 402 → recharger crédits ».

### Pitfall 6 : DPA OpenRouter — signé = enterprise only
**What goes wrong :** prétendre « DPA signé avec OpenRouter » serait faux : le DPA mutuellement signé est réservé au tier enterprise (support OpenRouter, vérifié 2026-07).
**How to avoid :** la fiche DPA documente honnêtement : self-serve = pas de DPA signé ; garanties réelles = politique par défaut de non-rétention des prompts (métadonnées seules), réglages compte ZDR/logging OFF à vérifier + capturer, Trust Portal consultable. Signaler l'incertitude à Laurent (D-16) ; mitigation possible notée : ZDR enforcement sur les endpoints. Idem nuance Anthropic : atteint VIA OpenRouter (sous-sous-traitant) — pas de relation contractuelle directe.
**Warning signs :** un auditeur demande le DPA signé — la fiche doit déjà contenir la réponse préparée.

### Pitfall 7 : Backups Supabase — même région, pas off-site
**What goes wrong :** conclure « backups EU ✓ » sans preuve, ou survendre : les snapshots daily (Pro, 7 j) sont stockés dans la même région AWS que le projet (eu-west-1 → EU ✓, flag roadmap résolu) **mais ne sont pas off-site** — une défaillance régionale emporte base ET backups.
**How to avoid :** preuve = capture dashboard Database → Backups montrant les snapshots quotidiens + rappel dans le registre que le pg_dump hors vendor est au backlog assumé (D-12). La doc officielle Supabase ne précise pas la région des backups → la capture dashboard EST la preuve (confiance MEDIUM sur la localisation, sources tierces concordantes).

### Pitfall 8 : Le mailer loggue les emails destinataires en clair
**What goes wrong :** `mailer.ts:79` — `console.log('[mailer:dry-run] to=${input.to} subject=...')` : chaque dry-run quotidien écrit des emails de payeurs/apprenants dans les logs Railway (rétention logs = PII).
**How to avoid :** inclure dans l'audit D-17 (masquer l'email, logger un id) ; autre occurrence connue : `closure/worker.ts:409` (`notif sent to ${user.email}` — email d'un User interne, risque faible mais même règle). Périmètre du scan : ~103 fichiers avec `console.*` sous `lib/closure`, `lib/veille`, `lib/invoice-reminders`, `lib/calendar`, `lib/preinscription-extractor.ts`, `scripts/*worker*.ts` — l'essentiel loggue déjà des IDs/codes session (bon pattern), les corrections seront peu nombreuses et ciblées.

### Pitfall 9 : Audit d'écart — comptages exacts, pas reltuples
**What goes wrong :** utiliser `pg_class.reltuples` (approximatif) ou oublier que certaines tables n'ont pas d'`updatedAt`.
**How to avoid :** `SELECT count(*)` par table (47 modèles, volume faible — OK) sur les DEUX bases + `max(createdAt)`/`max(updatedAt)` quand les colonnes existent, comparés au 2026-07-03. Écarts ATTENDUS côté cloud (E2E, backfill, régénérations post-dump) : le critère n'est PAS « comptages égaux » mais « le local ne contient RIEN de postérieur au dump » + délta cloud explicable. ⚠ le `.env` local pointe le CLOUD depuis la Phase 19 : l'URL locale Docker doit être passée explicitement au script (jamais lue du `.env`).

### Pitfall 10 : Le flip MAIL_DRY_RUN doit toucher DEUX plateformes
**What goes wrong :** flipper Vercel et oublier Railway (ou l'inverse) — les relances partent du worker Railway, les convocations/notifs de Vercel.
**How to avoid :** le runbook liste les 2 flips explicitement, avec preuve par plateforme (Railway redéploie automatiquement au changement de var — prévoir la fenêtre).

## Code Examples

### Audit d'écart local↔cloud (D-01) — squelette
```typescript
// apps/web/scripts/audit-data-gap.ts — LECTURE SEULE, 2 connexions explicites
// Usage: LOCAL_DATABASE_URL=postgres://... CLOUD_DATABASE_URL=postgres://... pnpm tsx scripts/audit-data-gap.ts
import { PrismaClient } from '@qualiof/db';

const DUMP_DATE = new Date('2026-07-03T23:59:59Z');
const local = new PrismaClient({ datasources: { db: { url: process.env.LOCAL_DATABASE_URL! } } });
const cloud = new PrismaClient({ datasources: { db: { url: process.env.CLOUD_DATABASE_URL! } } });

// Introspection: liste des tables + présence createdAt/updatedAt via information_schema,
// puis par table: count(*) local vs cloud + max("createdAt")/max("updatedAt") LOCAL vs DUMP_DATE.
// Verdict PASS = aucune ligne locale > DUMP_DATE ; les déltas cloud sont listés (informatif).
```

### Portage Google — fallback env → fichier (D-07)
```typescript
// google-client.ts — remplace les 2 readFileSync ; module reste worker-safe
import { sharedEnv } from '@qualiof/shared/env'; // déjà importé au boot worker

function loadOAuthConfig() {
  const { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN } = sharedEnv;
  if (GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET && GOOGLE_OAUTH_REFRESH_TOKEN) {
    return { client_id: GOOGLE_OAUTH_CLIENT_ID, client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
             refresh_token: GOOGLE_OAUTH_REFRESH_TOKEN };
  }
  // Fallback dev local : files/secrets/ (comportement actuel inchangé)
  const clientRaw = JSON.parse(fs.readFileSync(path.join(SECRETS_DIR, 'oauth-client.json'), 'utf8'));
  const { client_id, client_secret } = clientRaw.installed ?? clientRaw.web ?? clientRaw;
  const token = JSON.parse(fs.readFileSync(path.join(SECRETS_DIR, 'google-token.json'), 'utf8'));
  return { client_id, client_secret, refresh_token: token.refresh_token };
}
// env.ts : 3 clés server z.string().optional() + runtimeEnv + turbo.json globalEnv + .env.example
```

### Sanity check env (D-18 ②) — détection valeurs polluées
```typescript
// Sur un fichier .env tiré (vercel env pull --environment=production) — vars non-sensitive.
const BAD = /[^\x20-\x7E]|#| +$/; // non-ASCII imprimable, dièse, espaces de fin
for (const [k, v] of Object.entries(parsed)) {
  if (BAD.test(v)) console.log(`✗ ${k}: caractère suspect à l'index ${v.search(BAD)}`);
}
// Sensitive (non relisibles) : re-pose depuis source assainie + preuve comportementale (auto-fill).
```

### Rapport relances en attente + relances brûlées (D-06 / Pitfall 1)
```typescript
// Lecture seule. (a) reproduire la sélection du cron: issueDate >= 2026-05-19,
// statut en retard, reminderCount < maxLevel, lastReminderAt null ou > 24h.
// (b) l'historique à blanc:
const burned = await prisma.auditLog.findMany({
  where: { action: 'invoices.reminder_sent', diff: { path: ['dryRun'], equals: true } },
});
// Sortie: tableau markdown {facture, payeur, email, niveau, relances brûlées} → validation Laurent.
// (Vérifier la syntaxe JSON-filter selon le type réel de la colonne diff.)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Rollback = restaurer le local Mac | Rollback = re-flag staging Vercel (~5 min) | Décision D-04 (Phase 22) | Le Mac sort définitivement de la boucle |
| Upstash dans le périmètre (requirement RGPD-01 littéral) | Upstash supprimé (Redis viré Phase 20), remplacé par Google + OVH dans la liste réelle | D-14 | RGPD-01 satisfait par sur-couverture (7 > 6) |
| « dump final restauré » (roadmap) | Audit d'écart + cloud=vérité | D-01 | Aucun restore ; script lecture seule |
| Ollama local (label `Erreur Ollama`) | OpenRouter global depuis Phase 16 | D-18 ③ | Correction cosmétique du label ai-fill-product.ts:297 |

**Deprecated/outdated :** domaine start-academy.fr (abandonné, D-15 Phase 21) ; crons Vercel (zéro, volontaire) ; endpoints CRON_SECRET (débranchés, à laisser tels quels).

## Open Questions

1. **Type de compte Google utilisé pour Calendar/Drive (fiche DPA Google)**
   - What we know : OAuth interne, refresh token scope calendar seul, agenda « Rappel Formations » ; l'email pro est chez OVH (SMTP ssl0.ovh.net) donc probablement PAS Google Workspace.
   - What's unclear : compte Google gratuit (grand public) ou Workspace payant ? Un compte gratuit relève des conditions grand public — pas de DPA processeur → à documenter comme point d'attention (noms sessions/formateurs/emails apprenants dans les events).
   - Recommendation : question à Laurent lors de la rédaction de la fiche ; si compte gratuit, le signaler explicitement dans le registre (D-16 — pas d'invention), mitigation possible au backlog (Workspace).
2. **Remédiation des `reminderCount` brûlés en dry-run (Pitfall 1)**
   - What we know : incréments quotidiens à blanc depuis Phase 20, traçables via AuditLog `diff.dryRun=true`.
   - What's unclear : quelles factures Laurent a-t-il relancées manuellement par ailleurs (le reset aveugle re-enverrait niveau 1 à des payeurs déjà relancés hors outil) ?
   - Recommendation : le rapport D-06 présente les deux listes ; décision de reset = checkpoint Laurent, appliquée comme data migration ciblée AVANT le flip.
3. **Verify-work Phase 20 (relevé 24 h attendu 2026-07-07 ~08h45)**
   - Dépendance d'entrée de la fenêtre : le runbook peut s'écrire avant, mais la Wave 2 (bascule) ne démarre qu'après clôture Phase 20.
4. **Filtre JSON Prisma sur `AuditLog.diff`** — vérifier le type de colonne (Json vs String) avant d'écrire la requête `path: ['dryRun']`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node / pnpm / tsx | scripts d'audit | ✓ | v25.9.0 / 10.33.2 | — |
| Docker | pg_dump archive + purge locale (D-05) | ✓ | 29.4.0 | — |
| pg_dump / psql (host) | archive D-05 | ✗ | — | `docker exec <postgres> pg_dump` (le conteneur local les embarque) |
| vercel CLI | env pull / pose vars (sur autorisation, pattern 21-04) | ✓ | 54.20.1 | dashboard |
| railway CLI | flip MAIL_DRY_RUN worker | ✓ | 5.23.3 | dashboard (préféré, runbook non-technicien) |
| gh CLI | PRs cloud-migration→main (merge commit) | ✓ | 2.91.0 | — |
| googleapis (npm) | portage D-07 | ✓ | ^173.0.0 | — |
| Dashboards (Vercel/Railway/Supabase/OpenRouter) | alertes coûts, backups, flips | accès Laurent requis | — | checkpoints human-action, pattern 21-04 (délégation sur autorisation explicite) |

**Missing dependencies with no fallback :** aucune.
**Missing dependencies with fallback :** pg_dump/psql host → `docker exec`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 (apps/web 1176 tests, packages/shared 113) + Playwright 1.61.1 (e2e/, 4 projets) |
| Config file | `apps/web/vitest.config.*`, `playwright.config.ts` (baseURL `STAGING_BASE_URL`) |
| Quick run command | `pnpm --filter @qualiof/web test -- <fichier>` |
| Full suite command | `pnpm test` (turbo, 3 tâches) ; e2e : `pnpm exec playwright test` avec `STAGING_BASE_URL=https://qualiof.vercel.app` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CUT-01 | google-client lit l'env avec fallback fichier (D-07) | unit | `pnpm --filter @qualiof/web test -- src/lib/calendar/__tests__/google-client` | ❌ Wave 0 (test à créer ; `__tests__/` calendar existe) |
| CUT-01 | Audit d'écart : verdict PASS/FAIL machine-checkable | script + sortie | `pnpm tsx apps/web/scripts/audit-data-gap.ts` (exit ≠0 si donnée locale > dump) | ❌ Wave 0 (script = livrable) |
| CUT-01 | 0 lien mort storage final | script existant | `pnpm tsx apps/web/scripts/migrate-storage.ts` (DRY) + audit d'écart 21-02 | ✅ |
| CUT-02 | Pack témoin SES-0094 : 0 stub, %PDF, 0 404 | e2e manuel outillé (protocole Phases 20/21) | vérifs Prisma `usedStub=false` + curl signed URLs | ✅ protocole établi |
| CUT-02 | Filigrane absent en production (D-08) | unit existant + preuve runtime | `pnpm --filter @qualiof/web test -- pdf-render.watermark` (5 tests, param appEnv) | ✅ |
| CUT-02 | Alertes coûts + backups actifs | manual-only (dashboards, captures datées) | — justification : état de config SaaS, pas de code | — |
| RGPD-01 | Aucun console.* avec PII brut dans worker/generators | grep gate | `grep -rn "console\." <périmètre D-17> \| grep -i "email\|firstName\|lastName"` = occurrences justifiées uniquement | ✅ (commande) |
| RGPD-01 | Registre + 7 fiches DPA présents et exportables | fichiers + build PDF | `ls docs/rgpd/` + génération PDF sans erreur | ❌ Wave 0 (livrable docs) |
| Régression | Suite complète verte post-changements code | full suite | `pnpm test` (1176+113) + `tsc --noEmit` | ✅ |

### Sampling Rate
- **Per task commit :** test du fichier touché (`pnpm --filter @qualiof/web test -- <path>`) + `tsc --noEmit`.
- **Per wave merge :** `pnpm test` complet ; e2e Playwright seulement si code touchant l'app est déployé (les flips env n'en déclenchent pas — le pack témoin EST le test).
- **Phase gate :** suite verte + pack témoin SES-0094 vert + preuves runbook datées avant `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `apps/web/src/lib/calendar/__tests__/google-client.test.ts` — couvre le fallback env/fichier (CUT-01/D-07), mock fs + sharedEnv (pattern getter existant des tests cron-workers)
- [ ] `apps/web/scripts/audit-data-gap.ts` — livrable-outil de CUT-01 (exit code = verdict)
- Framework : rien à installer.

## Sources

### Primary (HIGH confidence)
- Code local vérifié 2026-07-06 : `google-client.ts` (2 fichiers secrets), `sync-session.ts:84,99-109` (garde + sendUpdates), `mailer.ts:53,79` (isDryRun + log PII), `invoice-reminder-core.ts:100-167` (incrément en dry-run), `tenant-users.ts` (6 exports invitation), `session-calendar-sync-toggle.tsx:37` (défaut false), `llm-client.ts:134-141`, `ai-fill-product.ts:297`, `env.ts`, `docker-compose.yml` (5 services), `.env.example:102-111` (SMTP = OVH ssl0.ovh.net:465)
- `.planning/phases/17-.../17-REGIONS.md` — Supabase eu-west-1 Irlande DÉFINITIVE, Vercel cdg1, Railway europe-west4
- Runbooks/rapports existants : `20-DEPLOY.md`, `21-DEPLOY-VERCEL.md`, `STORAGE-BACKFILL-REPORT-2026-07-06.md`, `migrate-storage.ts`
- [Supabase Docs — Database Backups](https://supabase.com/docs/guides/platform/backups) — Pro = 7 jours daily, restore dashboard (la région n'y est PAS précisée)
- [Vercel Docs — Spend Management](https://vercel.com/docs/spend-management) — défaut 200 $, alertes email/web, pause optionnelle, rôle Owner/Billing
- [Railway Docs — Usage Limits](https://docs.railway.com/reference/usage-limits) — soft (email) + hard limit (coupe, min 10 $)
- [Railway DPA](https://railway.com/legal/dpa) + Trust Center (subprocessors : GCP, Stripe, Cloudflare)
- [OpenRouter — ZDR](https://openrouter.ai/docs/guides/features/zdr) + [support DPA](https://openrouter.zendesk.com/hc/en-us/articles/47828437697051) — DPA signé = enterprise only ; défaut = pas de rétention prompts

### Secondary (MEDIUM confidence — à confirmer par capture dashboard au moment de l'exécution)
- Backups Supabase stockés dans la même région AWS que le projet (sources tierces concordantes 2026 ; doc officielle muette) — preuve finale = dashboard
- Mécaniques exactes d'écrans OpenRouter (auto top-up, credit limit par clé, alertes de solde) — dashboard mouvant
- URLs DPA restantes à citer dans les fiches (stables mais à re-vérifier à la rédaction) : Supabase `supabase.com/legal/dpa` (acceptation via dashboard org), Vercel `vercel.com/legal/dpa`, Anthropic `anthropic.com/legal` (commercial terms + DPA), OVH DPA GDPR dans les conditions contractuelles (société française, données UE), Google : dépend du type de compte (Open Question 1)

### Tertiary (LOW confidence)
- Aucune assertion LOW retenue dans les recommandations.

## Metadata

**Confidence breakdown :**
- Standard stack : HIGH — zéro nouvelle dépendance, tout vérifié dans le repo
- Architecture (ordre des gates) : HIGH — dérivé des décisions D-01..D-18 + code vérifié
- Pitfalls : HIGH pour 1-4, 8-10 (code lu) ; MEDIUM pour 5-7 (dashboards/docs cloud)
- RGPD/DPA : MEDIUM — documents publics vérifiés pour OpenRouter/Railway, les autres à re-vérifier à la rédaction des fiches ; Google = Open Question

**Research date :** 2026-07-06
**Valid until :** 2026-08-05 (stable — sauf mécaniques dashboards cloud : re-vérifier au moment de l'exécution)
