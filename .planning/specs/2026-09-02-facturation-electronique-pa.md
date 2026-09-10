# Spec — Facturation électronique : raccorder QualiOF à une Plateforme Agréée (PA) gratuite par API

> **Date** : 2026-09-02 · **Auteur** : Laurent + Claude (session Cowork)
> **Statut** : SPEC À IMPLÉMENTER — lot 0 hors code (immédiat), lots 1→3 en code, chacun livrable seul, tout derrière un feature flag.
> **Pour** : Claude Code, dépôt QualiOF (`files/`), branche de travail depuis `cloud-migration`. Commande associée : `/facture-electronique`.
> **À relire avant** : audit produit 28/08 (E-1 péremption, E-2 cascade de tarif, E-9 settleInvoice) — une facture électronique hérite de tous ces défauts si on ne les ferme pas d'abord ; spec SessionPricing.

---

## 0. Ce que dit vraiment la réforme pour Start Academy (à retenir avant de coder)

| Point | État au 02/09/2026 | Source |
|---|---|---|
| **Réception** de factures électroniques | **Obligatoire depuis le 01/09/2026 pour TOUT assujetti**, y compris exonéré. Start Academy doit être inscrit dans l'**annuaire** avec une PA de réception. | Cegid (maj 25/08/2026), calendrier confirmé (report rejeté le 11/04/2025) |
| **Émission** — grandes entreprises / ETI | 01/09/2026 | idem |
| **Émission** — PME / TPE / micro | **01/09/2027** (Start Academy = TPE) | idem |
| **Opérations exonérées art. 261 à 261 E** (dont formation pro continue art. 261-4-4°a, ce que QualiOF facture aujourd'hui avec `vatRate = 0`) | **Hors champ de l'e-invoicing ET de l'e-reporting** en émission (CGI art. 289 bis I). Un OF exonéré *n'a pas l'obligation* d'émettre en électronique pour ses prestations exonérées. | Digiforma, Formadmin, FAQ DGFiP |
| Activité mixte (conseil, prestations non exonérées) | Soumise à l'e-invoicing dès 2027 | Formadmin |
| Formats du socle | Factur-X (PDF/A-3 + XML CII), UBL 2.1, CII — profil conforme EN 16931 | DGFiP |
| Nouvelles mentions obligatoires | SIREN du client, adresse de livraison si ≠ facturation, nature (biens / services / mixte), option TVA sur les débits | Cegid |
| PPF | Réduit à l'annuaire + concentrateur : **aucune émission gratuite par l'État**. La gratuité ne peut venir que d'une PA privée. | Pennylane / Tiime |

**Conséquence** : pour Start Academy, l'obligation *dure* est la **réception** (lot 0, sans code, à faire tout de suite). L'**émission** Factur-X depuis QualiOF est un investissement de conformité *anticipée* : (a) obligatoire au 01/09/2027 uniquement pour les opérations non exonérées, (b) de plus en plus **exigée par les clients entreprises** dont la PA n'acceptera plus les PDF simples, (c) impose une exactitude des données que le CRM n'a pas encore (E-1/E-2). On le fait, mais dans le bon ordre et sans se raconter que c'est une obligation légale de 2026.

⚠ **Ne jamais afficher « facture conforme réforme 2026 » sur un document tant que le lot 2 n'est pas validé par le validateur de la PA** — même logique que la mention trompeuse Qualiopi 33.

---

## 1. Choix de la plateforme : PA gratuite avec API

Critères : immatriculée DGFiP (liste officielle), **API documentée** (pas seulement un portail web), offre gratuite réelle à notre volume (< 100 factures/mois), formats Factur-X/UBL/CII, annuaire par API, cycle de vie (statuts) remonté.

| PA | Gratuité | API | Verdict |
|---|---|---|---|
| **Super PDP** (superpdp.tech) | Compte gratuit **jusqu'à 1 000 factures/mois** ; KYC/KYB 2 € HT une fois, minimum de facturation 10 € HT/an. API à l'usage 0,01 € HT/facture au-delà du gratuit. Immatriculée PA le 22/12/2025. ISO 27001, Peppol AP/SMP. | Oui — « API pour envoyer et recevoir », doc + validateur de facture en ligne + « Info Annuaire ». Marque grise possible. | **Candidat n°1** — API-first, gratuit à notre volume, validateur public utile en CI |
| **Iopole** (iopole.com) | Tarifs non publics | Oui — REST, Swagger, sandbox « Lab Iopole », annuaire par API, e-reporting, webhooks temps réel | **Candidat n°2 / repli** — le plus complet techniquement, mais gratuité non démontrée |
| Indy, Tiime, Abby, Flowie, Shine, Sinao, VosFactures, Odoo, jefacture.com… | Offres gratuites | API selon éditeur | Ce sont des **logiciels de facturation** avec PA intégrée : ils veulent qu'on facture *chez eux*. Doublon de QualiOF → écartés |

**Décision proposée** : Super PDP en cible, **derrière un port abstrait** (§4) pour que le remplacement par Iopole (ou autre) soit une classe, pas une refonte. La première tâche du lot 1 est de **lire la doc API réelle de Super PDP** (superpdp.tech/documentation, après création de compte) — cette spec ne recopie aucun endpoint qu'elle n'a pas pu vérifier, Claude Code ne doit pas les inventer non plus.

---

## 2. Ce qui manque dans QualiOF aujourd'hui (constat sur le schéma Prisma)

| Manque | Détail | Impact Factur-X |
|---|---|---|
| **Pas de lignes de facture** | `Invoice` porte `amountHT / vatRate / amountTTC` à plat. Seul `Quote` a des `QuoteLine`. | Le profil EN 16931 exige des lignes (quantité, prix unitaire, catégorie TVA par ligne). **Bloquant.** |
| **Pas d'identifiant fiscal du client structuré** | `Organization.siren/siret/vatNumber` existent, mais `Invoice` ne fige rien : le PDF est rendu depuis des données vivantes (défaut E-1). `BillingProfile` n'a ni SIREN ni TVA. | SIREN client = nouvelle mention obligatoire. Doit être **figé** sur la facture au moment de l'émission. |
| **Émetteur incomplet** | `Tenant.siret / rcs / iban / bic / address` ; pas de SIREN dérivé, pas de code pays, pas de code d'exonération. | En-tête vendeur EN 16931. |
| **Pas de statut de transmission** | `InvoiceStatus` = DRAFT / ISSUED / PAID / PARTIAL / OVERDUE / CANCELLED / CREDIT_NOTE — cycle *interne*. | La réforme impose de suivre les statuts *plateforme* (déposée, rejetée, refusée, encaissée…). |
| **PDF non PDF/A-3** | Gotenberg/Chromium ou WeasyPrint → PDF simple, hash SHA-256 du PDF produit. | Factur-X = PDF/A-3 + XML attaché + métadonnées XMP. |
| **Nature de la prestation, adresse de livraison** | Absentes. | Mentions obligatoires 2026 (services ; lieu de formation ≠ siège payeur). |

---

## 3. Modèle de données (migrations **additives** uniquement, `prisma migrate deploy`)

```prisma
model InvoiceLine {
  id           String  @id @default(uuid())
  invoiceId    String
  invoice      Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  position     Int
  label        String          // "Formation « Maîtriser l'IA » — 3 j, M. Dupont"
  quantity     Decimal @db.Decimal(10, 2)
  unit         String  @default("C62") // UN/ECE rec.20 : C62 unité, HUR heure, DAY jour
  unitPriceHT  Decimal @db.Decimal(10, 2)
  vatRate      Decimal @db.Decimal(5, 2)
  vatCategory  String  @default("E")   // EN16931 : S standard, E exonéré, K, AE…
  vatExemptionReasonCode String?       // code VATEX (à fixer, voir D-2)
  vatExemptionReasonText String?       // "TVA non applicable, art. 261-4-4° du CGI"
  participantId String?                // traçabilité (facture groupée)
  totalHT      Decimal @db.Decimal(10, 2)
  @@index([invoiceId, position])
}

/// Snapshot des parties figé à l'émission (E-1 : la facture ne doit plus dépendre des données vivantes).
model InvoiceParty {
  id          String  @id @default(uuid())
  invoiceId   String
  invoice     Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  role        InvoicePartyRole  // SELLER | BUYER | DELIVERY
  legalName   String
  siren       String?
  siret       String?
  vatNumber   String?
  addressLine1 String?
  addressLine2 String?
  postalCode  String?
  city        String?
  countryCode String  @default("FR")
  email       String?
  electronicAddressScheme String?  // "0225" (SIREN France) / "0002" (SIRET) — identifiant annuaire
  electronicAddress       String?
  @@unique([invoiceId, role])
}
enum InvoicePartyRole { SELLER BUYER DELIVERY }

/// Une transmission = une tentative vers une PA. Plusieurs par facture (rejet puis renvoi).
model EInvoiceTransmission {
  id             String   @id @default(uuid())
  tenantId       String
  invoiceId      String
  invoice        Invoice  @relation(fields: [invoiceId], references: [id])
  provider       String              // "SUPERPDP" | "IOPOLE" | "MOCK"
  format         EInvoiceFormat      // FACTURX | UBL | CII
  profile        String   @default("EN16931")
  xmlStorageKey  String              // MinIO : l'XML exact envoyé
  pdfStorageKey  String?             // le PDF/A-3 Factur-X produit
  xmlSha256      String
  externalId     String?             // id de la facture côté PA
  status         EInvoiceStatus @default(PENDING)
  statusDetail   String?             // message/motif de rejet renvoyé par la PA
  submittedAt    DateTime?
  lastPolledAt   DateTime?
  events         EInvoiceEvent[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([tenantId, status])
  @@index([invoiceId])
}
enum EInvoiceFormat { FACTURX UBL CII }
/// Cycle de vie normalisé DGFiP (sous-ensemble). Ne PAS remplacer InvoiceStatus : les deux coexistent.
enum EInvoiceStatus { PENDING SUBMITTED DEPOSITED REJECTED_PLATFORM RECEIVED REFUSED_BUYER APPROVED PAID_REPORTED ERROR }
model EInvoiceEvent {
  id             String   @id @default(uuid())
  transmissionId String
  transmission   EInvoiceTransmission @relation(fields: [transmissionId], references: [id], onDelete: Cascade)
  status         EInvoiceStatus
  payload        Json?     // réponse brute PA (webhook ou polling)
  occurredAt     DateTime
  createdAt      DateTime @default(now())
}
```

Ajouts sur `Invoice` : `deliveryAddressJson Json?`, `supplyNature String @default("SERVICES")`, `vatOnDebits Boolean @default(false)`, `sourceFingerprint String?` (le E-1, enfin), relations `lines`, `parties`, `transmissions`.
Ajouts sur `Tenant` : `einvoiceProvider String?`, `einvoiceEnabled Boolean @default(false)`, `siren String?` (dérivé du SIRET si absent), `vatExemptionText String?` (défaut `MENTION_TVA` de `catalogue-constants.ts`).
Secrets : `EINVOICE_PROVIDER`, `SUPERPDP_API_KEY`, `SUPERPDP_BASE_URL`, `SUPERPDP_WEBHOOK_SECRET` dans `packages/shared/env` (jamais en dur, pattern `sharedEnv`).

Rétro-compatibilité : les factures existantes n'ont pas de lignes → un script `scripts/backfill-invoice-lines.ts` crée **une ligne de synthèse** par facture ISSUED/PAID (label = titre de la session, quantité 1, `totalHT = amountHT`). Pas de réécriture de montants (code de commerce : une facture émise ne se modifie pas, on ajoute de la structure autour).

---

## 4. Architecture : un port, des adaptateurs

```
apps/web/src/lib/einvoice/
  port.ts              interface EInvoicePlatform { submit(), getStatus(), lookupDirectory(), parseWebhook() }
  builder/
    invoice-to-en16931.ts   Invoice + lines + parties → modèle pivot EN16931 (objet TS pur, testé)
    facturx.ts              pivot → XML CII + embarquement dans le PDF/A-3 (voir §5)
    ubl.ts                  pivot → UBL 2.1 (format de repli si la PA le préfère)
  adapters/
    superpdp.ts         implémentation réelle (doc lue au lot 1, jamais devinée)
    iopole.ts           squelette (non branché)
    mock.ts             pour tests + dev local (MAIL_DRY_RUN-like : EINVOICE_DRY_RUN=1)
  validate.ts          appel au validateur de la PA (Super PDP expose un validateur) — gate avant envoi
```

Règles :
- `port.ts` ne connaît **aucun** détail HTTP d'une PA. L'adaptateur est le seul à importer `fetch` vers l'extérieur.
- Tout appel sortant est **fail-closed** comme le mailer : sans clé ou en `EINVOICE_DRY_RUN`, on écrit la transmission en `PENDING` avec `provider = MOCK` et on n'émet rien.
- Idempotence : `(invoiceId, xmlSha256)` — renvoyer le même XML ne crée pas de doublon côté PA (`externalId` réutilisé).
- Toute transition de `EInvoiceStatus` écrit un `AuditLog` **dans la transaction** (règle `/quick`), et un `EInvoiceEvent` avec la réponse brute.

---

## 5. Génération Factur-X (le point technique dur)

1. **Modèle pivot** : construire un objet EN 16931 depuis `Invoice + InvoiceLine[] + InvoiceParty[]`. Bibliothèque candidate : `@e-invoice-eu/core` (génère Factur-X/ZUGFeRD, UBL, CII conformes EN 16931 depuis un JSON, TypeScript, MIT). À évaluer en premier ; sinon écrire le CII à la main avec un template XML testé contre le validateur de la PA.
2. **PDF/A-3** : Gotenberg (Chromium) ne produit pas de PDF/A. Deux voies, à trancher au lot 2 par un spike d'une demi-journée :
   - (a) Gotenberg → PDF, puis conversion PDF/A-3b via **Ghostscript** dans le conteneur, puis attachement de `factur-x.xml` + métadonnées XMP avec `pdf-lib` (déjà en dépendance) ;
   - (b) `@e-invoice-eu/core` qui sait embarquer l'XML dans un PDF fourni (LibreOffice optionnel pour la conversion PDF/A).
   Critère : le fichier passe le validateur de la PA **et** s'ouvre normalement chez un client (le PDF reste lisible, l'XML est invisible).
