# Design — Génération du BPF (Cerfa 10443\*17) dans QualiOF

**Date :** 2026-08-13
**Statut :** design validé par Laurent, prêt pour planification
**Origine :** dernier manque structurel identifié par l'audit du 12/08 —
« les données nécessaires existent, mais pas d'état *Cerfa 10443 prêt à déposer* ».
**Étalon :** BPF 2025 réellement télétransmis le 01/04/2026 (NDA 93061048106), fourni par
Laurent. Ce document fixe les libellés exacts et sert de référence de validation.

---

## 1. Contexte réglementaire

Obligatoire pour tout prestataire de formation professionnelle (art. L.6352-6 à L.6352-11,
L.6355-15, R.6352-22 à R.6352-24 du Code du travail). Retrace l'exercice comptable clos.

| Fait | Valeur | Conséquence de design |
|---|---|---|
| Date limite | **30 avril** de l'année suivante | Le panneau d'anomalies doit servir dès janvier |
| Canal | **Mon Activité Formation**, en ligne | Cible = écran de recopie, pas un PDF |
| Cerfa papier | Recours **uniquement** si MAF inaccessible | PDF pré-rempli hors périmètre V1 |
| Sanction | Jusqu'à **4 500 €**, annulation possible du NDA | Justifie la traçabilité du déclaré |

**Version de référence : Cerfa n° 10443\*17, mention FA 08.** Structure en 8 cadres, A à H,
sur 2 pages. Les libellés ci-dessous sont **relevés sur le formulaire réel**, pas reconstitués.

---

## 2. Objectif

Une page `/app/bpf` qui, pour un exercice donné, présente **tous les chiffres du BPF classés
dans l'ordre des cadres**, chacun copiable en un clic. Laurent ouvre MAF à côté, recopie, puis
marque la déclaration déposée — QualiOF fige alors ce qui a été déclaré.

**La valeur n'est pas dans le calcul**, qui est de l'arithmétique. Elle est dans le **panneau
d'anomalies**, et dans les **trois contrôles de cohérence que le formulaire impose lui-même**
(§ 9).

---

## 3. Décisions verrouillées

Arbitrées par Laurent le 2026-08-13. À ne pas rouvrir en planification.

| # | Décision | Retenu |
|---|---|---|
| D-01 | Forme de la sortie | **Écran de recopie MAF.** Pas de PDF Cerfa en V1. |
| D-02 | Cadre D (charges) | **Saisie annuelle mémorisée**, conservée par exercice, N-1 en référence. |
| D-03 | Persistance | **Déclaration figée par exercice** : brouillon, puis instantané au dépôt. |
| D-04 | Heures-stagiaires | **Présent = durée complète du produit. Absent et abandon = 0 h.** |
| D-05 | Exercice comptable | **Année civile** — confirmé par le BPF 2025 (01/01 → 31/12). |
| D-06 | Statut des formateurs | Laurent déclare « tous prestataires ». **⚠️ Contredit par le BPF 2025** (voir § 12). |
| D-07 | Étalon de validation | **BPF 2025 déposé le 01/04/2026** — valeurs en § 11, **partiellement fiable** (voir D-09). |
| D-08 | Cadre D à zéro en 2025 | **Assumé et non rectifié** — le BPF est déposé, il ne sera pas rouvert. Mais « pour les prochains, faire les choses bien » : le cadre D devient une **anomalie bloquante** si des produits sont déclarés et les charges laissées à zéro. |
| D-09 | Portée de l'étalon | Le BPF 2025 vaut comme référence pour les cadres **C, E, F** (montants, effectifs, heures). Il **ne vaut pas** pour le cadre D, ni pour le classement F-1 — deux simplifications assumées à l'époque, à ne pas reproduire. |
| D-10 | Ligne F-1 des agents en EI | **Au cas par cas, dérivé automatiquement** (voir § 5.4). Un mandataire en EI relève de la ligne **e**, un salarié d'enseigne de la ligne **a**. Le classement uniforme en ligne a de 2025 n'est pas repris. |

---

## 4. Structure réelle du formulaire

