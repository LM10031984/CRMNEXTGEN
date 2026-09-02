# Référentiel des questions — Diagnostic agence (R1)

> ⚠️ **Document généré depuis le code.** Ne pas éditer à la main.
>
> Source : `packages/shared/src/diagnostic/questions.ts`.
> Régénérer : `pnpm --filter @qualiof/shared exec tsx src/diagnostic/write-referential-doc.ts`.
> Un test de contrat (`referential-doc.contract.test.ts`) échoue si ce fichier est périmé.

**Version du référentiel** : `2026-09`

**Volumétrie** : 94 questions sur 11 chapitres · set LÉGER : 37 questions.

## Règles de lecture

- **ID** : la clé de `DiagnosticAnswer.questionId`. Elle ne se renomme jamais — une réponse déjà saisie y est rattachée.
- **O/F** : obligatoire ou facultative. Une obligatoire manquante ne bloque JAMAIS le diagnostic — elle lève l'alerte `missing_required_data`, visible au cockpit et dans le rapport.
- **Lég.** : ✅ = la question fait partie du set LÉGER (R1 sec, ~30 min). Le léger est un sous-ensemble strict du complet : un upgrade ne fait re-saisir aucune réponse.
- **Hint** : la façon de poser la question à l'oral. C'est le script de l'entretien, pas une note de développeur.

Les fiches nominatives de l'équipe (Ch.2.2 / 2.3) ne sont pas des questions : elles vivent dans le modèle `DiagnosticParticipant` (une ligne par indé/salarié). L'identité durable de l'agence (raison sociale, SIRET, adresse) vient de `Organization`, pas d'une réponse.

---

## Chapitre 1 — Identité & contexte (~3 min)

**Objectif** : Cadrer l'entreprise et vérifier que le diagnostic est pertinent (transaction ancien).

10 questions · 5 dans le set léger.

| ID | Question | Type | O/F | Lég. | Conditionnement | Alimente |
|---|---|---|---|---|---|---|
| `identity-network` | Vous êtes sous enseigne, ou vous êtes indépendant ? | texte | F |  |  | Calibrage du ton de la recommandation |
| `identity-agencies-count` | Combien de points de vente vous avez aujourd'hui ? | entier | O |  |  | Dimensionnement de la formation collective |
| `identity-geo-areas` | Vous couvrez quels secteurs ? | texte | F |  |  |  |
| `identity-activities` | Vous faites quoi, exactement — de la transaction, de la location, de la gestion, du syndic ? | multi-choix | O | ✅ |  | Pertinence du diagnostic (calibré transaction ancien) |
| `identity-transaction-ancien-percent` | Et sur votre chiffre d'affaires, la transaction dans l'ancien, ça pèse combien ? | % | O | ✅ |  | **Alerte si transaction ancien < 50 % du CA** |
| `identity-property-types` | Vous vendez plutôt quoi comme biens ? | multi-choix | F |  |  |  |
| `identity-sales-n1` | L'an dernier, vous avez fait combien de ventes ? | entier | O | ✅ |  | Ratio CA moyen par vente · Ratio ventes par agent (après Ch.2) |
| `identity-revenue-n1` | Et en chiffre d'affaires, ça donne quoi sur l'année écoulée ? | € | O | ✅ |  | Ratios de productivité · CA par collaborateur (après Ch.2) |
| `identity-revenue-goal` | Cette année, vous visez combien ? | € | F | ✅ |  | Écart ambition / moyens — enjeu en € de l'audit |
| `identity-ambition-3y` | Et si je vous projette à trois ans, vous voulez être où ? | texte | F |  |  | Ton de la proposition · Vision dirigeant |

<details><summary>Valeurs de réponse</summary>

- `identity-activities` : Transaction ancien (`transaction_ancien`) · Transaction neuf (`transaction_neuf`) · Location (`location`) · Gestion locative (`gestion`) · Syndic (`syndic`) · Autre (`autre`)
- `identity-property-types` : Appartements (`appartements`) · Maisons (`maisons`) · Prestige (`prestige`) · Commerces / locaux (`commerces`) · Terrains (`terrains`) · Immeubles (`immeubles`)

</details>

<details><summary>Comment poser ces questions (script commercial)</summary>

- `identity-network` — Le réseau change tout : outils imposés, formations déjà financées par la tête de réseau, marge de manœuvre du dirigeant. Saisir le nom du réseau, ou « indépendant ».
- `identity-agencies-count` — Nombre d'agences physiques. Plusieurs sites = formation collective à organiser par site ou en central — ça change le dimensionnement.
- `identity-geo-areas` — Communes ou zones citées spontanément. Sert au contexte marché, pas au calcul.
- `identity-activities` — Cocher toutes les activités exercées, même marginales. On chiffre la répartition juste après.
- `identity-transaction-ancien-percent` — En % du CA. Sous 50 %, le diagnostic reste utile mais il faut le dire au dirigeant : nos repères sont calibrés sur l'ancien.
- `identity-property-types` — Calibrage des recommandations (le prestige et le commerce ne se travaillent pas comme le résidentiel classique).
- `identity-sales-n1` — Nombre de ventes actées sur N-1, toute agence confondue. Le chiffre pivot de la moitié des ratios.
- `identity-revenue-n1` — CA HT global N-1. Si le dirigeant hésite, prendre son ordre de grandeur et le noter comme déclaratif — on ne le présente jamais comme audité.
- `identity-revenue-goal` — Objectif CA de l'année en cours. L'écart entre l'ambition et les moyens actuels, c'est l'enjeu chiffré de l'audit.
- `identity-ambition-3y` — Laisser parler, noter les mots du dirigeant. C'est ce qui donne le ton de la proposition — on la lui rendra dans ses termes.

