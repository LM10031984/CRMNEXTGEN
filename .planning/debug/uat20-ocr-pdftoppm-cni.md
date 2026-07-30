---
status: diagnosed
trigger: "UAT Phase 20 test 2 — CNI déposée via formulaire pré-inscription → erreurs '[CNI] Texte extrait très court… pdftoppm introuvable (brew install poppler)… Texte extrait trop court (< 20 char), skip'"
created: 2026-07-07T06:00:00Z
updated: 2026-07-07T06:30:00Z
---

## Current Focus

hypothesis: CONFIRMÉE (H2 + H4) — chemin OCR inline résiduel `extractDocsFromBuffers` via `extractApprenantDocs` (wizard admin création apprenant) exécuté sur Vercel serverless sans poppler, avec un PDF scanné (photo encapsulée en PDF par iOS)
test: terminé
expecting: —
next_action: reporter root cause dans 20-UAT.md section Gaps

## Symptoms

expected: PDF/photo CNI déposé via formulaire public passe SUBMITTED → EXTRACTED par le worker OCR Railway (poppler installé), champs auto-remplis
actual: erreurs OCR avec hint macOS "brew install poppler" — pdftoppm introuvable
errors: "[CNI] Texte extrait très court — le PDF est probablement un scan sans OCR… [CNI] Rasterisation impossible : pdftoppm introuvable (installer poppler-utils via brew install poppler). [CNI] Texte extrait trop court (< 20 char), skip"
reproduction: dépôt CNI (photo selon Laurent) via formulaire pré-inscription pendant UAT Ph.20
started: signalé UAT 2026-07-07 ; date réelle du dépôt à déterminer (H1)

## Eliminated

- hypothesis: H3 — staging Vercel sans le code 20-02
  evidence: public-form.tsx appelle confirmPreEnrollmentUpload (storage-upload.ts:117) qui ne déclenche PLUS l'OCR (commentaire WORK-04 lignes 160-163) ; à confirmer côté déploiement mais le message 3 ne peut pas venir de ce chemin de toute façon
  timestamp: 2026-07-07T06:10:00Z

## Evidence

- timestamp: 2026-07-07T06:00:00Z
  checked: grep messages exacts
  found: "Texte extrait très court" et "Rasterisation impossible/pdftoppm" émis par apps/web/src/lib/pdf-extract.ts:74,152 ; "Texte extrait trop court (< 20 char), skip" émis par apps/web/src/lib/preinscription-extractor.ts:279 (UNIQUEMENT extractDocsFromBuffers)
  implication: le pipeline a traité le fichier comme un PDF (chemin pdf-extract), pas comme une image → H4 partiellement vrai (photo → PDF)