### Cadre A — Identification de l'organisme

Numéro de déclaration · Forme juridique · N° SIRET · Code NAF · Dénomination · Adresse ·
**« Acceptez-vous que cette adresse soit rendue publique : oui / non »** · Téléphone ·
Email de contact.

### Cadre B — Informations générales

Exercice comptable du … au … · **« Avez-vous mis en œuvre, durant cette période, une ou des
actions de formation en tout ou partie à distance (classes virtuelles, e-learning, etc.) :
oui / non »**.

Les deux cases oui/non de A et B sont des **préférences stockées**, pas des calculs.

### Cadre C — Bilan financier hors taxes : origine des produits

Libellés et numéros de ligne exacts :

| Ligne | Libellé |
|---|---|
| 1 | des entreprises pour la formation de leurs salariés |
| 2.a | *(organismes gestionnaires des fonds)* des contrats d'apprentissage |
| 2.b | des contrats de professionnalisation |
| 2.c | de la promotion ou de la reconversion par alternance |
| 2.d | des projets de transition professionnelle |
| 2.e | du compte personnel de formation |
| 2.f | des dispositifs spécifiques pour les personnes en recherche d'emploi |
| 2.g | **des dispositifs spécifiques pour les travailleurs non-salariés** |
| 2.h | du plan de développement des compétences ou d'autres dispositifs |
| **2** | Total des produits provenant des organismes gestionnaires *(a à h)* |
| 3 | des pouvoirs publics pour la formation de leurs agents |
| 4 | *(publics spécifiques)* Instances européennes |
| 5 | État |
| 6 | Conseils régionaux |
| 7 | France travail (ex Pôle emploi) |
| 8 | Autres ressources publiques |
| 9 | de contrats conclus avec des personnes à titre individuel et à leurs frais |
| 10 | de contrats conclus avec d'autres organismes de formation (y compris CFA) |
| 11 | Autres produits au titre de la formation professionnelle |
| **TOTAL** | Total des produits réalisés au titre de la formation professionnelle *(1 à 11)* |
| — | **Part du chiffre d'affaires global réalisée dans le domaine de la formation professionnelle (en %)** |

### Cadre D — Bilan financier hors taxes : charges de l'organisme

Total des charges liées à l'activité de formation, dont **Salaires des formateurs** et
**Achats de prestation de formation et honoraires de formation**.

### Cadre E — Personnes dispensant des heures de formation

Deux lignes, chacune avec *Nombre* et *Nombre d'heures de formation dispensées* :

1. Personnes **de votre organisme** dispensant des heures de formation
2. Personnes **extérieures** à votre organisme dispensant des heures de formation dans le cadre
   de contrats de sous-traitance

### Cadre F — Bilan pédagogique

Quatre sous-cadres, chacun en *Nombre de stagiaires* × *Nombre total d'heures de formation
suivies*.

**F-1. Type de stagiaires de l'organisme**

| | Libellé |
|---|---|
| a | Salariés d'employeurs privés hors apprentis |
| b | Apprentis |
| c | Personnes en recherche d'emploi formées par votre organisme de formation |
| d | Particuliers à leurs propres frais formés par votre organisme de formation |
| e | Autres stagiaires |
| **(1)** | TOTAL |

**F-2. Dont activité sous-traitée de l'organisme** — stagiaires dont l'action a été **confiée
par** Start Academy **à** un autre organisme. → total **(2)**

**F-3. Objectif général des prestations dispensées**

| | Libellé |
|---|---|
| a | Formations visant un diplôme, un titre à finalité professionnelle ou un CQP enregistré au RNCP — *dont niveaux 6 à 8, 5, 4, 3, 2, et CQP sans niveau* |
| b | Formations visant une certification (dont CQP) ou une habilitation enregistrée au répertoire spécifique (RS) |
| c | Formations visant un CQP non enregistré au RNCP ou au RS |
| d | **Autres formations professionnelles** |
| e | Bilans de compétence |
| f | Actions d'accompagnement à la validation des acquis de l'expérience |
| **(3)** | TOTAL |

