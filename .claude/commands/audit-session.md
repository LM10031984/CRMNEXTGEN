---
description: Audit Qualiopi complet d'une session QualiOF avant contrôle (preuves, docs stub, cohérence prix/dates/lieu, blockers)
argument-hint: "[code session, ex: SES-0107]"
allowed-tools: Bash(pnpm *) Bash(git log*) Bash(rg *) Read Grep Glob
---

# Audit Qualiopi — session $1

Tu es auditeur Qualiopi. Tu passes la session **$1** au crible comme le ferait
un auditeur de l'organisme certificateur, PUIS comme le ferait un gestionnaire
OPCO qui instruit le dossier de remboursement. Deux regards, deux verdicts.

## Règle d'or

Ne conclus JAMAIS depuis le code seul. Une preuve = une ligne en base + un
objet storage qui répond. Un `Document` en base dont la clé storage renvoie 404
n'est PAS une preuve (leçon plan 21-02 : 733 clés fantômes).

## Étape 1 — Collecte (lecture seule, jamais d'écriture)

Écris un script `apps/web/scripts/_audit-$1.ts` (préfixe `_` = jetable, à
supprimer en fin de run) qui lit, pour la session :

- la session : statut, dates, modalité, lieu (`Location.legalName` + CP + ville —
  l'AGEFICE l'exige sur l'émargement), `pricePerLearner`, formateur `isPrimary`
- le produit : `programMd`, `derouleJson`, objectifs, `aiDraftedAt` (≠ null =
  contenu IA jamais relu → blocker), champs BPF, champs `agefice*`
- chaque `SessionParticipant` : `priceHT`, `financingMode`, `financingStatus`,
  `docStatus` (Json, source de vérité — les booléens legacy sont *shadowed*),
  les 4 booléens trésorerie, `payerErrorMessage`
- tous les `Document` + `PedagogicalAsset` de la session : type, hash, clé storage
- tous les `ClosureJob` : `usedStub` (true = PDF générique non personnalisé)
- les `Attendance` / `SessionSlot`

Puis vérifie chaque clé storage avec une signed URL (HEAD ou GET partiel).
Compte : présentes / manquantes / orphelines.

## Étape 2 — Grille de verdict

Produis un tableau par indicateur. Utilise `QualiopiDocCatalog` comme point de
départ, mais **ne t'y limite pas** — le catalogue seedé ne couvre pas tout.
Vérifie au minimum :

| Preuve | Ce qui invalide la preuve |
|---|---|
| Programme (ind. 1) | prix/durée/objectifs absents ; `aiDraftedAt` non null ; version ≠ celle jointe au dossier OPCO |
| Analyse des besoins (ind. 4) | absente ; nominative alors que le payeur est une personne morale (règle payeur 28/08) |
| Positionnement / prérequis (ind. 8) | non tracé par apprenant |
| Convention (ind. 9 + L6353-1) | non signée ; montant ≠ `participant.priceHT` ; nominative pour un payeur personne morale ; dates ≠ session |
| Convocation | horaires ≠ créneaux réels des `SessionSlot` (défaut connu : 9h-17h figé vs 9h-13h/14h-18h) |
| Émargement (ind. 12) | demi-journées manquantes ; pas de raison sociale + CP + ville du lieu ; signature formateur absente |
| Évaluation des acquis (ind. 11) | QCM générique (`usedStub=true`) ; pas de score ; pas de lien aux objectifs du programme |
| Certificat de réalisation (ind. 11) | heures ≠ heures réellement émargées |
| Satisfaction chaud (ind. 30) | absente ; identique mot pour mot entre apprenants (signal de stub) |
| Grille d'observation (ind. 11) | `usedStub=true` |
| Veille (ind. 23-25) | aucune entrée `RegulatoryWatch` sur la période de la session |
| Accessibilité PSH (ind. 26) | `hasDisabledLearner=true` sans `disabilityAdaptations` |
| Facture | montant ≠ convention ; numéro hors séquence ; pas de PDF archivé |

Pour chaque ligne : **CONFORME / RÉSERVE / NON CONFORME**, avec la preuve
littérale (id, hash, extrait) ou l'absence constatée.

## Étape 3 — Le regard OPCO

Rejoue le dossier du point de vue du financeur réel de chaque participant
(`financingMode` + `sponsorOrg.opcoCatalog`) :

- **AGEFICE** : demande de prise en charge complète (nom commercial, code APE,
  adresse du lieu bien décomposée), attestation d'assiduité, convention,
  programme, RIB/CNI/CFP. Budget annuel par personne rattaché à la bonne année
  (`financingRequestDate`, pas la date de session).
- **FIFPL** : demande déposée AVANT le début de la formation (règle stricte),
  plafond annuel par profession, programme au format attendu.
- **OPCO EP / ATLAS / OPCO Commerce** : accord de prise en charge daté avant
  démarrage, subrogation ou non, certificat de réalisation en fin.

Signale tout dossier où la formation a démarré avant l'accord de prise en charge.

## Étape 4 — Rendu

1. Un tableau de synthèse : nb conforme / réserve / non conforme.
2. La liste ordonnée des actions, la plus bloquante d'abord, chacune avec le
   fichier ou l'écran exact où corriger.
3. Ce qui est réparable par script vs ce qui exige une action humaine
   (re-signature, ressaisie).

Supprime le script jetable à la fin. N'écris rien en base.