</details>

---

## Chapitre 2 — Équipe & financement

**Objectif** : Cartographier l'équipe et produire immédiatement la stratégie de financement — c'est le chapitre qui montre la valeur en premier.

> 🔔 **Synthèse en fin de chapitre** : « Votre potentiel de financement » — calculée par fonctions pures, affichée en moins d'une seconde, sans aucun appel IA (on est en rendez-vous).

15 questions · 7 dans le set léger.

| ID | Question | Type | O/F | Lég. | Conditionnement | Alimente |
|---|---|---|---|---|---|---|
| `team-total-count` | Vous êtes combien au total dans l'agence ? | entier | O | ✅ |  | Contrôle de cohérence effectifs · CA par collaborateur |
| `team-employees-count` | Là-dedans, combien de salariés ? | entier | O | ✅ |  | Enveloppe OPCO EP (seuils < 11 / 11-50 / > 50) |
| `team-independents-count` | Et combien d'agents commerciaux indépendants ? | entier | O | ✅ |  | Budget AGEFICE mobilisable |
| `team-assistants-count` | Vous avez des assistantes, du back-office ? | entier | F |  |  |  |
| `team-managers-count` | Quelqu'un encadre l'équipe au quotidien ? | entier | F |  |  | Recommandation management (Ch.11) |
| `team-directors-count` | Vous êtes combien à la direction ? | entier | O | ✅ |  |  |
| `funding-trainings-24m` | Sur les deux dernières années, vous avez formé du monde ? | O/N | O |  |  | Taux de consommation des droits |
| `funding-trainings-24m-detail` | Sur quoi, avec qui, et ça a donné quoi ? | texte | F |  | si `funding-trainings-24m` = yes |  |
| `funding-agefice-used` | Vos agents ont déjà utilisé leurs droits AGEFICE ? | choix | O | ✅ |  | Stratégie de financement · Levier « droits sous-utilisés » |
| `funding-opco-used` | Et côté salariés, vous avez déjà sollicité votre OPCO ? | choix | O | ✅ |  | Enveloppe OPCO EP restante |
| `funding-rights-known` | Vous savez à combien vous avez droit, aujourd'hui ? | O/N | O |  |  |  |
| `funding-past-refusals` | On vous a déjà refusé une prise en charge ? | O/N | O | ✅ |  | **Alerte risque administratif** |
| `funding-past-refusals-reason` | Pour quelle raison ? | texte | F |  | si `funding-past-refusals` = yes |  |
| `funding-internal-budget` | Vous avez un budget formation à vous, en plus des financements ? | O/N | F |  |  | Reste à charge acceptable |
| `funding-internal-budget-amount` | De quel ordre ? | € | F |  | si `funding-internal-budget` = yes |  |

<details><summary>Valeurs de réponse</summary>

- `funding-agefice-used` : Oui (`oui`) · Non (`non`) · Ne sait pas (`ne_sait_pas`)
- `funding-opco-used` : Oui (`oui`) · Non (`non`) · Ne sait pas (`ne_sait_pas`)
- `funding-trainings-24m` : oui = « Oui, au moins une action » · non = « Non, rien depuis 2 ans »
- `funding-rights-known` : oui = « Oui, chiffre connu » · non = « Non »
- `funding-past-refusals` : oui = « Oui, au moins un refus » · non = « Non, jamais »
- `funding-internal-budget` : oui = « Oui, budget interne » · non = « Non »

</details>

<details><summary>Comment poser ces questions (script commercial)</summary>

- `team-total-count` — Tout le monde, dirigeant compris. On détaille juste après — un écart avec la somme des catégories est un avertissement, pas un blocage.
- `team-employees-count` — Salariés au sens contrat de travail. C'est eux qui ouvrent l'enveloppe OPCO EP de l'entreprise.
- `team-independents-count` — Les mandataires / agents co. Chacun porte ses propres droits AGEFICE — c'est le gisement de financement principal.
- `team-assistants-count` — Nombre. Souvent oubliées des plans de formation alors que leur montée en compétence libère du temps commercial.
- `team-managers-count` — Nombre de managers. Zéro manager avec plus de 8 conseillers, c'est un constat d'audit à lui tout seul.
- `team-directors-count` — Dirigeants / associés. Ils sont finançables comme les autres (souvent TNS).
- `funding-trainings-24m` — Oui = au moins une action de formation financée ou payée. Une équipe jamais formée depuis 2 ans, c'est un budget dormant à montrer.
- `funding-trainings-24m-detail` — Thèmes, organismes, ressenti. Sert au contexte concurrentiel — et à ne pas revendre ce qui vient d'être fait.
- `funding-agefice-used` — « Ne sait pas » est une réponse fréquente et exploitable : c'est précisément l'argument (« vous avez des droits que vous ne connaissez pas »).
- `funding-opco-used` — OPCO EP pour l'immobilier (IDCC 1527). Une enveloppe entreprise déjà entamée se déduit du mobilisable.
- `funding-rights-known` — Non = argument commercial direct. Oui = vérifier le chiffre annoncé, il est souvent faux.
- `funding-past-refusals` — Un refus antérieur = risque administratif à traiter AVANT de promettre un financement. Toujours demander le motif.
- `funding-past-refusals-reason` — Dossier hors délai, CFP non à jour, organisme non référencé… Le motif dit si le refus se reproduira.
- `funding-internal-budget` — Budget interne de l'agence. C'est ce qui absorbe le reste à charge — le savoir change la conversation prix.
- `funding-internal-budget-amount` — Montant annuel indicatif. Reste interne : ne figure dans aucune sortie client.

