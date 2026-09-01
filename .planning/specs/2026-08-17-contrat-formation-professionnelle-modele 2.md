---
created: 2026-08-17
title: Contrat de formation professionnelle — modèle fourni par Laurent + écarts à corriger
source: Laurent, 2026-08-17 (texte intégral collé en session)
statut: matière première pour le chantier « contrat vs convention » — PAS ENCORE IMPLÉMENTÉ
lié:
  - .planning/todos/pending/2026-08-12-contrat-vs-convention-analyse-par-commanditaire.md
---

## À quoi sert ce fichier

Laurent a fourni le 17/08 le texte intégral de son contrat de formation professionnelle
(document Word utilisé hors app). Il sert de gabarit au futur `contrat-template.ts` — le
document qui manque pour les **agents co qui paient eux-mêmes** (là où les salariés dont
l'entreprise paie reçoivent une convention).

Son mot : « Le contrat de formation est quasi identique à la convention ».

## ⚠ Écarts relevés dans le modèle — à corriger AVANT implémentation

| # | Dans le modèle | Correction | Gravité |
|---|---|---|---|
| 1 | Siège « 618 boulevard Jean Maurel Inférieur, 06140 Vence » | **12 avenue des Camélias, 06800 Cagnes-sur-Mer** (déménagement 12/08/2026). Doit venir de `of-config`, jamais en dur | 🔴 Bloquant |
| 2 | Signataire « Julien Lafitte, le Président » | **Laurent Marx** — même bug que celui corrigé sur les certificats le 04/06/2026 | 🔴 Bloquant |
| 3 | « 500 € TTC (dont TVA 20 % 83,33 €) » | Start Academy est en **exonération TVA art. 261-4-4° du CGI** (cf. gabarit facture). Un contrat à 20 % contredit les factures — un auditeur croise les deux | 🔴 Bloquant |
| 4 | Art. 9 : « la présente **convention** », « le représentant de l'**entreprise bénéficiaire** » | Scorie de copier-coller depuis la convention : on est dans un contrat **individuel**, le signataire est le stagiaire | 🟠 À corriger |
| 5 | Art. 6 : rétractation **14 jours** | L6353-5 prévoit **10 jours**. 14 j est plus favorable au stagiaire donc licite, mais doit être un choix assumé et cohérent partout | 🟠 À trancher |
| 6 | Programme, objectifs, durée, prix en dur | À injecter depuis `TrainingProduct` / `SessionParticipant.priceHT` comme le fait déjà la convention | 🟡 Implémentation |
| 7 | Formateur : « Bac + 4 École de commerce, 12 ans d'expérience » | À injecter depuis le formateur réel de la session (`session.trainers`) | 🟡 Implémentation |

## Structure du document (10 articles)

1. **Objet** — organisme (SIRET, n° DA 93 06 10481 06) + co-contractant (nom, prénom, adresse,
   statut et fonction du stagiaire) ; catégorie L6313-1 = actions de développement des compétences
2. **Nature et caractéristiques** — champ L6353-1 et suivants, objectifs (verbes Bloom), attestation
   délivrée en fin, durée en heures
3. **Programme** — modules et sous-objectifs
4. **Organisation** — dates, lieu, effectif, titres/références du formateur
5. **Modalités d'évaluation et de sanction** — attestation de présence, émargement par demi-journée
   (stagiaires + formateur), QCM de fin
6. **Délai de rétractation** — LRAR, aucune somme exigible (voir écart #5)
7. **Dispositions financières** — prix, modalités de règlement (voir écart #3)
8. **Interruption du stage** — force majeure → résiliation, prestations dues au prorata temporis
9. **Collecte et traitement des données personnelles** — finalités (L6362-6 justificatifs,
   suivi pédagogique), destinataires, droits RGPD art. 13, conservation 5 ans puis archivage, CNIL
10. **Cas de différend** — tribunal judiciaire de Nice

Signature : double exemplaire, « Fait à …, le … », stagiaire + organisme.

## Texte intégral fourni par Laurent (verbatim, écarts NON corrigés)

> CONTRAT DE FORMATION PROFESSIONNELLE (Articles L.6353-3 et suivants du Code du travail)
>
> Entre les soussignés : 1) L'organisme de formation START ACADEMY, adresse siège social : 618 boulevard Jean Maurel Inférieur 06140 Vence - N° de SIRET : 95131909400011 enregistré auprès de la Direction Régionale de l'Économie, de l'Emploi du Travail et des Solidarités de NICE sous le numéro 93 06 10481 06 ; 2) Le co-contractant : Nom, prénom, adresse du stagiaire, statut et fonction (poste occupé).
>
> **Article 1 : Objet** — En exécution du présent contrat, l'organisme de formation s'engage à organiser l'action de formation : « L'immobilier et sa prospection efficace : Devenir incontournable sur son secteur ». Catégorie d'action de formation (article L.6313-1 du code du travail) : Actions de formation de développement des compétences.
>
> **Article 2 : Nature et caractéristiques des actions de formation** — L'action de formation entre dans le champ d'application des dispositions relatives à la formation professionnelle tel qu'il est défini aux articles L6353-1 et suivants du code du travail. Elle a pour objectifs de : Connaitre et sélectionner les différentes méthodes de prospection immobilières ; Créer et entretenir une base de données solide au quotidien ; Définir sa sphère d'influence et savoir la cultiver. À l'issue de la formation, une attestation sera délivrée au stagiaire. Sa durée est fixée à 7 heures.
>
> **Article 3 : Programme de formation** — La formation se déroule en 1 module. Connaitre et sélectionner les différentes méthodes de prospection adaptées ; Identifier les atouts et les limites du porte à porte ; Connaitre les différentes techniques de la pige et ses avantages et limites ; Faire une veille concurrentielle et connaitre son intérêt dans la prospection ; Repérer la récupération facile des biens à vendre, les acquéreurs source de prospection ; Choisir les méthodes appropriées à la situation. Créer et entretenir une base de données ; Apprendre à constituer et fidéliser une base de données efficace ; Relationner avec les commerçants, source de contacts ; Utiliser les réseaux sociaux pour trouver des prospects ; Identifier les professions liées à son métier pour trouver des contacts pertinents ; Exploiter le site « Leboncoin » comme outil de prospection. Définir sa sphère d'influence ; Comprendre ce qu'est la sphère d'influence et les différents acteurs qui la constituent ; Construire sa sphère d'influence efficacement en identifiant les personnes clés à contacter et en cultivant des relations durables. Cibler, constituer et cultiver des leads ; Se positionner comme un référent de son secteur ; Connaitre les acteurs du marché et les contacter efficacement ; Entretenir les relations avec les différents interlocuteurs pour convertir des leads en clients. QCM évaluation des acquis ; Questionnaire de satisfaction et clôture de la formation.
>
> **Article 4 : Organisation de l'action de formation** — L'action de formation aura lieu du …/…/… au …/…/… à …………. Elle est organisée pour un effectif de … stagiaires. Les diplômes, titres ou références de(s) personne(s) chargée(s) de la formation sont indiqués ci-dessous : Bac + 4 Ecole de commerce, 12 ans d'expérience en immobilier (gérant d'agence, coach formateur).
>
> **Article 5 : Modalités d'évaluation et de sanction** — Remise d'une attestation de présence délivrée en fin de formation. Feuille de présence émargée par demi-journée par les stagiaires et le formateur. Evaluation des acquis en fin de formation par QCM.
>
> **Article 6 : Délai de rétractation** — A compter de la date de signature du présent contrat, le stagiaire dispose d'un délai de 14 jours pour se rétracter. Il doit en informer l'organisme de formation par lettre recommandée avec accusé de réception. Dans ce cas, aucune somme ne peut être exigée du stagiaire.
>
> **Article 7 : Dispositions financières** — Le prix de l'action de formation s'élève à 500 € TTC (dont TVA 20% 83,33€). Le règlement s'effectuera à réception de la facture en fin de formation.
>
> **Article 8 : Interruption du stage** — En cas de cessation anticipée de la formation du fait de l'organisme de formation ou l'abandon du stage par le stagiaire pour un autre motif que la force majeure dûment reconnue, le présent contrat est résilié selon les modalités financières suivantes : Si le stagiaire est empêché de suivre la formation par suite de force majeure dûment reconnue, le contrat de formation professionnelle est résilié. Dans ce cas, seules les prestations effectivement dispensées sont dues au prorata temporis de leur valeur prévue au présent contrat.
>
> **Article 9 : Collecte et traitement des données à caractère personnel** — L'organisme de formation tient à rappeler au signataire de la présente convention que l'exécution du présent contrat rend nécessaire la collecte et le traitement de données à caractère personnel le concernant et ce, afin de respecter les finalités suivantes : Permettre à l'organisme de formation de satisfaire à ses obligations de justificatifs de la réalité des actions de formations dispensées, telles que précisées aux articles L.6362-6 et suivants du Code du travail et plus spécifiquement des feuilles d'émargement. Permettre le suivi technique, administratif et pédagogique de l'action de formation dans le cadre de la réalisation de la formation, objet des présentes. L'organisme de formation tient à rappeler que le défaut de fourniture de ces données personnelles empêcherait la réalisation des objectifs ci-avant rappelés et que la collecte conditionne plus généralement la conclusion et l'exécution du présent contrat. Les données à caractère personnel seront adressées aux formateurs intervenants au sein de l'organisme de formation, aux organismes financeurs le cas échéant, aux autorités de contrôle, dûment habilitées par les dispositions légales et réglementaires en vigueur. En application de l'article 13 du règlement européen sur la protection des données à caractère personnel du 27 avril 2016, le représentant de l'entreprise bénéficiaire signataire de la présente convention est informé de ce qu'il dispose du droit de demander au responsable du traitement l'accès aux données à caractère personnel, la rectification ou l'effacement de celles-ci, ou une limitation du traitement relatif à le personne concernée, ou du droit de s'opposer au traitement ou du droit à la portabilité des données. Ces données seront conservées pendant toute la durée et l'exécution du présent contrat, ainsi que, le cas échéant, pour la durée de la prolongation éventuelle. Afin de permettre un suivi statistique et préserver les intérêts de l'organisme de formation du point de vue de l'engagement de sa responsabilité civile, elles seront également conservées pendant une durée de 5 (cinq) ans à compter du terme du présent contrat, correspondant au délai de prescription de droit commun. Cette durée pourra être prolongée le cas échéant, en cas de survenance d'événements qui pourraient interrompre ou suspendre ce délai de prescription. Pendant cette durée, ces données feront l'objet d'un archivage, préalable à leur suppression définitive. Le signataire de la présente convention est également informé de ce qu'il dispose de droit de saisir une autorité de contrôle afin d'introduire, le cas échéant, une réclamation, en saisissant plus spécifiquement la Commission Nationale Informatique et Libertés (CNIL).
>
> **Article 10 : Cas de différend** — Si une contestation ou un différend n'ont pu être réglés à l'amiable, le tribunal judiciaire de NICE sera seul compétent pour régler le litige.
>
> Fait, en double exemplaire, à ………, le …/…/…
> Pour le stagiaire (Nom et prénom du signataire) — Pour l'organisme de formation : Julien Lafitte, le Président
