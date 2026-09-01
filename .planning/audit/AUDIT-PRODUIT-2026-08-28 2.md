# Audit produit QualiOF — 28/08/2026

Lecture seule, branche `cloud-migration`. 145k lignes TS · 70 modèles Prisma · 1332 tests · 24 DocTypes.
Rapport lisible (artefact) : https://claude.ai/code/artifact/adb66da4-e448-44e5-9521-f45764b37e7d

## Cause racine commune

QualiOF sait **fabriquer** des documents ; il ne sait pas **savoir qu'un document est devenu faux**.
Une donnée est recopiée à la création, puis chaque copie vit sa vie, et rien ne signale la divergence.
E-1 et E-2 sont deux instances du même défaut. Toute feature ajoutée avant de fermer ce trou en hérite.

## Ce qui tient (à protéger dans toute refonte)

- **A-1** `Person` + `Organization` + `LegalLink` typé + `sponsorOrgId` pivot payeur → le multi-casquette EI/enseigne est résolu à la racine. Refus explicite d'inscrire sans lien juridique déclaré.
- **A-2** Pack de fin de formation : 21 docs / 93 s, 0 stub, hash SHA-256, archivage.
- **A-3** Trésorerie OPCO modélisée comme elle se passe (4 jalons + dates de transition ; pas de subrogation supposée) ; budget AGEFICE rattaché à l'année du **dépôt** (`financingRequestDate`).
- **A-4** Règle payeur personne morale (convention d'entreprise régénérée, analyse des besoins par structure).
- **A-5** Veille réglementaire outillée et exportable (critère 6).
- **A-6** Garde-fous : emails fail-closed par tenant, AuditLog avec diff dans la transaction, registre RGPD art. 30.

## Écarts

### Majeurs

**E-1 — Aucune détection de document périmé.**
`Document.hashSha256` = empreinte du PDF *produit*. Rien sur les *données d'entrée*.
→ Correctif : `Document.sourceFingerprint` (SHA-256 du JSON des champs réellement rendus, calculé à la génération) + `isDocumentStale(doc)`. Le badge « à régénérer » devient dérivable partout.

**E-2 — La cascade de tarif n'existe pas.**
```
TrainingProduct.priceHT
  └─(copie à la création de session — sessions-create.ts:167)→ TrainingSession.pricePerLearner
        └─(copie à la création UNIQUEMENT — sessions-create.ts:207)→ SessionParticipant.priceHT
              ↳ c'est LUI qui alimente convention / AGEFICE / facture
```
`updateSessionDetails` (sessions.ts:1154) écrit le niveau session seul.
`addParticipant` (sessions.ts:37) prend `priceHT ?? 0` → tout inscrit tardif arrive à **0 €**.
Précédent connu : `apps/web/scripts/audit-pricing-overrides.ts` (le champ a parfois contenu le CA total).
→ Correctif : `applyPriceCascade({ scope, newPrice, dryRun })` appelé par l'édition de session, la fiche produit et l'ajout de participant. Un test par classe :

| Classe | Condition | Traitement |
|---|---|---|
| LIBRE | rien d'émis, rien de signé | nouveau prix + régénération |
| ENGAGÉ OPCO | `OpcoSubmission.status >= SENT` ou `financingStatus >= REQUESTED` | intouchable — nouveau dossier / avenant |
| FACTURÉ | `Invoice.status != DRAFT` | intouchable — avoir puis nouvelle facture (numérotation continue) |
| SIGNÉ | convention signée | avenant écrit, pas de régénération muette |

**E-3 — `usedStub = true` n'est bloquant nulle part.** Le PDF générique part chez l'apprenant, job `DONE`, badge vert. Deux grilles d'observation identiques mot pour mot = premier signal cherché par un auditeur.
→ Bloquant dans `getSessionCompleteness` + rouge dans la matrice + avertissement au téléchargement du pack.

**E-4 — `updateParticipant` n'écrit aucun AuditLog** (prix, `enrollmentStatus`, `financingMode`, `financingRequestDate`) alors que `updateSessionDetails` le fait scrupuleusement. Ce sont exactement les champs contestables en audit.

### Mineurs

**E-5 — Mono-financeur.** 11 libellés (`funder-codes.ts`), 4 au référentiel (`OpcoCatalog` seed), 1 automatisé (AGEFICE). FIFPL = étiquette. Manques métier : contrôle d'antériorité de la demande (FIFPL = refus sec si dépôt après démarrage) et alerte « formation démarrée avant accord de prise en charge », tous financeurs. Piloter par `OpcoCatalog.requiredDocs` au lieu de `if (code === 'AGEFICE')`.

**E-6 — BPF Cerfa 10443 non généré** alors que `bpfSpecialty/Category/Level`, `excludedFromBpf`, `bpfStatus` sont en base.

**E-7 — `TrainingSession.name` dénormalisé** sans justification de snapshot (cf. FRICTION-JOURNAL F-02/F-03). Arbitrage D-2.

**E-8 — Défauts connus non soldés** : horaires convocation 9h-17h vs créneaux réels 9h-13h/14h-18h ; fiche AGEFICE (nom commercial et code APE vides, adresse du lieu mal composée) ; ranking recherche apprenant ; `lookupSiret` sans auth ; a11y des dropdowns custom.

**E-9 — `settleInvoiceForParticipant`** : règle non arbitrée depuis le 12/08 (ne reverse rien au dé-toggle).

## Échéances réglementaires (absentes de .planning)

**Qualiopi — 33 indicateurs au 1er novembre 2026.** Décret n° 2026-728 du 01/08/2026 : 12 indicateurs modifiés, 7 critères inchangés, +1 indicateur CFA (hors périmètre). Référentiel actuel jusqu'au 31/10 ; **tout audit à partir du 01/11 se fait sur le nouveau**. Nouvelles exigences : pas de mention trompeuse sur le financement ou les débouchés ; transparence du calcul des résultats affichés ; procédure VSS / harcèlement / discriminations ; suivi **effectif** du distanciel ; conformité Qualiopi des sous-traitants et du portage ; identification et traitement des risques qualité. Les auditeurs jugeront « l'effectivité des démarches » plus que la documentation — c'est ce qu'un CRM prouve et qu'un classeur ne prouve pas.
→ `QualiopiDocCatalog` (seed) mappe l'ancien référentiel. À recaler **et** à rendre versionné par date d'entrée en vigueur (un audit passé doit rester lisible avec le référentiel de sa date).

**Facturation électronique.** Réception obligatoire pour tout assujetti TVA au **01/09/2026** (se règle hors code : PDP ou expert-comptable). Émission : GE/ETI au 01/09/2026, **TPE-PME au 01/09/2027**. Formats : Factur-X (PDF/A-3 + XML embarqué), UBL, CII. QualiOF émet un PDF sans XML. Calendrier confirmé, report rejeté le 11/04/2025.

## Roadmap proposée

**Lot 0 — rendre la donnée honnête (immédiat)**
0.1 `applyPriceCascade` + défaut du prix à l'ajout de participant · 0.2 `sourceFingerprint` + `isDocumentStale` · 0.3 stub bloquant · 0.4 AuditLog sur `updateParticipant`.

**Lot 1 — référentiel de novembre (sept-oct)**
1.1 catalogue 33 indicateurs versionné · 1.2 registre de l'effectivité (réclamations, actions correctives, amélioration continue sur le patron de la veille) · 1.3 procédure VSS tracée par session + mode de calcul des taux exportable + conformité sous-traitants/portage sur la fiche formateur avec expiration · 1.4 suivi effectif du distanciel.

**Lot 2 — finances (oct-déc)**
2.1 Factur-X + choix PDP · 2.2 arbitrage E-9 + DSO par financeur depuis les dates de transition existantes · 2.3 BPF 1 clic avec écart déclaré/calculé.

**Lot 3 — différenciation (2027)**
3.1 **mode auditeur** : lien tokenisé lecture seule, 33 indicateurs, preuves cliquables horodatées et hachées (personne ne le propose ; ~3 semaines sur des briques existantes) · 3.2 dossier de financement autopiloté · 3.3 signature électronique (ferme la boucle « document faux ») · 3.4 émargement mobile QR · 3.5 décider consciemment si QualiOF sort de Start Academy.

## Arbitrages en attente

- **D-1** dé-toggle du dossier OPCO (= E-9)
- **D-2** libellé de session : titre voulu indépendant, ou lecture directe du produit
- **D-3** date du prochain audit Qualiopi (avant / après le 01/11) — conditionne l'ordonnancement du lot 1
- **D-4** périmètre financeur des 12 prochains mois — si ouverture aux salariés d'agences, OPCO EP remonte au lot 1