</details>

---

## Chapitre 3 — Prospection & entrées vendeurs

**Objectif** : Mesurer la capacité de l'agence à générer des contacts vendeurs.

8 questions · 3 dans le set léger.

| ID | Question | Type | O/F | Lég. | Conditionnement | Alimente |
|---|---|---|---|---|---|---|
| `prospecting-methods` | Entrons dans le vif : aujourd'hui, vos vendeurs, ils arrivent comment ? Racontez-moi tout — le bouche-à-oreille, la pige, le terrain... | multi-choix | O | ✅ |  | Reco modules prospection |
| `prospecting-who` | Et concrètement, qui s'y colle ? Tout le monde prospecte, ou c'est porté par certains ? | choix | O | ✅ |  | Alerte forte si personne |
| `perf-contacts-week` | En rythme de croisière, ça donne quoi — combien de contacts vendeurs par semaine, toute l'agence confondue ? | entier | F |  |  |  |
| `prospecting-contacts-per-month` | Donc sur un mois, on est autour de combien de nouveaux contacts vendeurs générés ? | entier | O | ✅ |  | Ratio contacts → RDV |
| `prospecting-hours-per-week` | Et en temps investi : un conseiller chez vous, il passe combien d'heures par semaine à prospecter, vraiment ? | entier | F |  | si `prospecting-who` = tous / certains |  |
| `perf-rate-rdv` | Sur dix contacts vendeurs, combien acceptent un rendez-vous ? | % | F |  |  |  |
| `prospecting-script` | Quand un conseiller décroche son téléphone pour un propriétaire, il a une trame — ou il y va au talent ? | O/N | F |  | si `prospecting-who` = tous / certains |  |
| `skill-prospection` | Honnêtement, si je demandais demain à chacun de vos conseillers de faire une heure de pige devant vous — ça se passerait comment ? | O/N | F |  |  |  |

<details><summary>Valeurs de réponse</summary>

- `prospecting-methods` : Pige (`pige`) · Terrain (`terrain`) · Boîtage (`boitage`) · Réseaux sociaux (`reseaux_sociaux`) · Recommandation (`recommandation`) · Notoriété (`notoriete`) · Farming secteur (`farming`) · Aucune (`aucune`)
- `prospecting-who` : Tout le monde (`tous`) · Certains seulement (`certains`) · Personne (`personne`)
- `prospecting-script` : oui = « Trame écrite utilisée » · non = « Au talent, sans support »
- `skill-prospection` : oui = « Toute l'équipe sait faire » · non = « Inégal ou à former »

</details>

<details><summary>Comment poser ces questions (script commercial)</summary>

- `prospecting-methods` — Cocher toutes les sources citées spontanément, puis balayer celles non mentionnées ("et le boîtage ? les réseaux ?"). Rien d'actif = aucune.
- `prospecting-who` — Cocher le profil réel, pas l'intention affichée.
- `perf-contacts-week` — Saisir le chiffre hebdo. Si le dirigeant raisonne au mois, diviser par 4 et le noter.
- `prospecting-contacts-per-month` — Saisir la moyenne mensuelle. Vérifier la cohérence avec le chiffre hebdo (×4 environ) — un gros écart = le dirigeant ne mesure pas, c'est un constat en soi.
- `prospecting-hours-per-week` — Saisir les heures réelles par agent. "Quand ils ont le temps" = creuser pour un chiffre, même approximatif.
- `perf-rate-rdv` — Convertir en % (3 sur 10 = 30). "Aucune idée" = noter l'absence de mesure — constat d'audit.
- `prospecting-script` — Oui = script/trame écrit et utilisé. "Ils savent faire" sans support = Non.
- `skill-prospection` — Oui = méthode maîtrisée par toute l'équipe. Malaise, "certains", "il faudrait les former" = Non.

</details>

---

## Chapitre 4 — RDV vendeur, découverte & estimation

**Objectif** : Mesurer la qualité de l'entrée en relation vendeur — là où se joue le mandat.

9 questions · 2 dans le set léger.

