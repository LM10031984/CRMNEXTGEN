# RECONCILE-RULES.md — Contrat de réconciliation 3 sources

> Phase 9.2 — Réconciliation base (Airtable + SmartOF + Tréso AGEFICE).
> Document d'arbitrage **figé avant E2**. Toute déviation en cours d'exécution doit être justifiée ici par écrit.
> Pré-audit RNQ V9 du 03/07/2026 (Samia ZIANI, BCI). Point Kaïna 16/06 9h-11h.

---

## 0. Principe directeur

**On ne reconstruit aucun schéma d'import.** L'outillage existe, tout en dry-run par défaut, tracé via `ExternalIdentity` :
`import-smartof.ts`, `import-smartof-sessions.ts`, `import-airtable.ts`, `import-treso-agefice.ts`,
`match-treso-agefice.ts`, `rapprochement-treso-bdd.ts`, `dedupe.ts`, `backfill-trainer-from-treso.ts`, `sync-smartof-prices.ts`.

Le travail = **auditer → rejouer dans le bon ordre → arbitrer les conflits**.
**Interdiction de modifier un script d'import existant sans justifier par écrit, dans ce fichier, pourquoi le mécanisme actuel ne suffit pas.**

### 0.1 Modifications / omissions de scripts — justifiées par écrit (exigence §0)

- **`apps/web/scripts/dedupe.ts` — MODIFIÉ pour testabilité uniquement.** Extraction de `mergeOrgsTx`/`mergePersonsTx` (corps de transaction par doublon) + export nommé de `mergeOrgs`/`mergePersons`/`detectPersonsByName`/`detectOrgsBySiret` + garde sur `main()`. **Le mécanisme de repointage FK est INCHANGÉ** : sans `tx` injecté, le comportement CLI est identique à aujourd'hui. Justification : c'est le seul moyen de tester l'invariant §3.2 (la fusion reporte les `ExternalIdentity` du perdant sur le survivant) par une fusion réelle, sans dupliquer la logique. Refacto « rendre testable », pas « changer le mécanisme ».
- **`apps/web/scripts/match-treso-agefice.ts` — MODIFIÉ : correction de la clé §4.** Le scoring actuel (lignes 247-250) utilise le montant comme critère d'entrée (`+20 si montant ±5 %`) — interdit par §4 (le montant est la donnée fausse à corriger). Correction : retirer le montant des critères d'entrée (départage seul), ajouter le `nb stagiaires` en entrée. C'est l'unique modification fonctionnelle de script de la phase, justifiée car le mécanisme actuel produit le bug qu'on corrige.
- **`import-airtable.ts` — OMIS du rejeu E2, volontairement.** Le snapshot Airtable (figé ~10/11/2025, §2) est **déjà appliqué en base** : `ExternalIdentity` airtable = 21 Org / 216 Person, et les 267 `LegalLink` (casquettes EI/SALARIE/AGENT_COMMERCIAL + rattachement OPCO) **existent déjà** (photo E0 §1). La passe de dédoublonnage (Plan 03) **repointe** ces `LegalLink` et `ExternalIdentity` du perdant vers le survivant (invariant §3.2, prouvé par `dedupe.merge.test.ts`), donc l'autorité Airtable pré-nov25 sur les casquettes/OPCO est **préservée sans rejeu**. Rejouer `import-airtable.ts` serait au mieux un no-op idempotent, au pire une **régression** : le fichier snapshot pointe vers des IDs d'entités d'avant le dédoublonnage et pourrait recréer des références vers des entités fusionnées/supprimées. **Décision : pas de rejeu Airtable ; l'enrichissement casquettes/OPCO est garanti par (a) sa présence en base + (b) le repointage dedupe.** Toute correction ponctuelle de casquette/OPCO manquante est traitée au cas par cas dans le reliquat E3 (Plan 07), pas par un re-import global.
- **Formateurs 2024/2025 depuis Airtable — DÉVIATION assumée (2026-06-10, hors-plan, exécutée pendant la pause du Plan 04).** Le §2 ne listait que le Tréso comme source `SessionTrainer` ; or les onglets Tréso 2024/2025 n'ont **pas** de colonne formateur (seul l'onglet 2026 l'a). Décision Laurent : **lire le formateur 2024/2025 dans Airtable `Sessions_planifiees` (champ `Formateur`)** — lecture ponctuelle ciblée, PAS un rejeu de `import-airtable.ts`. Cohérent avec la fenêtre d'autorité Airtable pré-nov25 (§2). Protocole appliqué : pg_dump → match date+nom → **CSV de revue** (`/tmp/airtable-trainer-review.csv`) → validation humaine → apply. Résultat : **32 `SessionTrainer` créés** (HAUTE+A_VERIFIER), 8 SUSPECT + 1 sans-match laissés en saisie manuelle. Backfill Tréso 2026 : 26 créés. Périmètre `SessionTrainer` mis à jour au §2.
- **Suppression de 11 sessions placeholder vides — DÉVIATION assumée (2026-06-10, hors-plan).** Série « Immobilier : gagnez 2h par jour » (SES-0060→0070, 0 participant, bulk-créées jamais remplies). Décision Laurent. pg_dump `qualiof-pre-delete-empty-20260610-132002.sql.gz` avant. **Effet de bord corrigé** : 12 `ExternalIdentity` smartof orphelines purgées (invariant 0 orphelin restauré), ET le scope `sessions` exclu du `--only` du Plan 04 pour ne pas re-créer ces 11 (toujours présentes côté SmartOF). Photo E0 invalidée → voir annotation **E0′** §1.

