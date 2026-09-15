# Items ouverts — dossier réel monté en local, pseudonymisé (15/09/2026)

## ① SUPPRIMER `DIAG-R001` une fois le programme relu — **à échéance**

**Statut : à faire dès que Laurent a rendu son avis sur le programme composé.**

> Une base de travail n'est pas un endroit où les dossiers clients
> s'accumulent, même pseudonymisés.

### Ce qui a été versé

| | |
|---|---|
| Référence | `DIAG-R001` |
| UUID | `454b58e6-7f88-4d95-adf6-5fc6c16ab838` |
| Base | `qualiof_dev @ localhost` — **jamais** la production |
| Libellé d'agence | `Agence A (COPIE PSEUDONYMISÉE — ne pas remettre)` |
| Contenu | 1 `Lead`, 1 `Diagnostic`, 37 `DiagnosticAnswer`, 3 `DiagnosticParticipant`, 1 `AuditLog` |
| Origine | `DIAG-0001` de production (`5f8f9aa7-9354-46a5-8b43-f6c54e0faf13`) |
| Trace | `AuditLog` action `diagnostic.import_pseudonymise` |

Aucun nom, aucun e-mail, aucun téléphone, aucune raison sociale, aucun SIRET
n'a quitté la production — la lecture ne les a pas demandés. Ce qui est descendu :
les 37 réponses verbatim et les champs **structurels** des 3 fiches (statut,
CA N-1, éligibilité OPCO), parce qu'ils pilotent le financement, donc le volume,
donc la composition.

### Le geste

```sql
-- Les answers et participants tombent en cascade ; le Lead, non.
DELETE FROM "Diagnostic" WHERE reference = 'DIAG-R001';
DELETE FROM "Lead" WHERE notes LIKE 'Agence : Agence A (COPIE PSEUDONYMISÉE%';
```

**À vérifier avant** : qu'aucune `Proposal` ni `Quote` n'a été créée depuis ce
dossier entre-temps. Si c'est le cas, les supprimer d'abord — et se demander
pourquoi une pièce commerciale est née d'une copie de prévisualisation.

### Le critère de déclenchement

La relecture du programme `.planning/DIAG-R001-programme-compose.md` par
Laurent. Tant qu'elle n'a pas eu lieu, le dossier sert ; après, il ne sert plus
et il expose.

---

## ② Le libellé porte l'avertissement — **TRANCHÉ, FERMÉ le 15/09/2026**

**Décision Laurent : on garde la mention dans le titre, telle quelle.**

> Un document qui ne doit pas circuler porte sa marque partout ; on n'échange
> jamais un marqueur de sûreté contre de l'esthétique.

Le titre lit donc `Parcours sur mesure — Agence A (COPIE PSEUDONYMISÉE — ne pas
remettre)`, et c'est le comportement voulu : en passant par `nomAgence()` —
résolution unique, celle de la production (§4 bis) — la mention suit **toute**
pièce issue du dossier, pas seulement le fichier de sonde.

Aucune action. L'item reste écrit pour que la question ne se rouvre pas au
prochain import.

---

## ②bis Les 4 demi-journées non consommées = **4 032 € de droits qui expirent**

**Statut : chiffre à porter au point 5. Aucune action sur le moteur.**

Le moteur compose 6 demi-journées quand le budget en finance 10, et refuse de
combler l'écart. **Il a raison, et pour la bonne raison** : un module sans point
de douleur derrière ne passerait pas un contrôle OPCO (§8.2). Le garde-fou fait
exactement son travail.

Mais ce n'est pas un non-événement, et il faut le nommer :

| | |
|---|---|
| Droits ouverts | 10 demi-journées |
| Parcours composé | 6 demi-journées |
| Écart | **4 demi-journées × 1 008 € = 4 032 €** |
| Échéance | 31 décembre — non consommés, perdus |

**Ce n'est pas un défaut de moteur : c'est la mesure exacte de ce que la
bibliothèque sait répondre aujourd'hui**, sur ce client. Le chiffre ne se
corrige pas en desserrant le seuil ; il se corrige en écrivant les modules qui
manquent. C'est l'argument chiffré du point 5.

---

## ②ter BIB-D070 — huit « modules » qui sont des cellules d'un tableau horaire

**Statut : trouvaille du relevé des verbes (15/09/2026). Non corrigé.**

Huit titres du rayon `BIB-D070` commencent par `|` : le découpage a pris les
lignes d'un **tableau de déroulé horaire** pour des modules.

```
| Accueil & mise en confiance              | Prospection & crédibilité marché
| Comprendre l'IA et ChatGPT (sans jargon) | Rendez-vous vendeur & image pro
| Écrire plus vite et mieux au quotidien   | Suivi client, annonces & administratif
| Synthèse & plan d'action personnel       | Pause déjeuner
```

