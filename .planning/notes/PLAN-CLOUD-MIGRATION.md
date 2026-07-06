# Plan migration cloud QualiOF — pilote 2026-06-04

## Stack cible (validée 2026-06-03)
- **Vercel** (Next.js + Cron)
- **Supabase** (Postgres + Storage + Auth)
- **OpenRouter** (Claude Haiku 4.5 + Sonnet 4.6) — fast/quality tiers
- **PAS de Redis** — queue native Postgres `FOR UPDATE SKIP LOCKED`
- Budget cible : ~25-40€/mois

## Branche : `cloud-migration`

## Avancement

### ✅ Fait (7 commits)
- Sub-phase A — Abstraction LLM + client SmartOF + sync prix (39 corrections + 26 conversions)
- Sub-phase B — Abstraction Storage MinIO/Supabase + smoke test OK
- Point 3 — Page Audit Trésorerie + 2 formules statut Airtable portées

### 🔄 En cours / À faire dans l'ordre

#### A. Sub-phase C — Queue Postgres (vire BullMQ + Redis) [EN COURS]
- `lib/closure/queue-postgres.ts` — claim atomique `FOR UPDATE SKIP LOCKED`
- Refactor `lib/closure/queue.ts` en façade (driver switch via `QUEUE_DRIVER`)
- `scripts/closure-worker-postgres.ts` — boucle while + sleep (dev local)
- `app/api/cron/closure-worker/route.ts` — endpoint Vercel Cron (prod)
- Test enqueue → process → DONE
- Mettre à jour `package.json` workers en mode Postgres
- Documenter dans `.env.example`

#### B. Wizard étape 2 — Dates + créneaux + formateur (UX critique audit 03/07)
- Composant calendrier (sélection dates uniquement jours ouvrés)
- Calcul auto nb jours `ceil(durationHours / 8)`
- Skip sam/dim/jours fériés via `isBusinessDayISO` (réutilisé)
- Horaires figés 9h-13h/14h-18h par défaut + override par créneau
- Génération `SessionSlot[]` à la création
- **Détection conflit formateur** : query `SessionTrainer` existants sur la plage
- Picker formateur avec disponibilité affichée + tooltip si pris
- Cohérence programme ↔ déroulé ↔ planning (alerte si mismatch)

#### C. Sub-phase D partielle — Migration data Docker local → Supabase
- `pg_dump` schema-only déjà fait (migrations appliquées)
- Dump des data local (39+26=65 corrections récentes incluses)
- Restore sur Supabase
- Validation : SES-0093 a bien 3024€ après migration
- Toggle `.env.local` pour passer dev sur Supabase (test usage réel)

#### D. Pack fin de formation visibilité — fiche session
- Section "Documents avant formation" (programme/convention/convocation/analyse/AGEFICE)
- Section "Documents fin de formation" (10 docs Qualiopi)
- État clair par doc : généré ✓ / en cours / manquant
- Bouton "Générer pack 1-clic" très visible
- Branchement déjà partiel via `prepare-training.ts` + `closure-pack.ts`

#### E. Signature électronique Yousign — workflow AGEFICE J-15
- Provider : **Yousign** (FR, RGPD, déjà dans `.env.example` `YOUSIGN_API_KEY`)
- Alternative testée : DocuSign US (rejeté coût + RGPD)
- Workflow :
  1. À J-15 du début session, alerte ADMIN+MANAGER
  2. Bouton "Envoyer pour signature" sur la session
  3. API Yousign créer envoi (convention + dossier AGEFICE + tous docs préalables)
  4. Email auto stagiaire + dirigeant entreprise + responsable OPCO
  5. Webhook callback → marquer `Document.signedAt`
  6. Auto-envoi à AGEFICE après toutes signatures
- Nouveau worker daily : check sessions endDate ∈ [now+14j, now+15j] et alerter
- AuditLog `signature.*` (sent, signed, completed, sent_to_funder)

#### F. Charte graphique — 10 docs Qualiopi
- Vérifier entête (logo Start Academy + NDA + SIRET)
- Vérifier pied de page (mentions légales + pagination)
- Pattern actuel : `position:fixed bottom:0` 11pt body (cf mémoire `feedback_footer_pdf_qualiof`)
- Audit doc par doc + correction si manquant

#### G. Sub-phase D finale — Deploy Vercel + DNS
- Provisionner Vercel project (free Hobby OK)
- Connecter repo GitHub
- Env vars (copie de `.env.local`)
- Vercel Cron pour `/api/cron/closure-worker` (toutes les 30s)
- DNS `qualiof.start-academy.fr` → Vercel
- HTTPS auto
- Tests E2E en prod

#### H. Phase 10 Audit Qualiopi blanc (déjà planifiée — 11 plans ready)
- Lancer `/gsd:execute-phase 10` quand cloud stable

#### I. Boîte mail intégrée (V2 post-audit 03/07)
- Options : IMAP/SMTP générique vs Gmail API vs Microsoft Graph
- Lier emails reçus aux Person/Session en base
- Vue 360° fiche apprenant

## Deadlines

| Date | Jalon |
|------|-------|
| 2026-06-10 | A + B + C terminés (base cloud + UX dates) |
| 2026-06-17 | D + E + F terminés (UX session + signature + charte) |
| 2026-06-24 | G terminé (cloud prod) + Phase 10 démarrée |
| 2026-07-02 | Phase 10 finie + tests finaux |
| **2026-07-03** | **🎯 AUDIT QUALIOPI SAMIA ZIANI BCI** |

## Conventions à respecter
- Worker safety : `lib/<feat>/core.ts` séparé de `actions/` (jamais d'import auth React dans worker)
- `prisma migrate deploy` requis sur Supabase à chaque migration (pas juste generate)
- AuditLog convention `one-helper-per-entity` (`lib/<feat>-audit.ts`)
- Multi-tenant scope (`tenantId: user.tenantId`) sur toute query
- Horaires Start Academy figés 9h-13h/14h-18h, skip sam/dim/fériés via `isBusinessDayISO`
- Pas de "smart calc" sur conventions métier (cf `feedback_pas_de_smart_calc_sur_conventions_metier.md`)