**Verdicts prix produits (Plan 05, 2026-06-10) — format gate E3 (corrigé / accepté + motif) :**
- **PROD-0671 « Tracfin » 4h : 0 € → 168 € — CORRIGÉ (appliqué, apply filtré SES-0086).** Verdict : **168 € confirmé par Laurent** = formation 4h vendue à ce prix (demi-journée = 336/2, recoupé au catalogue réel, pas une division parasite). Seul produit appliqué au Plan 05.
- **PROD-0662 « Maîtriser l'IA » 35h @ 336 € — RELIQUAT (non appliqué).** Produit **sur-mergé** : 5 sessions / 5 prix SmartOF (1050/1680/2625/4460/7560 €), durée 35h = moyenne absurde. Aucun prix unique correct → à **éclater** en produits distincts par durée (Plan 07 / post-audit). C'est la 3ᵉ anomalie PROD-0662 annoncée (avec les 3 UID SmartOF du Plan 04).
- **PROD-0062 « Non discrimination, Tracfin » 8h @ 336 € — À RECOUPER au Plan 06** contre les encaissements Tréso. 336 € est une valeur de la famille suspecte, MAIS **336 €/8h = prix-jour légitime** (1 jour) → probablement correct ; confirmation finale au rapprochement Tréso.
- **Cadrage prix affiné (Plan 05)** : la « famille divisée » (336/672/1008…) est en fait majoritairement **légitime** quand elle suit la durée : **8h=336, 16h=672 (2j), 24h=1008 (3j)**. Le bug 336 ne se manifeste QUE sur les formations **longues** (35h/72h/105h) portant un prix court. → le Plan 06 cible les **SP AGEFICE de formations longues** à 336, pas tous les 336 de la base.

---

## 1. Photo E0 — état de référence (2026-06-10, read-only, reproductible)

Backup : `CRM Next gen/backups/qualiof-E0-baseline-2026-06-10.sql.gz` (552 Ko, intègre).

| Référentiel | Total | requiresCleanup | archived |
|---|---:|---:|---:|
| Person | 314 | **48** (email manquant) | 0 |
| Organization | 261 | **38** (22 SIRET invalide + 16 sans note) | 1 |
| TrainingProduct | 32 | — | — |
| TrainingSession | 88 | — | — |
| SessionParticipant | 294 | — | — |
| AgeficeProfile | 142 | — | — |
| Invoice | 9 | — | — |

**Anomalies structurelles**
- SP sans `sponsorOrgId` : **0** ✅ · SP avec `priceHT` NULL/0 : **0** (NE veut PAS dire « prix corrects » — voir ci-dessous).
- Sessions sans participant : **13** · sans `locationId` : **22** · sans product/dates/prix : **0** ✅
- Doublons SIRET : **4 SIRET → 8 orgs** · Doublons email : **6 emails → 16 persons**

