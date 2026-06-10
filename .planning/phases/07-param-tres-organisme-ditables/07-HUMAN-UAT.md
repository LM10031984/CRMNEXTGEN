---
status: partial
phase: 07-param-tres-organisme-ditables
source: [07-SMOKE.md, 07-05-SUMMARY.md]
started: 2026-05-15
updated: 2026-05-15
---

## Current Test

[awaiting human testing]

## Tests

### 1. Smoke build + vitest end-to-end (sandbox-blocked during 07-05)
expected: |
  - `pnpm --filter @qualiof/web build` exit 0
  - `pnpm --filter @qualiof/web test --run` exit 0
  - `pnpm --filter @qualiof/shared test --run` exit 0
how_to_run: |
  cd "/Users/laurentmarx/Documents/CRM Next gen/files"
  rm -rf apps/web/.next
  pnpm --filter @qualiof/web build
  pnpm --filter @qualiof/web test --run
  pnpm --filter @qualiof/shared test --run
note: |
  tsc --noEmit a été confirmé clean en sandbox (post-auto-fixes 07-05).
  Build et vitest doivent juste être lancés manuellement.
result: [pending]

### 2. Visual QA Paramètres — édition Identité
expected: |
  Sur `/app/parametres`, section "Identité OF" :
  - Bouton "Modifier" → passe en mode édition (champs SIRET / N° DA / RCS / forme juridique)
  - Saisie SIRET invalide → erreur fieldErrors affichée
  - Saisie SIRET valide (ex `81423718600030`) + "Enregistrer" → toast success + retour mode lecture
  - Recharger la page → valeurs persistées
  - Vérifier `prisma.auditLog` contient une row `action='parameters.update'` avec diff des champs modifiés
result: [pending]

### 3. Visual QA Paramètres — upload Logo + Signatures
expected: |
  Sur `/app/parametres`, section "Logo & signatures" :
  - Vignette logo actuel visible
  - "Remplacer" + upload PNG/JPG/SVG < 2MB → thumbnail mise à jour avec cache-busting
  - "Restaurer par défaut" → AlertDialog confirmation → reset vers asset bundled
  - Idem pour signature pédago + signature dirigeant
  - Régénérer un PDF programme/convention → le nouveau logo apparaît dans le PDF (cache invalidé)
result: [pending]

### 4. Visual QA Paramètres — RIB + Email + Numérotation
expected: |
  - Section "RIB" : IBAN + BIC éditables, IBAN affiché avec espaces tous les 4 chars (formatIban)
  - Section "Email" : emailFrom éditable, info box rappelle que SMTP password reste en ENV
  - Section "Numérotation" : invoicePrefix éditable, AlertDialog warning si changement mi-séquence
  - Toute édition crée un AuditLog row avec diff
result: [pending]

### 5. Régression PDF — vérifier que les templates restent corrects
expected: |
  - Générer un pack de fin de formation sur une session test (e.g. SES-0010)
  - Le PDF certificat doit avoir signature dirigeant
  - Le PDF attestation doit avoir signature responsable pédagogique
  - Le PDF programme/convention doit avoir le logo correct
  - Footer PDF intact (pattern position:fixed bottom:0)
how_to_run: |
  Lancer le worker BullMQ et déclencher la closure via UI.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

(populated if user reports issues during UAT)
