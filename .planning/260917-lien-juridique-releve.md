# Le rattachement juridique — relu à chaque pièce, jamais daté

**17/09/2026. Relevé en lecture seule : aucune écriture en base, aucune migration,
aucun code applicatif.**

- Code lu : `origin/main` à `2dabbe7b`, branche `fix/260917-lien-juridique-role`.
- Base lue : **production**, en `BEGIN READ ONLY … ROLLBACK`, horodatages en UTC.
- Mesures rejouables : `260917-lien-juridique-mesures.sql` ; sortie brute : `260917-lien-juridique-mesures.txt`.
- Dry-run Katia **préparé, non joué** : `260917-katia-rattachement-dry-run.sql`.
- Proposition (modèle daté, édition, refus, suppression) : `260917-rattachement-date-proposition.md`.

**Populations** : 578 liens juridiques (373 personnes) · 384 personnes ·
376 inscriptions sur 87 sessions · 315 organisations.

L'arbitrage du 17/09 qui commande tout : **un rôle ne s'écrase pas, il se termine
et un autre commence.** Katia était agente commerciale en janvier 2026 ; elle est
salariée de Century 21 depuis une date postérieure, **encore à fournir**.

---

## ⚠ Trois prémisses corrigées par la lecture

1. **`professionalStatus` ne s'imprime sur aucune grille d'observation.** Il est
   transporté dans le contexte (`build-context.ts:95`, `worker.ts:168`), mais le
   gabarit de la grille n'imprime que « entreprise — fonction »
   (`shared-template.ts:646-659`), et le prompt de la grille individuelle ne cite
   que prénom, nom et civilité (`ollama-generators.ts:695-745`). Il n'entre que
   dans des **prompts IA** : analyse des besoins individuelle (`:592`),
   positionnement (`:830`), grille de session (`:1250`). Là, il ressort dans la
   prose imprimée (§3.f). Le défaut reste entier : un texte libre finit sur une
   pièce remise, simplement par l'IA plutôt qu'en champ.
2. **Le rattachement daté existe déjà au schéma.** `LegalLink.startDate` et
   `endDate` (`schema.prisma:330-331`, depuis `da2ba7bd`, 27/04/2026). **Aucun code
   ne les compare à une date de session** ; `startDate` ne sert que de critère de
   tri secondaire (`build-context.ts:27`, `worker.ts:96`,
   `generate-deroule-session.ts:115`). En base : 4 liens sur 578 ont un début, égal
   à leur date de création (script du 24/06), 0 a une fin.
3. **`financingMode` ne dit pas le financeur.** Rempli sur 44 inscriptions sur 376,
   il n'est lu par aucune règle de financement. Le financeur, c'est l'`opcoCode`
   de l'organisation qui paie l'inscription.

---

## 1. Relu ou figé ? — la réponse qui commande la suite

### Figé à l'inscription : le payeur

`SessionParticipant.sponsorOrgId` est posé à l'inscription (`sessions-create.ts:245-248`,
`sessions.ts:110` et `:119`, `enroll-from-request.ts:166-174`) et **jamais recalculé
depuis les liens**. Il ne change que par `participant-sponsor.ts`, sous
`verrou-financeur.ts:72-77` (dossier SENT/ACK_RECEIVED/APPROVED/REIMBURSED, pièce signée
ou en signature). C'est lui que lisent :

| Pièce | Lecture | Ensuite |
|---|---|---|
| Facture | `invoices.ts:283` (`payerOrgId: participant.sponsorOrg.id`) | **figée** à l'émission (`InvoiceParty`, `schema.prisma:2493-2494`), sauf le PDF acquitté qui relit l'organisation (`invoices.ts:1378-1381`) |
| Dossier de prise en charge | `opco-submission.ts:301-311` | **figé** dans l'`OpcoSubmission` une fois créé (`:342-354`) |
| Régime de signature | `participants-regime.ts:120-122` | relu |
| Structure de la demande AGEFICE | `agefice-generator.ts:140`, **en premier** | relu |

`SessionParticipant.priceHT` est lui aussi figé à l'inscription.

### Relu à chaque génération, sans aucune date : tout ce qui vient du rattachement

