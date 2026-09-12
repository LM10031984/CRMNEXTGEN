# Journal de recette C.3 — aperçu Vercel, 11/09/2026

Testeur : Laurent (toutes les adresses = laurent@start-academy.fr). Session témoin
DEMO-SIG-01 (`scripts/recette-apercu-seed.sh`), pièce : Convention — Provence
Immobilier (2 participants), ordre 1. Paul DURAND (client) · 2. Laurent MARX (OF).

## Préparation — ce qu'il a fallu corriger avant de pouvoir jouer

| Constat | Cause | Correction |
|---|---|---|
| Récap : « n'a pas pu être régénérée … fetch failed » | `WEASYPRINT_URL` n'existait qu'en Production | ajoutée en Preview (domaine public Railway), redeploy |
| Envoi : « DocuSeal POST /submissions/pdf → 401 Not authenticated » | `DOCUSEAL_API_KEY` Preview ≠ clé du compte EU | clé re-copiée depuis console.docuseal.eu → Preview, redeploy |
| Base d'aperçu vide (compte admin présent, 0 session) | migrations passées, jamais seedée | `scripts/recette-apercu-seed.sh` (seed + démo + emails de recette) |
| Porte webhook | — | `curl` → 401 `signature-invalide` ✓ (bypass + secret `whsec_` OK) |

Réglages aperçu : Envois d'emails en mode test, seule catégorie « Signature
électronique » cochée, seule session DEMO-SIG-01 autorisée ; signataire OF =
Laurent MARX / laurent@start-academy.fr (posé par le script).

## Le parcours

| # | Attendu | Constaté |
|---|---|---|
| 1 | Récap, aperçu avec ancres, ordre 1. client · 2. OF | ✅ « Pièce régénérée à l'instant avec ses zones de signature », badge « Partira » |
| 2 | « Email envoyé à … », cellule « En attente » | ✅ « envoyée en signature — Email envoyé à laurent@start-academy.fr », lien docuseal.eu/s/… |
| 3 | Email « Convention à signer » | ✅ reçu (Laurent) |
| 4 | Retour client → PARTIALLY_SIGNED | ✅ moteur : DocuSeal `form.completed` → OK 200 ; Historique 16h01 `signature.signer_completed` + `signature.notified` |
| 5 | Email « À votre tour de signer » | ✅ reçu (Laurent), signé depuis ce lien — sur mobile : page DocuSeal blanche au 1er chargement, OK ensuite (côté DocuSeal) |
| 6 | Lien « Signer maintenant » sur la ligne OF | ❌ **DÉFAUT** — voir ci-dessous |
| 7 | OF signe → `submission.completed` | ✅ Historique 16h08 : `signature.signer_completed`, `signature.completed`, 2× `signature.notified` |
| 8 | Sans rien faire, cellule verte « Signé » | ✅ (fiche rechargée) |
| 9 | Email « Votre exemplaire signé », 2 PJ (PDF + audit-trail) | ✅ reçu (Laurent) |
| 10 | Cloche ADMIN « signature.completed » | ❌ **DÉFAUT D-C3-2** — la ligne Notification est écrite, la cloche ne la lit pas |
| 11 | Télécharger → PDF SIGNÉ, panneau de signature Adobe | ✅ Adobe Reader : « Signé au moyen de signatures valables », source de confiance **AATL**, tampon temporel, 2 signatures visibles (Paul DURAND 18:01, Laurent MARX 18:08) — `11-adobe-panneau-signatures.png` |

## Verdict

Le parcours de bout en bout FONCTIONNE sur l'aperçu (moteur, DocuSeal, webhook
HMAC, emails, PDF signé AATL). Deux défauts d'ÉCRAN bloquent la fusion :
D-C3-1 (état par signataire + lien « Signer maintenant ») et D-C3-2 (cloche).
À corriger, puis rejouer les étapes 4, 6 et 10 sur l'aperçu (un nouvel envoi
DocuSeal suffit ; pas besoin de refaire 9 et 11).

Reste à faire après fusion : `MAIL_DRY_RUN` Preview → `true`, retirer le
webhook DocuSeal de l'aperçu, remettre la clé/URL webhook en Production.

## Défauts relevés

### D-C3-1 — le bloc Signature n'affiche pas l'état par signataire (étape 6)

Après la signature du client, la ligne reste « En attente de signature », sans
« Paul DURAND a signé le … », **sans le lien « Signer maintenant » de l'OF**, et
avec la phrase périmée `PHRASE_AUCUN_EMAIL` (« l'envoi automatique des emails aux
signataires arrive au lot C.2c ») — faux depuis C.2c.

Où : `apps/web/src/components/sessions/signature/bloc-signature.tsx` (état
`ENVOYE` rendu sans lire `signers`) ; les briques existent déjà dans
`lib/sessions/ordre-signataires.ts` (`ordreSignatairesEnvoyes`,
`mentionAttenteOf`, `signerMaintenant`) mais ne sont utilisées que par le récap.