- timestamp: 2026-07-07T06:08:00Z
  checked: call-sites extractDocsFromBuffers / extractPreEnrollmentDocuments
  found: extractDocsFromBuffers appelé UNIQUEMENT par extract-apprenant-docs.ts:67 (server action wizard création apprenant, UI create-person-button.tsx:132 qui affiche warnings.slice(0,3)) ; extractPreEnrollmentDocuments encore appelé inline par preinscription-public.ts:111 (submitPreEnrollmentForm legacy) et :132 (retriggerExtraction, bouton admin "Relancer l'extraction")
  implication: le trio EXACT de messages (et l'ordre, et la limite à 3) = une exécution extractDocsFromBuffers avec un PDF scanné, sur une plateforme sans poppler → wizard création apprenant sur Vercel (ou Mac sans poppler). Le message "brew" ne peut pas venir du worker Railway.
- timestamp: 2026-07-07T06:10:00Z
  checked: storage-upload.ts confirmPreEnrollmentUpload (chemin public 20-02)
  found: OCR inline retiré (WORK-04), statut reste SUBMITTED pour le worker Railway
  implication: le formulaire public lui-même est conforme 20-02 ; les chemins inline résiduels sont retriggerExtraction + extractApprenantDocs

- hypothesis: H1 — dépôt antérieur à la bascule 20-02 (artefact historique)
  evidence: requête cloud (lecture seule) — AUCUNE PreEnrollment (toutes époques) ne contient "pdftoppm introuvable" dans aiErrorMsg ni extractedData ; seul match = smoke P6 TEST-OCR-P6D du 2026-07-06 05:52 qui a RÉUSSI (EXTRACTED, warning "pdftoppm 144dpi" = rasterisation OK sur Railway). L'écran vu par Laurent est un affichage UI temps réel (warnings du wizard, jamais persistés) → incident actuel, pas historique.
  timestamp: 2026-07-07T06:20:00Z
- hypothesis: H3 (bis) — staging Vercel sans le code 20-02
  evidence: origin/main contient le commit 8e1b511 "feat(20-02): worker OCR pre-inscription remplace le fire-and-forget serverless" et le commentaire WORK-04 ligne 160 de storage-upload.ts → le déploiement Vercel a bien le code 20-02
  timestamp: 2026-07-07T06:25:00Z
- hypothesis: exécution locale Mac sans poppler
  evidence: /opt/homebrew/bin/pdftoppm présent sur le Mac de Laurent → ENOENT impossible en local ; impossible aussi sur Railway (Dockerfile installe poppler-utils, prouvé par P6) → seule plateforme candidate : Vercel serverless
  timestamp: 2026-07-07T06:25:00Z

## Evidence (suite)

- timestamp: 2026-07-07T06:20:00Z
  checked: base cloud PreEnrollment (10 derniers jours)
  found: 2 PreEnrollment créées le 2026-07-06 16:23 et 16:28 restées PENDING_FORM (aucun fichier, jamais soumises) ; aucune SUBMITTED/EXTRACTING récente hors smoke P6
  implication: le dépôt CNI de Laurent n'est JAMAIS passé par le flux public PreEnrollment→worker ; il a exercé le wizard admin "Créer un apprenant" (extractApprenantDocs, aucun side-effect DB — cohérent avec l'absence totale de trace)
- timestamp: 2026-07-07T06:25:00Z
  checked: create-person-button.tsx (UI wizard)
  found: handleExtract envoie les File bruts à extractApprenantDocs (server action inline Vercel) et affiche warnings.slice(0,3) — exactement les 3 messages rapportés, dans cet ordre
  implication: correspondance parfaite message/UI ; le trio est la signature d'un PDF scanné traité par extractDocsFromBuffers sans poppler
- timestamp: 2026-07-07T06:25:00Z
  checked: origin/main preinscription-public.ts
  found: main contient encore 2 appels inline extractPreEnrollmentDocuments (submitPreEnrollmentForm:111 legacy, retriggerExtraction:132 bouton admin "Relancer l'extraction")
  implication: 2e chemin inline résiduel DANGEREUX — le bouton retry admin exécute l'OCR sur Vercel (sans poppler) et peut passer la row en EXTRACTED avec cni:null, volant le job au worker Railway

## Resolution

root_cause: "Le plan 20-02 n'a relocalisé vers le worker Railway QUE le chemin public confirmPreEnrollmentUpload. Deux chemins OCR inline subsistent et s'exécutent dans le runtime Vercel serverless (sans poppler) : (1) extractApprenantDocs / extractDocsFromBuffers — wizard admin 'Créer un apprenant', c'est LUI qui a produit le message exact de Laurent (message 3 '< 20 char, skip' n'existe que là, preinscription-extractor.ts:279) ; (2) retriggerExtraction — bouton admin 'Relancer l'extraction' qui appelle extractPreEnrollmentDocuments inline. Le fichier de Laurent était un PDF scanné (photo encapsulée en PDF, probablement 'Scanner un document' iOS) → couche texte vide → fallback pdftoppm → ENOENT sur Vercel. Le flux public formulaire→worker Railway fonctionne (prouvé smoke P6)."
fix: "(non appliqué — mode diagnose-only) Recommandation : retriggerExtraction doit repasser la row en SUBMITTED (+ purge extractedData) pour délégation au worker Railway au lieu d'exécuter inline ; le wizard admin doit soit déléguer la rasterisation au worker, soit accepter les images seules côté Vercel avec un message clair (sans hint brew) ; supprimer le fire-and-forget legacy de submitPreEnrollmentForm."
verification: —
files_changed: []