| ID | Question | Type | O/F | Lég. | Conditionnement | Alimente |
|---|---|---|---|---|---|---|
| `seller-meetings-per-month` | Concrètement, combien de rendez-vous d'estimation votre équipe décroche par mois, toutes personnes confondues ? | entier | O | ✅ |  | Ratio RDV → mandat |
| `perf-rate-estimation` | Sur dix premiers rendez-vous vendeur, combien débouchent réellement sur une estimation remise ? | % | F |  |  |  |
| `seller-meeting-format` | Racontez-moi comment se passe un rendez-vous vendeur type chez vous : tout en une fois, ou vous revenez présenter l'estimation ? | choix | F |  |  |  |
| `seller-discovery-formalized` | Quand un de vos conseillers rencontre un vendeur, comment il s'y prend pour comprendre son projet — il a une trame, ou chacun a sa méthode ? | O/N | O | ✅ |  | Alerte si non — cause n°1 des mandats surévalués |
| `estimation-delivery-delay` | Entre le rendez-vous et le moment où le vendeur a son estimation entre les mains, il se passe combien de temps en général ? | choix | F |  |  |  |
| `seller-written-valuation` | Qu'est-ce que le vendeur repart avec, concrètement ? Un document écrit, ou c'est annoncé de vive voix ? | O/N | F |  |  |  |
| `skill-qualification` | Quand un vendeur appelle, vos conseillers arrivent à faire le tri entre un vrai projet et une pêche aux prix ? | O/N | F |  |  |  |
| `skill-estimation` | Vos conseillers sont à l'aise pour préparer et défendre une estimation, ou c'est un point qui coince pour certains ? | O/N | F |  |  |  |
| `skill-objections` | Et face à un vendeur qui dit "je vais vendre seul" ou "l'agence d'à côté prend moins cher" — ils réagissent comment ? | O/N | F |  |  |  |

<details><summary>Valeurs de réponse</summary>

- `seller-meeting-format` : R1 + R2 (`r1_r2`) · RDV unique (`rdv_unique`)
- `estimation-delivery-delay` : Immédiate, en RDV (`immediat`) · Sous 48 h (`48h`) · Plus de 48 h (`plus`)
- `seller-discovery-formalized` : oui = « Trame partagée » · non = « Chacun sa méthode »
- `seller-written-valuation` : oui = « Document écrit remis » · non = « Oral ou irrégulier »
- `skill-qualification` : oui = « Tri maîtrisé » · non = « Au feeling »
- `skill-estimation` : oui = « Équipe autonome » · non = « Ça dépend de qui »
- `skill-objections` : oui = « Réponses structurées » · non = « Improvisation »

</details>

<details><summary>Comment poser ces questions (script commercial)</summary>

- `seller-meetings-per-month` — Saisir la moyenne mensuelle agence. Si le dirigeant hésite, l'aider : "sur le dernier trimestre, à la louche ?"
- `perf-rate-estimation` — Convertir en % (7 sur 10 = 70). Si "je ne sais pas" : noter l'absence de mesure, c'est déjà un constat.
- `seller-meeting-format` — Cocher R1/R2 si un second rendez-vous de restitution existe systématiquement, RDV unique sinon.
- `seller-discovery-formalized` — Oui = une trame écrite/partagée existe (motivation, délai, projet). "Chacun fait à sa sauce" = Non.
- `estimation-delivery-delay` — Cocher le délai le plus fréquent, pas le meilleur cas.
- `seller-written-valuation` — Oui = un avis de valeur écrit est remis systématiquement. Oral ou "parfois" = Non.
- `skill-qualification` — Oui = méthode de qualification maîtrisée par l'équipe. Doute ou "certains oui" = Non.
- `skill-estimation` — Oui = l'équipe est autonome sur la préparation. "Ça dépend de qui" = Non.
- `skill-objections` — Oui = réponses structurées connues de l'équipe. Improvisation ou évitement = Non.

</details>

---

## Chapitre 5 — Mandats & exclusivité

**Objectif** : Mesurer la qualité et la valeur du stock.

8 questions · 4 dans le set léger.

| ID | Question | Type | O/F | Lég. | Conditionnement | Alimente |
|---|---|---|---|---|---|---|
| `mandates-active-stock` | Photographions votre portefeuille : aujourd'hui, vous avez combien de mandats actifs en rayon ? | entier | O | ✅ |  |  |
| `mandates-per-month` | Et il se renouvelle à quel rythme — combien de rentrées par mois, en moyenne ? | entier | O | ✅ |  |  |
| `perf-rate-mandat` | Sur dix estimations remises, combien se transforment en mandat ? | % | F |  |  |  |
| `perf-rate-exclusivity` | Et parmi ceux qui signent en simple — vous arrivez à en repasser certains en exclu ensuite ? Ça représente quoi ? | % | F |  |  |  |
| `mandates-exclusivity-percent` | Sur vos rentrées, l'exclusivité pèse combien — la moitié, plus, moins ? | % | O | ✅ |  | Alerte si < benchmark → module vendre l'exclusivité |
| `mandates-price-above-market` | Question franchise : un vendeur vous demande 10 % au-dessus du marché pour signer — vous faites quoi ? | choix | O | ✅ |  |  |
| `skill-price-defense` | Et vos conseillers, face à ce vendeur-là — ils tiennent le prix avec des arguments, ou ils lâchent pour ne pas perdre l'affaire ? | O/N | F |  |  |  |
| `mandates-average-duration-months` | Dernier chiffre sur les mandats : entre la signature et la vente, il se passe combien de temps chez vous, en moyenne ? | entier | F |  |  |  |

