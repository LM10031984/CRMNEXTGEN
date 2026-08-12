---
phase: 22-bascule-prod-conformit-rgpd
plan: 07
status: complete
completed: 2026-08-04
requirements: [CUT-01, CUT-02]
---

# Summary — Plan 22-07 : Sortie du dry-run emails (runbook §4)

## Résultat

**Les emails réels sont actifs et gouvernés** : `MAIL_DRY_RUN=false` sur les DEUX plateformes,
chaîne SMTP Google Workspace prouvée par un envoi réel (`messageId`, réception confirmée par
Laurent le 2026-08-04), et le garde-fou applicatif 22-11 (fail-closed, tout OFF par défaut)
fait que **rien ne part sans coche explicite dans Paramètres** — Laurent a réalisé sa première
activation réelle (catégorie « notifications internes » + session test SES-0094).

## Séquence D-06 respectée (ordre strict)

1. **Rapport jour J** (Task 1, `38ece67`) : 0 envoi apprenant en attente ; découverte des
   compteurs brûlés en « mode réel raté » 21-23/07 (FAC-000006/008 à 2/2 avec 0 email reçu).
2. **Décision Laurent 03/08** (Task 2, `4eaa524`) : reset complet ① + SMTP Workspace
   formation@start-academy.fr + Railway « second temps » + liste nominative validée
   (2 payeurs, 0 apprenant).
3. **Remédiation appliquée** (Task 3, `49701e2`) : `_reset-burned-reminders.ts` DRY→WRITE,
   snapshot + 2 AuditLog `invoices.reminder_reset`, écart 0 vs liste validée.
4. **Flip + preuve** (Task 4, 2026-08-04, exécutée par l'orchestrateur après kill de l'agent) :
   - Vars SMTP posées les 2 plateformes (03/08, agent) ; `MAIL_FROM` corrigé sur Railway
     (`SMTP_FROM` = var morte).
   - Credentials = mot de passe d'application Google (boîte formation@, 2FA activée par
     Laurent) — l'ancien mot de passe de boîte purgé du `.env`.
   - Flip Railway par CLI --set (vérifié), flip Vercel par **API REST JSON** après 2 poses
     stdin vides (leçon PROD-0674 durcie : jamais de stdin CLI sur Vercel), redeploys OK.
   - Preuve : `sendMail` réel via le garde → `{ ok: true, messageId }` sans dryRun,
     réception confirmée.

## Incident résolu en cours de route

**Crash RSC de /app/parametres en prod** (digest 4036615754) : la page (Server Component)
passait des render-props `editView` au client `SettingsSection` — pattern Phase 7 jamais
rendu en prod serverless avant la 1ʳᵉ visite de Laurent. Fix : `editView` devient un
élément cloné côté client avec injection `onSaved`/`onCancel` (9 sections converties,
callbacks optionnels). PR #10 (merge commit `b3f0d182`), tsc 0 erreur, 1208/1208 tests,
déployée et vérifiée.

## État final / garde-fous

- Vercel : `MAIL_DRY_RUN="false"` (prouvé par pull), SMTP_* + MAIL_FROM posés.
- Railway worker : `MAIL_DRY_RUN=false`, MAIL_FROM posé — ⚠ egress SMTP **bloqué en Hobby** :
  les relances du cron ne partiront qu'après upgrade Pro (« second temps », décision Laurent) ;
  échecs sans dégât (compteurs conditionnels au départ réel depuis 22-11).
- Réglages tenant : interrupteur général OFF, seule « notifications internes » cochée,
  session test SES-0094. **Catégorie « relances factures » à laisser décochée jusqu'à
  l'upgrade Railway Pro** — au premier run réel après coche : AKORIMMO niv.1 + KING niv.1.
- Dette tracée (deferred-items) : fiche DPA/registre à amender OVH→Workspace ; détection
  guillemets dans sanity-check-env ; upgrade Railway Pro.

## Metrics

- Durée : ~3 j calendaires (03-04/08), dont checkpoints Laurent (décisions, 2FA, activation UI)
- Commits : `38ece67`, `4eaa524`, `49701e2`, `82fd11b`, `9aa48a3`, `90b41a6`, fix `f772b2a`/`b3f0d182`
