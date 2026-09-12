# Quick 260910-jxr — Le certificat de signature DocuSeal en français

**Date :** 2026-09-10
**Demandeur :** Laurent
**Mode :** quick (recherche déjà faite en session — dépôt `docusealco/docuseal` branche master, OpenAPI `console.docuseal.com/openapi.yml`, et le certificat réel du test d'acceptation du 10/09)

## Le constat qui déclenche cette tâche

Le certificat de signature émis le 10/09/2026 sur l'envoi 1619115
(`.planning/specs/evidence/signature-B/1619115-certificat-de-signature.pdf`) est
**intégralement en anglais** : « DocuSeal Audit Log », « Envelope ID », « Original
SHA256 », « Generated at: September 10, 2026 at 12:29 PM CEST », « Event Log »,
« Form viewed by », « Submission completed by ».

Ce n'est pas cosmétique. Ce document est la pièce que **l'AGEFICE réclame** pour
établir la valeur probante de la signature (c'est le critère qui a fait choisir
DocuSeal contre Yousign, décision O-2 de la spec du 2026-09-04). Une pièce
justificative en anglais dans un dossier de financement français s'expose à un
retour du financeur.

## Ce qui est établi (à ne pas re-vérifier)

**DocuSeal sait produire ce certificat en français.**
`lib/submissions/generate_audit_trail.rb` ligne 39 :
`I18n.with_locale(last_submitter.metadata.fetch('lang', account.locale)) do`.
Tous les libellés passent par `I18n.t`, et la locale française est complète
(`config/locales/i18n.yml` l. 3397 `fr:` et l. 8813 `fr-FR:` ; `config/application.rb`
l. 44 déclare les deux dans `available_locales`) : « Journal d'audit », « ID de
l'enveloppe », « SHA256 d'origine », « Généré le », « Journal des événements »,
« Formulaire consulté par », « Soumission terminée par »…

**Deux leviers, de portées différentes — et il faut les deux :**

| Levier | Où | Ce qu'il traduit | Qui l'actionne |
|---|---|---|---|
| `submitters[].metadata.lang` | à la création de l'envoi, par appel API | **les libellés seulement** | le code (cette tâche) |
| `account.locale` | console DocuSeal, écran « Langue » | les libellés **et les dates** | le responsable de traitement, **à la main** |

Pourquoi les dates échappent au premier levier : `I18n.l(..., locale: account.locale)`
est **codé en dur** ligne 234 (« Generated at ») et ligne 530 (chaque horodatage du
journal d'événements). Aucun paramètre d'envoi ne peut les atteindre.

Pourquoi le poser sur **tous** les signataires : la locale est lue sur le **dernier
signataire ayant complété**. Ne la poser que sur le client rendrait le résultat
dépendant de l'ordre réel de signature.

**Limites résiduelles, intraduisibles par quelque levier que ce soit** (chaînes en dur
dans `generate_audit_trail.rb`) : `User agent:` (l. 305), `Time zone:` (l. 306), et le
motif de signature du PDF `Signed with DocuSeal.com` (l. 542, méthode `sign_reason`).
`IP:` est identique en français.

**`metadata` est bien un paramètre documenté** de `POST /submissions/pdf` :
`.agents/skills/docuseal-code/references/api/create-a-submission-from-pdf.md` l. 43 —
`submitters[].metadata` `object`. Aucun paramètre inventé (garde-fou projet).

## Tâches

### Tâche 1 — `metadata.lang = 'fr-FR'` sur chaque signataire, verrouillé par un test

**Fichiers**
- `apps/web/src/lib/signature/docuseal.ts` (fonction `createRequest`, construction de `submitters`)
- `apps/web/src/lib/signature/__tests__/docuseal.test.ts`

**Action**

Dans `createRequest`, le `.map()` qui construit chaque submitter (l. 170-179) gagne
`metadata: { lang: 'fr-FR' }`, à côté de `send_email: false`. C'est le **seul** endroit
de QualiOF qui construit un submitter DocuSeal (vérifié par grep : `dry-run.ts` ne
touche pas l'API, `smoke-docuseal-sandbox.ts` ne fait que **lire** les submitters d'une
réponse) — donc un seul point de pose, aucun risque d'oubli ailleurs.

Le commentaire au-dessus suit le style du fichier (citer la décision et le *pourquoi*,
pas le *quoi*) et doit dire trois choses, faute de quoi le prochain lecteur croira le
problème réglé :
1. **pourquoi** : le certificat est une pièce du dossier AGEFICE, il doit être lisible
   par le financeur ;
2. **pourquoi sur tous les signataires** : DocuSeal lit la langue du *dernier signataire
   ayant complété* ;
3. **ce que ça ne couvre pas** : les horodatages, qui suivent la langue du **compte** —
   réglage manuel dans `console.docuseal.eu`, tracé dans `docs/rgpd/dpa/docuseal.md`.

`fr-FR` en constante littérale, pas en variable d'environnement : QualiOF est un CRM
d'organisme de formation français, ses signataires signent des conventions de droit
français. Ce n'est pas un réglage d'exploitation.

Côté test, deux ajouts dans `describe('DocuSeal — createRequest')` :
- une assertion que **tous** les submitters du corps posté portent
  `metadata.lang === 'fr-FR'` (`.every()`, comme le test `send_email` juste au-dessus —
  c'est la formulation qui casse si un seul signataire est oublié) ;
- l'en-tête du fichier complété : un point 5 dans « Ce qui est verrouillé ici », et une
  ligne dans le bloc **PROTOCOLE DE MUTATION** — retirer `metadata.lang` d'un seul
  signataire dans `docuseal.ts` doit faire passer ce test ROUGE.

Ne pas modifier `CREATE_RESPONSE` : c'est la réponse réelle relevée le 04/09/2026, elle
décrit ce que l'API **répond**, pas ce qu'on lui **envoie**. Le test porte sur le corps
de la requête (`fetchMock.mock.calls[0][1].body`).

**Verify**
```
pnpm --filter @qualiof/web test src/lib/signature/__tests__/docuseal.test.ts
```
puis les gates du dépôt : `pnpm lint` et `pnpm test` (suite complète verte ; il n'y a
pas de script `typecheck` — `turbo.json` n'expose que build/dev/lint/test/db:generate,
la vérification de types passe par `pnpm --filter @qualiof/web build` si un doute subsiste).

**Done**
Le corps posté sur `/submissions/pdf` contient
`"metadata":{"lang":"fr-FR"}` sur **chacun** des deux submitters, le nouveau test est
vert, les 8 tests `createRequest` préexistants aussi, et retirer la ligne d'un seul
submitter fait tomber le nouveau test.

### Tâche 2 — La fiche sous-traitant dit ce qui est fait, ce qui reste à faire à la main, et ce qui restera en anglais

**Fichiers**
- `docs/rgpd/dpa/docuseal.md`

**Action**

Cette fiche est le document qui sera opposé lors d'un contrôle : elle doit refléter
l'état réel, y compris ce qui **n'est pas** couvert par le code. Trois inscriptions.

1. **Dans « Mesures techniques côté QualiOF »** — une puce, sur le modèle des puces
   existantes (« Aucun email envoyé par DocuSeal », « Webhooks authentifiés »…) :
   le certificat de signature est **demandé en français** à la création de chaque envoi
   (`metadata.lang = "fr-FR"` sur chaque signataire), parce que c'est une pièce
   justificative destinée à un financeur français. Portée : les libellés.

2. **Dans « Points ouverts / limites »** — une entrée ⚠ **action manuelle du responsable
   de traitement** : régler la langue du compte sur **Français** dans
   `console.docuseal.eu` (écran des paramètres de compte). Sans ce réglage, **les
   horodatages du certificat restent au format anglais** (« September 10, 2026 at
   12:29 PM CEST »), car ils sont formatés avec la langue du compte et non celle de
   l'envoi. À dater une fois fait, comme l'a été la création du compte UE au point 3.

3. **Dans « Points ouverts / limites »** — une entrée **limites résiduelles** : même
   compte réglé en français, trois chaînes restent en anglais dans le certificat, faute
   d'être traduisibles chez le prestataire : `User agent:`, `Time zone:`, et le motif de
   signature apposé dans le PDF, `Signed with DocuSeal.com`. Le noter explicitement
   évite qu'un futur lecteur reprenne l'enquête à zéro en voyant de l'anglais résiduel.

Enfin, **« Date de vérification »** : ajouter `2026-09-10 (langue du certificat de
signature)` à la suite de la mention du 2026-09-04, sans effacer celle-ci.

Rédaction en français, format du tableau et des puces inchangé.

**Verify**
```
grep -c "metadata.lang\|fr-FR" docs/rgpd/dpa/docuseal.md          # >= 2
grep -c "User agent:\|Time zone:\|Signed with DocuSeal.com" docs/rgpd/dpa/docuseal.md   # 3 chaînes citées
grep -c "console.docuseal.eu" docs/rgpd/dpa/docuseal.md            # la console est nommée
grep -c "2026-09-10" docs/rgpd/dpa/docuseal.md                     # date de vérification à jour
```

**Done**
Un lecteur qui ouvre la fiche sans connaître le dossier comprend en une lecture : (a) que
le code demande le français, (b) qu'il reste **une** action à faire dans la console et ce
qu'il en coûte de ne pas la faire, (c) que trois chaînes resteront en anglais quoi qu'il
arrive.

## Ce que cette tâche ne fait pas

- **Ne touche pas au `.env.example`** : `fr-FR` est une constante métier, pas un réglage
  d'exploitation. Aucune nouvelle variable d'environnement.
- **Ne touche pas au schéma Prisma** ni à la spec
  `.planning/specs/2026-09-04-signature-electronique-docs-signes.md` : c'est une
  correction d'exécution, pas une décision d'architecture — donc pas de nouveau `D-nn`.
- **N'invente aucun paramètre d'API** : seul `metadata`, documenté par la référence
  DocuSeal du dépôt, est ajouté. Rien sur `locale`, `language` ou autre champ supposé.
- **Ne modifie pas `docs/rgpd/REGISTRE-TRAITEMENTS.md`** : la langue du certificat ne
  change ni la finalité du traitement, ni les données transmises, ni la durée de
  conservation.
- **Ne régénère pas** le certificat du test d'acceptation du 10/09
  (`.planning/specs/evidence/signature-B/1619115-certificat-de-signature.pdf`) : il reste
  la preuve horodatée de l'état **avant** correction.
- **Ne règle pas la langue du compte** : c'est une action hors code, dans
  `console.docuseal.eu`, qui appartient au responsable de traitement — la tâche 2 se
  contente de la consigner comme action ouverte.
- **N'ajoute pas de test d'intégration réseau** : la suite `docuseal.test.ts` est
  hermétique (`global.fetch` mocké), un envoi réel enverrait de vrais emails.