| Ce qui est décidé | Où | Quel lien est pris |
|---|---|---|
| Convention ou contrat individuel (payeur de forme solo) | `payer-rule.ts:73-89`, appelé par `convention-core.ts:150-157` et `:396-400`, `route-conventions.ts:83-85`, `programme-core.ts:237` et `:422`, `analyse-besoin-entreprise-core.ts:121-125` et `:303`, `signature-envoi.ts:260` et `:287-290`, `dispatch-generate-doc.ts:136-142`, `session-learner-zip.ts:177`, `sessions/[id]/page.tsx:149` et `:714` | `legalLinks.find(l => l.organizationId === sponsorOrgId)` : **le premier trouvé**, sans tri, sans date — **12 sites** |
| Éligibilité AGEFICE | `eligibilite.ts:35-47` (`OU_AGEFICE`), `sessions.ts:196-208`, `prepare-training.ts:427-456` | payeur AGEFICE **ou n'importe quel** lien EI_SELF/AGENT_COMMERCIAL vers une organisation à profil AGEFICE — **même quand l'inscription est payée par une société OPCO** |
| Structure de la demande AGEFICE, en repli | `agefice-generator.ts:141-149` | lien EI_SELF, sinon premier lien EI/agent |
| Raison sociale de l'attestation d'assiduité | `agefice-attendance-generator.ts:116-123` | payeur s'il est AGEFICE, sinon EI_SELF > AGENT_COMMERCIAL > SALARIE, `isPrimary` ignoré |
| « Entreprise — fonction » imprimée sur émargement, grille, QCM, satisfactions, analyse, positionnement | `build-context.ts:25-27` et `:62-65`, `worker.ts:94-98` et `:119-123` | le lien **principal** (`isPrimary desc, startDate desc`), **pas** le lien vers le payeur |
| Analyse des besoins entreprise (garde « a un salarié », fonctions) | `analyse-besoin-entreprise-core.ts:121-125`, `:160-165` | `find` vers le payeur |
| Forme et signataire d'une pièce envoyée en signature | `signature-envoi.ts:260-290`, `signataire-de-la-piece.ts:67-91` | `find` vers le payeur |

### Les générateurs effacent avant de refaire

`convention-core.ts:66-71`, `agefice-generator.ts:94-100`,
`agefice-attendance-generator.ts:71-73` : `deleteMany` **inconditionnel**, `force`
ignoré. Les `PedagogicalAsset` (grille, analyse, QCM…) : `upsert` inconditionnel
(`worker.ts:262-287`).

Gardes existantes, et leur portée réelle :

- **chemin signature seulement** : une pièce `signed` ou `sent_for_signature` n'est
  jamais régénérée (`signature-envoi.ts:415-434`) ;
- **matrice Qualiopi** : `checkDocumentReplacement` en mode unitaire, levé par
  confirmation + motif (`qualiopi-matrix.ts:669-689`) ;
- **pack de clôture et worker** : attestation et certificat seulement
  (`closure-pack.ts:295-317`, `worker.ts:192-222`) ;
- **aucune garde** sur « Préparer la formation » (`prepare-training.ts:180`, `:395`,
  `:444`), le DocDock (`dispatch-generate-doc.ts:88`, `:100`, `:109`), l'ajout d'un
  inscrit (`sessions.ts:211`), les boutons convention et AGEFICE, la relâche de
  signature (`signature-relacher.ts`).

L'empreinte de péremption d'une convention ne contient ni le rôle ni la forme
juridique (`source-fingerprint.ts:245-259`) : **un changement de rattachement ne
marque aucune pièce comme périmée.**

### Verdict

**Le passé n'est pas protégé par construction.** Il l'est pour ce qui s'ancre sur le
payeur de l'inscription (financeur, facture, dossier envoyé). Tout ce qui dérive du
rattachement est relu le jour de la régénération, par des générateurs qui effacent
d'abord.

### Appliqué à Katia — constat, pas un go

- **SES-0043** (04–14/01/2026, payée par son EI, AGEFICE) : aucun lecteur ne consulte
  le lien Century 21 pour cette inscription. Terminer le lien « agent commercial » ne
  change rien **aujourd'hui**. Mais la protection est **accidentelle** : elle tient au
  fait que le lien EI est principal. Si le lien « salariée » devenait principal,
  régénérer l'émargement, la grille, le QCM, les satisfactions ou l'analyse de
  janvier imprimerait « GCS Century 21 Immo d'azur » pour janvier.