<details><summary>Valeurs de réponse</summary>

- `mandates-price-above-market` : Souvent, pour rentrer le mandat (`souvent`) · Parfois, avec stratégie (`parfois`) · Jamais (`jamais`)
- `skill-price-defense` : oui = « Prix tenu avec méthode » · non = « Ils lâchent souvent »

</details>

<details><summary>Comment poser ces questions (script commercial)</summary>

- `mandates-active-stock` — Saisir le stock actuel. Hésitation longue = le dirigeant ne suit pas son stock, à noter.
- `mandates-per-month` — Saisir la moyenne mensuelle sur les derniers mois, pas le meilleur mois.
- `perf-rate-mandat` — Convertir en % (4 sur 10 = 40). Benchmark 40 % — ne pas le citer, juste saisir.
- `perf-rate-exclusivity` — Convertir en %. "Jamais, on ne retente pas" = 0, constat en soi.
- `mandates-exclusivity-percent` — Convertir en % des rentrées. Distinguer du stock si le dirigeant mélange.
- `mandates-price-above-market` — Cocher la pratique réelle. La réponse spontanée avant justification est la bonne.
- `skill-price-defense` — Oui = méthode de défense du prix maîtrisée par l'équipe (données marché, comparables). "Ça dépend de qui" = Non.
- `mandates-average-duration-months` — Saisir en mois. "Aucune idée" = absence de mesure, à noter.

</details>

---

## Chapitre 6 — Commercialisation & suivi vendeur

**Objectif** : Mesurer le pilotage du stock — le chapitre qui révèle le stock mort.

3 questions · 2 dans le set léger.

| ID | Question | Type | O/F | Lég. | Conditionnement | Alimente |
|---|---|---|---|---|---|---|
| `commercial-followup-frequency` | Pendant ces mois-là, le vendeur, il entend parler de vous à quel rythme — c'est organisé ou c'est quand il y a du neuf ? | choix | O | ✅ |  | Alerte si a_la_demande ou jamais |
| `commercial-price-drop-per-month-percent` | Quand un bien est trop cher, vous arrivez à faire bouger le vendeur ? Sur votre stock, ça donne combien de baisses de prix obtenues par mois ? | % | O | ✅ |  |  |
| `commercial-requalification-process` | Et les mandats qui dorment depuis six mois — il se passe quoi ? Il y a un moment où on remet tout à plat avec le vendeur, ou ils vieillissent tranquillement ? | O/N | O |  |  |  |

<details><summary>Valeurs de réponse</summary>

- `commercial-followup-frequency` : Hebdomadaire (`hebdo`) · Bimensuel (`bimensuel`) · À la demande (`a_la_demande`) · Jamais (`jamais`)
- `commercial-requalification-process` : oui = « Remise à plat organisée » · non = « Ils vieillissent »

</details>

<details><summary>Comment poser ces questions (script commercial)</summary>

- `commercial-followup-frequency` — Cocher la fréquence réelle des comptes-rendus. "Quand il appelle" = à la demande.
- `commercial-price-drop-per-month-percent` — Convertir en % du stock. "On n'ose pas trop" = proche de 0, verbatim précieux.
- `commercial-requalification-process` — Oui = process de requalification organisé (RDV bilan, renégociation, sortie). Laisser-vieillir = Non.

</details>

---

## Chapitre 7 — Acquéreurs

**Objectif** : Mesurer la génération et la qualification acquéreurs.

4 questions · 2 dans le set léger.

| ID | Question | Type | O/F | Lég. | Conditionnement | Alimente |
|---|---|---|---|---|---|---|
| `buyers-sources-repartition` | Passons de l'autre côté : vos acheteurs, ils arrivent d'où ? Si vous deviez découper le gâteau — portails, vitrine, votre base, le reste ? | texte | O |  |  |  |
| `buyers-contacts-per-month` | En volume, ça représente combien de contacts acquéreurs par mois ? | entier | O | ✅ |  |  |
| `buyers-discovery-formalized` | Quand un acheteur appelle pour un bien, il se passe quoi — on l'emmène visiter, ou on prend d'abord le temps de comprendre son projet ? | O/N | O |  |  |  |
| `buyers-financing-verified` | Et son financement — vous le vérifiez avant d'ouvrir des portes, ou ça se découvre au moment de l'offre ? | O/N | O | ✅ |  | Alerte forte si non — visites inutiles, chutes compromis |

<details><summary>Comment poser ces questions (script commercial)</summary>

- `buyers-sources-repartition` — Noter la répartition en % approximatifs telle qu'il la donne. S'il ne sait pas découper = noter "non mesuré".
- `buyers-contacts-per-month` — Saisir la moyenne mensuelle. Hésitation = donner un ordre de grandeur à confirmer ("plutôt 30 ou plutôt 100 ?").
- `buyers-discovery-formalized` — Oui = découverte acquéreur structurée avec trame (projet, budget, délai) avant visite. "On visite et on discute sur place" = Non.
- `buyers-financing-verified` — Oui = vérification systématique avant visite (simulation, attestation, courtier). "On fait confiance" ou vérification à l'offre = Non.

