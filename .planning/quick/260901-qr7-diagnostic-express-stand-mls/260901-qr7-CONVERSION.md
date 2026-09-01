# Quick 260901-qr7 — Volet CONVERSION (addendum au PLAN)

**Écrit le 2026-09-01** — J-8 avant les 25 ans du MLS (mercredi 9 septembre, 18h-23h).
**Objet :** le PLAN livre un aimant à leads. Ce document livre la machine à signer.
**Périmètre :** ce qui manque au parcours pour transformer un scan de QR en client, plus les
pièges vérifiés qui peuvent faire rater la soirée.

> Le code technique est traité en parallèle (catalogue-map, programme-sur-mesure, worker).
> Ce document ne le redouble pas : il ajoute la couche commerciale et les garde-fous.

---

## 1. Le constat

Une soirée d'anniversaire à 19 h, un verre à la main : intention faible, sociabilité forte.
**Personne ne signe une formation ce soir-là.** Le stand ne vend pas — il achète le droit
d'appeler, et il fabrique la raison de décrocher.

Or le parcours s'arrête aujourd'hui sur *« On vous rappelle dans les jours qui viennent »*.
C'est exactement la phrase qui produit, le 15 septembre, un appel qui sonne dans le vide.

---

## 2. Les trois leviers, par ordre de rendement

### Levier 1 — L'engagement de rappel pris SUR LE STAND

Trois boutons, un seul tap, sur l'écran de résultat, **avant** le formulaire de contact :

> **Quand peut-on vous appeler pour caler votre journée ?**
> `[ Cette semaine ]` `[ La semaine prochaine ]` `[ Plus tard — juste le programme ]`

Pourquoi c'est le plus rentable des trois : l'appel du 10 septembre ne s'ouvre plus par
« bonjour, je me permets de vous appeler » mais par **« vous m'avez dit cette semaine »**.
Ce n'est plus du démarchage, c'est un rendez-vous tenu. Et le tri des leads se fait tout seul,
par le prospect lui-même.

Corollaire : si le prospect choisit « cette semaine », **le téléphone devient obligatoire**.
Aujourd'hui il est facultatif — or un lead « chaud » sans numéro est un lead mort.

### Levier 2 — Le financement chiffré, pas la promesse floue

L'email dit aujourd'hui : *« c'est souvent pris en charge en totalité »*.
**C'est faux dans la majorité des cas**, et ça se retourne au premier appel.

Chiffres AGEFICE 2026 (source : communication-agefice.fr, plafonds 2026 et étapes clefs 2026) :

| Élément | Valeur 2026 |
|---|---|
| Présentiel | **42 €/h** |
| Distanciel synchrone | 35 €/h |
| Enveloppe annuelle | **3 000 €/an** (5 000 € si titre RNCP ; 600 € si CFP < 7 €) |
| **Une journée de 8 h** | **336 € pris en charge** |
| Dépôt du dossier | **au plus tard 15 jours calendaires avant** le début (et au plus tôt 4 mois avant) |
| Enveloppe | **annuelle** — ce qui n'est pas consommé au 31/12 est perdu |

La bonne phrase, honnête et bien plus vendeuse que la promesse floue :

> « Votre enveloppe formation 2026, c'est 3 000 €. Elle repart à zéro le 1er janvier.
> Pour l'utiliser, le dossier doit partir 15 jours avant la formation — concrètement,
> on a jusqu'à début décembre pour caler votre journée. »

C'est aussi ce qui donne enfin son sens à la **question 8** (« avez-vous suivi une formation
cette année ? ») : elle ne sert pas au diagnostic, elle repère les **droits intacts**.

### Levier 3 — Un seul CTA cliquable

Un email de prospect avec trois liens ne convertit sur aucun. Un seul bouton :

> **Réserver mon point financement — 15 min**

Ce n'est pas un rendez-vous commercial, c'est un service : on regarde ensemble ce qui est
finançable et ce qu'il reste de droits. Personne ne refuse ça — et c'est l'appel de vente.

**Arbitrage Laurent :** lien de réservation (Calendly / agenda Google) ou `tel:` direct vers
le portable ? Sans lien, replier sur `tel:0631056390` + `mailto:` — ça reste un CTA unique.

---

## 3. Ce qu'il ne faut PAS faire

- **Pas de remise « spéciale salon ».** Elle dévalue la journée, et l'AGEFICE rembourse sur le
  prix réel : une remise réduit mécaniquement la prise en charge. Si geste il doit y avoir, que
  ce soit un **bonus** (le point financement, un module en ligne, un audit IA de 45 min), jamais
  une réduction.
