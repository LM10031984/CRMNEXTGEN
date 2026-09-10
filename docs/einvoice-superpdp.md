# Super PDP — API réelle (lue le 03/09/2026)

> Source : documentation publique `https://www.superpdp.tech/documentation/{2..14}` (rendue en JavaScript — un fetch HTTP nu ne renvoie que la coquille marketing, il faut un navigateur) et le document OpenAPI **`https://api.superpdp.tech/openapi/superpdp.json`** (OAS 3.0.4, version **1.30.0.beta** au 03/09/2026). Référence interactive : `https://www.superpdp.tech/openapi`. Exemples officiels : `https://github.com/superpdp/examples` (`quick_start.js`, `erp.go`).
> Rien ici n'est deviné. Ce qui n'est pas dans ce fichier doit être relu dans le JSON OpenAPI avant d'être codé.

## 1. Base et environnements

- Base API : `https://api.superpdp.tech/v1.beta/` — OAuth : `https://api.superpdp.tech/oauth2/`.
- Versionnée dans l'URL (`v1.beta`). Mineures rétro-compatibles ; majeure = changement d'URL + guide de migration.
- **Bac à sable vs production = déterminé par la clé (application) utilisée.** Une application bac à sable ne peut pas atteindre la prod ni les annuaires réels. À la création du compte, deux entreprises fictives sont fournies (Burger Queen / Tricatel) pour tester un envoi de bout en bout.
- Une **application** (client_id / client_secret, secret affiché une seule fois) se crée dans l'interface, **par entreprise** (menu Applications → Nouvelle application → choisir l'entreprise).
- Identifiants d'objets : bigint positifs (int64).

## 2. Authentification