À faire : faire remonter `signers` (rang, aSigne, signedAt, signUrl) dans
`bloc-signature-vue.ts`, rendre sur la ligne « 1. Paul DURAND — signé le … · 2.
Laurent MARX — [Signer maintenant] », remplacer `PHRASE_AUCUN_EMAIL` par la
phrase vraie (« Email envoyé à … le … » / `mentionAttenteOf`). Test de câblage
via `page.tsx` (règle projet).

### D-C3-2 — la cloche n'affiche pas `signature.completed` (étape 10)

`prevenirAdmins` (signature-retour.ts) écrit bien une ligne `Notification`
type `signature.completed` par ADMIN, mais `getNotifications()`
(`server/actions/notifications.ts`) ne lit que `type: 'lead.assigned'` et
`NotificationKind` ne connaît pas la signature. Résultat : cloche muette.

À faire : ajouter la source `signature.completed` (schéma de payload zod,
libellé « Convention — Provence Immobilier signée par tous », href vers la fiche
session `?tab=avant`, `markNotificationRead` réutilisé). Test de câblage.

### Observations sans action

- Les deux emails « exemplaire signé » sont partis (2 signataires = 2 emails) ;
  ici même adresse pour les deux, normal.
- DocuSeal sur mobile : page blanche au premier chargement du lien, OK au
  second — côté prestataire, à surveiller sur un vrai envoi.

---

## Suite — les deux défauts d'écran, corrigés le 11/09/2026

Branche `feat/signature-docs-signes`, commits `test(signature-c3-ecran)` puis
`feat(signature-c3-ecran)`. Gates : `pnpm lint` ✓ · `tsc --noEmit` ✓ ·
`pnpm test` ✓ (3107 web · 201 shared · 20 db, 0 échec).

### D-C3-1 — l'état par signataire

`SignatureRequest.signers` remonte jusqu'à la fiche session : jointure sur le
`findMany` qui chargeait déjà les documents (aucune requête de plus), relecture
par `parseSignatureSigners`, rangement par camp par `signatairesDeLaDemande` —
**extrait** de `signature-retour.ts` vers `envoi-contrats.ts` plutôt que
recopié, pour que l'écran ne puisse pas désigner un camp différent des emails.

Ce que la ligne d'une pièce partie affiche désormais :

- l'ordre **RÉEL** (`ordreSignatairesEnvoyes`) au lieu de l'ordre prévu, qui
  annonçait « personne n'a signé » quoi qu'il se soit passé chez le prestataire ;
- « a signé le 11/09/2026 à 18:01 » par rang — fuseau `Europe/Paris` fixé, une
  heure de signature étant une donnée de preuve ;
- le lien **« Signer maintenant »** de l'organisme quand son tour est venu. Ni
  grisé ni masqué : `signerMaintenant` reste adossé au `signedAt` du client ;
- quand le lien n'est pas là, la phrase qui dit pourquoi, en nommant l'attendu.

Trois phrases périmées réécrites : `PHRASE_AUCUN_EMAIL` (supprimée, remplacée
par `mentionAttentePiece`), `mentionAttenteOf` et `MENTION_RETOUR_AUTOMATIQUE`
ne promettent plus un branchement déjà livré. Cas nommé en plus : une demande
dont la colonne Json ne porte aucun signataire lisible — `parseSignatureSigners`
écarte en silence — a sa propre phrase, au lieu d'une pièce « en attente » de
personne.

### D-C3-2 — la cloche

`getNotifications()` filtrait `type: 'lead.assigned'` en dur. Le filtre porte
les **deux** types, le payload est relu par `SignatureCompletedPayloadSchema`
(champ neuf optionnel avec défaut — règle de la colonne Json), et le libellé
comme la destination viennent d'un module pur : l'attestation d'assiduité ouvre
l'onglet « Après », les panneaux d'onglet inactifs étant rendus `hidden`.
`markNotificationRead` est réutilisé tel quel.

### Mutations exécutées — dix, toutes rouges

