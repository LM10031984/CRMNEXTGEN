# Audit produit & technique QualiOF — 12/09/2026

Lecture statique du code, branche `fix/260912-programme-forfait-entreprise` (7bbeec58), recalée sur `main` (d095b409) pour la signature et les crons — la branche auditée avait 31 commits de retard, deux constats initiaux (signature « sans bouton », crons non planifiés) ont été corrigés. Rapport complet : https://claude.ai/code/artifact/cb553d5c-834b-4101-beb8-de0fd526cd33

## Note : 7/10 (8,5 atteignable après lots 1 et 2)

Production documentaire 9 · Chaîne diagnostic→devis 8 · Qualité technique 7 · Suivi session 6 · Prise en charge financeur 5 · Pilotage 5 · Qualiopi hors documents 4 · Envois & communication 3 · BPF 1.

## Verdict

QualiOF fabrique très bien, presque rien ne PART tout seul. Hors signature électronique (lot C, prod 12/09 : convention + dossier AGEFICE, plan d'envoi par régime de financement, DocuSeal + webhook, relances J+3/J+7, exemplaire signé), invitation Google Calendar et relance d'impayé, aucun email n'atteint un apprenant ou une entreprise. Le dossier financeur, lui, part à la mauvaise adresse.

## Prise en charge financeur — les détails qui changent tout

- Destinataire = EI du stagiaire (`opco-submission.ts:177-178`), jamais le Point d'Accueil AGEFICE (`AgeficePointAccueil.email` inutilisé).
- Aucun contrôle de format email avant envoi (`opco-submission.ts:261`, `submission-editor.tsx:89,152`).
- Pièces manquantes non bloquantes, listées DANS le mail au financeur (`opco-submission.ts:205-209`).
- Statut SENT écrit même en dry-run / envoi supprimé (`opco-submission.ts:298-309`, `mailer.ts:165,185`).
- Composer exige la facture émise d'abord (`dossiers-opco/page.tsx:466-469`) — ordre inversé.
- Pas d'étape « déposé » dans la timeline (`dossier-timeline.tsx:30-35`) ; `financingRequestDate` caché dans Éditer inscription, non lié à `sentAt`.
- Aucune alerte d'antériorité (règle 15 j `funding-rules.ts:79` jamais comparée à `startDate`).
- Refus / AR / annulation : enum présent, aucune UI (seul `markOpcoSubmissionStatus('SENT')`).
- Lien « Voir le dossier OPCO » → 404 (`step-facturation.tsx:124` vers `/app/dossiers-opco/[id]`, seule route `/envoyer/[id]`).
- Financeurs ≠ AGEFICE = étiquettes ; `OpcoCatalog.requiredDocs/contactEmail` jamais lus ; FIFPL vs FI-FPL.
- Budget AGEFICE : 3 000 pour tous ; droits réduits 500 (`agefice-rights.ts:21`) vs 600 (`crud-edits.ts:649`) ; refusés comptés.

## Boutons absents

Convocation (PDF à 9h-17h en dur, `convocation-generator.ts:104`), convention à signer (DocuSeal câblé sans bouton ni webhook), envoi de facture (seule la relance existe), attestation/certificat, satisfaction chaud/froid (règle J+90 jamais exécutée dans l'app), émargement électronique (`Attendance` jamais écrit), journal des emails (`EmailMessage` écrit seulement avec Document joint, aucune UI, `bounced` sans écrivain).

## Pilotage

Trois vérités tréso (SessionParticipant / Invoice / cases audit tréso), deux DSO, deux « réalisé ». Année seule à l'accueil ; N-1 = YTD vs année pleine. OVERDUE jamais posé automatiquement ; pas de balance âgée ni de prévisionnel d'encaissement. Pas de funnel. `Task` jamais créée ; notifications `lead.created/lead.stale/preenrollment.submitted` écrites, jamais affichées. Pas d'export comptable / FEC. Pas de vue qualité de données. `dailyRate` formateur inexploité.

## BPF

Spec du 13/08 (10 décisions) ; **0 ligne de code**. Champs `bpfCategory/bpfLevel/excludedFromBpf/bpfStatus` jamais lus ; liste « Statut BPF » = 5 anciennes catégories périmées. À capter dès maintenant : trainerKind, typologie BPF du payeur, code NSF, dirigeant, charges. Écran de recopie en janv.–fév. 2027, étalon 2025 en test.

## Qualiopi

Matrice = participants × 14 documents ; 10 indicateurs mappés sur 32. Pas de taux de réussite ni d'abandon. Pas de registre réclamations / amélioration continue / VSS / distanciel. Veille : existe. Stub bloque la livraison session, pas le ZIP ni la fiche apprenant.

## Technique — 7/10

207 k lignes, 2 943 tests + 10 E2E, CI lint+tsc+tests, 0 @ts-ignore, 0 secret. À serrer : `CRON_SECRET` fail-open, `lookupSiret` sans auth, rate-limit mémoire (inefficace serverless, absent sur /preinscription et /invitation), MIME par extension. Dette : 10 fichiers > 1 000 lignes, 73 formatteurs € dupliqués, 6 footers PDF, 2 clients LLM, 0 loading.tsx, CLAUDE.md périmé (Ollama/BullMQ/Playwright/Docker).

## Plan

Lot 1 (1-2 sem.) envoi prise en charge fiabilisé + convocation + facture + journal emails + 404 + crons + CRON_SECRET.
Lot 2 (2-3 sem.) source unique tréso, OVERDUE auto, balance âgée, prévisionnel, tâches auto, capture BPF, export comptable, antériorité, qualité données.
Lot 3 (automne) envoi des questionnaires de satisfaction, émargement QR, 33 indicateurs, registres.
Lot 4 (janv.–fév. 2027) BPF 1 clic, puis dette.
