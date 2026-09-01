---
phase: 20-worker-3-h-te-doc-engines
plan: 05
status: complete
completed: 2026-07-06
requirements: [WORK-01, WORK-02, WORK-03, WORK-04]
---

# Summary — Plan 20-05 : Déploiement Railway + smokes runtime + validation Laurent

## Résultat

Les 4 requirements WORK-01..04 sont **validés par preuves runtime** (voir 20-SMOKE.md) et le
pack témoin cloud a passé la **validation visuelle de Laurent le 2026-07-06** (« Ok on est bons »)
après correction de 2 écarts découverts au checkpoint Task 3.

- **Task 1 (checkpoint déploiement)** : 4 services Railway up (worker + gotenberg-proxy +
  weasyprint, plan HOBBY $5/mo retenu — P5 SMTP différé en dette assumée).
- **Task 2 (smokes)** : P1-P7a consignés dans 20-SMOKE.md — pack SES-0094 21/21 DONE 0 stub
  Mac éteint (~113 s), OCR PDF scanné → EXTRACTED données réelles, Bearer 401/200, 0 Redis.
  8 bugs corrigés en exécution (dont polyfill WebSocket Node 20 et OPENROUTER_API_KEY corrompue).
- **Task 3 (validation Laurent)** : écarts remontés le 2026-07-06, corrigés le jour même,
  pack régénéré, **approuvé**.

## Écarts checkpoint Task 3 et corrections

1. **Footers PDF vides en cloud** — `getOfConfig()` des footers est ENV-only ; les 22 vars
   `OF_*` n'existaient que dans le `.env` local. Fix : 22 vars poussées sur le worker Railway
   (config seule). ⚠ À reporter au runbook 20-DEPLOY.md et à prévoir sur Vercel (Phase 21).
   Dette : basculer les footers sur `loadOfConfig(tenantId)` BDD (cf. BUG-13 backlog).
2. **Positionnement partie 3 mécanique** (motif avant/après quasi identique entre stagiaires)
   — fix quick task `260706-bya` : SYSTEM_PROMPT_POSITIONNEMENT **v11** + garde Zod
   déterministe (`apres > avant`, `avant ≤ 3`, anti-tampon). Vérifié post-régénération :
   motifs distincts, progressions +1/+2/+3, 0 stub.
3. **Docs « manquants »** : clarifié — satisfaction froide = J+90, autres docs = pipeline
   `_gen-session-pack.ts` hors périmètre smoke. Pack complet régénéré (36 docs) et validé.

## Découverte majeure (hors périmètre plan, consignée)

**Migration Storage Phase 18 incomplète** : des objets référencés en BDD (AGEFICE, assiduité,
convocations, analyses besoin de SES-0094, ~juin 2026) sont dans MinIO local mais **absents de
Supabase Storage**. Audit + backfill idempotent requis **avant Phase 22** (gate « aucun 404 »).
Détail : `deferred-items.md`. NE PAS purger MinIO local d'ici là.

## Reste à faire (hors gate)

- **Relevé observation 24 h (P7b/c)** : fenêtre redémarrée 2026-07-06 (redeploy vars OF_*) —
  relevé le 2026-07-07 (restarts, coût projeté vs budget D-07).
- Nettoyage PreEnrollment `TEST-OCR-P6D-…` (données fictives) — suppression = étape séparée
  gatée Laurent (convention destructif).
- Fiche AGEFICE : 3 corrections cosmétiques différées (voir deferred-items.md).
- Anomalie cosmétique : `ClosureBatch.doneDocs` double-compté après re-run (42/21, statut
  PARTIAL alors que 21/21 DONE) — fausse l'affichage de progression UI.

## Phase gate 20

- [x] Pack témoin cloud validé visuellement par Laurent (2026-07-06, après régénération v11)
- [x] OCR PDF scanné validé (champs CNI corrects, données fictives)
- [ ] Relevé 24 h du 2026-07-07 (dernier item avant clôture formelle)