**F-4. Spécialités de formation** — les **cinq principales** en clair, avec leur **code NSF**,
plus une ligne « Autres spécialités ». → total **(4)**

### Cadre G — Stagiaires confiés à votre organisme par un autre organisme

Sous-traitance **entrante** — Start Academy intervient comme sous-traitant. → total **(5)**

⚠️ Ne pas confondre F-2 (sortante) et G (entrante). La notice le rappelle explicitement : les
actions confiées à votre organisme par un autre OF ne se comptabilisent **pas** dans les cadres
F, elles vont en G et correspondent aux produits de la ligne 10 du cadre C.

### Cadre H — Personne ayant la qualité de dirigeant

Nom et prénom · Qualité.

---

## 5. Ce que le formulaire réel change par rapport au design initial

Quatre corrections majeures issues de la lecture du BPF 2025.

### 5.1 Les catégories BPF de QualiOF sont périmées

`BPF_OPTIONS` dans `edit-person-button.tsx` propose aujourd'hui :

| Valeur en base | Existe dans le Cerfa \*17 ? |
|---|---|
| `F.1.a - Salariés d'employeurs privés hors apprentis` | ✅ = F-1 ligne **a** |
| `F.1.b - Salariés d'employeurs publics` | ❌ **n'existe plus** |
| `F.2 - Personnes en recherche d'emploi` | ✅ = F-1 ligne **c** |
| `F.3 - Particuliers à leurs propres frais` | ✅ = F-1 ligne **d** |
| `F.4 - Travailleurs indépendants, professions libérales…` | ❌ **n'existe plus** → ligne **e** « Autres stagiaires » |

Ces libellés viennent d'une version antérieure du Cerfa. **Une migration de données est
nécessaire** pour reclasser l'existant sur les cinq lignes réelles, et la liste déroulante doit
être refaite. À traiter en premier : tout le cadre F en dépend.

### 5.2 Trois sous-cadres non prévus

F-2, F-3 et F-4 n'étaient pas dans le design initial.

- **F-3** est une seconde dimension de chaque stagiaire : *objectif de la formation*. Les champs
  `TrainingProduct.bpfCategory` et `bpfLevel` existent déjà et sont probablement faits pour ça —
  à vérifier et à câbler. Pour Start Academy, tout tombe aujourd'hui en **d, autres formations
  professionnelles**.
- **F-4** exige des **codes NSF** sur les produits. `TrainingProduct.bpfSpecialty` existe :
  il doit porter le code NSF, pas un libellé libre. Seules les **cinq principales** spécialités
  sont déclarées, le reste est agrégé en « Autres ».
- **F-2** est à zéro tant que Start Academy ne confie pas d'action à un autre OF.

### 5.3 Le cadre C se pilote par le payeur, pas par le mode de financement

Le cadre C demande **d'où vient l'argent encaissé par l'organisme**. Le déterminant est donc
**qui Start Academy facture** — information que porte `Invoice.payerOrg` — et non le dispositif
qui rembourse ensuite l'apprenant.

Le cas dominant l'illustre : Start Academy facture l'**EI de l'agent commercial**, qui paie ;
l'AGEFICE rembourse ensuite **l'apprenant**, pas l'organisme. Du point de vue du BPF, le produit
ne provient donc **pas** d'un organisme gestionnaire de fonds — il provient du client facturé.
La ligne 2.g n'est mobilisée que si l'AGEFICE **paie directement** Start Academy (subrogation).

**Règle retenue** — pilotée par le payeur, avec le mode de financement en signal secondaire :

| Situation | Ligne C |
|---|---|
| Facture émise à une personne morale employeur, pour ses salariés | 1 |
| Facture émise à un organisme gestionnaire de fonds (AGEFICE, OPCO) en subrogation, dispositif travailleurs non-salariés | 2.g |
| Idem, dispositif CPF | 2.e |
| Idem, dispositif demandeurs d'emploi | 2.f |
| Facture émise à France Travail | 7 |
| Facture émise à une personne physique à ses propres frais | 9 |
| Facture émise à un autre organisme de formation | 10 |
| Aucun de ces cas | **Non ventilé → anomalie**, jamais rangé d'office en « Autres » |