</details>

---

## Chapitre 8 — Visites, offres & transformation

**Objectif** : Mesurer la transformation — où la chaîne fuit.

> 🔔 **Synthèse en fin de chapitre** : « Votre pipeline de transformation » — calculée par fonctions pures, affichée en moins d'une seconde, sans aucun appel IA (on est en rendez-vous).

5 questions · 4 dans le set léger.

| ID | Question | Type | O/F | Lég. | Conditionnement | Alimente |
|---|---|---|---|---|---|---|
| `visits-per-month` | Maintenant, déroulez-moi votre entonnoir sur un mois type : combien de visites... | entier | O | ✅ |  | Ratio visites/vente |
| `offers-per-month` | ...combien d'offres qui tombent... | entier | O | ✅ |  |  |
| `compromis-per-month` | ...combien de compromis signés... | entier | O | ✅ |  |  |
| `actes-per-month` | ...et au bout, combien d'actes par mois ? | entier | O | ✅ |  |  |
| `chute-compromis-acte-percent` | Entre compromis et acte, vous en perdez beaucoup en route — financements qui capotent, rétractations ? | % | F |  |  |  |

<details><summary>Comment poser ces questions (script commercial)</summary>

- `visits-per-month` — Saisir les visites mensuelles moyennes.
- `offers-per-month` — Saisir les offres mensuelles. Réagir naturellement sans commenter le ratio — la restitution le fera.
- `compromis-per-month` — Saisir les compromis mensuels.
- `actes-per-month` — Saisir les actes mensuels. S'il ne connaît que ce chiffre, remonter l'entonnoir à rebours avec lui.
- `chute-compromis-acte-percent` — Convertir en % de chute. "Quasiment jamais" = 5 %, "ça arrive" = creuser pour un chiffre.

</details>

---

## Chapitre 9 — Base de données & e-réputation

**Objectif** : Mesurer les actifs immatériels de l'agence.

7 questions · 3 dans le set léger.

| ID | Question | Type | O/F | Lég. | Conditionnement | Alimente |
|---|---|---|---|---|---|---|
| `db-volume` | Parlons d'un truc que tout le monde a et que peu exploitent : votre base de contacts. Elle pèse combien, tous confondus — vendeurs, acheteurs, anciens clients ? | entier | O | ✅ |  |  |
| `db-crm-uptodate` | Et honnêtement, dans quel état elle est ? Si vous ouvrez une fiche au hasard, elle raconte quoi ? | choix | O |  |  |  |
| `perf-crm-usage` | Dans l'équipe, qui joue le jeu du CRM — tout le monde saisit, ou c'est deux personnes sur cinq ? | % | F |  |  |  |
| `db-exploitation` | Et cette base, elle vit ? Qu'est-ce que vous en faites — des relances, des campagnes, du matching avec les biens... ou elle dort ? | multi-choix | O |  |  |  |
| `google-reviews-count` | Côté image maintenant : si je tape le nom de l'agence sur Google, je trouve combien d'avis ? | entier | O | ✅ |  | Ratio avis/vente |
| `google-reviews-score` | Et la note, elle dit quoi ? | % | O | ✅ |  |  |
| `reviews-collection-process` | Ces avis, ils tombent tout seuls, ou il y a un moment précis où on les demande — à la remise des clés par exemple ? | O/N | O |  |  |  |

<details><summary>Valeurs de réponse</summary>

- `db-crm-uptodate` : À jour (`oui`) · Obsolète (`non`) · Partiellement (`partiellement`)
- `db-exploitation` : Emailing (`emailing`) · SMS (`sms`) · Rapprochement automatique (`rapprochement_auto`) · Aucune (`aucune`)
- `reviews-collection-process` : oui = « Collecte organisée » · non = « Au bon vouloir des clients »

</details>

<details><summary>Comment poser ces questions (script commercial)</summary>

- `db-volume` — Saisir le volume total. "Aucune idée" = faire estimer via le CRM ou noter l'absence de mesure.
- `db-crm-uptodate` — Cocher l'état réel. Le rire gêné = partiellement au mieux.
- `perf-crm-usage` — Convertir en % de l'équipe qui l'utilise réellement au quotidien (2 sur 5 = 40).
- `db-exploitation` — Cocher tous les usages réels cités. "Elle dort" = cocher aucun — souvent le déclic de l'entretien, laisser le silence travailler.
- `google-reviews-count` — Saisir le nombre. Le vérifier en direct sur téléphone si le dirigeant hésite.
- `google-reviews-score` — Saisir la note sur 5 (ex. 4,6). Noter aussi la réaction — fierté ou évitement.
- `reviews-collection-process` — Oui = process organisé de collecte (moment défini, lien envoyé, relance). "Les clients contents en laissent" = Non.

</details>

---

## Chapitre 10 — Outils & IA

**Objectif** : Cartographier l'équipement et la maturité digitale.

16 questions · 2 dans le set léger.

