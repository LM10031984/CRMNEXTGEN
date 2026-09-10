---
description: Raccorde QualiOF à une Plateforme Agréée de facturation électronique (Factur-X + API) selon la spec du 02/09/2026 — lot par lot, derrière un feature flag, sans jamais inventer un endpoint
argument-hint: "[lot 1 | lot 2 | lot 3 | lot 4 | --etat]"
allowed-tools: Bash(pnpm *) Bash(git *) Read Edit Write Grep Glob WebSearch WebFetch
---

# Facturation électronique — $ARGUMENTS

## 0. Lire avant de toucher au code

1. `.planning/specs/2026-09-02-facturation-electronique-pa.md` — **la spec**. Ne pas re-spécifier. Si un point n'y est pas, poser la question, ne pas décider seul.
2. `.planning/audit/AUDIT-PRODUIT-2026-08-28.md` §E-1, E-2, E-9 — une facture électronique transmise à une plateforme d'État hérite de tous ces défauts. Si le lot 0 de cet audit (cascade de tarif, sourceFingerprint) n'est pas fermé, le dire et s'arrêter (décision D-5 de la spec).
3. `packages/db/prisma/schema.prisma` : `Invoice`, `InvoicePayment`, `Quote/QuoteLine`, `BillingProfile`, `Organization`, `Tenant`. Constat : **`Invoice` n'a pas de lignes** — c'est le premier chantier.
4. `apps/web/src/server/actions/invoices.ts` (les 6 actions), `lib/invoice-template.ts`, `lib/pdf-render.ts` (Gotenberg/WeasyPrint : pas de PDF/A), `lib/numbering.ts`, `lib/invoice-audit.ts`, `lib/mailer.ts` (modèle fail-closed à copier).

## Rappel réglementaire (ne pas se tromper de combat)

- Réception obligatoire pour tous depuis le 01/09/2026 (hors code — compte PA + annuaire).
- Émission TPE/PME au 01/09/2027, **et uniquement pour les opérations non exonérées** : les prestations de formation art. 261-4-4°a (tout ce que QualiOF facture aujourd'hui, `vatRate = 0`) sont **hors champ** de l'e-invoicing et de l'e-reporting (CGI art. 289 bis I).
- Donc : on construit une émission Factur-X **anticipée et optionnelle** (`Tenant.einvoiceEnabled`), pas une obligation. Aucun libellé « conforme réforme 2026 » dans l'UI ou les PDF tant que le validateur de la PA ne l'a pas dit.

## Si `--etat`

Lecture seule. Produire un tableau : modèles présents/absents (InvoiceLine, InvoiceParty, EInvoiceTransmission), factures sans SIREN client (`Organization.siren` null sur le payeur), factures sans lignes, état du flag, adaptateur branché, dernières transmissions et leurs statuts. Aucune écriture.

## Lot 1 — Socle données

- Migrations **additives** (`prisma migrate dev` en local, `migrate deploy` en cloud, jamais `db push`) : `InvoiceLine`, `InvoiceParty`, `EInvoiceTransmission`, `EInvoiceEvent`, champs `Invoice` (`deliveryAddressJson`, `supplyNature`, `vatOnDebits`, `sourceFingerprint`) et `Tenant` (`einvoiceProvider`, `einvoiceEnabled`, `siren`, `vatExemptionText`).
- `createInvoiceFromParticipant`, `createInvoiceForSponsorGroup`, `createCreditNote` : écrire lignes + parties **figées** (snapshot, pas de FK vivante) + `sourceFingerprint` dans la **même transaction** que la facture. SIREN client manquant à l'émission = erreur explicite renvoyée à l'UI, pas une facture incomplète.
- `scripts/backfill-invoice-lines.ts` : une ligne de synthèse par facture existante, **aucune modification de montant**, dry-run par défaut, `--apply` pour écrire, rapport en sortie.
- Test de contrat : `amountHT === Σ lines.totalHT` sur toute facture ISSUED.
- `lib/einvoice/port.ts` + `adapters/mock.ts`. Pas encore d'HTTP.
- **Lire la doc API de la PA** (superpdp.tech/documentation, compte créé par Laurent au lot 0) et consigner les endpoints réels dans `docs/einvoice-superpdp.md` avec la date de lecture. Si la doc n'est pas accessible : le dire, ne rien deviner.

## Lot 2 — Factur-X

- Spike ½ journée, à documenter : `@e-invoice-eu/core` vs CII à la main ; Ghostscript + pdf-lib vs embarquement par la lib. Critère unique : le fichier passe le **validateur de la PA** et reste un PDF lisible.
- `builder/invoice-to-en16931.ts` (pur, testé sur 3 fixtures : TNS individuel, groupée sponsor, avoir 381), `builder/facturx.ts`, `validate.ts`.
- Catégorie TVA **E** + texte `Tenant.vatExemptionText`, code VATEX = D-2 (laisser `null` si non confirmé, ne pas inventer).
- Le Factur-X **remplace** le PDF actuel (un seul fichier, `Invoice.pdfUrl`), `hashSha256` recalculé.
- UI `/app/factures/[id]` : encart + bouton « Vérifier la conformité », visible seulement si `einvoiceEnabled`.

## Lot 3 — Transmission

- `adapters/superpdp.ts` d'après `docs/einvoice-superpdp.md` uniquement. Secrets via `sharedEnv` (`SUPERPDP_API_KEY`, `SUPERPDP_BASE_URL`, `SUPERPDP_WEBHOOK_SECRET`). Fail-closed : pas de clé ou `EINVOICE_DRY_RUN=1` → mock.
- `submitEInvoice(invoiceId)` : `requireRole(['ADMIN','COMPTABLE'])`, scope `tenantId`, Zod, `lookupDirectory(siren)` avant envoi (client absent de l'annuaire → on garde l'envoi mail), idempotence `(invoiceId, xmlSha256)`, `AuditLog` + `EInvoiceEvent` dans la transaction, `revalidatePath` sur liste + détail.
- Webhook `app/api/einvoice/webhook/[provider]/route.ts` : signature vérifiée, payload brut conservé, mapping de statuts testé. Polling de secours dans le worker daily (pattern relances phase 11, même garde-fous que `/prod` : pas de job zombie).
- Colonne « Plateforme » + filtre « non transmises / rejetées » dans `/app/factures`.

## Lot 4 — Réception (différé, minimal — refuser tout élargissement)

Uniquement si le lot 3 est livré. `SupplierInvoice` (émetteur, montants, échéance, clés MinIO PDF+XML, `handledAt`), récupération via l'API de réception de la PA (webhook si disponible, sinon polling daily), page « Factures reçues » en lecture seule avec compteur rouge dans la navigation (non traitées = `handledAt null`), bouton « Traité ». **Pas** de workflow de validation, pas de paiement, pas de statuts renvoyés à la PA : QualiOF n'est pas la compta. Si on te demande plus, renvoyer à la spec §6.

## Garde-fous communs (check-list `/quick`)

requireRole · tenantId partout · Zod avant I/O · AuditLog dans la transaction · Decimal via `Number()` · revalidatePath · clé API jamais loggée ni renvoyée au client · aucun `if (provider === 'SUPERPDP')` hors de l'adaptateur.

## Avant de livrer

`/livraison` (diffs, pas fichiers entiers ; `git log --since` sur tous les fichiers touchés ; merge commit). Les 1 332 tests existants restent verts. Terminer par un résumé : ce qui est fait, ce qui reste, et les décisions D-1..D-5 encore ouvertes.