Vit dans `lib/bpf/mapping-cadre-c.ts`, sous forme de constante explicite — jamais de calcul
« élégant », conformément à la règle projet sur les conventions métier figées.

**Sélection des factures :** `status ∈ {ISSUED, PARTIAL, PAID, OVERDUE}` et `issueDate` dans
l'exercice. Les avoirs se **soustraient** de leur ligne d'origine. Brouillons et annulées exclus.

### 5.4 Classement F-1 : correspondance et dérivation automatique (D-10)

**Correspondance des anciennes valeurs vers le Cerfa \*17 :**

| Ancienne valeur QualiOF | Ligne F-1 du \*17 | Justification |
|---|---|---|
| `F.1.a - Salariés d'employeurs privés hors apprentis` | **a** | identique |
| `F.1.b - Salariés d'employeurs publics` | **e** *(autres stagiaires)* | la ligne a est explicitement réservée aux employeurs **privés** |
| `F.2 - Personnes en recherche d'emploi` | **c** | identique |
| `F.3 - Particuliers à leurs propres frais` | **d** | identique |
| `F.4 - Travailleurs indépendants, professions libérales, professions non salariées **et autres**` | **e** | le « et autres » est la trace de la fusion : cette ligne *est devenue* « Autres stagiaires » |

Un agent commercial mandataire en EI est un **travailleur non salarié**. Il n'est pas salarié
d'un employeur privé (ligne a), et il n'est pas non plus un particulier se formant à ses propres
frais (ligne d) puisque sa formation est financée par son EI et prise en charge par un fonds
d'assurance formation. Il relève donc de la ligne **e**.

**Dérivation automatique.** Le pattern métier dominant est *EI + Enseigne* : une même personne
peut être mandataire de sa propre EI **et** salariée d'une enseigne. Le classement ne peut donc
pas être uniforme. QualiOF dispose déjà de la donnée nécessaire :

| Signal disponible | Ligne proposée |
|---|---|
| `SessionParticipant.participantType = "Salarié"`, ou payeur = personne morale employeur distincte de l'EI | **a** |
| `participantType ∈ {"EI", "Dirigeant"}`, ou `LegalLink` de type `EI_SELF` vers l'organisation payeuse | **e** |
| Financement `POLE_EMPLOI` et statut demandeur d'emploi | **c** |
| Payeur = la personne physique elle-même, hors dispositif | **d** |
| Aucun signal exploitable | **non classé → anomalie**, jamais rangé d'office |

La valeur dérivée **pré-remplit** `SessionParticipant.bpfStatus` et reste **surchargeable à la
main** — le champ de surcharge existe déjà et cette conception est conservée. La dérivation
n'écrase jamais une valeur saisie manuellement.

### 5.5 Le cadre H n'est pas l'utilisateur de l'application

Le BPF 2025 porte **LAFITTE JULIEN, PDG**. Le dirigeant déclaré est une donnée de configuration
à part entière, distincte du signataire des documents pédagogiques et de l'utilisateur connecté.

---

## 6. Origine des données, cadre par cadre

| Cadre | Source | État |
|---|---|---|
| A | `loadOfConfig(tenantId)` + 1 préférence oui/non | ⚠️ adresse à mettre à jour (§ 12) |
| B | Année civile (D-05) + 1 préférence oui/non | ✅ trivial |
| C | **Factures de l'exercice**, ventilées par payeur (§ 5.3) | ⚠️ table de correspondance |
| D | Saisie manuelle (D-02) | ⚠️ nouveau stockage |
| E | `SessionTrainer` + durée sessions + statut interne/externe | ⚠️ champ manquant |
| F-1 | `SessionParticipant.bpfStatus` → repli `Person.bpfDefaultStatus`, pré-rempli par dérivation | ⚠️ **valeurs à migrer** (§ 5.4) |
| F-2 | Néant | ✅ zéros |
| F-3 | `TrainingProduct.bpfCategory` / `bpfLevel` | ⚠️ à câbler |
| F-4 | `TrainingProduct.bpfSpecialty` = code NSF | ⚠️ à fiabiliser |
| G | Néant | ✅ zéros |
| H | Configuration dédiée | ⚠️ à ajouter |