- **SES-0116** (20/11/2026, payée par Century 21, SARL) :
  - le régime y est **déjà** la convention : une SARL relève de la convention quel que
    soit le rôle (`payer-rule.ts:79-80`). Corriger le rôle ne change pas cette pièce ;
  - **la demande AGEFICE se régénérera quand même** à chaque « Préparer » : son
    éligibilité vient du lien EI (`eligibilite.ts:37-46`), qui ne bouge pas.
    **Corriger le rôle ne retire pas la demande AGEFICE** ;
  - l'« entreprise » imprimée sur ses pièces sera son EI (lien principal), pas
    Century 21. Faux pour novembre, rôle corrigé ou non.
- **Deux liens vers Century 21** (agent commercial terminé + salariée) rendraient les
  12 `find` arbitraires. Sans effet sur le régime d'une SARL, mais faux dès qu'un
  payeur de forme solo a employé quelqu'un qui y fut d'abord agent.

⇒ Écrire la correction de rôle, seule, n'est **ni nécessaire** au régime de SES-0116,
**ni suffisant** pour son dossier AGEFICE, **ni sûr** pour janvier sans une résolution
datée. C'est à trancher avant d'écrire quoi que ce soit.

---

## 2. Proposition

Voir `260917-rattachement-date-proposition.md` : rattachement résolu à la date de la
session, `updateLegalLink`, refus en présence d'une pièce engagée, garde de
`deleteLegalLink`. Rien n'est écrit.

---

## 3. Mesures

### a. Liens « agent commercial » vers une organisation non solo — 257

Sur **274** liens AGENT_COMMERCIAL, **257** pointent vers une organisation qui n'est
ni EI, ni EIRL, ni auto-entrepreneur : **234 personnes, 44 organisations**.
Formes : AUTRE 178 liens (29 organisations) · SARL 60 (11) · SAS 13 (3) · SASU 6 (1).
151 de ces personnes ont aussi un lien EI.

**C'est d'abord le schéma normal** « enseigne + EI » d'un agent commercial immobilier :
ce compte mesure un motif, pas des erreurs.

Le **motif Katia exact** — l'organisation du lien « agent commercial » est aussi le
**payeur** d'une de ses inscriptions — : **36 personnes, 15 organisations**. Pour une
société, ces inscriptions relèvent de la convention quel que soit le rôle
(`payer-rule.ts:79-80`) ; le rôle n'y décide rien aujourd'hui.

| Organisation | Forme | Financeur | Agents liés | dont payés par elle |
|---|---|---|---|---|
| Imagimmo | AUTRE | OPCO_EP | 35 | 0 |
| Neyrat immo | AUTRE | OPCO_EP | 30 | 4 |
| Ambition | AUTRE | OPCO_EP | 17 | 0 |
| GCS Century 21 Immo d'azur | SARL | OPCO_EP | 16 | 1 |
| Meilleur taux | AUTRE | — | 15 | 0 |
| Sigma | AUTRE | OPCO_EP | 13 | 1 |
| ASHLEY PARKER | SARL | — | 11 | 0 |
| CONCEPT PATRIMOINE | SARL | AGEFICE | 10 | 1 |
| RIVIERA ESTATES | SAS | OPCO_EP | 10 | 10 |
| BIANCO INVEST ASSURANCES | SARL | — | 8 | 8 |
| Bianco Invest | AUTRE | ATLAS | 7 | 0 |
| KW HLC | AUTRE | OPCO_EP | 7 | 0 |
| LAdresse | AUTRE | OPCO_EP | 6 | 0 |
| Nestenn France | AUTRE | OPCO_EP | 6 | 1 |
| Riviera Keys | SASU | OPCO_EP | 6 | 1 |
| Habitat Concept Immo | SARL | OPCO_EP | 5 | 0 |
| OPTIMMO SARL | SARL | OPCO_EP | 5 | 0 |
| Solo | AUTRE | — | 5 | 0 |
| Laforet | AUTRE | OPCO_EP | 4 | 0 |
| Le Castel Real Estate | AUTRE | OPCO_EP | 4 | 0 |
| Octantimmo | AUTRE | OPCO_EP | 4 | 0 |
| Syndup | AUTRE | — | 4 | 0 |
| Solution Immobilier | AUTRE | — | 3 | 2 |
| CENTURY 21 MANDELIEU | AUTRE | — | 2 | 0 |
| Laforet Caen | AUTRE | OPCO_EP | 2 | 0 |
| Magrey and son | AUTRE | OPCO_EP | 2 | 0 |
| Nestenn Fréjus | AUTRE | OPCO_EP | 2 | 0 |
| NEYRAT Immobilier Chalon sur Saone | SAS | OPCO_EP | 2 | 2 |
| A.BC FINANCE | SARL | — | 1 | 1 |
| AGEFICE 06 | AUTRE | — | 1 | 0 |
| Albert 1er agence SARL | SARL | OPCO_EP | 1 | 1 |
| Ashley&Parker | AUTRE | — | 1 | 0 |
| Azur Loc Invest | AUTRE | — | 1 | 0 |
| BSK Immo | AUTRE | OPCO_EP | 1 | 0 |
| Concept patrimoine | AUTRE | — | 1 | 0 |
| CRYSTAL Piscine (DARCEL) | SARL | — | 1 | 1 |
| HOLDING ERIC PECOUL | SARL | — | 1 | 1 |
| IAD | AUTRE | OPCO_EP | 1 | 0 |
| Infinity Groupe | AUTRE | OPCO_EP | 1 | 0 |
| Locashop | AUTRE | — | 1 | 0 |
| MCH IMMOBILIER | SARL | OPCO_EP | 1 | 0 |
| Nestenn Vitrolles | AUTRE | OPCO_EP | 1 | 0 |
| SAS NS ANTIBES IMMOBILIER | SAS | OPCO_EP | 1 | 1 |
| TEAM PRIMOS (Le Castel Real estate) | AUTRE | OPCO_EP | 1 | 0 |

