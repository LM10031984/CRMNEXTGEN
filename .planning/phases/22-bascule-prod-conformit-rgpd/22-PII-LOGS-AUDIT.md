# Audit D-17 — logs PII du worker & des générateurs (RGPD-01)

**Date :** 2026-07-06
**Plan :** 22-02, Task 3
**Règle :** un log ne doit JAMAIS interpoler de PII brut (email, prénom, nom, nom complet, CNI, RIB/ribKey, adresse personnelle). Logger des IDs, des codes session, des compteurs — jamais la valeur.

## Commande de scan reproductible

```bash
grep -rn "console\." \
  apps/web/src/lib/closure \
  apps/web/src/lib/veille \
  apps/web/src/lib/invoice-reminders \
  apps/web/src/lib/calendar \
  apps/web/src/lib/preinscription-extractor.ts \
  apps/web/src/lib/mailer.ts \
  apps/web/scripts/*worker*.ts \
  | grep -v "__tests__"
```

Résultat au 2026-07-06 : **51 occurrences** (hors tests), dont 6 mentions dans des commentaires/doc-comments (pas des appels). Toutes examinées ci-dessous.

## Tableau des verdicts

| Fichier:ligne | Extrait (avant correction) | Verdict | Correction appliquée |
| --- | --- | --- | --- |
| `apps/web/src/lib/mailer.ts:79` | `[mailer:dry-run] to=${input.to} subject=...` | **CORRIGÉ** (email destinataire en clair — chaque relance dry-run du cron Railway logguait l'email apprenant/payeur) | `maskedTo = String(input.to).replace(/^(.)[^@]*(@.+)$/, '$1***$2')` → log `to=l***@start-academy.fr` |
| `apps/web/src/lib/closure/worker.ts:409` | `notif sent to ${user.email} (batch=...)` | **CORRIGÉ** (email admin déclencheur en clair). Le `select` amont ne remonte pas `user.id` → on loggue `batch.createdByUserId` (même valeur, déjà chargée) | `notif sent to user=${batch.createdByUserId} (batch=${batch.id}, status=${finalStatus})` |
| `apps/web/src/lib/closure/worker.ts:413` | `notifyBatchCompletion error: (e as Error).message` | OK (message d'erreur technique) | — |
| `apps/web/src/lib/closure/ollama-generators.ts:716` | `✓ ${latencyMs}ms (model=..., prompt=...)` | OK (latence/modèle) | — |
| `apps/web/src/lib/closure/ollama-generators.ts:962` | `jour ${k}/${nbJours} échoué — déroulé GLOBAL abandonné` | OK (compteurs) | — |
| `apps/web/src/lib/closure/ollama-generators.ts:1060` | `thèmes potentiellement étrangers : ${fidelity.extraneous.join(...)}` | OK (titres de modules pédagogiques, pas de PII) | — |
| `apps/web/src/lib/closure/ollama-generators.ts:1111` | `✓ après retry #${attempt - 1}` | OK (compteur) | — |
| `apps/web/src/lib/closure/ollama-generators.ts:1115` | `attempt ${attempt}/${MAX_ATTEMPTS} KO (...): ${r.reason.slice(0,120)}` | OK (raison technique LLM tronquée — pas de PII interpolé) | — |
| `apps/web/src/lib/closure/regenerate-grille-core.ts:61` | `Ollama failed, fallback stub: e?.message` | OK (message d'erreur) | — |
| `apps/web/src/lib/closure/queue-postgres.ts:147` | `job ${p.jobId.slice(0,8)}… (${p.kind}) failed : ${e.message?.slice(0,200)}` | OK (id de job + type + erreur) | — |
| `apps/web/src/lib/veille/core.ts:50` | `tenant=${tenantId} sources=${activeSources.length}` | OK (id + compteur) | — |
| `apps/web/src/lib/veille/core.ts:91` | `item process failed source=${source.name} title="${item.title.slice(0,60)}"` | OK (titre d'article RSS public — contenu éditorial, pas de PII) | — |
| `apps/web/src/lib/veille/core.ts:99` | `tenant=${tenantId} result=${JSON.stringify(result)}` | OK (compteurs d'ingestion) | — |
| `apps/web/src/lib/veille/worker.ts:29` | `tick jobId=cron triggered_by=${input.triggered_by}` | OK | — |
| `apps/web/src/lib/veille/fetch-rss.ts:40` | `RSS fetch failed for ${url}` | OK (URL de flux public) | — |
| `apps/web/src/lib/invoice-reminders/worker.ts:46` | `tick { triggered_by }` | OK | — |
| `apps/web/src/lib/invoice-reminders/worker.ts:100` | `processed { processed }` | OK (compteur) | — |
| `apps/web/src/lib/calendar/sync-session.ts:85` | `sync skipped — staging guard` | OK (constante) | — |
| `apps/web/scripts/closure-worker-postgres.ts:27,34,39,43,47,57` | started/processed/loop error/stopped/signal/fatal | OK (compteurs, signaux, messages d'erreur) | — |
| `apps/web/scripts/preinscription-ocr-worker.ts:20,25,27,31,34,41` | started/processed/loop error/stopped/signal/fatal | OK (compteurs, signaux) | — |
| `apps/web/scripts/veille-worker.ts:26,32,38` | cron error / croner registered / signal | OK | — |
| `apps/web/scripts/invoice-reminder-worker.ts:27,33,39` | cron error / croner registered / signal | OK | — |
| `apps/web/scripts/test-veille-worker.ts:24,27,33,34,39` | `dry-run RSS+Ollama pour tenant ${tenant.name} (${tenant.id})` + résumé JSON | JUSTIFIÉ (script de test manuel, `tenant.name` = raison sociale de l'OF « Start Academy » — donnée d'organisation, pas de personne physique ; résumé = compteurs RSS) | — |
| `apps/web/scripts/_regen-analyse-via-worker.ts:17,26,37,40,47,53` | `Participant=${participantId} session=${sp.session.code}`, job status, pdfUrl, taille | OK (IDs opaques, code session, clé storage — pas de nom/email) | — |
| `apps/web/src/lib/preinscription-extractor.ts` | — | OK (0 occurrence `console.*` dans le fichier) | — |
| Commentaires (mailer.ts:5, closure/worker.ts:333, ollama-generators.ts:927) | mentions du mot « console » dans des doc-comments | OK (pas des appels) | — |

## Fix connexe (D-18 ③, cosmétique)

| Fichier:ligne | Avant | Après |
| --- | --- | --- |
| `apps/web/src/server/actions/ai-fill-product.ts:297` | `Erreur Ollama : ${e?.message ?? e}` | `Erreur IA : ${e?.message ?? e}` (provider = OpenRouter depuis Phase 16) |

## Résultat

- 2 corrections PII appliquées (mailer dry-run, notif closure-worker).
- 1 verdict JUSTIFIÉ (`test-veille-worker.ts` : raison sociale d'organisation dans un script de test manuel, pas de PII personne physique).
- Gate de re-vérification :

```bash
grep -rn "console\." apps/web/src/lib/closure apps/web/src/lib/veille \
  apps/web/src/lib/invoice-reminders apps/web/src/lib/calendar \
  apps/web/src/lib/preinscription-extractor.ts apps/web/src/lib/mailer.ts \
  apps/web/scripts/*worker*.ts \
  | grep -v "__tests__" | grep -iE '\$\{[a-z]*\.(email|firstName|lastName)'
# → 0 résultat
```

**Occurrences PII restantes = 0.**

---
*Phase 22 — bascule-prod-conformit-rgpd · Plan 22-02 · Audit D-17 exécuté le 2026-07-06*
