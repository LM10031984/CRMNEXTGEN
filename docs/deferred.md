# Différé — décisions prises, travail non engagé

Ce fichier ne liste PAS des idées. Il liste des cas **identifiés, compris, et
volontairement non traités**, avec ce qui les rouvrira. Une ligne qui n'a pas de
déclencheur n'a rien à faire ici : elle appartient à un backlog.

---

## D-1 · Deux entreprises sur la même session, avec deux forfaits différents

**Posé le** 16/09/2026.

### Le cas

Une session porte les salariés de DEUX entreprises, chacune ayant négocié son
propre forfait. Chaque convention engage sur son montant, et chaque dossier
financeur doit retrouver CE montant dans son programme.

### Ce qui se passe aujourd'hui

`resoudrePrixProgramme` (`apps/web/src/lib/closure/tarif-programme.ts`) bascule
sur le total UNIQUEMENT quand la session relève d'un seul commanditaire. Avec
deux entreprises, il retombe sur le prix **par stagiaire** — un repli sûr : un
total qui n'en couvrirait qu'une serait faux pour l'autre.

Ce n'est pas un bug, c'est le refus d'inventer. Mais ça ne sert pas le cas.

### Pourquoi c'est différé

Le cas voisin — une session mixte **salariés / auto-entrepreneurs** — a été
tranché autrement le 16/09/2026 : elle se scinde en **deux sessions** (deux
produits, 88 h entreprise et 72 h indépendants) qui partagent dates, salle et
formateur. Tout reste par session, et rien ne bouge dans `programme-core`,
`opco-submission` ni la matrice Qualiopi.

Le même découpage règle mécaniquement une partie du cas à deux entreprises. Ce
qu'il ne règle pas — deux forfaits distincts sous un seul produit — attend une
vraie modélisation du tarif, pas un contournement.

### La forme pressentie

Une ligne **`SessionPricing` par commanditaire** : la session porte N tarifs, un
par organisation, au lieu d'un `pricePerLearner` unique. Le programme, la
convention et la facture liraient tous la même ligne.

⚠ À concevoir, pas à improviser : `pricePerLearner` est lu par la convention, la
facture, l'AGEFICE et l'export comptable. Une seconde source de vérité sur le
tarif qui divergerait de la première coûterait plus cher que le cas qu'elle
résout.

### Ce qui le rouvrira

Une session réelle portant les salariés de deux entreprises à deux forfaits
différents. Pas avant : le découpage en deux sessions couvre ce qu'on rencontre
aujourd'hui.

---

## D-2 · `groupFlatPrice` obsolète — `priceHT` porte le forfait

**Posé le** 16/09/2026, en réduisant le périmètre du chantier « mode de prix ».

### Le cas

Le produit portera un `pricingMode` (`PAR_STAGIAIRE` | `FORFAIT_ENTREPRISE`). Dès
lors, **un seul montant suffit** : `priceHT`, que le mode dit comment lire. La
colonne `groupFlatPrice` fait double emploi.

### Ce qui est décidé, et non fait

Décision de Laurent du 16/09/2026 : `groupFlatPrice` devient obsolète. Le
chantier devait, en plus de la colonne `pricingMode` :

1. rétro-remplir `priceHT` depuis `groupFlatPrice` sur les produits passés en
   `FORFAIT_ENTREPRISE` **quand les deux divergent** ;
2. basculer `resolveDefaultParticipantPrice` — son déclencheur passerait de
   « `groupFlatPrice` non nul » à « `pricingMode = FORFAIT_ENTREPRISE` », le
   montant venant de `priceHT` ;
3. supprimer la colonne dans un lot ultérieur.

### Pourquoi c'est différé

Mesure faite le 16/09 sur la base de production : **`groupFlatPrice` n'est
renseigné que sur 2 produits (PROD-0674 et PROD-cdd22466), et il vaut exactement
`priceHT` dans les deux cas.** Le point 1 porte donc sur zéro ligne, et le point
2 ne change aucun comportement observable aujourd'hui.

Le comportement de `resolveDefaultParticipantPrice` reste par ailleurs juste :
il rend `priceHT: 0` + `needsReview` + « forfait à répartir entre les inscrits »,
ce qui est la bonne sémantique. Seul son DÉCLENCHEUR est mal nommé.

⚠ Point de vigilance pour le jour où : la suppression de la colonne est une
migration DESTRUCTIVE. Elle casserait l'ancienne version de l'app encore servie
si elle partait avant que `deploy.yml` n'ordonne migration et déploiement.
Ne pas la lancer avant que le Deploy Hook Vercel soit en place.

### Ce qui le rouvrira

Un produit dont le forfait diffère réellement du prix par tête — c'est-à-dire le
premier `groupFlatPrice ≠ priceHT` en base. Ou la suppression de la colonne,
quand on voudra solder la dette.

---

## D-3 · Geler le mode de prix dès qu'une session est rattachée

**Posé le** 16/09/2026.

### Le cas

Changer le `pricingMode` d'un produit qui porte déjà des sessions change
rétroactivement ce que leurs programmes annonceront à la prochaine
régénération — le même défaut que celui constaté sur `programMd` le 16/09
(cf. `lib/closure/freeze-product-assets.ts` : un produit = un programme pour
TOUTES ses sessions).

Décision de Laurent : le champ est **modifiable tant qu'aucune session n'est
rattachée, figé ensuite**, avec un message qui dit de créer un nouveau produit.