**⚠️ Le bug prix N'EST PAS corrigé** (l'absence de zéros ne dit rien sur l'exactitude des montants). Scan E0 sur l'univers AGEFICE :
- `336,00 €` apparaît **52 fois** = valeur exacte du bug connu `3024/9` ([[reference_smartof_formule_prix_2026_06_03]]).
- Famille de montants « divisés » : 168 (×14), 672 (×16), 240 (×8), 1008 (×8), 144 (×3)…
- Les 130 SP « = prix produit » ne valident rien : le mauvais prix s'est **propagé jusqu'à `TrainingProduct.priceHT`** (plage produit 336 → 3080). Matcher le prix produit ne prouve pas l'exactitude.
- **Conséquence** : `Σ SP.priceHT` est une **base partiellement fausse, pas une vérité**. La correction prix est un chantier **majeur** de E2 (passe Tréso pour AGEFICE + `sync-smartof-prices` pour le hors-AGEFICE), pas un détail.

**Univers AGEFICE (cible Tréso)** : 186 SP avec sponsor `opcoCode=AGEFICE`. Booléens : factureEnvoyee 143 · validationOpco 165 · remboursementOpco 145 · paiementClient 160.

**Sessions sans lieu — taille réelle du reliquat** : 22 au total, mais **13 sans participant** (hors population closure) et plusieurs CANCELLED → poids closure réel ≤ **9** sessions avec participants. Origine SmartOF 21/22 ; lieu absent des `internalNotes`. **Backfillable vs manuel tranché par le dry-run `import-from-smartof` en E2** (propose un lieu → backfill ; sinon → reliquat manuel E3).

**Figures de base (à corriger, pas des cibles)** : `Σ SP.priceHT` total = 357 253 € · AGEFICE = 261 951 € · `Invoice.amountHT` = 11 819 € (factures quasi inutilisées). La **cible** de vérité prix/encaissement AGEFICE = **le Tréso Excel**, scopé à l'identique (voir §5).

**Traçabilité ExternalIdentity** : smartof = 211 Org / 255 Person / 27 Produit / 85 Session ; airtable = 21 Org / 216 Person. Le recouvrement Person (255+216 identités sur 314 personnes) confirme que beaucoup portent déjà les 2 sources.

### E0′ — état de référence RÉVISÉ (2026-06-10, après mutations hors-plan)

⚠️ La photo E0 ci-dessus est **périmée** suite aux chantiers hors-plan du 10/06 (backfill formateurs + suppression 11 placeholders). **Le gate E3 / Plan 07 doivent se dimensionner sur E0′, pas E0.** Dump de référence : `qualiof-pre-delete-empty-20260610-132002.sql.gz` (état juste avant la suppression).

| Compteur | E0 | E0′ | Δ |
|---|---:|---:|---|
| TrainingSession | 88 | **77** | −11 (placeholders « Immobilier gagnez 2h » SES-0060→0070 supprimés) |
| Sessions sans participant | 13 | **2** | −11 (les 11 supprimées étaient toutes sans participant) |
| Sessions sans `locationId` | 22 | **11** | −11 (les 11 supprimées étaient toutes sans lieu) |
| Sessions sans formateur primary | — | **16** | nouveau ; après backfill Tréso 2026 (26) + Airtable 2024/2025 (32) |
| Organization | 261 | **260** | −1 (fusion dedupe Plan 03 : « Thomas PECOUL ») |

- **Reliquat lieu closure-relevant inchangé** : les 11 sessions supprimées avaient 0 participant → hors population closure (le « ≤ 9 » du §1 reste valable, désormais sur 11 sessions sans-lieu restantes).
- **⚠️ Effet de bord à purger** : **12 `ExternalIdentity` smartof orphelines** (entityType=TrainingSession, entityId pointant des sessions supprimées). À supprimer pour restaurer l'invariant « 0 orphelin » (Plan 03 ne vérifiait que Person/Org). Tant qu'elles existent, un rejeu SmartOF scope `sessions` re-créerait les placeholders.
- **Σ SP.priceHT** (figures à corriger) : recalculer en E0′ si besoin pour le gate ; la suppression n'a touché aucun SP (sessions vides), donc **AGEFICE = 261 951 € inchangé**.

---

## 2. Golden record — source de vérité par champ

Airtable est **figée depuis ~10/11/2025**. Elle ne fait donc autorité que sur les enregistrements **antérieurs à nov. 2025** ; au-delà, SmartOF + Tréso sont seuls maîtres.