**« Pause déjeuner » est enregistré comme un module de formation.** Le refus
d'objectif les a rendus visibles — c'est exactement le rôle d'une liste blanche
qui penche vers le refus (§4 nonies).

À reprendre au découpage (`extract-drive-catalog.ts`), pas à la main en base :
un prochain import réintroduirait les mêmes huit lignes.

## ③ L'arbitrage du balayage est lié au `questionId`, pas au TEXTE

**Statut : limite connue, sans conséquence aujourd'hui.**

`--textes-libres-arbitres=<questionId,…>` déclare qu'une réponse a été relue.
Si le texte de cette réponse **change** en production entre deux imports,
l'arbitrage continue de valoir alors qu'il portait sur un autre contenu.

Sans conséquence ici : le balayage du 15/09 a rendu **0 trouvaille sur 37
réponses**, donc aucun arbitrage n'a été donné. Le jour où l'un le sera, lier
l'arbitrage à une empreinte du texte (même mécanique que
`Diagnostic.sourceFingerprint`) fermerait la porte.

---

## ④ Les deux comptes de modules sont désormais nommés — ailleurs, non

**Statut : corrigé sur les deux sorties de ce lot. À surveiller.**

« 490 » et « 402 » se sont contredits une demi-heure. Les deux étaient justes :

| Population | Compte |
|---|---|
| Tous les `TrainingModule` de la base | **490** |
| Instantané Drive + Faros (« la bibliothèque ») | **402** (400 + 2) |
| Hors import (`sourceRef` nul) | **88** |
| Offerts au moteur, retraits déduits | **298** |

Le script d'import et la sonde les nomment maintenant. **Le reste du dépôt
n'a pas été balayé** : toute autre sortie qui annonce « N modules » sans dire
laquelle de ces quatre populations elle compte porte le même défaut (§4 quater).

---

## ⑤ « Piloter par les chiffres et animer l'équipe » — douleur à ÉCRIRE

**Statut : besoin réellement non couvert, constaté le 15/09/2026.**

Ce besoin n'était couvert, dans le parcours de DIAG-R001, que par les deux
modules `BIB-D014` — qui sont des résidus de découpage (§⑥). Et les deux
parlaient d'**animation d'équipe**, pas de *piloter par les chiffres*.

> Une fois les deux retirés, le besoin devient NON COUVERT. **C'est la vérité,
> et elle vaut mieux que deux coquilles.**

Aucun module de la bibliothèque ne traite le pilotage par les indicateurs. C'est
un **contenu à écrire**, pas un rattachement à trouver.

Effet chiffré si les deux modules sortent : parcours de 6 → 5 demi-journées,
droits non consommés de 4 032 € → **5 040 €** (cf. §②bis).

---

## ⑥ `BIB-D014` et `BIB-D047` — le découpage a agrafé deux listes

**Statut : mesuré, NON corrigé (relevé `260915-deroules-releve.md`).**

`drive:014`, motif `liste-imbriquee`, 4 modules : les titres viennent de la liste
des objectifs, les déroulés de la liste horaire, **appariés deux à deux**. Aucun
déroulé ne correspond à son titre ; le module 4 n'a pas de déroulé du tout.

`BIB-D047` porte 7 modules dont le déroulé est le mot « Après-midi », rien
d'autre.

**Un module dont le contenu appartient à un autre module est plus dangereux
qu'un module vide : le vide se voit, le décalage se lit comme du contenu.**
Aucun compteur ne l'attrape — la réparation est au découpage
(`extract-drive-catalog.ts`), pas en base.

Portent la même signature de décalage : `BIB-D010`, `BIB-D033`, `BIB-D038`.

---

## ⑦ Le seuil d'`isAnimable` — à poser, arbitrage ouvert

**Statut : mesuré, NON appliqué.**

`isAnimable` teste le vide **littéral** : « - Après-midi : » n'est pas vide, donc
c'est un déroulé. La règle 4 dit « une étiquette n'est pas un contenu » ; le code
dit « une chaîne non vide est un contenu ».

Seuil que le constat désigne — **A + B + C, −26 modules sur 298 (8,7 %)** :

| | Règle | Coût |
|---|---|---|
| A | déroulé fait uniquement de fragments d'horaire | −7 |
| B | horaire en tête **ET** ≤ 2 puces (la conjonction, pas l'un des deux) | −1 |
| C | déroulé d'une seule puce | −18 |

**C est le point à arbitrer** : 18 modules minces écartés pour 1 résidu attrapé.
Écarter tout « horaire en tête » (−49) ou tout « ≤ 2 puces » (−77) frapperait
massivement du contenu réel — §4 quaterdecies.