Les 36 personnes, nommées, sont dans la sortie brute. Anomalies vues en passant, **non
creusées** : un lien « agent commercial » vers **« AGEFICE 06 »** (un financeur
comme employeur) ; des doublons d'organisations sous deux graphies (« ASHLEY PARKER »
/ « Ashley&Parker », « CONCEPT PATRIMOINE » / « Concept patrimoine »).

### b. Multi-casquettes — 174 personnes, 55 sessions

- **371** personnes portent au moins un lien « porteur » (dirigeant, salarié, EI,
  agent commercial, alternant, stagiaire).
- **174** ont des liens porteurs vers **au moins deux organisations**.
- **159** d'entre elles ont des liens qui mènent à des financeurs (153) ou à des
  régimes (148) différents.
- Leurs inscriptions : **193 inscriptions sur 55 sessions**, dont **5 non terminées** :

| Session | Statut | Début | Inscrits concernés |
|---|---|---|---|
| SES-0101 | PLANNED | 27/07/2026 | 10 |
| SES-0102 | DRAFT | 28/07/2026 | 1 |
| SES-0099 | PLANNED | 28/09/2026 | 6 |
| SES-0112 | DRAFT | 09/11/2026 | 5 |
| SES-0116 | DRAFT | 20/11/2026 | 1 |

« Dépend du lien retenu » est un **potentiel** : le payeur, lui, est figé par
l'inscription (§1). La dépendance se matérialise là où le code lit le lien sans le
payeur — éligibilité AGEFICE, entreprise imprimée — et à chaque régime d'un payeur
de forme solo.

### c. Des sessions de part et d'autre d'un changement — 1 personne