| Donnée | Source de vérité | Appoint / fallback | Règle en cas de conflit |
|---|---|---|---|
| Identité (Person, Org, Produit, Session) | **SmartOF** (ancrage `ExternalIdentity`) | — | SmartOF gagne |
| Champs descriptifs Org (SIRET, NAF, adresse, vatNumber) | **SmartOF** | Airtable (pré-nov25) si SmartOF vide | non-vide gagne ; jamais écraser une valeur par un vide |
| Niveau diplôme / expérience / statut pro Person | **SmartOF** | Airtable (pré-nov25) | non-vide gagne |
| Casquettes multi (LegalLink : EI_SELF / SALARIE / AGENT_COMMERCIAL, Enseigne, Structure_actuelle) | **Airtable** (pré-nov25) | SmartOF (heuristique nom) | Airtable gagne sur les enregistrements ≤ nov25 ; SmartOF pour les plus récents |
| Rattachement OPCO (`opcoCode`) | **Airtable** (pré-nov25) | SmartOF | Airtable gagne (pré-nov25) |
| `priceHT` réel encaissé — sessions AGEFICE | **Tréso AGEFICE** (Excel) | — | Tréso gagne (acté cas Steve Noel 22/05 : 0 € Excel ≠ 336 € base) |
| `priceHT` — sessions hors AGEFICE | **SmartOF** `presetTarification.tarifs[0].budget[0].prixUnitaireHT` | session/produit | sync-smartof-prices préserve les overrides manuels |
| 4 booléens encaissement (factureEnvoyee, validationOpco, remboursementOpco, paiementClient) | **Tréso AGEFICE** | — | OR-merge **uniquement sens montant** `false→true`. **Conflit descendant** (base `true` / Tréso `false`) → **PAS d'arbitrage auto**, route vers reliquat E3 avec verdict manuel (champ financier en audit) |
| Formateur par session (`SessionTrainer`) | **Tréso AGEFICE 2026** (`backfill-trainer-from-treso`, col. « Nom du formateur » présente uniquement onglet 2026) **+ Airtable `Sessions_planifiees` pour 2024/2025** (les onglets Tréso 2024/2025 n'ont PAS de colonne formateur) | saisie manuelle | ne jamais écraser un formateur saisi manuellement. **Airtable autorisé ici** car (a) Tréso muet sur 2024/2025, (b) fenêtre d'autorité Airtable = pré-nov25 cohérente avec ces sessions. Match par date+nom (pas de lien EI session↔airtable) → **revue CSV humaine obligatoire** (faux positifs mesurés, cf. §7). Voir déviation §0.1. |

**Invariant non-écrasement** : aucune passe ne remplace une valeur renseignée par une valeur vide. Un vide ne « gagne » jamais.
**Exception explicite** : un `0 €` Tréso **acté** (cas Steve Noel) est **une valeur**, pas un vide — il gagne sur le `priceHT` base au titre de la ligne « Tréso gagne », sans contredire l'invariant. Un Tréso vide/absent, lui, ne gagne pas.

---

## 3. Clés de rapprochement & règles de fusion (sécurité)

### 3.1 Référentiels (orgs puis persons)
Ordre de matching : **SIRET (nettoyé, Luhn) → email → nom+prénom (insensible casse/accents)**.

**48 Person sans email** : l'email ne peut pas servir de clé pour elles. Clé alternative ordonnée :
`SIRET de l'EI (LegalLink EI_SELF) → nom+prénom + birthDate → nom+prénom + org commanditaire`.
Si aucune ne discrimine de façon unique → **pas de fusion automatique**, route vers le reliquat E3.

### 3.2 ⚠️ Dédoublonnage — garde-fous issus de E0 (NON négociables)
Le dataset est immobilier : **les agences partagent une boîte email unique**.

- **L'email N'EST PAS une clé de fusion.** Constat E0 : `saintraphael@nestenn.com` = **6 personnes distinctes**. `email identique + noms différents` ⇒ **NE PAS fusionner** (c'est une adresse d'agence partagée, pas un doublon). L'email ne sert de signal de fusion **que** si nom+prénom concordent aussi.
- **SIRET partagé par 2 orgs de noms différents = arbitrage manuel, pas auto-merge.** Constat E0 : `MILLET Rachel || NEYRAT Immobilier` partagent un SIRET = EI et enseigne collées sur le même numéro (vraie erreur à corriger au cas par cas en E3, pas une fusion).
- **Fusion = report obligatoire des `ExternalIdentity`** du perdant vers le survivant (sinon le rejeu idempotent recrée le doublon). `dedupe.ts` le fait déjà (`updateMany` lignes 159-163 Org / 246-250 Person), **mais l'invariant n'est pas testé**.
  → **Prérequis dur de E2** : écrire `dedupe.merge.test.ts` (fusion réelle en transaction → asserter que les `ExternalIdentity` du perdant pointent vers le survivant après coup). Écrit **et** fermé dans E2 ; ne devient pas un gate ouvert ; ne rouvre pas le gate `updateSessionDetails` de `cloud-migration`.

---

## 4. Clé de rapprochement Tréso AGEFICE — échelle de dégradation

**Le montant n'est jamais un critère d'entrée** (il est précisément la donnée fausse à corriger : 336 € vs 3024 €). Cascade explicite :

1. **Clé d'entrée** : `fenêtre dates ±2j` + `org commanditaire` + `nombre de stagiaires`.
2. Si `nombre de stagiaires` côté base est **vide ou divergent** (sessions sans participant / lignes Tréso « no-participant ») → **dégrader** à `fenêtre dates ±2j` + `org commanditaire` seul.
3. Plusieurs candidats restants après dégradation → **montant en départageur uniquement**.
4. Toujours ambigu, OU zéro candidat → **no-match explicite routé vers le CSV de reliquat E3**. **Jamais de no-match silencieux.**

---

## 5. Gate de cohérence (E3) — critère réaliste

Pas d'égalité stricte (le cas Steve Noel 0 €/336 € la casserait). Le gate est vert si **les deux** conditions tiennent :

- **Écart CA résiduel < 2 %** sur le périmètre défini ci-dessous ;
- **0 ligne inexpliquée** : chaque écart figure dans le CSV de reliquat avec un verdict — **corrigé** OU **explicitement accepté** (avec motif).

### 5.1 Périmètre EXACT de la comparaison (les deux côtés scopés à l'identique)

Le seuil de 2 % ne mesure quelque chose que si les deux totaux couvrent le même périmètre. Définition figée :

- **Côté Tréso (Excel)** : les 3 onglets **AGEFICE 2024 / 2025 / 2026** du fichier `Tréso Agefice (2).xlsx` (version canonique), **agrégés ensemble**. Lignes hors AGEFICE = exclues. Lignes **sans montant** (planifiées/vides, colonnes `__EMPTY`) = exclues. Lignes « Groupe X » multi-stagiaires = comptées une fois pour leur montant total.
- **Côté base** : uniquement les SP dont `sponsorOrg.opcoCode = 'AGEFICE'` (186 SP), **agrégés sur les 3 exercices ensemble**.
- **⚠️ Vérifié 10/06 — les onglets sont rangés par année de FORMATION, pas de dépôt.** L'onglet « AGEFICE 2025 » contient 33 dossiers déposés en 2024 (formation 2025). **Donc PAS de scoping par exercice pour le gate** (un rattachement par `financingRequestDate` OU par onglet-année comparerait des périmètres décalés). `financingRequestDate` reste réservé à la règle de plafond budget [[feedback_budget_agefice_annee_dossier]] — c'est un axe différent, sans rapport avec ce rapprochement.
- **Comparaison à deux niveaux** : (1) **total global AGEFICE** base vs total AGEFICE Tréso (tous exercices confondus) ; (2) **ligne à ligne** après rapprochement (clé §4) — car un global juste peut masquer des compensations d'erreurs. Le gate exige les deux. (Une ventilation par année de formation reste utile en **diagnostic**, pas comme critère de gate.)
- **Écart inexpliqué symétrique** — les DEUX sens comptent, verdict obligatoire en E3 :
  - Ligne Tréso non rapprochée à un SP (no-match §4 étape 4) ;
  - SP AGEFICE en base **sans ligne Tréso en face** = signature d'une session fantôme / dossier jamais déposé (exactement ce qu'un auditeur remarque).

