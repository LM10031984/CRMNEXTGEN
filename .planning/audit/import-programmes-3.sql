BEGIN;

-- ============ 1. Anglais professionnel boosté par l'IA (71ba9536 / PROD-0667) — 21h, cap 5 ============
UPDATE "TrainingProduct" SET
  "capacityMin" = 1, "capacityMax" = 5,
  objectives = $obj$["Consolider les bases grammaticales et lexicales en anglais professionnel.", "Développer le vocabulaire spécifique aux métiers de la finance, du patrimoine et de l'entreprise.", "Améliorer la compréhension orale et écrite en contexte professionnel.", "Rédiger des emails et documents simples en anglais adaptés aux clients et partenaires.", "Préparer et conduire des échanges professionnels courts en anglais.", "Utiliser l'IA (ChatGPT, traducteurs IA, correcteurs) pour accélérer la pratique.", "Créer des supports personnalisés d'entraînement via l'IA (quiz, dialogues, simulations).", "Gagner en confiance à l'oral grâce à des mises en situation pratiques."]$obj$::jsonb,
  "programMd" = $prog$# Anglais professionnel boosté par l'IA

**Modalité :** Présentiel · **Durée :** 3 journées de 7h (21h) · **Effectif :** 5 personnes max · **Lieu :** 20 rue de France, Nice

## Public
- Salariés de cabinets de gestion de patrimoine, banque, assurance, immobilier
- Collaborateurs souhaitant améliorer leur anglais professionnel

## Profil du formateur
Tous les formateurs de l'équipe Start-Academy ont minimum 8 années d'expérience dans l'immobilier, notamment dans la vente de biens, la formation d'agents et le coaching individuel.

## Prérequis pédagogiques
Niveau débutant à intermédiaire.

## Objectifs de la formation
- Consolider les bases grammaticales et lexicales en anglais professionnel.
- Développer le vocabulaire spécifique aux métiers de la finance, du patrimoine et de l'entreprise.
- Améliorer la compréhension orale et écrite en contexte professionnel.
- Rédiger des emails et documents simples en anglais adaptés aux clients et partenaires.
- Préparer et conduire des échanges professionnels courts en anglais.
- Utiliser l'IA (ChatGPT, traducteurs IA, correcteurs) pour accélérer la pratique.
- Créer des supports personnalisés d'entraînement via l'IA (quiz, dialogues, simulations).
- Gagner en confiance à l'oral grâce à des mises en situation pratiques.

## Contenu