Une seule personne a des inscriptions chez **deux financeurs différents** :
**Katia T.** — SES-0043 (04/01/2026, son EI, AGEFICE) puis SES-0116 (20/11/2026,
GCS Century 21 Immo d'azur, SARL, OPCO_EP). 7 personnes ont plusieurs payeurs ; les
6 autres restent chez le même financeur.

### d. `professionalStatus` — 44 valeurs distinctes pour 285 personnes

285 personnes sur 384 ont un statut saisi ; **44 valeurs distinctes**. Le champ mêle
**métiers** (agent immobilier, conseiller, courtier) et **statuts juridiques**
(salarié, agent commercial, gérant).

| Même chose | Graphies | Personnes |
|---|---|---|
| salarié | « salarié » 22 · « Salarié » 21 · « salarié immobilier » 2 · « salariée immobilier » 1 · « employé immobilier » 1 | **5 graphies**, 47 |
| agent commercial | « Agent commercial » 27 · « agent commercial » 15 · « AGENT COMMERCIAL » 11 · « Agent co » 2 · « Agent commercial immobilier » 1 | **5**, 56 |
| agent immobilier | « Agent immobilier » 45 · « agent immobilier » 22 · « Agent Immobilier » 3 | **3**, 70 |
| conseiller commercial | « conseiller commercial » 29 · « conseiller comemercial » 1 · « conseiller commerial » 1 | **3**, 31 |
| conseiller immobilier | « conseiller immobilier » 18 · « Conseiller Immobilier » 1 | **2**, 19 |
| dirigeant | « gérant » 9 · « Gérant » 4 · « gérante » 3 · « gérant immobilier » 1 · « dirigeant » 4 · « Dirigeant » 3 · « Dirirgeant » 1 · « dirigeant agence » 1 · « dirigeant courtier » 1 · « Dirigeant immobilier » 1 · « Chef d'entreprise » 1 | **11**, 29 |
| courtier | « courtier » 7 · « Courtier » 3 | **2**, 10 |
| valeurs isolées | Formateur 6 · Commerciale 5 · cadre 2 · Artisan · assistante · Coach · conjoint collaborateur · conseil entreprise · directeur · immobilier · manager immobilier · secretaire comptable · vidéaste | 13 valeurs, 23 |

Pour « salarié » précisément : « Salarié » et « salarié » cohabitent (21 et 22) ;
« Salariée » et « SALARIE » n'existent pas en base.

### e. Statut libre qui contredit le rattachement principal — 7

Jugeable seulement quand le texte relève d'un statut reconnaissable : **132
personnes** (salarié 47, agent commercial 56, dirigeant 29). Les 153 autres portent
un métier, sans contradiction possible.

- **7 contradictions** avec l'unique lien principal :

| Statut saisi | Personne | Lien principal |
|---|---|---|
| « Salarié » | Katia T. | EI_SELF → Katia Tchakmakjian [EI] |
| « salariée immobilier » | Mathilde S. | EI_SELF → Eric PECOUL [EI] |
| « salarié » | Antonin L. | AGENT_COMMERCIAL → Neyrat immo [AUTRE] |
| « salarié » | Bruno D. | AGENT_COMMERCIAL → Neyrat immo [AUTRE] |
| « salarié » | Léo M. | AGENT_COMMERCIAL → Neyrat immo [AUTRE] |
| « salarié » | Noémie D. | AGENT_COMMERCIAL → Neyrat immo [AUTRE] |
| « gérant » | Bastien N. | AGENT_COMMERCIAL → Neyrat immo [AUTRE] |

- **Non jugeables** : 37 personnes sans lien principal, **dont 30 « salarié »** ;
  9 avec plusieurs liens principaux.
- Les 4 salariés de Neyrat immo portent **à la fois** un lien SALARIE et un lien
  AGENT_COMMERCIAL principal : exactement le cas « deux rôles, un seul lu ».
- Mathilde S. a un lien **EI_SELF vers l'EI d'une autre personne** : anomalie à part,
  non creusée.

### f. Pièces déjà générées qui portent un statut libre

Le statut n'est stocké dans **aucun JSON de grille**. Ce qui se mesure :

| Pièce | Générées | Statut transmis à l'IA | Texte IA qui reprend littéralement le statut |
|---|---|---|---|
| Grille individuelle (`PedagogicalAsset` GRILLE_OBS) | 104 | **non** (prompt `:695-745`) | 10 — coïncidence de vocabulaire ou ancien prompt, non démontrable |
| Grille de session (`Document` GRILLE_OBS_SESSION) | **1** | oui (`:1250`) | non mesurable : PDF seul, pas de JSON |
| Analyse des besoins individuelle | 125 | oui (`:592`) | **83** |
| Positionnement | 76 | oui (`:830`) | **7** |

Littéral ≥ 5 caractères : borne basse pour les reformulations, faux positifs
possibles pour les métiers. Aucun PDF n'a été ouvert.

### Pour l'étape 2 (demandes AGEFICE)

- **190** personnes sont éligibles AGEFICE par un lien, quel que soit leur payeur.
- **15 inscriptions** payées par une société non AGEFICE sont pourtant éligibles
  AGEFICE (9 sessions).
- **6 demandes AGEFICE** existent déjà sur ce type d'inscription. Celle de Katia sur
  SES-0116 en fait partie.

---

## 4. Katia — l'état, rien d'écrit

| Lien | Rôle | Organisation | Principal | Dates | Créé le |
|---|---|---|---|---|---|
| `d1c7d1f7-…` | AGENT_COMMERCIAL | GCS Century 21 Immo d'azur — 89221099800019, SARL, OPCO_EP | non | aucune | 28/04/2026 |
| `8500fd19-…` | EI_SELF | Katia Tchakmakjian — 82106517400046, EI, AGEFICE | **oui** | aucune | 10/06/2026 — **ne bouge jamais** |

Les dates de création sont des dates de saisie, pas de carrière : le lien
Century 21 a été saisi en avril, **après** la session de janvier.

| Inscription | Session | Payeur | Pièces en base |
|---|---|---|---|
| `3b791d8b-…` | SES-0043, COMPLETED, 04–14/01/2026, PROD-0042 72 h, 3 024 € | son EI (AGEFICE) | AGEFICE (25/05), attestation ×2, certificat ×2, CONVENTION (18/06) ; grille, QCM, analyse, positionnement, satisfactions, émargement |
| `25a4490b-…` | SES-0116, DRAFT, 20/11/2026, PROD-0062 8 h, 120 € | Century 21 (OPCO_EP) | convocation, **AGEFICE** (17/09 10:17 UTC) |

- Sur les deux inscriptions : **aucun dossier de prise en charge**, aucune demande de
  signature, aucune facture, aucun e-mail tracé qui cite leurs pièces.
- ⚠ La base ne compte que **5 e-mails tracés au total** : l'absence de trace ne
  prouve pas qu'aucune pièce n'est partie, en particulier la demande AGEFICE de
  janvier (25/05). À confirmer avec Laurent avant l'étape 2.

**Dry-run préparé, pas lancé** (`260917-katia-rattachement-dry-run.sql`). Il affiche :
① les liens avant, ② les liens après (fin du lien agent commercial la veille du
salariat, nouveau lien SALARIE non principal ; lien EI inchangé), ③ pour chaque
inscription, le rôle vers le payeur avant et **à la date de la session**, et
l'éligibilité AGEFICE selon la règle actuelle, ④ les pièces et ce qui les engage. Il
est **inexécutable** tant que la date n'est pas saisie (`'AAAA-MM-JJ'::date`). Son
en-tête rappelle le prérequis : aucune écriture tant que les lecteurs du lien ne
résolvent pas par date.

---

## 5. Gates

Jouées dans le worktree `files-lien-juridique`. Son `.env` pointe la base **locale**
`qualiof_test`, comme la CI ; il ne contient aucune URL de production.

| Gate | Résultat |
|---|---|
| `pnpm lint` | ✅ 0 |
| `tsc --noEmit` web / db / shared | ✅ 0 / 0 / 0 |
| `pnpm test` | ✅ web 360 fichiers, 3 879 tests, 2 ignorés (catalogue conditionnel) · db 223 · shared 208 |

- `faros-non-importable.test.ts` : absent de la branche, qui part de `main`.
- ⚠ `qualiof_test` a **8 migrations de retard** sur `main` (depuis le 10/09). Elles
  n'ont pas été appliquées (consigne « aucune migration »). Les 2 tests d'intégration
  base (`dedupe.merge`, `invoices-lines-contract`) passent malgré tout.

## Ce qui a été cherché — et ce qui ne l'a pas été

- **Cherché** :
  - tous les lecteurs de `legalLinks`, `professionalStatus`, `sponsorOrg`,
    `financingMode` et `participantType` dans `apps/web/src` (3 lectures parallèles,
    lignes décisives revérifiées à la main) ;
  - les gardes de régénération ;
  - l'usage des dates de lien ;
  - les mesures a–f en production, en lecture seule.
- **Pas cherché** :
  - le contenu des PDF déjà générés (seul `rawJson` est lu) ;
  - l'inférence du rôle depuis le statut dans les scripts de synchro SmartOF
    (`import-from-smartof.ts`, `sync-smartof-1208.ts`), repérée mais non mesurée ;
  - les anomalies Mathilde S. / AGEFICE 06 / doublons d'organisations ;
  - l'envoi hors application des pièces AGEFICE.