- **Pas de chiffres de satisfaction dans l'email.** Vérifié dans
  `Indicateurs-Qualiopi-par-produit.xlsx`, feuille « Méthodologie » :
  *« Les satisfactions actuellement en base sont générées (source IA), valeurs quasi uniformes.
  Remplacer par les questionnaires réels avant publication. »*
  Publier « 4,9/5 » sur cette base, c'est une réserve d'audit **et** un argument mensonger.
  Utilisable en revanche, si Laurent confirme que les sessions sont réelles : **« 275
  professionnels de l'immobilier formés »**.
- **Pas de parcours long dans l'email.** Arbitrage Laurent du 01/09, retenu : **une journée
  maximum**. Le 88 h se vend *pendant* la journée, pas avant. Le second axe reste une phrase,
  jamais un devis.

---

## 4. La priorisation des rappels

Avec 60 à 100 leads le 10 au matin, rappeler dans l'ordre d'arrivée gaspille les meilleurs.
Le score se calcule à partir de réponses **déjà collectées** — aucune question en plus.

| Niveau | Règle |
|---|---|
| **A — rappel J+1** | a demandé « cette semaine » **OU** dirigeant / équipe de 6+ **OU** (mandats en baisse **ET** aucune formation cette année) |
| **B — rappel J+2/J+3** | aucune formation cette année **OU** téléphone renseigné |
| **C — email seulement** | le reste |

À écrire **en tête** du champ `notes` **et** dans `lastAction` (`[A] Diagnostic — Rentrer plus
de mandats — rappel cette semaine`) : `lastAction` est la colonne visible dans la liste des
leads, sans ouvrir la fiche. Fonction pure `lib/diagnostic/priorite.ts` → testable hors réseau.

---

## 5. La séquence de relance (c'est là que se fait la vente)

| Quand | Canal | Cible | Contenu |
|---|---|---|---|
| **J+1** — jeu. 10, matin | Appel | Leads **A** | script ci-dessous |
| **J+4** — dim. 13 / lun. 14 | Email court, écrit à la main | A + B non joints | question fermée à 2 options |
| **J+10** — ven. 18 | Email | tous les non-répondants | date limite AGEFICE + porte de sortie |

### J+1 — script d'appel (leads A)

> « Bonjour X, Laurent Marx de Start Academy — on s'est vus hier soir au MLS, vous m'aviez dit
> que je pouvais vous appeler cette semaine. Vous avez bien reçu votre programme ?
> … Je vous appelle surtout pour une chose concrète : vos droits formation 2026. Vous m'avez dit
> que vous n'aviez rien fait cette année — vous avez donc une enveloppe qui dort et qui saute au
> 31 décembre. On regarde ensemble en dix minutes ce qu'on peut caler avant la fin d'année ? »

### J+4 — email court (pas un template, il doit avoir l'air écrit à la main)

> **Objet :** Suite au MLS — votre journée
>
> X, on s'est croisés mercredi soir au MLS. Votre diagnostic pointait « *{titre de l'axe}* » et
> je vous ai envoyé le programme de la journée correspondante.
> Une seule question : vous préférez qu'on cale ça **avant fin octobre**, ou plutôt **en
> novembre** ?
> Laurent

*Une question fermée à deux options convertit nettement mieux qu'un « n'hésitez pas ».*

### J+10 — dernier email

> **Objet :** Vos droits 2026 (dernier message)
>
> X, je clôture mon suivi du MLS. Rappel utile : le dossier AGEFICE doit être déposé 15 jours
> avant le début de la formation. Pour une journée en décembre, il faut donc décider d'ici
> mi-novembre.
> Si ce n'est pas le moment, dites-le moi simplement — je vous recontacte en janvier, quand
> l'enveloppe est repartie à zéro.

*Offrir une porte de sortie augmente le taux de réponse ; et « je vous recontacte en janvier »
qualifie le lead pour l'an prochain au lieu de le brûler.*

---

## 6. Les cinq ajouts à coder

| # | Ajout | Où | Pourquoi |
|---|---|---|---|
| **D1** | Question « quand peut-on vous appeler ? » (3 boutons, 1 tap) sur l'écran de résultat, avant le formulaire | `components/diagnostic/diagnostic-form.tsx` | levier 1 |
| **D2** | Téléphone **obligatoire** si le choix est « cette semaine » | idem + Zod dans `server/actions/diagnostic-public.ts` | un lead chaud sans numéro est mort |
| **D3** | `lib/diagnostic/priorite.ts` — fonction **pure** `prioriser(reponses, rappel, contact) → 'A'\|'B'\|'C'`, écrite en tête de `notes` et dans `lastAction` | nouveau module + action | §4 |
| **D4** | Bloc financement de l'email : remplacer « souvent pris en charge en totalité » par les chiffres du §2, et un **CTA unique** | `lib/mailer-templates/diagnostic-programme.ts` | levier 2 + 3 |
| **D5** | Bouton **« Nouveau diagnostic »** sur l'écran de remerciement + retour auto au bout de 45 s | `diagnostic-form.tsx` | le diagnostic se fait aussi sur l'ordi du stand : sans ça, il faut recharger la page entre deux visiteurs |