---

## 6. Gel de l'environnement de génération (audit)

**Ce qui passe le gate E4 = ce qui génère E5.** Couple figé pour **toute** génération destinée à l'audit :

- Modèle : **Ollama `mistral-small:24b`** (config locale actuelle) — déroulé éventuellement via `CLOSURE_OLLAMA_MODEL_DEROULE`.
- Prompts : `closure/qualiopi-prompts.ts` **dans leur état actuel**.
- **Bascule Sonnet / cloud INTERDITE avant le 03/07/2026.** Toute migration de routing modèle entre E4 et l'audit invalide la recette témoin → risque de conformité silencieux.

**Gate E4 = gate DE FOND, pas que d'existence** : verbes de Bloom présents, structure markdown attendue, autant de grilles que de mises en situation, **0 stub**. Invariant documentaire vérifié : analyse besoin → programme → déroulé type → déroulé réalisé.

---

## 7. Garde-fous globaux d'exécution

- (a) **`pg_dump` avant CHAQUE `--apply`** (E0 déjà fait : baseline du 10/06).
- (b) **Une étape `--apply` à la fois** : dry-run → revue du diff → apply. Jamais deux `--apply` enchaînés sans relire la sortie.
- (c) Interdiction de modifier un script d'import sans justification écrite (§0).
- (d) Gel modèle/prompts (§6).
- (e) Ce chantier **ne rouvre pas** le gate `updateSessionDetails` de `cloud-migration` (chantier orthogonal).
- (f) **Taux de faux positifs du matching MESURÉ, non nul.** Deux faux positifs déjà rattrapés par revue humaine : (1) Plan 03 — `Franck SERVANT` fusionné à tort vers `SEVIERI Franck` (match prénom-seul) ; (2) backfill formateur — SES-0061 (placeholder vide) avait capté 2 formateurs Tréso par collision de date. **Conséquence pour le Plan 06** (passe Tréso prix, la plus sensible — 52 × 336 €) : la revue du diff `--apply` est **ligne à ligne sur chaque correction de prix**, PAS un survol. Un prix corrigé sur la mauvaise session = un document financier faux devant l'auditeur. Le CSV `/tmp/treso-matching.csv` doit être relu intégralement avant l'apply prix.