### Jour 1 – Fondamentaux & IA appliquée (7h)
- **Matin (9h-12h30)** : Accueil et test de niveau ; rappel structuré des bases grammaticales essentielles ; lexique professionnel de l'entreprise (fonctions, services, documents clés).
- **Après-midi (14h-17h30)** : Atelier — création de phrases types pour un contexte professionnel ; introduction à ChatGPT pour générer vocabulaire et phrases adaptées ; exercices guidés (mini-dialogue professionnel avec l'IA).

### Jour 2 – Communication écrite & compréhension professionnelle (7h)
- **Matin (9h-12h30)** : Structure d'un email professionnel en anglais ; étude de cas (analyser et reformuler un mail) ; vocabulaire de base en finance et gestion de patrimoine (investments, insurance, loans).
- **Après-midi (14h-17h30)** : Atelier — rédaction d'emails professionnels + correction avec l'IA ; exercices d'écoute (réunion / call / message vocal) ; jeux de rôle (premier échange client en anglais).

### Jour 3 – Mise en situation, spécialisation & plan d'action (7h)
- **Matin (9h-12h30)** : Techniques pour présenter une offre ou un service en anglais ; spécialisation gestion de patrimoine (vocabulaire clé et tournures) ; simulation (mini-présentation orale + feedback).
- **Après-midi (14h-17h30)** : Outils IA pour booster la progression (quiz, dialogues, plans d'apprentissage) ; étude de cas (traiter un dossier client simple en anglais avec l'IA) ; restitution, plan de progression individuel, évaluation finale (QCM), clôture.

## Modalités pédagogiques
- Formation en présentiel
- Alternance théorie/pratique : mises en situation, jeux de rôle, ateliers conversationnels
- Utilisation d'outils IA (ChatGPT, traducteurs intelligents, correcteurs)

## Moyens et supports pédagogiques
- Livret de vocabulaire et fiches de mise en pratique

## Modalités d'évaluation et de suivi
- Une liste d'émargement est à signer à la demi-journée
- Un certificat de réalisation est délivré à chaque participant en fin de formation
- Une évaluation sous forme de QCM a lieu en fin de formation

## Modalités d'accès, inscription et délai
Contacter au minimum 14 jours avant le début : Angélique LAFITTE — formation@start-academy.fr — 06 16 24 63 43. Convention + convocation 7 jours avant. Subrogation : accord du financeur requis avant le début.

## Accessibilité aux personnes en situation de handicap
La loi du 5 septembre 2018 pour la « liberté de choisir son avenir professionnel » vise à faciliter l'accès à l'emploi des personnes en situation de handicap. Notre organisme s'efforce de donner à tous les mêmes chances d'accéder ou de maintenir l'emploi. Nous pouvons adapter certaines de nos modalités de formation : nous étudions ensemble vos besoins. Conformément à la réglementation (loi du 11 février 2005 et articles D.5211-1 et suivants du code du travail), START ACADEMY s'engage à répondre aux besoins particuliers des stagiaires en situation de handicap (aménagements de durée, rythme, méthodes et supports). Le cas échéant, l'organisme pourra mobiliser des compétences externes (Centre de Ressources Formation Handicap, P.A.S AGEFIPH-FIPHFP) et les ressources ad hoc (ACCEA, EPATECH…).$prog$
WHERE id LIKE '71ba9536%';

-- ============ 2. IA générative 105h (cf80eb86 / PROD-0670) — 105h, cap 25 ============
UPDATE "TrainingProduct" SET
  "capacityMin" = 1, "capacityMax" = 25,
  objectives = $obj$["À l'issue de la formation, le stagiaire sera capable de :", "Comprendre et consolider les fondamentaux de l'intelligence artificielle, notamment de l'IA générative, afin d'en faire un usage professionnel pertinent.", "Utiliser efficacement les principaux outils d'IA pour améliorer la productivité, la communication et l'organisation de l'entreprise.", "Structurer des usages durables de l'IA, en identifiant les tâches à forte valeur ajoutée et celles pouvant être automatisées.", "Intégrer l'IA dans les processus de l'entreprise en respectant les enjeux de sécurité, d'éthique et de protection des données.", "Construire un plan d'action opérationnel et personnalisé pour déployer l'IA dans son entreprise à court, moyen et long terme."]$obj$::jsonb,
  "programMd" = $prog$# IA générative : consolider les bases, structurer ses usages et gagner en autonomie

**Modalité :** Présentiel · **Durée :** 15 journées de 7h (105h) · **Effectif :** 1 à 25 personnes

## Public
- Chefs d'entreprise
- Dirigeants
- Managers

## Profil du formateur
Tous les formateurs de l'équipe Start Academy disposent d'une expérience significative dans l'immobilier (minimum 8 années de pratique terrain : vente de biens, accompagnement des agents, formation professionnelle, coaching individuel). Ils sont également experts en intelligence artificielle appliquée à l'immobilier, dans une démarche continue de montée en compétence (formations spécialisées et diplômantes en IA et IA générative, veille permanente, expérimentation continue en contexte réel d'agences).

## Prérequis pédagogiques
Aucune connaissance préalable en intelligence artificielle n'est requise.

## Objectifs de la formation
À l'issue de la formation, le stagiaire sera capable de :
- Comprendre et consolider les fondamentaux de l'IA, notamment de l'IA générative, pour en faire un usage professionnel pertinent.
- Utiliser efficacement les principaux outils d'IA pour améliorer la productivité, la communication et l'organisation de l'entreprise.
- Structurer des usages durables de l'IA, en identifiant les tâches à forte valeur ajoutée et celles automatisables.
- Intégrer l'IA dans les processus de l'entreprise en respectant les enjeux de sécurité, d'éthique et de protection des données.
- Construire un plan d'action opérationnel et personnalisé pour déployer l'IA dans son entreprise à court, moyen et long terme.

## Contenu

- **Jour 1 – Fondamentaux de l'IA et cadrage** : panorama de l'IA, usages en entreprise, ce que l'IA sait / ne sait pas faire, limites, biais et hallucinations, bonnes pratiques.
- **Jour 2 – Comprendre le fonctionnement des IA génératives** : modèles de langage, logique de génération, erreurs fréquentes, lecture critique des résultats, fiabilisation.
- **Jour 3 – Bases solides du prompting** : rôle du prompt, structure d'un prompt efficace, ateliers de création, bibliothèque de prompts.
- **Jour 4 – ChatGPT : usages professionnels fondamentaux** : rédaction assistée (mails, comptes rendus, notes, documents internes), ajustement du ton/style/niveau.
- **Jour 5 – ChatGPT : usages avancés et qualité** : itération et reformulation, auto-correction, prompts avancés, standardisation et contrôle qualité.
- **Jour 6 – IA et organisation personnelle du dirigeant** : gestion du temps, priorisation, organisation des idées et projets, cas pratiques.
- **Jour 7 – Création de contenus avec l'IA** : contenus écrits professionnels, structuration, Canva IA, supports visuels et présentations.
- **Jour 8 – IA et communication d'entreprise** : communication interne/externe, adaptation des messages, mise en situation, optimisation de l'impact.
- **Jour 9 – Identifier les tâches à automatiser** : analyse des tâches chronophages, gains de productivité, priorisation, études de cas des participants.
- **Jour 10 – Introduction aux automatisations simples** : logique des workflows, outils d'automatisation, création de scénarios simples.
- **Jour 11 – IA, données et reporting** : analyse de données simples, synthèse, rapports automatisés, aide à la décision.
- **Jour 12 – Sécurité, RGPD et usage responsable** : protection des données, risques, cadre réglementaire, règles internes d'usage.
- **Jour 13 – Déployer l'IA dans son entreprise** : accompagnement du changement, rôle du dirigeant, structuration d'une démarche IA interne, pilotage.
- **Jour 14 – Autonomie et veille IA** : veille efficace, suivi des évolutions, boîte à outils IA personnalisée, cas avancés.
- **Jour 15 – Synthèse et plan d'action final** : récapitulatif, quiz de validation, plan d'action IA personnalisé, présentation, clôture et bilan.

## Modalités pédagogiques
La formation se déroule en présentiel. Le nombre de participants peut varier de 1 à 25 personnes maximum.

## Moyens et supports pédagogiques
Mises en situation professionnelles (techniques de prospection, discours, posture) et échanges sur les pratiques. Un livret de formation est remis à chaque participant en début de formation. Le formateur déroule la formation avec une présentation Canva projetée.

## Modalités d'évaluation et de suivi
- Une liste d'émargement est à signer à la demi-journée
- Un certificat de réalisation est délivré à chaque participant en fin de formation
- Une évaluation sous forme de QCM a lieu en fin de formation

## Modalités d'accès, inscription et délai
Contacter au minimum 14 jours avant le début : Julien LAFITTE — julien@start-academy.fr — 06 22 80 65 09. Convention + convocation 7 jours avant. Subrogation : accord du financeur requis avant le début.

## Accessibilité aux personnes en situation de handicap
La loi du 5 septembre 2018 pour la « liberté de choisir son avenir professionnel » vise à faciliter l'accès à l'emploi des personnes en situation de handicap. Notre organisme s'efforce de donner à tous les mêmes chances d'accéder ou de maintenir l'emploi. Nous pouvons adapter certaines de nos modalités de formation : nous étudions ensemble vos besoins. Contact : Julien LAFITTE — julien@start-academy.fr — 06 22 80 65 09. Conformément à la réglementation (loi du 11 février 2005 et articles D.5211-1 et suivants du code du travail), START ACADEMY s'engage à répondre aux besoins particuliers des stagiaires en situation de handicap (aménagements de durée, rythme, méthodes et supports). Le cas échéant, mobilisation de compétences externes (Centre de Ressources Formation Handicap, P.A.S AGEFIPH-FIPHFP) et ressources ad hoc (ACCEA, EPATECH…).$prog$
WHERE id LIKE 'cf80eb86%';

-- ============ 3. Optimisation des SI avec l'IA (cada712b / PROD-0668) — 14h, cap 5 ============
-- NB: "secteur financier" CONSERVÉ ici (public = cabinets gestion patrimoine/banque/assurance) — cohérent, contrairement à PROD-0673 immobilier.
UPDATE "TrainingProduct" SET
  "capacityMin" = 1, "capacityMax" = 5,
  objectives = $obj$["Comprendre le rôle du système d'information dans la performance globale et dans la transition numérique de l'entreprise.", "Identifier les points faibles d'un SI et les leviers d'optimisation.", "Automatiser des processus métiers grâce à des outils IA (Make, Zapier, Power Automate).", "Améliorer l'efficacité énergétique numérique via l'optimisation des traitements, workflows et stockage (sobriété numérique).", "Intégrer l'IA dans le CRM et les outils collaboratifs au service de la transition numérique.", "Améliorer la qualité, la sécurité et la sobriété des données.", "Élaborer un mini-plan d'action pour une transition numérique responsable et performante."]$obj$::jsonb,
  "programMd" = $prog$# Optimisation des systèmes d'information avec l'IA

**Modalité :** Présentiel · **Durée :** 2 journées de 7h (14h) · **Effectif :** 5 personnes max · **Lieu :** 20 rue de France, Nice

## Public
- Salariés de cabinets de gestion de patrimoine, banque, assurance
- Utilisateurs de CRM, responsables digitaux
- Collaborateurs engagés dans un projet de transition numérique ou d'optimisation des outils digitaux

## Profil du formateur
Tous les formateurs de l'équipe Start-Academy ont minimum 8 années d'expérience dans l'immobilier, notamment dans la vente de biens, la formation d'agents et le coaching individuel.

## Prérequis pédagogiques
Aucun.

## Objectifs de la formation
- Comprendre le rôle du système d'information dans la performance globale et dans la transition numérique de l'entreprise.
- Identifier les points faibles d'un SI et les leviers d'optimisation.
- Automatiser des processus métiers grâce à des outils IA (Make, Zapier, Power Automate).
- Améliorer l'efficacité énergétique numérique via l'optimisation des traitements, workflows et stockage (sobriété numérique).
- Intégrer l'IA dans le CRM et les outils collaboratifs au service de la transition numérique.
- Améliorer la qualité, la sécurité et la sobriété des données.
- Élaborer un mini-plan d'action pour une transition numérique responsable et performante.

## Contenu

### Jour 1 – Optimisation du SI & automatisation IA au service de la transition numérique (7h)
- **Matin (9h-12h30)** : Rôle du SI dans la performance interne et la transition numérique ; spécificités du secteur financier (sécurité, conformité, flux critiques) ; principes du numérique responsable (sobriété des données, optimisation des usages, réduction des traitements inutiles) ; atelier (cartographie simplifiée du SI : flux, outils, doublons, pertes de productivité).
- **Après-midi (14h-17h30)** : Découverte des outils d'automatisation IA (Make, Zapier, Power Automate) ; création d'un premier workflow automatisé (réduction des tâches répétitives, des traitements, des erreurs ; améliorations RSE) ; cas pratique (automatiser un flux métier simple, ex. relance client).

### Jour 2 – IA intégrée, données responsables & plan d'action de transition numérique (7h)
- **Matin (9h-12h30)** : IA appliquée aux CRM et outils collaboratifs (Teams, Notion, Slack) ; fiabilisation et sobriété des données (nettoyer, structurer, réduire la redondance ; gestion responsable des données sensibles) ; atelier (améliorer une base clients en réduisant les doublons et en optimisant les champs).
- **Après-midi (14h-17h30)** : Bonnes pratiques de sécurité et conformité (RGPD, gestion des accès) ; piliers d'une transition numérique responsable (stockage optimisé, réduction des temps de calcul, diminution de l'empreinte numérique) ; atelier final (mini-plan d'action d'optimisation et de transition numérique responsable) ; QCM + bilan individuel + attestations.

## Modalités pédagogiques
- Formation en présentiel

## Moyens et supports pédagogiques
- Études de cas concrets issus du secteur financier
- Exercices pratiques avec CRM, outils d'automatisation et IA
- Livret de formation et supports projetés

## Modalités d'évaluation et de suivi
- Une liste d'émargement est à signer à la demi-journée
- Un certificat de réalisation est délivré à chaque participant en fin de formation
- Une évaluation sous forme de QCM a lieu en fin de formation

## Modalités d'accès, inscription et délai
Contacter au minimum 14 jours avant le début : Angélique LAFITTE — formation@start-academy.fr — 06 16 24 63 43. Convention + convocation 7 jours avant. Subrogation : accord du financeur requis avant le début.

## Accessibilité aux personnes en situation de handicap
La loi du 5 septembre 2018 pour la « liberté de choisir son avenir professionnel » vise à faciliter l'accès à l'emploi des personnes en situation de handicap. Notre organisme s'efforce de donner à tous les mêmes chances d'accéder ou de maintenir l'emploi. Nous pouvons adapter certaines de nos modalités de formation : nous étudions ensemble vos besoins. Conformément à la réglementation (loi du 11 février 2005 et articles D.5211-1 et suivants du code du travail), START ACADEMY s'engage à répondre aux besoins particuliers des stagiaires en situation de handicap (aménagements de durée, rythme, méthodes et supports). Le cas échéant, mobilisation de compétences externes (Centre de Ressources Formation Handicap, P.A.S AGEFIPH-FIPHFP) et ressources ad hoc (ACCEA, EPATECH…).$prog$
WHERE id LIKE 'cada712b%';

COMMIT;