| ID | Question | Type | O/F | Lég. | Conditionnement | Alimente |
|---|---|---|---|---|---|---|
| `tools-metier` | Commençons par votre quotidien : c'est quoi votre logiciel de transaction aujourd'hui, et vous en pensez quoi ? | texte | O | ✅ |  |  |
| `tools-estimation` | Pour estimer, vous vous appuyez sur quoi ? | texte | F |  |  |  |
| `tools-pige` | Et côté pige — vous avez un outil qui surveille le marché, ou c'est manuel ? | texte | F |  |  |  |
| `tools-portals` | Vos annonces partent où, comme portails ? | multi-choix | F |  |  |  |
| `tools-esignature` | Quand un mandat se signe, ça se passe comment — tablette, lien de signature, ou papier ? | O/N | F |  |  |  |
| `tools-ai-usage` | Parlons IA. Aujourd'hui, dans l'agence, elle sert à quoi concrètement — même un petit peu ? | multi-choix | O | ✅ |  |  |
| `tool-chatgpt-usage` | ChatGPT par exemple : c'est entré dans les habitudes, ou c'est chacun de son côté de temps en temps ? | texte | F |  |  |  |
| `tool-claude-gemini` | Et au-delà de ChatGPT — Claude, Gemini, ça parle à quelqu'un dans l'équipe ? | O/N | F |  |  |  |
| `tool-team-access` | Ces outils, tout le monde y a accès de la même façon, ou certains ont leurs comptes et d'autres rien ? | O/N | F |  |  |  |
| `tool-chatgpt-setup` | Ceux qui l'utilisent, ils l'ont configuré — ou c'est la page blanche à chaque fois ? | O/N | F |  |  |  |
| `tool-chatgpt-instructions` | Est-ce qu'il connaît votre agence — votre secteur, votre façon de rédiger — ou il répond comme pour n'importe qui ? | O/N | F |  |  |  |
| `tool-prompts-standard` | Quand deux conseillers demandent la même chose à l'IA, ils obtiennent la même qualité — ou ça dépend de qui tape ? | O/N | F |  |  |  |
| `tool-anti-hallucination` | Il vous est déjà arrivé que l'IA invente un chiffre ou une info ? L'équipe sait repérer et éviter ça ? | O/N | F |  |  |  |
| `tool-notebooklm` | Dernière ligne droite : NotebookLM, ça vous dit quelque chose ? | O/N | F |  |  |  |
| `tool-notebook-created` | Vous avez déjà essayé d'y mettre vos propres documents — un règlement de copro, un PV d'AG ? | O/N | F |  |  |  |
| `tool-gamma` | Et pour vos présentations — books vendeur, supports — vous avez testé des outils comme Gamma ? | O/N | F |  |  |  |

<details><summary>Valeurs de réponse</summary>

- `tools-portals` : Leboncoin (`leboncoin`) · SeLoger (`seloger`) · Logic-Immo (`logic_immo`) · Bien'ici (`bien_ici`) · PAP (`pap`) · Autre (`autre`)
- `tools-ai-usage` : Rédaction d'annonces (`redaction_annonces`) · Estimation (`estimation`) · Réponses aux avis (`reponses_avis`) · Prospection (`prospection`) · Aucun (`aucun`)
- `tools-esignature` : oui = « En usage réel » · non = « Papier ou inutilisée »
- `tool-claude-gemini` : oui = « Usage réel dans l'équipe » · non = « Inconnu ou jamais testé »
- `tool-team-access` : oui = « Accès organisé pour tous » · non = « Comptes disparates »
- `tool-chatgpt-setup` : oui = « Paramétré » · non = « Page blanche à chaque fois »
- `tool-chatgpt-instructions` : oui = « Personnalisé agence » · non = « Réponses génériques »
- `tool-prompts-standard` : oui = « Prompts partagés » · non = « Chacun sa méthode »
- `tool-anti-hallucination` : oui = « Vérification en place » · non = « Confiance aveugle »
- `tool-notebooklm` : oui = « Connu » · non = « Jamais entendu parler »
- `tool-notebook-created` : oui = « Déjà testé avec leurs docs » · non = « Jamais essayé »
- `tool-gamma` : oui = « Déjà testé » · non = « Jamais essayé »

</details>

<details><summary>Comment poser ces questions (script commercial)</summary>

- `tools-metier` — Noter l'outil + le ressenti s'il s'exprime ("compliqué", "sous-exploité"...) — c'est de la matière d'audit.
- `tools-estimation` — Noter l'outil ou "aucun / expérience".
- `tools-pige` — Noter l'outil ou "aucun". "On regarde Leboncoin de temps en temps" = aucun.
- `tools-portals` — Cocher tous les portails cités.
- `tools-esignature` — Oui = signature électronique en usage réel. "On l'a mais on s'en sert pas" = Non.
- `tools-ai-usage` — Cocher tous les usages cités. Rien de concret = "aucun".
- `tool-chatgpt-usage` — Noter la réalité d'usage : quotidien / ponctuel / certains seulement / jamais.
- `tool-claude-gemini` — Oui = au moins un usage réel. "J'en ai entendu parler" = Non.
- `tool-team-access` — Oui = accès homogène organisé par l'agence. Comptes persos disparates = Non.
- `tool-chatgpt-setup` — Oui = paramétrage effectif (projets, mémoire, préférences). Usage brut = Non.
- `tool-chatgpt-instructions` — Oui = instructions personnalisées en place. Non sinon.
- `tool-prompts-standard` — Oui = prompts standardisés partagés dans l'équipe. "Chacun sa méthode" = Non.
- `tool-anti-hallucination` — Oui = réflexes de vérification en place (sources, relecture). Confiance aveugle ou incidents non détectés = Non.
- `tool-notebooklm` — Oui = connaît l'outil. Non sinon — et c'est une opportunité de démonstration, pas un reproche.
- `tool-notebook-created` — Oui = au moins un notebook créé avec des documents internes. Non sinon.
- `tool-gamma` — Oui = au moins une présentation créée. Non sinon.