---

## 8. Hors périmètre de la phase 9.2

- **E5 (généralisation à l'échantillon audit)** : conditionné à la liste **backfillables vs non-backfillables** validée par **Kaïna le 16/06**.
  - Backfillables (défendables a posteriori) : programme, analyse du besoin, déroulé type.
  - À arbitrer avec Kaïna (légitimité ≠ existence) : déroulé **réalisé** daté, rapport formateur daté.
  - **Émargements : EXCLUS, non négociable** — ne se fabriquent pas après coup.
- Re-tuning des prompts pour Sonnet → milestone v6 (cloud), **après** le 03/07.

**Différés actés (Plan 04 scope réduit, 2026-06-10) — à NE PAS perdre :**
- **11 placeholders « Immobilier gagnez 2h » existent toujours côté SmartOF.** L'apply Plan 04 a exclu le scope `sessions` pour ne pas les re-créer, mais **tout futur sync SmartOF scope `sessions` (juillet) les recréera**. Correctif définitif = les **supprimer/neutraliser dans SmartOF lui-même** (en amont), pas en base. → ligne reliquat Plan 07.
- **Refresh descriptif des 85 sessions DIFFÉRÉ, pas abandonné.** Le scope `sessions` a été exclu de l'apply Plan 04 — l'identité/descriptif session SmartOF n'a donc PAS été rejouée ce coup-ci. À rejouer **proprement une fois SmartOF nettoyé des placeholders**. « Exclu de l'apply » ≠ « jamais fait » → tracer pour ne pas l'oublier.
- **Refresh descriptif des 27 produits (programMd) NON fait** (exclu pour protéger les programmes Qualiopi, risque PROD-0662). Si besoin de rafraîchir le descriptif produit (titre/durée/public) sans toucher programMd → passe ciblée avec garde non-écrasement, hors audit.

**Pré-classement reliquat Plan 07 (triage 2026-06-10) — pour que le gate E3 ne compte pas ces cas comme « inexpliqués » :**
- **6 sessions DRAFT 2026 futures (SES-0094 → SES-0099)** — dont 3 portent des SP AGEFICE à 336 (SES-0096, SES-0098, SES-0099). Ce sont des **sessions futures, pas encore encaissées** → le Tréso n'a AUCUN encaissement en face → elles sortiront **NO_MATCH** au gate Plan 07. **Verdict pré-acté : « session future, pas encore encaissée — écart ACCEPTÉ »** (PAS inexpliqué). Leurs 336 € seront corrigés **quand le vrai prix sera connu** (à l'encaissement réel), **PAS par le Plan 06** qui n'a rien à leur confronter. Le Plan 06 ne doit donc PAS tenter de les corriger.
- **SES-0013 / SES-0014** (« Formation l'IA & l'humain », CANCELLED, 0 participant, produit PROD-0043) — **candidates suppression**, À BATCHER avec le ménage Plan 07 (PAS ce soir). Même protocole que les 11 placeholders : liste → mot de Laurent → pg_dump → suppression → **purge des ExternalIdentity rattachées** (leçon des 12 orphelines §0.1/E0′) + **vérifier si elles existent côté SmartOF** (si oui → liste de nettoyage amont SmartOF, sinon elles renaîtront au prochain rejeu scope `sessions`).
- **Catalogue produits (triage `.planning/audit/TRIAGE-PRODUITS.csv`, prérequis T2/T3)** : 17 RÉEL (sains) · 5 DOUBLON (paires Cadastre stub PROD-0664/0666 à fusionner/supprimer + PROD-0662 sur-mergé déjà ici) · 8 ORPHELIN (catalogue mort sans session, dont stubs des placeholders supprimés) · 1 PRÉINSCRIPTION (FRM-0002) · 1 À_VÉRIFIER (PROD-0043). Nettoyage catalogue = prérequis avant T2/T3, à traiter au Plan 07 / post-audit. **Verdict produit s'écrit ICI (reliquat), pas en double.**

