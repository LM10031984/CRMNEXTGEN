BEGIN;

INSERT INTO "TrainingProduct"
  (id, "tenantId", code, title, "durationHours", modality, objectives, "programMd",
   "priceHT", "vatRate", version, "isActive", "excludedFromBpf", "capacityMin", "capacityMax",
   "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'db191440-a144-48d1-93c1-767e6f647f2c',
  'PROD-0673',
  $t$Optimiser son activité immobilière grâce à l'Intelligence Artificielle$t$,
  40,
  'PRESENTIEL',
  $obj$["À l'issue de la formation, le stagiaire sera capable de :", "Comprendre les fondamentaux de l'intelligence artificielle générative et ses usages dans l'immobilier", "Identifier les outils d'IA adaptés aux professionnels de l'immobilier", "Utiliser ChatGPT et d'autres outils IA pour améliorer la prospection et la relation client", "Créer rapidement des contenus commerciaux immobiliers avec l'IA", "Automatiser certaines tâches administratives et marketing", "Optimiser la diffusion et la visibilité des biens immobiliers grâce à l'IA", "Mettre en place une stratégie d'intégration de l'IA dans son activité immobilière quotidienne"]$obj$::jsonb,
  $prog$# Optimiser son activité immobilière grâce à l'Intelligence Artificielle

**Modalité :** Présentiel · **Durée :** 5 journées de 8h (40h) · **Effectif :** 25 personnes max

## Public
- Agents immobiliers
- Mandataires immobiliers
- Négociateurs immobiliers
- Responsables d'agence immobilière
- Professionnels de l'immobilier souhaitant intégrer l'IA dans leur activité

## Profil du formateur
Tous les formateurs de l'équipe Start-Academy ont minimum 8 années d'expérience dans l'immobilier, notamment dans la vente de biens, la formation d'agents et le coaching individuel.

## Prérequis pédagogiques
Aucune connaissance préalable en intelligence artificielle n'est requise.

## Objectifs de la formation
- Comprendre les fondamentaux de l'intelligence artificielle générative et ses usages dans l'immobilier
- Identifier les outils d'IA adaptés aux professionnels de l'immobilier
- Utiliser ChatGPT et d'autres outils IA pour améliorer la prospection et la relation client
- Créer rapidement des contenus commerciaux immobiliers avec l'IA
- Automatiser certaines tâches administratives et marketing
- Optimiser la diffusion et la visibilité des biens immobiliers grâce à l'IA
- Mettre en place une stratégie d'intégration de l'IA dans son activité immobilière quotidienne

## Contenu

### Jour 1 – Comprendre l'IA et ses applications dans l'immobilier
- **09h00–09h30** : Accueil, présentation du programme, tour de table et recueil des attentes, évaluation du niveau initial
- **09h30–10h30** : Introduction à l'IA — ce qu'est l'IA, IA classique vs générative, grandes évolutions en entreprise
- **10h30–11h30** : Panorama des outils d'IA utiles pour l'immobilier — ChatGPT, Perplexity, Claude, Canva IA, génération d'images, outils d'automatisation
- **11h30–13h00** : Cas d'usage de l'IA dans l'immobilier — rédaction d'annonces, réponses aux prospects, mails professionnels, contenus marketing
- **14h00–14h30** : Découverte pratique de ChatGPT — création de compte, fonctionnement des prompts, premiers tests
- **14h30–16h00** : Bien dialoguer avec l'IA — structurer ses demandes, créer des prompts efficaces, optimiser les résultats
- **16h00–18h00** : Atelier — prompts pour rédiger une annonce, répondre à un prospect, présenter un bien, rédiger un email commercial

### Jour 2 – Utiliser l'IA pour la prospection immobilière
- **09h00–10h30** : Comprendre la prospection immobilière avec l'IA — opportunités, scripts de prospection, approche commerciale
- **10h30–13h00** : Créer des scripts de prospection avec l'IA — appels, messages LinkedIn, emails, relances automatiques + atelier pratique
- **14h00–15h00** : Prospection digitale — posts LinkedIn immobiliers, contenus réseaux sociaux, planification
- **15h00–16h30** : Stratégie de contenu immobilier — publications attractives, contenus éducatifs, posts d'expertise
- **16h30–18h00** : Atelier — calendrier de contenu immobilier, génération de plusieurs posts

### Jour 3 – Créer des contenus immobiliers avec l'IA
- **09h00–10h30** : Rédiger des annonces immobilières performantes — structurer, optimiser les descriptions, valoriser un bien
- **10h30–13h00** : Atelier — annonces pour appartement, maison, bien haut de gamme, investissement locatif
- **13h30–15h00** : Améliorer les supports marketing — flyers, visuels d'annonces, présentations commerciales
- **15h00–16h30** : Outils de génération d'images — Canva IA, DALL-E, Midjourney
- **16h30–18h00** : Atelier — visuels d'annonces, visuels réseaux sociaux, présentations de biens

### Jour 4 – Automatiser son activité immobilière avec l'IA
- **09h00–10h30** : Comprendre l'automatisation — automatiser des tâches, optimiser le suivi client, réduire le temps administratif
- **10h30–13h00** : Gérer la relation client avec l'IA — réponses automatiques, suivi prospects, messages personnalisés
- **14h00–15h00** : Automatiser sa communication — emails automatiques, réponses aux demandes, messages de relance
- **15h00–16h30** : Créer des assistants IA — assistant IA immobilier, base de réponses types, base de prompts immobiliers
- **16h30–18h00** : Atelier — création d'un assistant IA personnalisé pour son activité

### Jour 5 – Mettre en place une stratégie IA dans son activité immobilière
- **09h00–10h30** : Structurer sa stratégie IA — identifier les tâches automatisables, prioriser les outils, intégrer l'IA au quotidien
- **10h30–13h00** : Optimiser son organisation — organisation commerciale, optimisation du temps, suivi des prospects
- **14h00–15h00** : Créer un plan d'action IA — outils à utiliser, priorités, mise en place
- **15h00–16h30** : Atelier final — construction d'un plan d'utilisation de l'IA dans son activité immobilière
- **16h30–17h30** : Présentation des plans d'action, échanges et ajustements
- **17h30–18h00** : Évaluation finale, bilan de la formation

## Modalités pédagogiques
- Formation en présentiel
- Études de cas concrets issus du secteur immobilier
- Exercices pratiques avec CRM, outils d'automatisation et IA
- Livret de formation et supports projetés

## Modalités d'évaluation et de suivi
- Une liste d'émargement est à signer à la demi-journée
- Un certificat de réalisation est délivré à chaque participant en fin de formation
- Une évaluation sous forme de QCM a lieu en fin de formation

## Modalités d'accès, inscription et délai
Pour vous inscrire, contacter au minimum 14 jours avant le début : Angélique LAFITTE — formation@start-academy.fr — 06 16 24 63 43. Après validation, une convention de formation est adressée et une convocation est envoyée par mail 7 jours avant le début. En cas de subrogation de paiement, l'accord du financeur doit nous parvenir avant le début de la formation.

## Accessibilité aux personnes en situation de handicap
La loi du 5 septembre 2018 pour la « liberté de choisir son avenir professionnel » vise à faciliter l'accès à l'emploi des personnes en situation de handicap. Notre organisme s'efforce de donner à tous les mêmes chances d'accéder ou de maintenir l'emploi. Nous pouvons adapter certaines de nos modalités de formation : nous étudions ensemble vos besoins. Contact : Angélique LAFITTE — formation@start-academy.fr — 06 16 24 63 43.

Conformément à la réglementation (loi du 11 février 2005 et articles D.5211-1 et suivants du code du travail), START ACADEMY s'engage à répondre aux besoins particuliers des stagiaires en situation de handicap en proposant des aménagements (durée, rythme, méthodes et supports pédagogiques). Le cas échéant, l'organisme pourra mobiliser des compétences externes (Centre de Ressources Formation Handicap, P.A.S AGEFIPH-FIPHFP) et les ressources ad hoc (ACCEA, EPATECH…) pour la recherche de solutions permettant l'accès aux formations.$prog$,
  1680, 0, 1, true, false, 1, 25, now(), now()
);

UPDATE "TrainingSession"
  SET "productId" = (SELECT id FROM "TrainingProduct" WHERE code='PROD-0673')
  WHERE code='SES-0084';

COMMIT;