### Pourquoi c'est différé

Le garde protège d'un geste qu'aucune interface ne propose encore : le champ
n'existe pas, donc personne ne peut le changer. Il n'a de sens qu'avec le
formulaire, et le formulaire n'est pas dans le périmètre réduit.

En attendant, le mode est posé par la migration de rétro-remplissage, sous
contrôle humain, produit par produit.

### Ce qui le rouvrira

L'ajout du champ au formulaire produit. Les deux partent ensemble : exposer le
champ sans le garde, c'est rouvrir l'écart E-1 sur le tarif.

---

## D-4 · Avertir quand un second commanditaire arrive sur une session au forfait

**Posé le** 16/09/2026.

### Le cas

Un produit `FORFAIT_ENTREPRISE` sur une session qui porte deux commanditaires ne
peut pas annoncer un total : il ne concernerait qu'une partie de la salle. Le
périmètre réduit traite ce cas par un **refus nommé à la génération du
programme**.

Décision de Laurent : y ajouter un avertissement **plus tôt**, au moment où l'on
rattache un second commanditaire à une telle session — ton du bandeau formateur,
**aucun blocage**.

### Pourquoi c'est différé

Le refus nommé ferme déjà le trou : aucune pièce fausse ne peut sortir.
L'avertissement à l'inscription est un gain d'ergonomie — il déplace la
découverte du problème de « au moment de générer » à « au moment de créer » —
mais il ne change pas ce qui part chez le financeur.

Et il demande de choisir son point d'accrochage : `addParticipant`,
`enroll-from-request`, le wizard, la reprise SmartOF. Quatre chemins, donc une
règle à poser une seule fois, au bon endroit — pas à recopier quatre fois.

### Ce qui le rouvrira

Un refus nommé rencontré en vrai sur une session déjà constituée. C'est le
signal que l'avertissement serait arrivé trop tard, donc qu'il vaut son coût.

---

## D-5 · Le Deploy Hook déploie la tête de `main`, pas le commit migré

**Posé le** 17/09/2026, en validant l'infrastructure de déploiement ordonné.

### Le cas

`deploy.yml` fait, dans l'ordre : `checkout` du commit que la CI vient de
valider → `prisma migrate deploy` → `POST` sur le Deploy Hook Vercel.

Les deux premières étapes sont épinglées sur `workflow_run.head_sha`. **La
troisième ne l'est pas** : un Deploy Hook dit « déploie `main` », et Vercel
résout la tête de `main` AU MOMENT DE L'APPEL. Le SHA migré et le SHA déployé
peuvent donc différer.

**Constaté le jour même de la mise en place.** Deux PR mergées à 3 secondes
d'écart (#86 `ed2b943`, #88 `4c6f6c7`) : les deux déploiements de production
portent `4c6f6c7`, alors que le premier workflow avait validé et migré depuis
`ed2b943`.

### Pourquoi c'est un risque, et lequel exactement

Ici, sans conséquence : aucune migration en attente, et aucun changement
applicatif dans les deux commits.

Le scénario qui mord : deux PR portant chacune une migration, mergées coup sur
coup. `concurrency: deploy-main` sérialise bien les migrations (Ma puis Mb),
mais **le hook du premier run part entre les deux** et déploie déjà le code B —
qui a besoin de Mb, pas encore appliquée. La fenêtre dure le temps du second run
(install + migrate, une à deux minutes).

C'est une version RÉDUITE du problème que tout ce dispositif a supprimé, pas sa
réapparition : il fallait auparavant zéro coordination pour le déclencher, il
faut maintenant deux migrations à quelques minutes d'intervalle.

### La règle en attendant (Laurent, 17/09/2026)

**Jamais deux PR à migration à moins de 10 minutes d'écart.** Une PR sans
migration ne compte pas : elle ne peut pas décaler ce qui n'existe pas.

### La piste propre

Remplacer le hook par `vercel deploy --prod` **épinglé sur le commit migré**,
depuis le workflow — l'arbre est déjà checkouté au bon SHA à cette étape. Coût :
trois secrets de plus (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) et
un build qui migre du côté de Vercel vers celui de GitHub Actions, donc des
durées et un cache à réobserver.

Variante plus légère, si le CLI s'avère coûteux : **ne pas appeler le hook quand
`workflow_run.head_sha` n'est plus la tête de `main`**. Le run en retard se tait,
le dernier déploie — et le dernier déploiement correspond alors toujours à la
dernière migration appliquée. Ça ne supprime pas la fenêtre, ça supprime les
déploiements redondants et fait converger l'état final.

### Ce qui le rouvrira

La première fois que deux PR à migration doivent partir le même jour — ou le
premier incident, si la règle des 10 minutes est oubliée.

---

## Antécédent — pourquoi le découpage plutôt que le programme par payeur

Une autre approche avait été instruite le 16/09/2026 : générer **un programme
par groupe de payeur** (`partitionByPayerRule`), un par entreprise plus un pour
les auto-payeurs.

Elle a été **abandonnée** : elle touchait l'identité du document
(`entityType: 'session'` / `entityId: sessionId`), donc l'empreinte de
péremption et la détection « document déjà sorti », plus la sélection de pièce
dans `opco-submission.ts` et l'anti-régression « le PDF Programme est UNIQUE »
de la matrice Qualiopi.

Scinder la session obtient le même résultat sans toucher à rien de tout cela.
Noté ici pour que personne ne la réinstruise en croyant à une piste neuve.