Signature de l'email : **nominative** (Laurent Marx + portable), pas « L'équipe ». Un email d'OF
signé par un humain joignable convertit mieux qu'un email signé par une marque.

---

## 7. Pièges vérifiés — à traiter avant le 9

### V1 — ⛔ AUCUN CRON N'EST CONFIGURÉ (bloquant absolu)

`vercel.json` ne contient que `{"regions":["cdg1"]}` : **il n'y a pas de clé `crons`**.
L'endpoint `/api/cron/closure-worker` porte d'ailleurs en commentaire « configuration
`vercel.json` (**à ajouter au déploiement**) » — ça n'a jamais été fait.

Conséquence directe : la soumission est désormais mise en file (`DiagnosticSubmission.PENDING`)
et l'email est délégué à un worker cron. **Si le cron n'existe pas, aucun programme ne part.**
Le prospect voit son résultat, le lead est créé — et sa boîte mail reste vide.

Second problème, même si le cron est ajouté : sur un plan Vercel Hobby, les crons ne se
déclenchent **qu'une fois par jour**. La cadence « quelques minutes » du commentaire de code
suppose un plan Pro.

**Recommandation (indépendante du plan Vercel, et la plus sûre à J-8) :**
déclencher le traitement **depuis le navigateur du prospect**, sur l'écran de remerciement —
un `fetch` non bloquant vers `/api/diagnostic/traiter?id=<submissionId>` juste après la
soumission. L'écran de merci est déjà affiché, le prospect n'attend rien, et son propre
téléphone déclenche son propre email. Le cron (ou un bouton « envoyer les programmes en
attente » dans le CRM) reste le filet, pas le mécanisme principal.

> `after()` de Next.js n'est pas une option : le projet est en **Next 14.2**, `after()` arrive
> en 15.

### V2 — `MAIL_DRY_RUN` doit être à `false` en production

`lib/mailer.ts:79` : `if (process.env.MAIL_DRY_RUN === 'true') return true;` → tout est avalé
silencieusement. À vérifier explicitement : `vercel env ls production | grep -i mail_dry_run`
(et `SMTP_HOST` non vide, même garde).

### V3 — La case à cocher est fail-closed

Paramètres → Emails → « Programme du diagnostic express » **et** l'interrupteur général.
Tant que ce n'est pas coché, rien ne part. C'est voulu — mais ça se coche le 8, pas le 9 à 18 h.

### V4 — Le QR pointe `qualiof.vercel.app`

Un prospect qui voit `qualiof.vercel.app` s'afficher sur son téléphone lit « bricolage », pas
« organisme certifié ». Un sous-domaine (`diagnostic.start-academy.fr`) se pose en une heure sur
Vercel — mais **oblige à réimprimer le QR**. Décision à prendre tout de suite à cause du délai
d'impression, ou à assumer telle quelle.

### V5 — Le plafond anti-robot peut sauter

`MAX_PAR_IP = 80 / 15 min`. Sur une soirée de plusieurs centaines de personnes derrière le même
wifi (ou le même NAT opérateur en 4G), tout le monde sort avec la même IP publique. Le risque
robot est nul sur un événement privé de 5 heures : **passer à 250**.

### V6 — Registre RGPD

Le traitement « diagnostic express du stand » n'est pas au registre
(`docs/rgpd/REGISTRE-TRAITEMENTS.md`) : base légale (consentement), finalité, durée de
conservation. Start Academy est certifié Qualiopi et audité — ça se voit.

---

## 8. Arbitrages qui n'appartiennent qu'à Laurent

1. **Le CTA** : lien de réservation d'un créneau, ou numéro de téléphone direct ?
2. **Le QR** : réimprimer sur un sous-domaine propre, ou assumer `qualiof.vercel.app` ?
3. **Le bonus** : quel geste offert aux visiteurs du stand (point financement / module en ligne
   / audit IA 45 min) ?
4. **La preuve sociale** : « 275 professionnels formés » est-il exact ? (les notes de
   satisfaction, elles, sont inutilisables — cf. §3)
5. **Le trou de catalogue MANAGEMENT_EQUIPE** : aucune journée courte de pilotage d'équipe.
   Le fichier `068.Management et performance augmentés par l'IA.docx` (8 h, objectifs et
   déroulé déjà rédigés) est prêt — reste à le créer comme produit. Sinon, tout dirigeant
   bascule sur l'axe IA productivité.
