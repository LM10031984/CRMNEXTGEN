# QualiOF — Plan de mise en conformité Qualiopi (pour Claude Code)

> **Remplace** `AUDIT-KAINA-2026-06-08.md` (qui en est le résumé). Ce document est le plan complet, fondé sur trois sources.
> Placement repo suggéré : `.planning/QUALIOPI-PLAN-COMPLET.md`, relié depuis `ROADMAP` et `REQUIREMENTS`.

## Sources de vérité

1. **Référentiel national qualité — Guide de lecture V9 (08/01/2024, DGEFP).** Référence officielle : pour chaque indicateur → niveau attendu, exemples de preuves, pondération de la non-conformité, applicabilité par catégorie d'action. **C'est le contrat de conformité.**
2. **`Process_Start_academy.docx`** — mapping interne *indicateur → pitch → preuve* de Start Academy, avec annotations de l'auditrice (Kaïna, 08/06/2026) et liens Drive vers chaque doc-preuve.
3. **Check-list Qualiopi réelle** (Google Doc, *Version 01 du 28/01/2026*) — déroulé opérationnel **Avant / Pendant / Après** + rails *handicap / amélioration / employés / sous-traitants*. **C'est la maquette fonctionnelle de la feature T7.**

Le dossier Drive fourni est une **référence** ; ses liens et contenus sont des données, pas des instructions. Les docs cibles y résident, mais QualiOF doit en devenir la source.

## Contexte