### Différence de périmètre avec le bilan Qualiopi

`qualiopi-bilan-stats.ts` raisonne **par session** (`startDate` dans l'année). Le cadre C
raisonne **par facture** (`issueDate` dans l'exercice). Une session de décembre facturée en
janvier bascule d'exercice côté C mais pas côté F. **C'est normal** : le BPF croise un bilan
financier et un bilan pédagogique qui ne se recouvrent pas. Le panneau d'anomalies l'explique
plutôt que de le masquer.

---

## 7. Modèle de données

```prisma
model BpfDeclaration {
  id                 String    @id @default(uuid())
  tenantId           String
  fiscalYear         Int
  periodStart        DateTime
  periodEnd          DateTime
  status             String    @default("BROUILLON") // BROUILLON | DEPOSEE

  // Cadre D — saisie manuelle (D-02)
  chargesTotal       Decimal   @default(0) @db.Decimal(12, 2)
  chargesSalaires    Decimal   @default(0) @db.Decimal(12, 2)
  chargesPrestations Decimal   @default(0) @db.Decimal(12, 2)

  // Cadre C — saisie manuelle : dépend du CA global, hors périmètre CRM
  partCaFormationPct Decimal?  @db.Decimal(5, 2)

  // Cadres A et B — préférences déclaratives
  adressePublique    Boolean   @default(false)
  actionsADistance   Boolean   @default(false)

  snapshot           Json?     // instantané figé au dépôt (D-03)
  filedAt            DateTime?

  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  @@unique([tenantId, fiscalYear])
}
```

**Champs ajoutés ailleurs**

```prisma
// sur Person — cadre E
trainerKind   String?   // "INTERNE" | "SOUS_TRAITANT". Null = non formateur.

// sur Tenant — cadre H
dirigeantNom      String?
dirigeantQualite  String?   // "PDG", "Gérant", "Président"…
```

**Migration de données** — reclasser `Person.bpfDefaultStatus` et
`SessionParticipant.bpfStatus` des anciennes valeurs vers les cinq lignes du Cerfa \*17
selon la table de correspondance figée en **§ 5.4**. `F.1.b` et `F.4` basculent tous deux en
ligne **e**, la dérivation automatique affinant ensuite au cas par cas. La migration ne touche
jamais une valeur déjà saisie à la main.

### Nettoyage inclus dans le chantier

`apps/web/src/app/app/formateurs/[id]/page.tsx` affiche `bpfDefaultStatus` sous le libellé
**« Statut BPF »**. Ce champ contient les catégories **stagiaire** — sans aucun sens pour un
formateur. À remplacer par `trainerKind`. Correctif ciblé, dans le périmètre parce qu'il porte
directement la donnée du cadre E.

---

## 8. Module de calcul

`lib/bpf/compute.ts`, sur le modèle de `qualiopi-bilan-stats.ts`.

- **Entrée :** `(tenantId: string, fiscalYear: number)`
- **Sortie :** `BpfData` typé, une propriété par ligne de cadre, plus `anomalies[]`
- Lit la base, ne mute rien, ignore React et l'UI → testable seul

**Heures-stagiaires (D-04) :** `Σ product.durationHours` sur les inscriptions comptées
présentes — `enrollmentStatus ∈ {ATTENDED, CONFIRMED}`. Exclus : `NO_SHOW`, `CANCELLED`,
`PRE_ENROLLED`. Produits `excludedFromBpf` hors périmètre.

**Heures dispensées (cadre E) :** `Σ durationHours` des sessions de l'exercice, réparties entre
formateurs internes et sous-traitants selon `Person.trainerKind`. À distinguer nettement des
heures-stagiaires : en 2025, 1 713 heures dispensées pour 6 225 heures-stagiaires.

---

## 9. Contrôles de cohérence imposés par le formulaire

Le Cerfa se contrôle lui-même. Trois totaux doivent coïncider — l'outil les vérifie et bloque
le passage en « déposée » s'ils divergent :

```
TOTAL F-1 (1)  ==  TOTAL F-3 (3)  ==  TOTAL F-4 (4)
```

en stagiaires **et** en heures. En 2025 : 179 et 6 225 sur les trois. Un écart signifie qu'un
produit n'a pas d'objectif général ou pas de spécialité NSF renseignés.

Deux contrôles complémentaires :

- `Total cadre C == somme des lignes 1 à 11` — et la ligne 2 doit égaler la somme de 2.a à 2.h
- Heures dispensées (E) et heures-stagiaires (F) doivent rester dans un rapport plausible au
  regard de la taille moyenne des groupes — écart aberrant = anomalie informative

---

## 10. Écran, anomalies, tests

### Écran `/app/bpf`

Sélecteur d'exercice · **panneau d'anomalies en tête** · cadres A → H dans l'ordre du formulaire,
chaque valeur avec bouton copier et valeur N-1 en gris · bloc de saisie cadre D et part de CA ·
bouton « Marquer comme déposée ».

**RBAC :** ADMIN, MANAGER, COMPTABLE. Lien de navigation à côté de « Bilan Qualiopi », dont il
est le pendant réglementaire.

### Panneau d'anomalies

| Anomalie | Pourquoi elle compte |
|---|---|
| N apprenants sans statut BPF | Invisibles au cadre F → sous-déclaration |
| N inscriptions dont le payeur ne se rattache à aucune ligne C | Produits non ventilables |
| N produits sans code NSF | Bloque F-4 et casse l'égalité des totaux |
| N produits sans objectif général | Bloque F-3, idem |
| N sessions terminées sans participant marqué présent ou absent | Heures-stagiaires fausses |
| Écart entre total C et total facturé de l'exercice | Factures orphelines |
| **Cadre D à zéro alors que le cadre C est non nul** | **Bloquant** (D-08) — l'erreur de 2025 ne doit pas se rejouer |
| N inscriptions dont la ligne F-1 n'a pas pu être dérivée | Sous-déclaration silencieuse (D-10) |
| Rupture d'un des trois contrôles du § 9 | **Bloquant** avant dépôt |

### Tests

Jeux synthétiques : un stagiaire AGEFICE en EI · un salarié dont l'employeur paie · un abandon
(compté en stagiaire, 0 heure) · un produit `excludedFromBpf` (absent) · une facture de
décembre N payée en janvier N+1 (cadre C de l'exercice N) · un avoir (soustrait) · une
inscription sans payeur rattachable (non ventilée + anomalie).

**Test de puissance au gate :** casser une ligne de la table de correspondance C, ou l'un des
trois contrôles du § 9, doit faire rougir un test.

**Validation grandeur nature (D-07) :** recalculer 2025 et comparer aux valeurs du § 11. Tout
écart doit être expliqué avant mise en service — bug, donnée manquante, ou erreur du BPF 2025.

---

## 11. Étalon — BPF 2025 tel que déposé le 01/04/2026

**A** — NDA 93061048106 · SA · SIRET 95131909400011 · NAF 8559A · START ACADEMY ·
BD JEAN MAUREL INFERIEUR 06140 VENCE · adresse publique : non · 0622806509 ·
info@start-academy.fr
**B** — 01/01/2025 → 31/12/2025 · actions à distance : non

**C** — ligne 1 : **212 874 €** · lignes 2 à 11 : **0** · **TOTAL 212 874 €** ·
part du CA formation : **100 %**

**D** — total charges **0** · salaires formateurs **0** · achats de prestations **0**
→ ⚠️ **Simplification assumée, non rectifiée** (D-08). Ces trois valeurs ne servent **pas**
d'étalon et ne doivent pas être reproduites. L'outil bloquera ce cas (§ 10).

**E** — personnes de l'organisme : **3** pour **1 641 h** · personnes extérieures en
sous-traitance : **1** pour **72 h**

**F-1** — a : **179 stagiaires / 6 225 h** · b, c, d, e : 0 · **TOTAL (1) 179 / 6 225**
**F-2** — 0 / 0
**F-3** — d *(autres formations professionnelles)* : **179 / 6 225** · reste 0 ·
**TOTAL (3) 179 / 6 225**
**F-4** — 326 Informatique : **144 / 5 596** · 312 Commerce, vente : **25 / 393** ·
100 Formations générales : **9 / 150** · 321 Journalisme et communication : **1 / 86** ·
autres : 0 · **TOTAL (4) 179 / 6 225**

**G** — 0 / 0
**H** — LAFITTE JULIEN, PDG

---

## 12. Écarts constatés entre le BPF 2025 et l'état actuel de QualiOF

Deux points ont été **arbitrés par Laurent le 2026-08-13** ; trois restent ouverts.

### Arbitrés

1. ~~**Cadre D entièrement à zéro**~~ → **assumé, non rectifié** (D-08). Le BPF 2025 est déposé
   et ne sera pas rouvert. Consigne explicite : « pour les prochains, fais les choses bien » →
   traduit en **anomalie bloquante** (§ 10) et retiré de l'étalon (D-09).
2. ~~**Les 179 stagiaires tous en « salariés d'employeurs privés »**~~ → **non repris** (D-10).
   Le classement uniforme de 2025 était une simplification. Le \*17 sera rempli **au cas par
   cas**, par dérivation automatique surchargeable (§ 5.4) : mandataire en EI → ligne **e**,
   salarié d'enseigne → ligne **a**.

### Encore ouverts

3. **Trois formateurs déclarés « de votre organisme »**, alors que Laurent indique n'avoir que
   des prestataires. Soit les trois sont internes au sens du BPF (dirigeants dispensant les
   formations), soit la ligne est à revoir. Détermine la valeur par défaut de `trainerKind`.
4. **Adresse Vence obsolète.** Le siège est à Cagnes-sur-Mer depuis le 12/08/2026. Le BPF 2026
   devra porter la nouvelle adresse — l'écran doit lire la configuration vivante, jamais une
   constante.
5. **Spécialité 326 « Informatique »** pour 144 des 179 stagiaires. Cohérent pour de la formation
   à l'IA, mais à confirmer face à 312 « Commerce, vente » qui correspond au cœur de cible
   immobilier. Détermine le code NSF par défaut des produits.

---

## 13. Hors périmètre

- **Cadre D automatique** — relève de la comptabilité, pas d'un CRM
- **Part du CA global en %** — suppose de connaître le CA hors formation
- **Émargement en base** — `Attendance` existe mais **rien ne l'écrit** ; les feuilles sont
  signées sur papier. Le modéliser changerait le quotidien administratif : chantier distinct
- **PDF Cerfa pré-rempli** — le mécanisme existe déjà (`agefice-form-fill.ts`, 92 champs via
  `pdf-lib`), donc réalisable plus tard à faible coût si un besoin d'archive se confirme
- **Dépôt automatique sur MAF** — aucune API publique connue

---

## 14. Séquencement proposé

| Étape | Contenu | Utilisable ? |
|---|---|---|
| 0 | **Trancher les 3 écarts restants du § 12** (statut formateurs, code NSF, adresse) | gate d'entrée, non bloquant pour l'étape 1 |
| 1 | Migration `BpfDeclaration`, `trainerKind`, dirigeant · reclassement des catégories F · correctif fiche formateur | non |
| 2 | Fiabiliser les produits : codes NSF et objectif général | non |
| 3 | `lib/bpf/compute.ts` + correspondance cadre C + tests | non |
| 4 | Écran `/app/bpf` : cadres, boutons copier, saisies | **oui — BPF recopiable** |
| 5 | Panneau d'anomalies + contrôles de cohérence + liens de correction | oui, avec le gain réel |
| 6 | Figeage, instantané, comparaison N-1 | oui, complet |
| 7 | Validation contre l'étalon 2025 (§ 11) | gate de mise en service |

La migration de données de l'étape 1 est désormais débloquée : sa règle est figée en § 5.4.
Les trois écarts restants du § 12 portent sur des valeurs par défaut et de la configuration —
ils peuvent être levés en parallèle des étapes 1 à 3, mais doivent l'être avant l'étape 4.
