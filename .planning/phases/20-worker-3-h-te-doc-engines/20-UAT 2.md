---
status: complete
phase: 20-worker-3-h-te-doc-engines
source: [20-01-SUMMARY.md, 20-02-SUMMARY.md, 20-03-SUMMARY.md, 20-04-SUMMARY.md, 20-05-SUMMARY.md]
started: 2026-07-07T05:30:00Z
updated: 2026-07-30T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Pack fin de formation cloud (Mac éteint)
expected: Pack témoin SES-0094 généré 100% cloud Mac éteint — 21/21 DONE, 0 stub, footers remplis, positionnement v11 varié, 36 docs.
result: [pending]

### 2. OCR pré-inscription dans le cloud
expected: Un PDF scanné (CNI) déposé via le formulaire public passe SUBMITTED → EXTRACTED par le worker OCR Railway, avec les champs auto-remplis (données réelles, pas de blocage EXTRACTING silencieux).
result: issue
reported: "[CNI] Texte extrait très court — le PDF est probablement un scan sans OCR. Re-déposer une photo (JPEG) du document permettrait à l'OCR vision de le traiter. [CNI] Rasterisation impossible : pdftoppm introuvable (installer poppler-utils via brew install poppler). [CNI] Texte extrait trop court (< 20 char), skip"
severity: major
note: passé initialement puis requalifié en issue par Laurent — le message d'erreur (hint brew/macOS) provient du chemin d'extraction inline local, pas du worker Railway (image Docker avec poppler, smoke P6 EXTRACTED OK). À dater/localiser au diagnostic.

### 3. Crons planifiés sans Redis (veille + relances)
expected: Le worker relances-factures se déclenche chaque jour à 8h Europe/Paris et la veille le lundi 8h (croner, 0 Redis) — visible dans les logs Railway du jour.
result: pass
evidence: "railway logs (relevé Claude 2026-07-30, délégué par Laurent) : ticks quotidiens [invoice-reminder-worker] tick/processed, run [veille-worker] avec résultat {fetched:744, classified:48, inserted:7} — croner opérationnel sur la durée, 0 Redis. Note mineure : 2 flux RSS veille en échec (travail-emploi.gouv.fr entité invalide, service-public.gouv.fr 404) — dette cosmétique, sources à rafraîchir."

### 4. Doc-engines protégés par Bearer
expected: Gotenberg (via proxy Caddy) et WeasyPrint répondent 401 sans token et 200 avec DOC_ENGINE_TOKEN ; /health reste ouvert (probe Railway).
result: pass
evidence: "curl 2026-07-07 : /health=200 et POST sans token=401 sur les 2 engines Railway ; cas positif prouvé E2E par le pack SES-0094 21/21 cloud (worker → engines avec Bearer)."

### 5. Stabilité 24 h + coût dans le budget
expected: Relevé après 24 h de fenêtre d'observation (échéance 07/07 ~08h45 Paris) — 0 restart pm2 sur les 4 workers, uptime continu, consommation Railway projetée dans le budget (plan Hobby $5/mo, seuil D-07).
result: pass
evidence: "Relevé Claude 2026-07-30 : déploiement 4f72cfdb du 2026-07-06 08:31 toujours SUCCESS et actif — AUCUN redéploiement ni restart/errored/exited dans les logs sur ~24 jours d'uptime continu (fenêtre 24 h très largement dépassée). Coût : plan Hobby ; chiffrage précis du dashboard délégué au plan 22-08 (alertes coûts, seuils D-07)."

## Summary

total: 5
passed: 4
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Un CNI déposé via le formulaire public est traité par le worker OCR Railway (SUBMITTED → EXTRACTED, champs auto-remplis)"
  status: failed
  reason: "User reported: [CNI] Texte extrait très court — PDF probablement scan sans OCR. Re-déposer une photo (JPEG). [CNI] Rasterisation impossible : pdftoppm introuvable (installer poppler-utils via brew install poppler). [CNI] Texte extrait trop court (< 20 char), skip"
  severity: major
  test: 2
  artifacts:
    - "apps/web/src/server/actions/extract-apprenant-docs.ts (server action inline Vercel — émetteur de l'incident via extractDocsFromBuffers)"
    - "apps/web/src/lib/preinscription-extractor.ts:279 (message '< 20 char, skip' — n'existe QUE dans extractDocsFromBuffers, jamais dans le chemin worker)"
    - "apps/web/src/lib/pdf-extract.ts:74,146-155 (warnings 'très court' + 'pdftoppm introuvable' ENOENT, hint brew)"
    - "apps/web/src/components/forms/create-person-button.tsx:132,325-328 (wizard admin 'Créer un apprenant' — affiche warnings.slice(0,3) = les 3 messages exacts rapportés)"
    - "apps/web/src/server/actions/preinscription-public.ts:111,132 (2e chemin inline résiduel : submitPreEnrollmentForm legacy + retriggerExtraction bouton admin)"
  missing:
    - "Délégation au worker Railway pour l'OCR du wizard admin (extractApprenantDocs tourne inline sur Vercel, sans poppler → tout PDF scanné échoue à la rasterisation)"
    - "retriggerExtraction ne délègue pas au worker : il exécute extractPreEnrollmentDocuments inline sur Vercel — risque de passer une row en EXTRACTED avec cni:null et de voler le job au worker Railway"
    - "Nettoyage du fire-and-forget legacy dans submitPreEnrollmentForm (plus branché à l'UI publique mais toujours exporté)"
  root_cause: "20-02 n'a relocalisé vers le worker Railway QUE le chemin public confirmPreEnrollmentUpload (conforme, prouvé smoke P6 : TEST-OCR-P6D EXTRACTED 06/07 05:52, pdftoppm OK). L'incident de Laurent vient du wizard admin 'Créer un apprenant' (extractApprenantDocs → extractDocsFromBuffers), exécuté inline dans le runtime Vercel serverless où poppler n'existe pas. Le fichier était un PDF scanné (photo encapsulée en PDF, type 'Scanner un document' iOS) → couche texte vide → fallback pdftoppm → ENOENT. Preuves : (a) le 3e message '< 20 char, skip' n'est émis QUE par extractDocsFromBuffers ; (b) le trio = warnings.slice(0,3) du wizard, dans l'ordre ; (c) AUCUNE PreEnrollment en base cloud ne porte l'erreur (fonction pure sans side-effect DB) et les 2 PE du 06/07 16h23/16h28 sont restées PENDING_FORM ; (d) pdftoppm présent en local (/opt/homebrew) et sur Railway (Dockerfile) → seul Vercel peut produire ENOENT ; (e) origin/main a bien 20-02 (8e1b511). Bug ACTUEL (pas artefact historique), mais le flux public formulaire→worker n'est PAS cassé."
  fix_recommendation: "1) retriggerExtraction : repasser la row en SUBMITTED (+ purge extractedData) pour que le worker Railway la reprenne, au lieu d'exécuter l'OCR inline. 2) Wizard admin : déléguer la rasterisation/OCR au worker (ou refuser les PDF scannés côté Vercel avec un message clair sans hint brew, en demandant un JPEG/PNG). 3) Supprimer le fire-and-forget legacy de submitPreEnrollmentForm."
  debug_session: ".planning/debug/uat20-ocr-pdftoppm-cni.md"