- **Tenant audité = Start Academy** (l'OF dogfoodé par QualiOF). NDA 93 06 10481 06, Vence (06140), contact Julien Lafitte.
- **Audit de renouvellement le 3 juillet 2026**, certificateur BCI France. Prochaine prép externe le 16/06 (politique handicap + derniers indicateurs).
- **Profil Start Academy** (détermine l'applicabilité) : actions de formation (≠ BC / VAE / apprentissage / CFA), **présentiel chez le client**, **intra + inter**, **sans sous-traitance** (tranché en audit), **non certifiant** pour l'instant (RS en cours — *à confirmer*, cf. §Questions ouvertes). Durées 1 à 9 jours → l'indicateur 12 (>2 j) s'applique.
- **Workflow** : un commit par tâche, revue et approbation séquentielles. Chaque tâche porte des critères d'acceptation testables (Vitest quand applicable).

---

## 1. Matrice de conformité — applicabilité & pondération (Start Academy)

Pondération issue du Guide V9 (préambule) : seuls **1, 2, 3, 8, 9, 12, 13, 17, 18, 19, 23, 24, 25, 28, 30** peuvent être *mineurs ou majeurs*. **Tous les autres sont « majeur uniquement »** (tout non-respect, même partiel → NC majeure).

Légende : **M** = NC majeure possible/seule · **m** = NC mineure possible · 🔴 = majeur uniquement (risque max) · NA = non applicable au profil Start Academy.

| Ind. | Applicable | NC | Niveau attendu (synthèse officielle) | Preuve(s) process | Artefact QualiOF | Écart → tâche |
|------|-----------|----|--------------------------------------|-------------------|------------------|----------------|
| 1 | ✅ | m | Info publique exhaustive **et à jour** (prérequis, objectifs, durée, modalités/délais, tarifs, contacts, **méthodes mobilisées**, modalités d'éval, accessibilité PSH) | Site + programme + CGV | `generateProgrammeForProduct` | Méthodes mobilisées + date MAJ sur le site → **T2, T9** |
| 2 | ✅ | m | Indicateurs de résultats chiffrés, datés | Site + QualiOF | Calcul satisfaction/reco | Datation + MAJ /3 mois → **T9** |
| 3 | ❌ NA | m | (certifiant) | — | — | NA sauf RS actif |
| 4 | ✅ | 🔴 | Démontrer l'analyse du besoin selon la finalité ; **prise en compte PSH/compensation** | Analyse des besoins | `ANALYSE_BESOIN` (prompt + template) | **Question handicap absente** → **T1** |
| 5 | ✅ | 🔴 | Objectifs définis, **opérationnels et évaluables** (observables, mesurables) | Programme + déroulé + QCM + grilles | Prompts programme/déroulé | Verbes d'action sur le **programme** → **T2** |
| 6 | ✅ | 🔴 | Contenus/modalités adaptés aux objectifs **et aux publics** | Déroulé + adaptation + analyse besoin | `DEROULE` (produit) | Adaptation **par session** liée à l'analyse → **T8** |
| 7 | ❌ NA | 🔴 | (certifiant) | — | — | NA sauf RS actif |
| 8 | ✅ | m | Procédures de **positionnement/éval à l'entrée** (peut être en début de formation) | Questionnaire positionnement | `POSITIONNEMENT` | OK → couvert par **T7** (auto) |
| 9 | ✅ | m | Conditions de déroulement **formalisées et diffusées** | Convocation (J-15) + RI + charte handicap + programme | `CONVOCATION` | Drop boilerplate distanciel ; bundle ; variante agence/salle louée → **T5** |
| 10 | ✅ | 🔴 | Prestation adaptée aux profils **lorsque l'analyse du besoin l'établit** (contenus, suivi, rythmes) | Déroulé péda | `DEROULE` (produit) | Adaptation par session = preuve → **T8** |
| 11 | ✅ | 🔴 | Processus d'évaluation **formalisé et mis en œuvre**, matérialisé par des outils | Descriptif outils + auto-éval + grille + QCM + certificat | `QCM`, `GRILLE_OBS`, `POSITIONNEMENT` | Nb grilles = nb mises en situation ; renommer « grille formateur » → **T7/T8** |
| 12 | ✅ (>2 j) | m | Mesures d'engagement **formalisées et mises en œuvre** | Procédure absence/abandon + émargement + relances | `EMARGEMENT` | Procédure abandon comme asset ; émargement demi-journée → **T7** |
| 13–16 | ❌ NA | — | (alternance / certifiant) | — | — | NA |
| 17 | ✅ | m | Locaux/équipements/moyens humains adéquats | Check-list formation + RC Pro + CV | `checklist-formation-template` | Scinder « organisme / lieu » ; logistique lieu via analyse besoin → **T6** |
| 18 | ✅ | m | **Mobilise ET coordonne** les intervenants | Organigramme + WhatsApp + CR réunions trimestrielles | — | Asset organigramme + preuve coordination → **T12-bis** |
| 19 | ✅ | m | Ressources péda mises à disposition et appropriables | Livrets de formation | — | Asset support/livret → **T7** (auto) |
| 20 | ❌ NA | 🔴 | (CFA) | — | — | NA |
| 21 | ✅ | 🔴 | Compétences **déterminées + mobilisées + évaluées**, maîtrise vérifiée | Fiches de poste + CV/diplômes + entretien associés + auto-éval | — | Espace référentiel formateurs + alerte péremption auto-éval → **T10b** |
| 22 | ✅ | 🔴 | **Plan de développement des compétences** (≥ 1 formation/an), preuves | Fiches de poste + preuves formations | — | Plan dev compétences + MAJ formations 2026 → **T10b** |
| 23 | ✅ | m | Veille légale/réglementaire **exploitée + diffusée** | Tableau veille 23 | `lib/veille` (INDIC_23) | Exploitation réelle + diffusion + lien article → **T11** |
| 24 | ✅ | m | Veille secteur **exploitée + diffusée** (impact sur prestations) | Tableau veille 24 | `lib/veille` (INDIC_24) | idem + date mise en place enseignement → **T11** |
| 25 | ✅ | m | Veille innovations péda/techno **exploitée** | Tableau veille 25 | `lib/veille` (INDIC_25) | idem → **T11** |
| 26 | ✅ | 🔴 | **Réseau handicap** identifié et mobilisable (Agefiph, Cap emploi, MDPH, RHF) ; référent handicap ; modalités de recours | Charte + guide handicap + doc réseau | `lib/veille` (INDIC_26) seulement | Module handicap complet → **T12** (différé au 16/06) |
| 27 | ❌ NA | 🔴 | (sous-traitance) | — | — | NA (à confirmer) |
| 28–29 | ❌ NA | — | (PFMP/AFEST / CFA) | — | — | NA |
| 30 | ✅ | m | Recueil des appréciations (bénéficiaires, financeurs ≥ 1×/an, équipes, entreprises). **Les évals d'acquis ne sont PAS une preuve probante ici** | Satisfaction chaud/froid + rapport formateur + financeur OPCO | `SATISFACTION_CHAUD/FROID` | Froid commanditaire + financeur annuel + relances → **T13** |
| 31 | ✅ | 🔴 | Traitement des **difficultés, réclamations, aléas** | Procédure réclamation + fiche amélioration | — | Workflow réclamation/aléa → **T13** |
| 32 | ✅ | 🔴 | **Mesures d'amélioration** issues de l'analyse | Plan d'amélioration continue + guide | — | Plan d'amélioration continue + check-list Qualiopi → **T7/T13** |

**Indicateurs majeurs applicables (risque max) : 4, 5, 6, 10, 11, 21, 22, 26, 31, 32.** Tout écart = NC majeure. Ils gouvernent la priorisation.

---

## 1-bis. Chaîne de cohérence pédagogique (PRINCIPE STRUCTURANT)

> Confirmé en lisant les docs réels Start Academy (fiche d'analyse du besoin, déroulé péda + rapport formateur intégré). L'auditeur vérifie une **chaîne**, pas des documents isolés. QualiOF doit la modéliser comme des **liens en base**, pas des blocs de texte indépendants.

```
Analyse du besoin              Programme                Déroulé péda TYPE (produit)         Déroulé RÉALISÉ + rapport formateur (session)
(objectifs visés,        →     (objectifs           →   séquence = objectif ↔ contenu  →    adaptations RATTACHÉES à l'objectif/séquence
 besoins matériels lieu,        opérationnels,           ↔ mise en situation ↔             + ANCRÉES sur l'analyse du besoin du
 handicap/stagiaire)            verbes d'action)          évaluation (grille formateur)      stagiaire échantillonné
 ind. 4                         ind. 5                    ind. 6 / 11                        ind. 10 / 30
```

Les **deux exigences que tu soulignes**, confirmées par les docs :

1. **Objectifs ↔ adaptations LIÉS.** Dans le déroulé réel, les adaptations sont aujourd'hui un bloc de texte libre en fin de rapport formateur (« diversification des supports, ajustement du niveau selon les profils… ») — non rattaché à un objectif précis, et générique (ce que Kaïna pénalise). QualiOF doit modéliser chaque adaptation comme **référençant l'objectif/la séquence** qu'elle adapte **et** l'item d'analyse du besoin correspondant. → T8.
2. **Mises en situation DANS le déroulé.** Le déroulé réel contient bien jeux de rôle / ateliers / simulations, mais la colonne *Évaluation* est souvent vague ou vide (« évaluation orale », « questionnement »). QualiOF doit **garantir ≥ 1 mise en situation par bloc pertinent**, chacune avec une **évaluation concrète (grille formateur)**, et **nb de grilles = nb de mises en situation** (règle Kaïna). → T2 (prompt déroulé) + T8 + le compteur de T7.

Autre constat utile : les objectifs du déroulé réel sont en fait des **titres de contenu** (« Introduction au marketing digital et bases du SEO »), pas des objectifs opérationnels à verbe d'action → renforce T2.

Cette chaîne est le fil rouge de T1, T2, T6, T8 et T11.

---

## 2. Lots de travail

### Lot 0 — Conformité bloquante avant le 3 juillet

#### T1 — Analyse du besoin : question handicap (ind. 4 — 🔴)
- **Niveau attendu** : démontrer l'analyse du besoin **et** la prise en compte des situations de handicap / besoins de compensation.
- **Fichiers** : `apps/web/src/lib/closure/qualiopi-prompts.ts` (`SYSTEM_PROMPT_ANALYSE_BESOIN`), `ollama-generators.ts` (`AnalyseBesoinSchema`, `generateAnalyseBesoinContent`), `analyse-besoin-template.ts` (`AnalyseBesoinContent`, `renderAnalyseBesoinHtml`).
- **Constat docs réels** : la *fiche d'analyse du besoin* manuelle (variante **commanditaire/entreprise**) **porte déjà** le handicap (« Nom + Fonction + Situation handicap par stagiaire » + « besoins spécifiques en cas de PSH »). C'est la génération IA **per-stagiaire** (`SYSTEM_PROMPT_ANALYSE_BESOIN`) qui ne l'a pas → c'est elle à aligner. La fiche capte aussi les **objectifs visés** (amont de l'ind. 5) et les **besoins matériels du lieu** (salle, vidéoprojecteur, paperboard, wifi, machine à café — amont de T6).
- **Change** : ajouter `besoin_adaptation: { concerne: boolean; precision: string|null; pose_a: 'stagiaire'|'commanditaire'|'les_deux' }`. Formulation imposée : « Avez-vous besoin d'une adaptation en rapport avec un handicap ou une maladie invalidante ? OUI/NON — si oui laquelle ? ». Poser **au stagiaire ET au commanditaire** (réponses pouvant diverger). Implémenter la **variante « commanditaire/intra »** sur le modèle de la fiche réelle (identité entreprise, n stagiaires, contexte, initiateur de la demande, besoins matériels) distincte de la variante individuelle. Exposer `objectifs_vises` pour qu'ils alimentent le programme (chaîne §1-bis).
- **Acceptation** : Vitest → champ toujours présent + rendu HTML ; schéma rejette son absence ; les deux variantes (individuelle / commanditaire) générées ; bump `PROMPT_VERSION`.

#### T2 — Objectifs opérationnels + méthodes mobilisées (ind. 5 🔴, ind. 1 m)
- **Niveau attendu** : objectifs **observables et mesurables** (verbes d'action) ; info site **exhaustive** incluant les **méthodes mobilisées**.
- **Fichiers** : prompt de génération **programme** (le déroulé impose déjà Bloom ✅ ; aligner le programme) ; heuristique Bloom existante (flag < 3 verbes).
- **Change** : interdire « comprendre/connaître/savoir » nus dans les objectifs ; exiger les méthodes mobilisées dans le bloc programme publié (alimente l'ind. 1).
- **Acceptation** : bench → ≥ 1 verbe d'action/objectif, 0 « comprendre » nu ; programme non conforme → `aiDraftedAt` (bannière de revue).

#### T3 — Re-tuning prompts Ollama → Sonnet 4.6 + bench (transversal)
- **Constat** : prompts calés `mistral-small:24b`, routage désormais `callLlm()` (Sonnet 4.6). Risque de dérive silencieuse.
- **Change** : brancher sur `callLlm()`, bump `PROMPT_VERSION`, tracer `aiPromptVersion`. **Bench de conformité** sur sorties critiques : T1 (handicap), T2 (Bloom), T8 (adaptations non vagues), QCM (JSON ≥ 10 Q).
- **Acceptation** : harness Vitest rejouable ; 0 `usedStub` sur run propre ; diff avant/après documenté.

#### T4 — Garde-fou « contenu IA non personnalisé » (transversal)
- **Fichiers** : `apps/web/src/lib/sessions/completeness.ts`, `app/app/sessions/[id]/page.tsx`.
- **Change** : blocker `doc_used_stub` → pack & « prêt pour audit » bloqués tant qu'un asset est `usedStub`. Visible dans `NextActionHero`.
- **Acceptation** : Vitest → blocker présent/levé ; pack non générable avec stub.

#### T5 — Convocation (ind. 9 m)
- **Niveau attendu** : conditions de déroulement formalisées et **diffusées**.
- **Change** : retirer le boilerplate distanciel (« vérifiez votre connexion ») en présentiel ; **bundle** convocation + règlement intérieur + charte accueil handicap + programme + indicateurs ; **variante** « agence » vs « salle louée » (liens transport/héberg/restauration). Règle métier : devis+convention+programme+CGV signés **≥ 14 j (11 j à distance)** avant le début, avec relance automatique sinon.
- **Acceptation** : convocation présentiel sans « connexion » ; bundle complet ; relance déclenchée si signature manquante à J-14.

#### T6 — Check-list formation matériel (ind. 17 m)
- **Fichiers** : `apps/web/src/lib/closure/checklist-formation-template.ts`.
- **Change** : scinder **« Apporté par l'organisme »** (PC, projecteur, clé USB/supports) vs **« Fourni par le lieu »** (salle, connexion, paperboard, pause/repas). La fiche d'analyse du besoin réelle **contient déjà** ces champs lieu (« Le client possède/peut louer une salle adaptée — places, vidéoprojecteur, paperboard, connexion wifi, machine à café ») : la section « Fourni par le lieu » doit en être **dérivée directement**, pas re-saisie. Retirer livret/machine à café/bouilloire de la check-list organisme quand `interventionChezClient = true`. Rattacher RC Pro (année courante).
- **Acceptation** : deux sections rendues ; items « lieu » dérivés des champs matériel de l'analyse du besoin ; items maison absents en intervention chez le client.

#### T7 — Check-list Qualiopi de session, interactive (ind. 32 + transversal) ⭐
**Maquette = le Google Doc réel.** Remplacer ce doc par une check-list de session cochable, structurée **Avant / Pendant / Après** + rails. Items **AUTO** (dérivés des artefacts via `getSessionCompleteness`) et **MANUAL** (cochés à la création / pendant la session).

Modèle `SessionChecklistItem { id, sessionId, key, phase, label, indicatorCode, source(AUTO|MANUAL), mandatory, status(TODO|DONE|NA), proofDocumentId?, checkedAt, checkedById }`.

**AVANT**
- ☐ Analyse des besoins remplie (AUTO, ind. 4) — non `usedStub`, **bloc handicap présent**
- ☐ Devis + ☐ convention/contrat + ☐ programme + ☐ CGV générés (AUTO, ind. 1)
- ☐ Documents signés ≥ 14 j (11 j distance) avant (MANUAL/AUTO si e-sign, ind. 9) — relance auto sinon
- ☐ Convocation + ☐ règlement intérieur + charte handicap envoyés (AUTO, ind. 9)
- ☐ Check-list formation remplie + dates planning vérifiées (AUTO/MANUAL, ind. 17)

**PENDANT**
- ☐ Test de positionnement rempli en début (AUTO, ind. 8)
- ☐ Livrets de formation distribués (MANUAL, ind. 19)
- ☐ Déroulé péda + **adaptations** renseignés (AUTO, ind. 6/10)
- ☐ Grille d'amélioration/progression remplie (AUTO, ind. 11)
- ☐ QCM passé (AUTO, ind. 11)
- ☐ **Rapport formateur** rempli pendant le QCM (AUTO, ind. 30 — bilan + adaptations)
- ☐ Questionnaire satisfaction stagiaire + ☐ émargement **à la demi-journée** (AUTO, ind. 30/12)
- ☐ Certificat de réalisation fourni (AUTO, ind. 11)

**APRÈS**
- ☐ Retour mail axes de progression à chaque stagiaire (MANUAL, ind. 11/30)
- ☐ Rapport formateur finalisé (AUTO, ind. 30)
- ☐ Questionnaires satisfaction stagiaires analysés/exploités (MANUAL, ind. 30/32)
- ☐ Satisfaction commanditaire à froid envoyée (AUTO planifié, ind. 30)
- ☐ Questionnaire financeur annuel + relance (MANUAL planifié, ind. 30)
- ☐ Archivage dossier `NOM_FORMATION_DATE_FORMATEUR` (AUTO via DocDock, ind. 32)

**Rails (niveau session ou tenant, selon le cas)**
- *Handicap* → ouvre les items de T12 (analyse besoin, guide/tableau adaptations, contact réseau).
- *Amélioration* (tenant) → fiche amélioration + plan d'amélioration ; **veilles régulières** ; **tableau des versions** (changer version+date du doc modifié) ; ≥ 1 formation/an ; **indicateurs de résultats MAJ tous les 3 mois sur le site** (ind. 2).
- *Employés* (tenant) → diffusion veilles ; entretien tous les 2 ans ; formation.
- *Sous-traitants* (tenant) → contrat ST, entretien à date anniversaire, charte qualité, CV/fiche de poste, NDA/SIRET/URSSAF/BPF/RC Pro. *(NA aujourd'hui — garder le rail désactivable.)*

**Branchements** : items AVANT `mandatory` non `DONE` → blockers `getSessionCompleteness` ; « prêt pour audit » exige tous les `mandatory` à `DONE`/`NA`. UI dans la page session (DocDock / `NextActionHero`) ; sous-ensemble amorcé au wizard de création.
**Acceptation** : seed à la création ; bascule AUTO sur présence d'artefact conforme (non-stub) ; blocage pack/audit ; traçabilité `checkedAt/checkedById` ; Vitest (seed, dérivation, blockers).

### Lot 1 — Structurel

#### T8 — Déroulé réalisé + adaptations liées, par session (ind. 6/10/11/30 🔴)
- **Constat docs réels** : le déroulé réel est une table `Durée | Objectifs | Contenu/Outils | Exercice pratique | Évaluation`, **avec le rapport formateur intégré en fin de doc** (adaptations + bilan + satisfaction formateur). Il est **par session** (dates réelles, formateur réel) — alors que QualiOF génère le déroulé **au niveau produit** (`generateDerouleForProduct`, hash idempotent). Mismatch structurel à résoudre.
- **Change** :
  1. Conserver le **déroulé TYPE** au niveau produit (les séquences/objectifs).
  2. Créer un asset **par session** « déroulé réalisé + rapport formateur » : reprend le type, et y **rattache chaque adaptation à l'objectif/la séquence concernée** (`adaptation.sequenceId` + `adaptation.besoinItemRef` vers l'analyse du besoin du stagiaire échantillonné) — fini le bloc de texte libre générique.
  3. **Garantir la chaîne §1-bis** : chaque bloc pertinent porte ≥ 1 **mise en situation** (jeu de rôle / atelier / simulation) reliée à une **grille d'évaluation formateur** ; invariant **`nb grilles = nb mises en situation`**. Renforcer `SYSTEM_PROMPT_DEROULE` / `DerouleSchema` pour refuser une séquence « exercice » sans évaluation concrète, et bannir les évaluations vagues (« évaluation orale » seule).
  4. **Structurer la grille PAR mise en situation** (confirmé sur la grille réelle) : la grille n'est pas une liste plate de 7 compétences — elle est **groupée par mise en situation** (ex. *« Jeu de rôle script porte-à-porte »* → compétences 4-6), chaque compétence notée **A/B/C/D** (A 90-100 / B 71-89 / C 51-70 / D <50 — déjà l'échelle de `SYSTEM_PROMPT_GRILLE_OBSERVATION`). Adapter `SYSTEM_PROMPT_GRILLE_OBSERVATION_SESSION` pour émettre `{ miseEnSituation, contexte, competences[] }` au lieu d'un tableau plat, et **mapper chaque mise en situation de la grille sur celle du déroulé** (ferme l'invariant du point 3). Colonnes = participants ; ligne MOYENNES ; bloc observations/axes par stagiaire.
  5. **Validation anti-vague** sur les adaptations (refuser « modification de l'ordre des modules » / « diversification des supports » sans précision de séquence). Ajouter `RAPPORT_FORMATEUR` à `CLOSURE_DOC_KINDS` si absent.
- **Cadre d'évaluation 3 phases** (descriptif réel — à respecter) : *début* = entretien besoin + **auto-positionnement** ; *pendant* = contrôle continu (mises en situation **en adéquation avec l'objectif**) + grille progressive + retour mail axes de progression ; *fin* = **QCM (≥ 70 %, max 2 tentatives)** + **re-passation du MÊME auto-positionnement** (comparé début/fin pour prouver la progression) + attestation. Encoder la règle QCM 70 %/2 essais ; garantir que le positionnement de fin réutilise le test de début et expose le delta.
- **Acceptation** : Vitest → 1 déroulé réalisé/session ; chaque adaptation référence une séquence + un item d'analyse du besoin ; grille groupée par mise en situation et chaque mise en situation reliée au déroulé ; `nb grilles = nb mises en situation` ; QCM ≥ 70 % / 2 tentatives ; positionnement fin = test de début + delta ; rejet d'une adaptation/évaluation vague ; item AUTO T7 branché ; rendu DocDock.

#### T9 — Datation, versioning & fraîcheur (ind. 1/2 m)
- **Niveau attendu** : info **à jour**, indicateurs **datés**.
- **Change** : estampiller chaque doc (génération/MAJ) et chaque stat (« arrêté au MM/AAAA ») ; **tableau des versions** par doc (version + date), aligné sur `PROMPT_VERSION`/`aiPromptVersion` ; signal de péremption (site resté en « 2025 ») ; rappel MAJ indicateurs **tous les 3 mois**.
- **Acceptation** : version+date sur chaque doc généré ; alerte si stat > 3 mois.

#### T10 — Aligner le référentiel sur le RNCQ officiel
- **Fichiers** : `packages/shared/src/constants/qualiopi.ts` (`QUALIOPI_INDICATORS`).
- **Change** : reprendre **les 32 libellés et numéros officiels** (Guide V9) ; encoder par indicateur : `applicableStartAcademy`, `ncPonderation: 'majeure'|'mineure_possible'`, `category`. La matrice §1 fait foi.
- **Acceptation** : table = référentiel officiel ; la matrice de conformité parle la langue de l'auditeur.

#### T10b — Espace référentiel formateurs (ind. 18/21/22 🔴 pour 21/22)
- **Change** : fiches de poste (détermination), CV/diplômes (mobilisation), **auto-évaluations avec alerte de péremption** (les vôtres dataient → l'outil aurait dû le signaler), entretien d'évaluation associés, **plan de développement des compétences** (≥ 1 formation/an, formations 2026 + preuves), organigramme + preuve de coordination (CR réunions trimestrielles).
- **Acceptation** : alerte si auto-éval > seuil ; plan de dev présent et à jour ; preuve de coordination rattachée.

#### T11 — Compléter le module veille (ind. 23/24/25 m)
- **Existant** : `lib/veille` classe RSS en INDIC_23/24/25/26 + `exploitation_draft`.
- **Change** : exiger le **lien du vrai article** ; passer de *draft* à **exploitation validée** + **preuve de diffusion** (mail commun / CR réunion + date agenda) + **date de mise en place de l'enseignement** ; lier l'entrée veille → programme/déroulé impacté ; élaguer le non-exploitable.
- **Acceptation** : entrée veille = lien réel + résumé + « ce qu'on en fait » + date ; preuve de diffusion ; lien vers la prestation impactée.

#### T12 — Module handicap / réseau (ind. 26 🔴 — différé au 16/06)
- **Niveau attendu** : réseau handicap identifié et mobilisable (**Agefiph, Cap emploi, MDPH, RHF**, PACA), référent handicap, modalités de recours + mesures spécifiques.
- **Change** : charte d'accueil PSH, guide des adaptations, **tableau des adaptations** par session, doc réseau partenaires, identité du/des référents handicap. Rattaché au rail handicap de T7 (item « demander le besoin dans l'analyse », « vérifier adaptations avant la formation », « contacter le réseau »).
- **Acceptation** : assets présents ; rail handicap T7 fonctionnel ; référent + réseau renseignés.

#### T13 — Appréciations & réclamations (ind. 30 m / 31 🔴 / 32 🔴)
- **Change** : satisfaction **commanditaire à froid** + **financeur annuel** (OPCO, ≥ 1×/an) + relances planifiées ; workflow **réclamation/aléa/difficulté** (accusé réception ≤ 24 h, délai traitement) → **fiche d'amélioration** → **plan d'amélioration continue**. **Important (ind. 30) : les évaluations d'acquis (QCM/grilles) ne sont PAS une preuve probante** — ne pas les taguer comme preuve de l'ind. 30.
- **Acceptation** : froid commanditaire + financeur annuel planifiés ; réclamation traçable ; QCM/grilles non tagués ind. 30.

---

## 3. Ordre conseillé (jalon 3 juillet)

**Avant l'audit (P0)** : T1 → T2 → T4 → T6 → T5 → T7, puis T3 (bench réutilisant T1/T2).
**Pour le 16/06 (prép handicap)** : T12 (ind. 26 majeur).
**Post-audit (structurel)** : T8, T9, T10, T10b, T11, T13.

---

## 4. Questions ouvertes (scoping à trancher avant d'encoder la matrice)

1. **Certifiant / RS** : Start Academy délivre-t-il des actions conduisant à une certification (RNCP/RS) sur la période auditée ? Si **oui**, activer **ind. 3, 7, 16** (sinon NA). Le RS est « en cours » → probablement **NA pour ce renouvellement**, à confirmer.
2. **Sous-traitance** : confirmé **sans sous-traitance** (décision audit) → ind. 27 NA et rail sous-traitant T7 désactivé. Confirmer pour figer.
3. **Alternance / AFEST / CFA / VAE** : aucun → ind. 13, 14, 15, 20, 28, 29 NA.
4. **Multi-tenant** : la matrice §1 est calée sur Start Academy. Pour les autres OF clients, l'applicabilité et la pondération doivent être **dérivées du profil tenant** (certifiant ?, sous-traitance ?, catégories d'action ?) — prévoir `tenantQualiopiProfile` qui pilote l'applicabilité des indicateurs et le seed T7.
