---
description: Fait le point sur la prod QualiOF — migrations en attente, garde-fou emails, worker, coûts, dérive local/cloud — avant toute intervention
allowed-tools: Bash(git *) Bash(pnpm *) Bash(gh *) Read Grep Glob
---

# État de la prod QualiOF

Architecture : **Vercel** (app Next, région cdg1) + **Supabase** (Postgres
eu-west-1 + Storage) + **Railway** (worker pm2 : closure IA, relances, crons) +
**OpenRouter** (IA). MinIO local n'est plus la source de vérité mais n'a pas été
purgé.

Passe ces points en revue et rends un tableau court : ✅ / ⚠️ / ❌ + l'action.

## 1. Code

- Branche courante, dérive `cloud-migration` ↔ `main`, PR ouvertes (`gh pr list`)
- Dernier run CI (`gh run list --limit 5`)
- Migrations Prisma non appliquées (`prisma migrate status`) — attendu :
  « No pending migrations to apply »

## 2. Emails — le garde-fou qui protège les clients

Rappel de la conception : `TenantEmailSettings` a **tout à `false` par défaut**.
Sans action ADMIN, aucun email applicatif ne part, même avec `MAIL_DRY_RUN=false`.

- Interrupteur général : ouvert ou fermé ?
- Catégories actives, `testSessionIds` renseignés ?
- ⚠️ Décision Laurent en vigueur : la catégorie **« relances factures » reste
  décochée** tant que Railway est en plan Hobby (egress SMTP :465/:587 bloqué).
- `reminderCount` : ne doit s'incrémenter que sur départ réel (`ok && !dryRun`).
  Un compteur au max avec zéro email reçu = relance « brûlée », silence
  définitif sur la facture. Vérifie avant tout flip.

## 3. Worker

- Jobs `ClosureJob` en `PROCESSING` depuis > 15 min (zombies)
- Taux de `usedStub` sur les derniers batches — un stub = un PDF générique
  livré à un apprenant, à régénérer avant tout audit
- Batches `PARTIAL` ou `FAILED` non repris

## 4. Données et storage

- Clés storage référencées en base qui ne résolvent pas (0 attendu)
- Documents générés depuis la dernière modif de leurs sources → `/coherence-docs`

## 5. Coûts

Garde-fous en place : Railway soft limit, Vercel budget on-demand + notifications
(auto-pause **OFF**), Supabase spend cap, OpenRouter credit limit **mensuelle**.

⚠️ Piège déjà rencontré : la credit limit OpenRouter est par défaut un **total à
vie** de la clé, pas un plafond mensuel. Mal réglée, elle coupe la prod IA.
Toujours « Reset limit = Monthly ».

## 6. Verdict

Termine par : ce qui est sain, ce qui doit être traité aujourd'hui, ce qui peut
attendre — et rien d'autre.