- En-tête `Authorization: Bearer <access_token>`.
- OAuth **2.1**, deux grant types :
  - **client_credentials** (notre cas : QualiOF accède au compte Start Academy) — `POST https://api.superpdp.tech/oauth2/token`, `grant_type=client_credentials`, `client_id` + `client_secret` de l'application. Scopes : aucun.
  - authorization_code (délégation par un utilisateur d'un logiciel tiers — hors périmètre, à noter pour un futur multi-tenant) — `/oauth2/authorize` + `/oauth2/token`, redirect URL déclarée dans l'interface, paramètres de pré-remplissage `login_hint`, `superpdp_company_number` + `superpdp_company_number_scheme` (`sandbox` | `fr_siren` | `be_numero_entreprise`), `superpdp_directory_entry_identifier`, `superpdp_send_and_receive` (`any` | `send` | `receive`).
- Révocation RFC 7009 : `/oauth2/revoke`.
- **access_token : 30 min** (valeur susceptible de changer) ; refresh_token (authorization_code seulement) : 1 an glissant avec rotation à chaque usage. Conseil officiel : bibliothèque OAuth 2.1 qui renouvelle automatiquement.
- Un token est lié à une **entreprise** (`company_id`) : tous les appels sont cloisonnés par entreprise.

## 3. Endpoints (extraits du JSON OpenAPI 1.30.0.beta — hors B2BInt / B2C / mandats, non utilisés)

| Méthode | Route | Rôle | Paramètres / corps |
|---|---|---|---|
| GET | `/v1.beta/oauth2_sessions/me` | Session courante (test de connexion) | — |
| GET | `/v1.beta/companies/me` | Entreprise courante (`has_vat_on_debits` disponible) | — |
| POST | `/v1.beta/companies` | Enrôler une entreprise | multipart/form-data |
| PATCH | `/v1.beta/companies` | Régime de TVA | JSON |
| **POST** | **`/v1.beta/invoices`** | **Créer = envoyer une facture** (mise en file, envoi asynchrone) | corps = `application/pdf` (Factur-X) ou `application/xml` (CII/UBL) ou multipart à un seul fichier. Query : `external_id` (notre `Invoice.number`), `disable_pre_check`, `processing_rule` (`B2B` par défaut ; `B2BInt`, `B2C` acceptés). Réponse : `id` de la facture côté PA → sert à suivre les événements. **200 = structure XML acceptée, PAS conformité ni transmission** : la validation et l'envoi se jouent ensuite, en asynchrone. |
| GET | `/v1.beta/invoices` | Lister | `direction`, `date`, `order`, `starting_after_id`, `ending_before_id`, `limit`, `expand[]` |
| GET | `/v1.beta/invoices/{id}` | Lire une facture | `format` (dont `factur-x`), `force_superpdp_pdf_renderer` |
| GET | `/v1.beta/invoices/{id}/download` | Fichier brut | **déprécié** |
| POST | `/v1.beta/invoices/convert` | Conversion de format | `from*`, `to*` ; corps JSON / XML / multipart |
| GET | `/v1.beta/invoices/generate_test_invoice` | Facture de test | `format*`, `b2c` |
| **POST** | **`/v1.beta/validation_reports`** | **Validateur** : une ou plusieurs factures en multipart → un rapport par facture, format détecté automatiquement, schematrons à jour | multipart |
| GET | `/v1.beta/invoice_events` | Événements de cycle de vie | `invoice_id`, `starting_after_id`, `limit` |
| POST | `/v1.beta/invoice_events` | Émettre un statut (côté acheteur, lot 4) | JSON `{ invoice_id*, status_code*, details[], attachments[] }` — `status_code` ∈ `fr:204..212, fr:220` |
| GET | `/v1.beta/directory_entries` | Nos lignes d'annuaire | — |
| POST / GET / DELETE | `/v1.beta/directory_entries[/{id}]` | Gérer nos lignes d'annuaire | JSON |
| GET | `/v1.beta/french_directory/companies` | Chercher une entreprise dans l'annuaire DGFiP | `formal_name_starts_with`, `post_code_starts_with`, `number`, `limit` |
| **GET** | **`/v1.beta/french_directory/entries`** | **Adresses de facturation électronique d'un SIREN** (→ `lookupDirectory(siren)` : le client est-il joignable ?) | `number*` |
| GET | `/v1.beta/ereportings[/{id}]`, `/preview` | E-reporting | hors champ pour un OF exonéré (D-3) |

Objet `invoice` : `id, company_id, created_at, direction, en_invoice (modèle EN 16931 parsé), events[], external_id, processing_rule`.
Objet `event` : `id, invoice_id, status_code, status_text, created_at, details[], attachments[], data`.

## 4. Cycle de vie — codes `status_code`

- **Techniques PA** : `api:uploaded` → `api:validated` | `api:invalid` → `api:sent` | `api:rejected` ; côté réception : `api:received`, `api:acknowledged`, `api:accepted`.
- **Statuts réforme (DGFiP)** : `fr:200` … `fr:213` (+ `fr:220`, `fr:501`). Ceux qu'un **acheteur** peut émettre via l'API : `fr:204..212, fr:220`.
- **PPF / Peppol** : `ppf:validated`, `ppf:refused`, `ppf:rejected`, `ppf:payment-received`, `ppf:flow-1`, chacun décliné `-ack`, `-ack-error`, `-rejected`, `-response-ok`.
- Mapping proposé vers `EInvoiceStatus` de la spec : `api:uploaded`→SUBMITTED · `api:validated`→DEPOSITED · `api:invalid`/`api:rejected`/`ppf:rejected*`→REJECTED_PLATFORM · `api:sent`→DEPOSITED · réception acheteur (`fr:2xx` selon libellé DGFiP, `ppf:validated`)→RECEIVED/APPROVED · `ppf:refused`→REFUSED_BUYER · `ppf:payment-received`→PAID_REPORTED. **À confirmer contre le libellé exact de chaque `fr:2xx` dans les spécifications externes DGFiP avant de coder le mapping** (les numéros sont ceux de la réforme : 200 déposée, 201 émise, 202 reçue, 203 mise à disposition, 204 prise en charge, 205 approuvée, 206 approuvée partiellement, 207 en litige, 208 suspendue, 209 complétée, 210 refusée, 211 paiement transmis, 212 encaissée, 213 rejetée — numérotation à vérifier dans le JSON, section `status_code`, avant usage).

## 5. Synchronisation (pas de webhook documenté)

**Aucun webhook** dans la doc ni dans l'OpenAPI 1.30.0.beta. Le mécanisme officiel est le **polling** :
- `GET /v1.beta/invoices?starting_after_id=<max id connu>` et `GET /v1.beta/invoice_events?starting_after_id=<max id connu>`, objets triés par `id` croissant, séquence **atomiquement strictement croissante** garantie → aucun trou possible si on repart toujours du max stocké.
- Pagination : répéter tant que `has_after == true`.
- Cloisonné par entreprise (token).
→ Pour QualiOF : le worker daily (ou un cron plus fréquent) fait le polling ; stocker `lastSeenEventId` par tenant/provider. Le champ `webhook` de la spec §6 lot 3 devient « polling seulement » ; `SUPERPDP_WEBHOOK_SECRET` inutile tant qu'aucun webhook n'existe.

## 6. Annuaire

- Adresse de facturation électronique = par défaut le **SIREN** (formats : `SIREN`, `SIREN_SIRET`, `SIREN_SUFFIXE`, `SIREN_SIRET_CODEROUTAGE`). Peppol : `0225:<adresse>` pour la France.
- Recevoir = avoir une ligne d'annuaire ouverte par une PA (fait au lot 0 par Laurent). Portabilité si la ligne existe ailleurs : e-mail de confirmation, 5 jours de réponse de l'ancienne PA, ligne « en erreur » pendant la migration — ne pas la supprimer.
- Avant tout envoi : `GET /v1.beta/french_directory/entries?number=<SIREN client>` ; si vide → le client n'est pas joignable électroniquement → on reste sur l'envoi PDF par mail (règle spec §6 lot 3).

## 7. Formats

Factur-X France (PDF + XML CII attaché), UBL France, CII France, Peppol BIS/UBL. Conversion entre formats par la PA (`/invoices/convert`). Normes de référence gratuites : AFNOR XP Z12-012 (à lire en priorité), XP Z12-014 (cas B2B), EN 16931. Fonction annoncée « génération depuis JSON EN 16931 » : pas encore disponible. **Toujours valider avec `/validation_reports` avant `POST /invoices`** (règle officielle et gate de la spec §5).

## 8. Conséquences pour la spec du 02/09

1. `adapters/superpdp.ts` : OAuth client_credentials avec cache du token (30 min) ; `submit()` = `POST /invoices` (PDF Factur-X, `external_id = Invoice.number`) ; `validate()` = `POST /validation_reports` ; `getStatus()` = `GET /invoice_events?invoice_id=` ; `lookupDirectory(siren)` = `GET /french_directory/entries?number=` ; `ping()` = `GET /oauth2_sessions/me`.
2. Secrets : `SUPERPDP_CLIENT_ID`, `SUPERPDP_CLIENT_SECRET` (remplacent `SUPERPDP_API_KEY`), `SUPERPDP_BASE_URL` (défaut `https://api.superpdp.tech`). Un jeu bac à sable et un jeu production = deux applications distinctes dans l'interface.
3. Lot 3 : pas de route webhook ; polling `starting_after_id` dans le worker, curseur persistant par tenant.
4. D-1 (confirmer Super PDP) : l'API couvre tout ce que la spec demande (envoi, validation, statuts, annuaire, sandbox isolé). Rien ne justifie de basculer Iopole.