3. **Cas TVA** : Start Academy = catégorie **E** (exonéré) sur chaque ligne avec `vatExemptionReasonText = "TVA non applicable, art. 261-4-4° du CGI"`. Le code VATEX exact pour l'art. 261-4-4°a est **D-2** (voir §9) — ne pas inventer un code, le prendre dans la liste VATEX publiée par la DGFiP / EN 16931.
4. **Avoirs** : `InvoiceStatus.CREDIT_NOTE` → `TypeCode 381` avec référence à la facture d'origine (`originalInvoiceId`) — cohérent avec la règle « avoir, jamais réécriture » de `/tarification`.
5. **Hash** : `Invoice.hashSha256` reste le hash du PDF ; `EInvoiceTransmission.xmlSha256` est celui de l'XML. Les deux sont audités.
6. Le PDF Factur-X **remplace** le PDF envoyé par mail au client (c'est un PDF valide) — un seul fichier, pas deux.

---

## 6. Lots

| Lot | Contenu | Livrable | Dépend de |
|---|---|---|---|
| **0 — Réception (hors code, immédiat, Laurent)** | Créer le compte Super PDP (KYC 2 €), déclarer Start Academy dans l'**annuaire** comme récepteur, brancher l'expert-comptable, tester en recevant une facture fournisseur. | Start Academy conforme à l'obligation du 01/09/2026 | rien |
| **1 — Socle données** | `InvoiceLine`, `InvoiceParty`, champs `Invoice/Tenant`, backfill, `createInvoiceFromParticipant` / `createInvoiceForSponsorGroup` / `createCreditNote` écrivent lignes + parties figées, `sourceFingerprint` posé à l'émission, SIREN client obligatoire à l'émission (bloquant si `Organization.siren` absent → écran de complétion, pas de facture « vide »). Lecture de la doc API Super PDP, écriture du `port.ts` et de `mock.ts`. | Factures structurées, PDF actuel inchangé | Lot 0 de l'audit 28/08 (E-1/E-2) |
| **2 — Factur-X** | Builder pivot + CII + PDF/A-3, `validate.ts` contre le validateur PA, bouton « Vérifier la conformité » dans `/app/factures/[id]`, feature flag `Tenant.einvoiceEnabled`. | Chaque facture émise est un Factur-X valide (mail au client = ce fichier) | Lot 1 |
| **3 — Transmission** | `adapters/superpdp.ts`, action `submitEInvoice(invoiceId)`, webhook `POST /api/einvoice/webhook/[provider]` (signature vérifiée, secret) + polling de secours dans le worker daily (même pattern que les relances phase 11), colonne « Plateforme » dans la liste factures, `lookupDirectory(siren)` pour vérifier que le client est **dans l'annuaire** avant d'envoyer (sinon : envoi PDF par mail, comme aujourd'hui). | Envoi et suivi de cycle de vie depuis QualiOF | Lot 2 + compte Super PDP + `/prod` |
| **4 — Réception (DIFFÉRÉ, version minimale seulement)** | Décision Laurent/Claude du 02/09 : pas de workflow fournisseur dans QualiOF (c'est la compta). Uniquement : `SupplierInvoice` (émetteur, montants, échéance, PDF + XML dans MinIO, `handledAt`), récupération via l'API de réception de la PA (webhook ou polling daily), entrée « Factures reçues » en lecture seule avec **compteur rouge** des non traitées, bouton « Traité ». Pas de statuts renvoyés à la PA, pas de paiement. À faire seulement une fois le lot 3 livré (l'adaptateur existe déjà). En attendant : notifications email Super PDP → boîte Laurent + expert-comptable. | Les factures reçues visibles dans QualiOF | Lot 3 |

Un lot = une PR, `/livraison` avant chaque commit, `pnpm test` vert (les 1 332 tests existants ne doivent pas bouger), tests unitaires sur le builder (montants, arrondis Decimal via `Number()`, catégorie E, avoir 381) et sur le mapping de statuts.

---

## 7. Interface (minimal)

- `/app/factures/[id]` : encart « Facturation électronique » → statut de transmission (badge), bouton « Vérifier » (lot 2), bouton « Transmettre » (lot 3, ADMIN/COMPTABLE), historique des événements.
- `/app/parametres` : section « Plateforme agréée » → provider, état de la clé (jamais affichée), test de connexion, `einvoiceEnabled`.
- Liste `/app/factures` : filtre « non transmises / rejetées ».
- Rien de tout ça n'est visible tant que `einvoiceEnabled = false` (tenant), pour ne pas exposer une promesse non tenue.

---

## 8. Tests & gates

- Builder : fixtures = les 3 factures réelles anonymisées (facture individuelle TNS, facture groupée sponsor, avoir).
- Validation : en CI, `validate.ts` en mode mock ; en staging, appel réel au validateur PA sur les fixtures (job manuel).
- Contrat : `Invoice.amountHT === Σ InvoiceLine.totalHT` et `amountTTC` recalculé — test qui casse si quelqu'un modifie un montant à plat sans toucher aux lignes (c'est le E-2 appliqué à la facture).
- Sécurité : webhook rejeté sans signature valide ; `tenantId` scopé partout ; clé API jamais loggée.

---

## 9. Décisions ouvertes (Laurent)

| # | Question | Défaut proposé |
|---|---|---|
| D-1 | Confirmer Super PDP après lecture de la doc et création du compte (lot 0). Si l'API réelle est trop pauvre (pas de statuts, pas de webhook), basculer Iopole et demander un devis. | Super PDP |
| D-2 | Code VATEX à utiliser pour l'art. 261-4-4°a (à demander à l'expert-comptable ou à lire dans les spécifications externes DGFiP). | Catégorie E + texte, code laissé `null` tant que non confirmé |
| ~~D-3~~ | ~~Y a-t-il des prestations **non exonérées** ?~~ **TRANCHÉE le 04/09/2026 : tout est exonéré.** L'émission reste une conformité anticipée, pas une obligation au 01/09/2027 ; le lot 3 ne devient pas prioritaire pour raison réglementaire. | Laurent, 04/09/2026 |
| D-4 | Factures payées par un financeur en subrogation (AGEFICE paie l'OF) : le « buyer » reste le stagiaire/entreprise, le financeur est un tiers payeur — à valider avec l'expert-comptable pour la représentation EN 16931 (`PayeeParty` ?). | Buyer = client, financeur en note |
| D-5 | Ordre : lot 1 avant ou après le lot 0 de l'audit 28/08 (cascade de tarif) ? | Après — sinon on transmet des montants faux à une plateforme d'État |

---

## 10. Sources consultées (02/09/2026)

Calendrier : cegid.com (calendrier maj 25/08/2026). Gratuité / PA : infos-pa.com/gratuit, comparateur-efacturation.fr/plateforme/superpdp, superpdp.tech, iopole.com/plateforme-agreee-france, pennylane.com (liste des PA immatriculées). OF exonérés : help.digiforma.com (réforme selon régime de TVA), formadmin.fr (OF exonéré de TVA). Librairie : github.com/gflohr/e-invoice-eu.
