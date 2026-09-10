---
description: Construit la chaîne Diagnostic → Proposition → Devis (spec du 01/09/2026) lot par lot, avec les règles tarifaires AGEFICE/OPCO EP et les garde-fous du projet
argument-hint: "[lot A..H | suite | --etat]"
allowed-tools: Bash(pnpm *) Bash(git *) Read Edit Write Grep Glob
---

# Chaîne Diagnostic → Proposition — $ARGUMENTS

Construire, lot par lot, la chaîne commerciale R1 → R2 : diagnostic d'agence
(complet 69 q / léger ~25 q), lien de pré-inscription par RDV, moteur budget
AGEFICE/OPCO EP, rapport d'audit 17 pages, proposition chiffrée qui génère les
devis, acceptation → session. **La spec est la source unique — cette commande
n'en est que le mode d'emploi.**

## 0. Sources de vérité — à lire AVANT toute ligne de code

- `.planning/specs/2026-09-01-chaine-diagnostic-proposition.md` — LA spec :
  modèles, parcours, moteur budget (§8), sorties (§9), lots (§13), critères (§14),
  décisions ouvertes D-1..D-10.
- `.planning/specs/2026-09-01-maquette-audit.html` (17 pages) et
  `2026-09-01-maquette-proposition.html` — les **références de rendu exactes**
  (structure, sections, mentions légales). On ne « s'en inspire » pas : on les
  implémente.
- Modèle réel de proposition : `~/Documents/nxt-coach/Formation Faros/PROPOSITION-OPTIMO/`.
- La carrière à transposer (lots A, C, D) : `git clone --depth 1
  https://github.com/jean-guy-gif/start-academy-diagnostic /tmp/diag-repo`
  — questions, chapitres, ratios, PRD financement, proposal-schema,
  apply-commercial-discount. On transpose du contenu et des fonctions pures,
  JAMAIS l'infra Supabase ni la table clients.

`--etat` : mode lecture seule — tableau A→H (modèles présents ? routes ? moteurs
testés ? documents générés ?), D-x encore ouvertes, prochain lot conseillé.
Aucune écriture.

## 1. Cadrer le lot

- Argument `lot X` → périmètre et « fini quand » repris de la spec §13/§14,
  recopiés en tête de réponse. `suite` → premier lot non livré (constaté dans le
  code, pas dans les souvenirs).
- **Dépendances dures** : le lot G exige `SessionPricing` (phase 23) livrée —
  sinon refuse et dis pourquoi. Avant le **10/09/2026**, interdiction de toucher
  l'express du stand (`/diagnostic`, `DiagnosticSubmission`, `lib/diagnostic/`),
  le mailer et le worker.
- Migrations : **additives**, `prisma migrate dev` (jamais `db push`), noms
  explicites. Aucune reprise de données historiques — besoin prospectif
  uniquement (décision SessionPricing du 28/08).
- **Isolement (leçon du 02/09)** : travailler dans le worktree dédié de la
  chaîne (`files-chaine`), JAMAIS dans `files/` partagé — une session = un
  worktree = un port. Interdiction des commandes à portée machine
  (`pkill -f`…) : résoudre le PID par le port et vérifier son répertoire de
  travail avant de tuer. Les migrations de la chaîne ne partent sur Supabase
  qu'AVEC le merge/déploiement, jamais avant (décision Laurent du 03/09).

## 2. Règles métier gravées — ne se renégocient pas en cours de lot

1. **Tarif** : demi-journée 4 h sur site co-animée = **336 € HT/participant** ;
   heures conventionnées = heures sur site × nb formateurs (défaut 2 → 8 h).
   Tout est paramètre `FundingRule`, rien en dur.
2. **Les heures conventionnées sont LA valeur unique** — proposition, convention,
   émargement, attestation, dossier financeur portent le même nombre. Test de
   contrat obligatoire.
3. **Plafond AGEFICE 3 000 €/an** : la prise en charge affichée ne dépasse JAMAIS
   le plafond (72 h × 42 = 3 024 → retenu 3 000, écart de 24 €/agent visible en
   reste à charge — D-8). Éligibilité en prospection = production N-1 > 7 000 €
   (estimation) ; dès que la CFP est connue au CRM, c'est elle qui fait foi.
4. **Régimes séparés en calcul, consolidés en affichage** : AGEFICE (indés) et
   OPCO EP (salariés, enveloppe entreprise 2 500 € < 11 / 4 500 € 11-50 / manuel
   > 50 ; 30 €/h cœur métier, 40 €/h réglementaire, présentiel uniquement) = deux
   dossiers distincts, UN reste à charge dirigeant. Surplus d'enveloppe =
   arbitrage humain, jamais de règle automatique.
5. **L'IA ne calcule jamais un prix ni un droit** — prix et financements sortent
   des fonctions pures ; l'IA rédige (synthèses, « pourquoi ce module »), sa
   sortie est TOUJOURS relue (`reviewedAt`) avant envoi ; fallback heuristique
   badgé, jamais silencieux (leçon E-3).
6. **Remise = uniquement sur le reste à charge** (non-transfert de dette), motif
   obligatoire, > 15 % → validation MANAGER/ADMIN bloquante.
   **« OFFERT » ≠ « pris en charge »** (`describeCoverageState`).
7. **Un point de douleur métier reçoit un programme MÉTIER** (055, 058, 059, 008,
   053…) — l'IA n'est jamais la réponse par défaut. Aucun module
   `excludedFromClientOutputs` (pige) dans une sortie client.
8. **PII** : les fiches équipe nominatives (nom + CA) ne sortent jamais — ni lien
   public, ni prompt IA (agrégats pseudonymisés p1/p2/…), ni logs. Transcript :
   jamais public, purgé à J+90.
