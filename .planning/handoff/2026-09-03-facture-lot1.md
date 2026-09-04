# Passation — Facturation électronique, lot 1

> Écrit le 04/09/2026 en fin de session, pour une reprise à froid.
> Branche `feat/facture-electronique-lot1`, partie de `main` (`b470802`).
> À lire avec : `.planning/specs/2026-09-02-facturation-electronique-pa.md`
> (la spec) et `docs/einvoice-superpdp.md` (l'API réelle, lue le 03/09).

## 1. Ce qui est commité — `7356ff3`

La **première tranche** du lot 1 : le socle sur lequel tout le reste s'appuie,
et rien de plus.

| Livré | Où |
|---|---|
| 3 enums, 4 tables, 9 colonnes | `packages/db/prisma/migrations/20260904090000_einvoice_socle/` |
| `InvoiceLine`, `InvoiceParty`, `EInvoiceTransmission`, `EInvoiceEvent` | `schema.prisma` (fin de fichier) |
| Champs `Invoice` : `deliveryAddressJson`, `supplyNature`, `vatOnDebits`, `sourceFingerprint` | `schema.prisma` |
| Champs `Tenant` : `einvoiceProvider`, `einvoiceEnabled`, `siren`, `vatExemptionText`, `einvoiceLastEventId` | `schema.prisma` |
| Le port | `apps/web/src/lib/einvoice/port.ts` |
| Adaptateur mock + résolution fail-closed | `adapters/mock.ts`, `index.ts` |
| Variables d'environnement | `packages/shared/src/env.ts` |
| 8 tests | `lib/einvoice/__tests__/mock-adapter.test.ts` |

Portes au moment du commit : `tsc --noEmit` 0 · `pnpm lint` 3/3 ·
`pnpm test` 3/3 (212 fichiers web).

La migration a été **produite par `prisma migrate diff`** depuis l'écart réel
avec la base, pas écrite à la main. Refaire ce geste plutôt que de rédiger du
SQL si le schéma bouge :

```
cd packages/db && npx dotenv -e ../../.env -- npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script
```

## 2. État exact des bases — à lire avant de lancer quoi que ce soit

| Base | Migrations | Remarque |
|---|---|---|
| **Supabase** (`.env`, prod) | 8 — jusqu'à `20260902120000` | `20260904090000_einvoice_socle` **n'y est PAS** et ne doit pas y aller à la main : consigne de Laurent, rien vers Supabase avant le 10/09. Elle partira par la CI au merge de la PR. |
| **`qualiof_test`** (`localhost:5432`) | aucun historique | Bâtie jadis par `db push` → `migrate deploy` y répond **P3005** (« schema not empty »). J'y ai appliqué **le seul SQL de ma migration** via `prisma db execute`, sans toucher à l'historique. |
| `qualiof_dev` (`localhost:5432`) | — | Base d'une autre session (chaîne diagnostic). **Ne pas y toucher.** |

⚠ **Le piège qui m'a coûté un test rouge** : régénérer le client Prisma avec de
nouvelles colonnes `Tenant` casse les tests d'intégration `dedupe`
(`scripts/__tests__/dedupe.merge.test.ts`), qui écrivent réellement dans
`qualiof_test`. Le symptôme est un `Invalid tx.tenant.create() invocation`
illisible. Le remède, si le schéma rebouge :

```
cd packages/db && TEST_URL=$(grep -E "^TEST_DATABASE_URL" ../../.env | cut -d= -f2- | tr -d '"') \
  && DATABASE_URL="$TEST_URL" DIRECT_URL="$TEST_URL" \
     npx prisma db execute --file prisma/migrations/<la-nouvelle>/migration.sql --schema prisma/schema.prisma
```

Il n'y a **pas** de `.env.local` dans ce worktree : tout pointe Supabase sauf
`TEST_DATABASE_URL`. (Le `files/.env.local` qui pointe `qualiof_dev` appartient
à une autre session, dans un autre arbre.)

## 3. Ce qui reste du lot 1

Par ordre de dépendance. C'est la moitié dense : elle réécrit `invoices.ts`.

1. **Les trois actions écrivent lignes + parties figées + `sourceFingerprint`**,
   dans la **même transaction** que la facture :
   `createInvoiceFromParticipant` (l. 70) · `createInvoiceForSponsorGroup`
   (l. 255) · `createCreditNote` (l. 554).
2. **SIREN client bloquant à l'émission** : `Organization.siren` absent ⇒
   erreur explicite renvoyée à l'UI, pas une facture incomplète. La spec parle
   d'un « écran de complétion » — à concevoir, il n'existe pas.
3. **`scripts/backfill-invoice-lines.ts`** : une ligne de synthèse par facture
   existante (label = titre de session, quantité 1, `totalHT = amountHT`),
   **aucune modification de montant**, dry-run par défaut, `--apply` pour
   écrire, rapport en sortie. Modèle à copier : `scripts/purge-orphan-drafts.ts`
   (même discipline « inventaire d'abord, écriture sur demande »).
4. **Test de contrat** `amountHT === Σ lines.totalHT` sur toute facture ISSUED.

## 4. Mes trois écarts assumés par rapport à la spec

La spec date du 02/09, la doc de la plateforme a été lue le 03/09. Quand les
deux divergent, **c'est la doc qui gagne** — et voici où.

**a. `parseWebhook()` supprimé, remplacé par `pollEvents({ startingAfterId })`.**
Super PDP n'expose **aucun webhook** (documentation et OpenAPI 1.30.0.beta).
Le mécanisme officiel est le polling sur une séquence d'ids garantie
strictement croissante. Garder une méthode morte « au cas où » ferait mentir
l'interface sur ce que la plateforme sait faire. Corollaire :
`Tenant.einvoiceLastEventId` existe déjà, et il est en **TEXTE** — les ids sont
des `int64`, que `Number` tronque au-delà de 2^53. Ne pas le « simplifier » en
entier. `SUPERPDP_WEBHOOK_SECRET` de la spec n'a pas été créé : il ne sert à
rien tant qu'aucun webhook n'existe.

**b. OAuth 2.1 client_credentials, pas une clé d'API.**
`SUPERPDP_CLIENT_ID` + `SUPERPDP_CLIENT_SECRET` remplacent
`SUPERPDP_API_KEY`. Jeton de 30 minutes : sa gestion et son cache appartiennent
à l'adaptateur, le port n'en sait rien. Bac à sable et production = **deux
applications distinctes** côté plateforme, donc deux jeux d'identifiants.

**c. `validate()` est sur le chemin nominal.**
La plateforme impose `POST /validation_reports` **avant** `POST /invoices`.
Ce n'est pas un outil de mise au point qu'on branche à la fin : c'est une étape
du parcours d'envoi, à écrire comme telle au lot 3.

Et un choix qui n'est pas un écart mais une abstention : `vatExemptionReasonCode`
reste **null**. **D-2** (code VATEX de l'art. 261-4-4°a) n'est pas tranchée, et
on n'invente pas un code fiscal.

## 5. Les pièges repérés dans `invoices.ts`

Vérifiés dans le code, pas supposés.

**① Le PDF de facture vit à DEUX endroits.**
`createInvoiceFromParticipant` (l. 191-201) et `createInvoiceForSponsorGroup`
(l. 394-403) écrivent `Invoice.pdfUrl` + `hashSha256`, **puis** créent un
`Document` type=FACTURE avec la même clé et le même hash. Deux lignes à tenir
synchrones. Le lot 2 remplace le PDF par le Factur-X (« un seul fichier ») :
il faudra mettre les deux à jour, ou trancher laquelle fait foi.

**② `createCreditNote` ne crée PAS de `Document`.**
Les deux autres si. Asymétrie réelle : ne pas supposer un traitement uniforme
en écrivant lignes et parties pour les trois.

**③ `generateAcquittedInvoicePdf` (l. 937) n'est pas une facture.**
C'est un duplicata tamponné « PAYÉ » portant le **MÊME numéro** que l'original
(décision Laurent du 13/08 : une 2ᵉ facture doublerait le CA). Il ne crée ni
`Invoice`, ni `Document`, et écrit sur une clé de stockage déterministe.
**Il ne doit produire ni ligne, ni partie, ni transmission.** C'est le premier
endroit où un « on écrit les lignes partout où on rend un PDF » casserait la
comptabilité.

**④ L'arithmétique des montants passe par le flottant.**
`amountTTC = Math.round(amountHT * (1 + vatRate / 100) * 100) / 100` (l. 108),
sur un `amountHT` obtenu par `Number(participant.priceHT)`. Le test de contrat
`amountHT === Σ lines.totalHT` doit comparer **en `Number` après conversion**,
comme le reste du dépôt, et non des `Decimal` — sinon il sera rouge pour de
mauvaises raisons.

**⑤ Le test de contrat cassera sur le parc existant.**
Aucune facture n'a de lignes aujourd'hui. Le test doit soit s'exécuter après le
backfill, soit ne porter que sur les factures **qui ont au moins une ligne** —
sinon il échoue sur des données que le code de commerce interdit de réécrire.

**⑥ `Document` type=FACTURE n'a pas d'empreinte.**
`FINGERPRINTED_DOC_TYPES` (`lib/docs/source-fingerprint.ts`) exclut
volontairement `FACTURE` : l'empreinte d'une facture appartient à
`Invoice.sourceFingerprint`, ce lot-ci. Ne pas rajouter `FACTURE` à cette liste
— on aurait deux empreintes rivales pour le même objet. La primitive à
réutiliser (`normalizeForFingerprint`, `stableStringify`, `computeFingerprint`,
`compareSourceFingerprint` et ses **trois** verdicts) est dans ce même fichier.
Rendre un booléen depuis `Invoice.sourceFingerprint` réintroduirait le
`null → périmé` que Laurent a explicitement écarté.

**⑦ Une facture émise ne se régénère pas.**
Elle s'annule par avoir. Si le lot 2 ou 3 crée un chemin d'écriture sur une
pièce déjà émise, il passe par `checkDocumentReplacement`
(`lib/docs/replacement-guard.ts`) — régime **groupé** pour tout traitement de
masse, jamais une garde maison.

## 6. Décisions

| # | État |
|---|---|
| **D-1** Plateforme | **Tranchée le 03/09 — Super PDP confirmé.** L'API couvre envoi, validation, statuts, annuaire, bac à sable isolé. |
| **D-3** Prestations non exonérées | **Tranchée le 04/09 — tout est exonéré.** L'émission reste donc une conformité *anticipée*, pas une obligation 2027. |
| **D-2** Code VATEX art. 261-4-4°a | **Ouverte.** `vatExemptionReasonCode` reste null en attendant. |
| **D-4** Financeur en subrogation (AGEFICE paie l'OF) | **Ouverte.** Buyer = client, financeur en note, à valider avec l'expert-comptable pour EN 16931. |
| **E-9** `settleInvoiceForParticipant` | **Ouverte** — Laurent tranche avant le lot 3. |

## 7. Rappels de forme

- Un lot = une PR, merge commit **jamais squash** (`/livraison`).
- Garde-fous `/quick` : `requireRole` · `tenantId` partout · Zod avant I/O ·
  AuditLog **dans** la transaction · `Decimal` via `Number()` ·
  `revalidatePath` · clé jamais loggée · aucun `if (provider === …)` hors
  adaptateur.
- Ne rien afficher qui ressemble à « facture conforme réforme 2026 » tant que
  le validateur de la plateforme ne l'a pas dit.
