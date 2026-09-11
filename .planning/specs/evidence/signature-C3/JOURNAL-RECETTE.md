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