| # | Mutation | Ce qui rougit |
|---|---|---|
| 1 | retirer `signataires` de l'appel dans `page.tsx` | `tsc` — TS2769 |
| 2 | y substituer `signataires: []` (compile !) | test de câblage, 3 assertions |
| 3 | la vue retombe toujours sur l'ordre PRÉVU | vue : date, lien OF **et** phrase d'attente |
| 4 | retirer le lien « Signer maintenant » du rendu | écran (e) |
| 5 | retirer la date de signature du rendu | écran (e), 2 tests |
| 6 | retirer `ligne.attente` du rendu | écran (c) |
| 7 | remettre `type: 'lead.assigned'` en dur | cloche, Test 4 |
| 8 | remplacer le filtre par le seul `signature.completed` | cloche, Test 4 (l'autre sens) |
| 9 | onglet de la cloche toujours « avant » | module pur **et** action, 2 tests |
| 10 | remettre la phrase « branché au lot C.3 » | 4 tests, sur 3 fichiers |

La mutation n°3 n'a d'abord fait rougir qu'une seule assertion : le test a été
**renforcé** (la phrase d'attente doit changer de main quand le client a signé)
avant de la rejouer.

### Ce qui reste à faire sur l'aperçu

1. Rejouer **les étapes 4, 6 et 10** — un nouvel envoi DocuSeal suffit ; 9 et 11
   n'ont pas à être refaits, ils ne dépendaient d'aucun des deux défauts.
2. Puis les réglages de sortie d'aperçu déjà listés plus haut : `MAIL_DRY_RUN`
   Preview → `true`, retrait du webhook DocuSeal de l'aperçu, clé et URL webhook
   remises en Production.

## Rejeu du 12/09/2026 après corrections (commits 8e76e2ae → 03d32239, aperçu redéployé)

Pièce : Convention — DEMO-SIG BERNARD Julien (EI) (TNS AGEFICE, EI_SELF), adresse
de Julien passée à laurent@start-academy.fr depuis la fiche apprenant.

| # | Attendu | Constaté |
|---|---|---|
| 4 | Retour client → état par signataire sur la ligne | ✅ « 1. Julien DEMO-SIG BERNARD — laurent@… · a signé le 12/09/2026 à 07:29 » (D-C3-1) |
| 6 | Lien « Signer maintenant » sur la ligne OF | ✅ lien docuseal.eu/s/… + « Il ne manque plus que la signature de Laurent MARX pour l'organisme de formation… » (D-C3-1) |
| 10 | Cloche ADMIN | ✅ « Convention signée par tous les signataires… » (D-C3-2, sur la signature de la veille) |

Observations : la ligne à l'état SIGNÉ (Provence Immobilier) affiche l'ordre prévu
sans les dates de signature — acceptable, non bloquant. Fiche organisation d'une EI
(DEMO-SIG BERNARD Julien) : l'encart « Aucune adresse email pour Julien BERNARD,
responsable… aucune convention ne peut partir » contredit le moteur, qui prend
l'adresse de l'apprenant lui-même (EI_SELF) et envoie bien — message à aligner
sur la cascade EI (D-C3-3, mineur, à prendre au lot D ou H).

Étape 7-8 (rejeu) : OF signé depuis « Signer maintenant » → ligne Julien au vert « Signé » ✅.

**Recette C.3 ACCEPTÉE le 12/09/2026.** Sortie d'aperçu : `MAIL_DRY_RUN` Preview
remis à `true` (12/09, pris au prochain déploiement). Reste au moment de la
fusion : retirer le webhook DocuSeal de l'aperçu et poser en Production
`DOCUSEAL_*` (clé du compte EU, `whsec_` d'un webhook prod sans bypass, URL
`https://<prod>/api/webhooks/docuseal`), `WEASYPRINT_URL` déjà en prod.

## Mise en prod (12/09/2026)

PR #55 fusionnée (squash 099828f) après résolution des conflits avec main ; Vercel
prod Ready, « Deploy migrations #68 » vert (11 migrations additives). Variables
Production posées : SIGNATURE_PROVIDER, DOCUSEAL_BASE_URL (config),
DOCUSEAL_API_KEY, DOCUSEAL_WEBHOOK_SECRET (secrets, collés par Laurent) ; webhook
DocuSeal basculé sur https://qualiof.vercel.app/api/webhooks/docuseal ; curl →
401 signature-invalide ✓. DocuSeal Pro souscrit.

### D-C3-4 — bloc muet quand aucun participant n'a de régime (constaté prod SES-0112)

5 apprenants « Agence », conventions individuelles, bloc Signature réduit à la
zone de dépôt : `regle === null` pour tous (financeur absent sur le commanditaire
ou commanditaire absent) → aucune pièce, et AUCUN avertissement faute de signal
(pas de lien EI_SELF, pas d'autre org ouvrant la pièce). Le cas Marion sans son
signal. À faire : quand `financeurSansRegime` est vrai pour un participant, le
bloc affiche « Aucun financeur renseigné pour {commanditaire} → rien à signer »
avec le lien vers la fiche organisation (même mécanique que
`composerAvertissementRegime`), ou « inscription sans commanditaire » avec le
lien vers l'inscription.

**Correctif D-C3-4, cause réelle** : ce n'était pas un défaut de données mais un
**backfill manquant** — la migration `signature_regime_financement` est additive,
les trois colonnes SignerRole d'OpcoCatalog étaient NULL en prod pour les 6
financeurs (le seed ne tourne qu'en local/aperçu). Rattrapé le 12/09 par
`packages/db/scripts/backfill-signer-roles.ts` (SEED_ALLOW_PROD=1, colonnes
signer uniquement, avant/après affiché). SES-0112 affiche désormais 10 pièces
(5 conventions EI + 5 dossiers AGEFICE). Leçon pour /prod : une migration qui
ajoute une colonne de règle métier doit venir avec son backfill (ou un seed
idempotent lancé au déploiement). L'amélioration « bloc muet → dire pourquoi »
reste utile (financeur vraiment absent) et garde le numéro D-C3-4.

### D-C3-5 — le certificat de signature n'est pas téléchargeable depuis l'écran

`SignatureRequest.auditTrailUrl` est bien renseigné (signature-retour.ts télécharge
et stocke le certificat en bucket, et l'envoie en PJ de « Votre exemplaire signé »),
mais aucune ligne SIGNÉ n'offre de lien « Certificat de signature ». À faire au
lot D (le dossier AGEFICE l'embarque) : lien à côté de « Ouvrir » sur une ligne
signée, servi par une route équivalente à /api/documents/[id] avec nom parlant
`…audit-trail.pdf`.

## Lot D — les trois défauts d'écran soldés (12/09/2026, `feat/signature-lot-d`)

Branche partie d'`origin/main` à jour. ⚠ Le dernier commit de
`feat/signature-docs-signes` (`5785996b` — script `backfill-signer-roles.ts` et
entrée D-C3-4 ci-dessus) n'était PAS dans `origin/main` : la PR #55 a été
fusionnée en squash AVANT lui. Il a été reporté par cherry-pick, sans quoi le
rattrapage de production joué le 12/09 aurait disparu du dépôt.

### D-C3-3 — RÉSOLU

La fiche organisation appelait `resoudreRepresentantEntreprise`, le chemin des
AGENCES, pour une entreprise individuelle dont l'apprenant signe. Elle suit
désormais la cascade EI_SELF, dans le même ordre que le moteur (`estEiSelf`
avant `representative`). Le critère est le **rôle du `LegalLink`**, celui que
`estEiSelfChezSponsor` lit aussi — pas `legalForm === 'EI'`, qui aurait été un
second critère pour une même question. Message d'absence d'adresse réécrit : il
envoie vers la **fiche apprenant**, jamais vers « le contact qui porte ce nom »,
qui n'existe pas sur ce chemin.

### D-C3-4 — RÉSOLU

Le moteur a raison de se taire quand `regle === null` : il n'a rien
d'INCOHÉRENT à signaler. C'est la VUE qui parle désormais — elle seule voit la
différence entre « rien à signer » et « on ne sait pas quoi signer ».
`construireVueSignature` reçoit `participants` (prop OBLIGATOIRE) et compose un
encart par inscrit laissé de côté, avec la MÊME mécanique de lien que
l'avertissement de régime. La condition `muet` du bloc intègre le cas : c'est
là que SES-0112 s'était joué — avec zone de dépôt le bloc s'affichait mais
réduit, sans elle il disparaissait.

### D-C3-5 — RÉSOLU

Route `GET /api/signature-requests/[id]/audit-trail` (décalquée de
`/api/documents/[id]` : auth, scope tenant, 404 indiscernable, redirection
Supabase / proxy MinIO, `?dl=1`, `no-store`) et lien « Certificat de signature »
À CÔTÉ d'« Ouvrir ». Le lien n'existe que s'il mène quelque part : un scan
déposé à la main est signé sans qu'aucun certificat existe.

⚠ **Défaut trouvé en cours de lot** : deux certificats d'un même dossier
portaient le même nom de fichier (un dossier AGEFICE porte deux demandes). Le
nom porte désormais la pièce couverte — `Certificat-de-signature-Convention-…`
vs `Certificat-de-signature-Dossier-AGEFICE-…`.

### Ce qui reste à jouer sur l'aperçu

Le lot D n'a pas été rejoué en recette : les trois gates sont verts
(lint, `tsc`, 3636 tests) et toutes les mutations exécutées sont rouges, mais
aucun envoi RÉEL n'a été fait depuis ces changements. À vérifier à la
fusion :

1. **Le certificat se télécharge** depuis une ligne signée, et porte le nom
   attendu — c'est le seul point où la redirection Supabase peut encore faire
   perdre le nom.
2. **Un dossier AGEFICE composé** porte bien les pièces SIGNÉES, ses deux
   certificats sous deux noms distincts, et le point d'accueil en destinataire.
3. **L'alerte J-15** : au premier passage du cron horaire, vérifier qu'elle ne
   part PAS en masse sur l'historique (la fenêtre est bornée aux sessions à
   venir, mais aucune n'a encore de `Task` marqueur).