</details>

---

## Chapitre 11 — Management, pilotage & vision

**Objectif** : Comprendre comment le dirigeant pilote — et calibrer le ton de la recommandation.

9 questions · 3 dans le set léger.

| ID | Question | Type | O/F | Lég. | Conditionnement | Alimente |
|---|---|---|---|---|---|---|
| `mgmt-team-meeting-frequency` | Parlons de vous maintenant, et de comment tourne l'équipe. Vous vous retrouvez tous ensemble à quel rythme — c'est ritualisé ou au fil de l'eau ? | choix | O |  |  |  |
| `exec-manager-reporting` | Et entre deux réunions, comment vous savez où en est chacun — ils viennent vers vous, ou c'est vous qui allez à la pêche ? | O/N | F |  |  |  |
| `mgmt-coaching-individual` | Vous arrivez à prendre du temps en tête-à-tête avec chacun — des points individuels réguliers — ou le quotidien mange tout ? | O/N | O |  |  |  |
| `exec-week-structure` | Un lundi matin type chez vous : vos conseillers savent ce qu'ils ont à faire de leur semaine, ou ça se décide au jour le jour ? | O/N | F |  |  |  |
| `exec-autonomy` | Et si vous partez deux semaines en vacances en coupant le téléphone — l'activité continue, ou ça ralentit sérieusement ? | O/N | F |  |  |  |
| `mgmt-indicators-followed` | Côté chiffres : qu'est-ce que vous regardez régulièrement pour savoir si l'agence va bien — vous suivez quoi, concrètement ? | multi-choix | O | ✅ |  | Alerte forte si aucun |
| `mgmt-recruitment` | L'équipe, elle est au complet pour vos ambitions — ou vous cherchez à renforcer ? | O/N | O |  |  |  |
| `mgmt-top3-difficulties` | On a fait le tour de beaucoup de choses. Si vous deviez me dire, là, les trois trucs qui vous pèsent le plus dans l'agence en ce moment — ce serait quoi ? | texte | O | ✅ |  |  |
| `mgmt-top3-priorities` | Et si on se reparle dans un an et que tout s'est bien passé — qu'est-ce qui aura changé ? Vos trois priorités, celles qui comptent vraiment. | texte | O | ✅ |  |  |

<details><summary>Valeurs de réponse</summary>

- `mgmt-team-meeting-frequency` : Hebdomadaire (`hebdo`) · Mensuelle (`mensuelle`) · Irrégulière (`irreguliere`) · Aucune (`aucune`)
- `mgmt-indicators-followed` : Chiffre d'affaires (`ca`) · Mandats (`mandats`) · Exclusivités (`exclusivite`) · Visites (`visites`) · Compromis (`compromis`) · Actes (`actes`) · Avis clients (`avis`) · Aucun (`aucun`)
- `exec-manager-reporting` : oui = « Remontée organisée » · non = « À la pêche aux infos »
- `mgmt-coaching-individual` : oui = « Points réguliers » · non = « Le quotidien mange tout »
- `exec-week-structure` : oui = « Semaines structurées » · non = « Au jour le jour »
- `exec-autonomy` : oui = « Ça tourne sans lui » · non = « Ça repose sur lui »
- `mgmt-recruitment` : oui = « Équipe au complet » · non = « En recherche »

</details>

<details><summary>Comment poser ces questions (script commercial)</summary>

- `mgmt-team-meeting-frequency` — Cocher la fréquence réelle, pas l'intention ("on devrait" = la fréquence actuelle).
- `exec-manager-reporting` — Oui = remontée régulière et organisée vers le manager. "Je demande quand je m'inquiète" = Non.
- `mgmt-coaching-individual` — Oui = coaching individuel régulier en place. Entretien annuel seul ou "quand ça va mal" = Non.
- `exec-week-structure` — Oui = semaines structurées (créneaux prospection, RDV, suivi). Improvisation dominante = Non.
- `exec-autonomy` — Oui = l'équipe produit sans relance permanente. "Ça dépend de moi" = Non — et noter la réaction, elle en dit long.
- `mgmt-indicators-followed` — Cocher tous les indicateurs cités spontanément. Ne pas souffler la liste. "Le compte en banque" ou rien de régulier = "aucun".
- `mgmt-recruitment` — Oui = recrutement en cours ou prévu à court terme. Non sinon.
- `mgmt-top3-difficulties` — Noter ses mots exacts, dans son ordre. Ne pas reformuler, ne pas suggérer. Relancer une seule fois : "et le troisième ?"
- `mgmt-top3-priorities` — Noter verbatim. Ces phrases ouvriront la restitution d'audit et la proposition — la qualité de la prise de note ici est décisive.

</details>