---

## Annexe A — Modification de script autorisée (exécution, §0/7c)

> Marqueur recette (verify) : `Modification de script autorisee` — `apps/web/scripts/match-treso-agefice.ts`, clé §4. Date : 2026-06-10 (Plan 09.2-02).

**Fichier** : `apps/web/scripts/match-treso-agefice.ts` — **seule modification fonctionnelle de script d'import de la phase** (§7c).

**Lignes touchées** : bloc de scoring d'entrée (anciennement ~247-250) + insertion `nbStagiaires` + extraction `scoreTresoRow` / `matchTresoRows` (exports nommés, testabilité) + garde `main()`.

| | AVANT (buggé) | APRÈS (correctif §4) |
|---|---|---|
| Montant | **critère d'ENTRÉE** : `+20 si |montant − sig.total| / sig.total < 5 %` | **départage seul** : à score d'entrée ÉGAL, la session dont `|total − montant|` est minimal gagne. N'entre jamais dans le score d'entrée. |
| Nb stagiaires | parsé mais **jamais scoré** | **critère d'ENTRÉE** : `+15 si t.nbStagiaires === sig.session.participants.length` (dégradation explicite si vide/divergent : pas de bonus, pas de pénalité) |
| Score d'entrée | noms +50 / début +30 / fin +20 / **montant +20** / OPCO +10 | noms +50 / début +30 / fin +20 / **nbStagiaires +15** / OPCO +10 |

**POURQUOI le mécanisme actuel ne suffit pas** : le montant en base est précisément la donnée fausse à corriger (bug 336 €×52 — `priceHT` stocké = prix/jour au lieu du prix total). Avec le montant en critère d'entrée, une ligne Tréso à 3024 € qui « matche » une session à 336 € verrait son score **baissé** (ratio hors ±5 %) ou, pire, un faux 336 € côté base conforterait un mauvais appariement → le bug se masque lui-même et empêche sa propre correction. En sortant le montant de l'entrée, le match repose sur noms + dates + nb stagiaires (données fiables), et le montant ne sert qu'à trancher entre candidats déjà qualifiés.

**Invariance préservée** : l'APPLY (`priceHT = montant / nb SP matchés`, OR-merge des 4 booléens d'encaissement) est **inchangé** (§2). Le seuil AUTO ≥ 70 reste atteignable par noms (+50) + date début (+30). Couvert par `apps/web/scripts/__tests__/match-treso-scoring.test.ts` (4 tests : montant hors entrée, nb stagiaires +15, départage montant, no-match).