9. **Anti-péremption dès la naissance** : `sourceFingerprint` sur audit et
   proposition + `isStale()` + bandeau « Régénérer » (leçon E-1).
10. **Référentiel questions** : code ⇄ doc synchronisés, test de contrat sur le
    compte et les IDs ; le set LÉGER est un sous-ensemble du COMPLET (mêmes IDs).

## 3. Construire — moteurs purs d'abord, UI ensuite

- Les moteurs (`financement`, `ratios`, `scoring`, `light-set`, extracteur
  transcript côté schéma) = **fonctions pures sans import prisma/next**, testées
  AVANT l'UI. Fixtures canoniques obligatoires :
  - 4 indés > 7 k€ → 36 demi-journées cumulées, 9 de groupe, prise en charge
    12 000 € (plafonnée), écart 96 € en reste à charge ;
  - groupe multi-structures type OPTIMO (AGEFICE agents + AGEFICE TNS « sous
    réserve CFP » + OPCO EP par entreprise + déduction consommé) ;
  - > 50 salariés → « à valider manuellement », jamais un montant ;
  - module distanciel → 0 € OPCO EP + alerte.
- Server actions : appliquer la check-list de `/quick` (requireRole, scope
  tenantId partout, Zod avant I/O, AuditLog dans la transaction, revalidatePath,
  Decimal via Number(), context mailer). Chaque nouveau type d'email = une
  catégorie décochable, fail-closed.
- **Réutiliser, ne pas recréer** : `payer-rule.ts` (personne morale/physique),
  `PreEnrollment` + OCR + validation admin + relances (lot F = campagne par
  RDV au-dessus, pas un second pipeline), `Quote`/`QuoteLine`, chaîne WeasyPrint
  (footer HTML dans le body), `OpcoCatalog.requiredDocs` (jamais de
  `if (code === 'AGEFICE')`), tokens publics hashés SHA-256 affichés une seule
  fois.
- Saisie R1 : une page par CHAPITRE (jamais une question par écran), autosave
  par réponse avec retry, hints commerciaux affichés, synthèses financement
  (après équipe) et pipeline (après transformation) **calculées en pur, < 1 s,
  zéro IA en rendez-vous**.

## 4. Sorties documentaires — conformité aux maquettes

- **Audit** : ≥ 15 pages, valeur 3 000 € en couverture, restitution de TOUTES
  les réponses chapitre par chapitre (« Ce que vous nous avez dit » → « Notre
  lecture » → repères → enjeu en € → premier levier), score global + par
  chapitre (barème versionné D-9), page « performance de votre équipe » depuis
  les fiches (objectifs + préconisations nominatives), GPS 3 priorités + plan
  90 jours, **financement en DERNIÈRE page**. `DocType.DIAGNOSTIC_AUDIT`.
- **Proposition** : structure OPTIMO (entendu → axes → planning avec deadline
  J-15 → budget mobilisable par financeur/bénéficiaire → détail type devis par
  payeur → OFFERT le cas échéant → prochaines étapes → mentions), génère les
  `Quote` par payeur. `DocType.PROPOSITION`.
- Tests de contrat : Σ devis = Σ proposition ; heures conventionnées identiques
  partout ; disclaimers présents ; aucun montant de prise en charge > plafond.

## 5. Gates & livraison

```
pnpm lint
pnpm --filter @qualiof/web exec tsc --noEmit
pnpm test
```

Les trois verts, puis livrer via `/livraison` (anti-collision de snapshot).
Mettre à jour `.planning/STATE.md`, et consigner toute décision D-x tranchée
**dans la spec** — c'est elle qui vit, pas la conversation.

## 6. Rendre compte

Trois lignes (ce qui marche pour l'utilisateur, ce qui est différé, quoi
vérifier à la main) + les D-x encore ouvertes + le lot suivant conseillé.

## Les lots — périmètre et « fini quand »

| Lot | Périmètre | Fini quand |
|---|---|---|
| **A** | Modèles Prisma (§4) + seeds FundingRule + port questions/chapitres/light-set + import catalogue (§5.3 : PROD-NNNN, Drive 008→074, Agent Incomparable inactif) | Migrations appliquées, tests de contrat référentiel verts, rapport d'import validé par Laurent |
| **B** | Saisie R1 (léger/complet, page-par-chapitre, autosave, grille équipe, reprise) + 2 synthèses live | Un diagnostic léger réel bouclé en < 30 min, synthèse financement < 1 s |
| **C** | Transcript : collage/upload → extraction (confidence + quote) → revue par exception | ≥ 60 % de pré-remplissage sur un transcript réel ; rien de non-confirmé ne sort |
| **D** | Moteur ratios/scoring + rapport d'audit 17 pages PDF | Audit conforme maquette sur un dossier réel, relu et remis en R2 |
| **E** | Éditeur de proposition (lignes par payeur, remise/OFFERT, validation > 15 %) + PDF + lien public + devis générés | Une proposition réelle envoyée, devis identiques au centime |
| **F** | Campagne RDV (`EnrollmentBatch` + dates + `/rdv/[token]` + avancement admin) + alertes §11.1 (nouveau lead · lead non traité 24 h · nouvelle inscription → ADMIN) | Un lien réel diffusé, pièces validées, les 3 alertes reçues en conditions réelles |
| **G** | Acceptation → sessions + SessionPricing + conversion pré-inscrits + conventions | Chaîne complète jouée de bout en bout sur un client réel |
| **H** | Relances auto (J+1/J+3/J+7/J-5), import Plaud, Coach Brain, pack communication, lien formateur | Au fil de l'eau, après G |
