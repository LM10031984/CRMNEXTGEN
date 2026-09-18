# Audit du référentiel AGEFICE — 18 septembre 2026

Audit exécuté : 2026-09-18T16:46:09.427Z. Snapshot officiel : 2026-09-18T16:44:14.673Z.

## Méthode et limites

- Lecture seule : transaction PostgreSQL BEGIN READ ONLY, contrôle du mode puis ROLLBACK. Aucun import ni modification en base.
- Aucune personne ni document apprenant lus. Les profils sont interrogés uniquement par comptages agrégés ; aucune identité, aucun NIR ni secret enregistré.
- Référentiel institutionnel : nom du point, numéro PTA, email professionnel public, code postal, ville et couverture. Pas de nom de contact.
- Source : [annuaire officiel](https://communication-agefice.fr/trouver-un-point-daccueil/) et [endpoint public par département](https://communication-agefice.fr/ajax/json.php?dept=06). La page a retourné HTTP 503 via le navigateur de recherche ; l’endpoint public fonctionne séparément.
- 101 départements au maximum, concurrence 3, pause 250 ms entre requêtes par worker, timeout 12 s. Aucune validation de délivrabilité SMTP.

## Collecte officielle

- Départements interrogés avec succès : 101/101.
- Points d'accueil distincts : 143.
- Points officiels sans email : 0.
- Échecs : 0.

## État en base (production, transaction read-only confirmée)

- Points enregistrés : 158.
- Sans email : 0.
- Sans numéro PTA : 15.
- Sans couverture départementale : 15.
- Numéros PTA en doublon : 0 groupes (0 lignes).
- Doublons nom normalisé + code postal : 0 groupes.
- Emails partagés entre plusieurs points : 4 groupes (ne prouve pas un doublon).
- Profils AGEFICE : 187 ; non rattachés : 187 ; rattachés à un point sans email : 0.

## Comparaison au snapshot officiel

- Identiques sur les champs comparés : 142.
- Points avec différences ou rapprochement ambigu : 1.
- Points officiels non retrouvés en base : 0.
- Points en base non retrouvés dans le snapshot : 15. Leur absence ne justifie aucune suppression, particulièrement si collecte partielle.

| PTA officiel | Point | Différences | Email en base | Email officiel |
|---|---|---|---|---|
| 83 | CCI MARNE ARDENNES | couverture (base : 08 ; officiel : 08/51) | f.lamotte@marneardennes.cci.fr | f.lamotte@marneardennes.cci.fr |

### Points officiels à rapprocher ou ajouter

| PTA | Point | Email officiel | Départements couverts |
|---|---|---|---|

### Points en base non rapprochés

| PTA | Point | Email |
|---|---|---|
|  | UMIH AISNE | fdih-umih02@wanadoo.fr |
|  | CCI DE MOULINS VICHY | cpelissier@allier.cci.fr |
|  | CPME 05 | ageficecpme05@gmail.com |
|  | CPME ARDENNES-MARNE | contact@cpme51.fr |
|  | CCI ALLIER | ml.collin@allier.cci.fr |
|  | UMIH DE LA CORSE | syndicatumih2b@wanadoo.fr |
|  | MEDEF HERAULT MONTPELLIER SETE | agefice@medef-montpellier.com |
|  | CPME Loire-Atlantique (antenne 44) | agefice@cpme-pdl.fr |
|  | CPME Loire-Atlantique (antenne 49) | agefice@cpme-pdl.fr |
|  | CPME Loire-Atlantique (antenne 53) | agefice@cpme-pdl.fr |
|  | MEDEF ARTOIS | laurence.pecheur@medef-artois.fr |
|  | CCI DE BAYONNE PAYS BASQUE | adv.cciformations@bayonne.cci.fr |
|  | CCI PAU BEARN | agefice-pau@pau.cci.fr |
|  | MEDEF DE LA SOMME | isabelle.prieur@medef-somme.fr |
|  | CPME VOSGES | info@cgpme-88.org |

## Audit agrégé des rattachements (aucune identité exportée)

Clés présentes dans paFields (noms de champs seulement) :

- Activité Professionnelle (Entreprise)
- Adresse (Entreprise)
- Adresse du PA AGEFICE
- Adresse Entreprise
- BIC
- Code APE - NAF (Entreprise)
- Code postal (Entreprise)
- Code Postal (Entreprise)
- Date de naissance (Stagiaire)
- Email (Stagiaire)
- Forme juridique (Entreprise)
- IBAN
- Interlocuteur PTA
- Lieu de naissance (Stagiaire)
- N° affiliation URSSAF
- N° de PTA
- N° Sécurité sociale (Stagiaire)
- N° SIRET (Entreprise)
- Nom (Stagiaire)
- Nom / Raison Sociale de L'entreprise (Entreprise)
- Nom du PA AGEFICE
- Nom du PTA
- Prénom (Stagiaire)
- Téléphone (Stagiaire)
- Ville (Entreprise)

Le code postal paFields est une donnée historique du formulaire : sa présence ne prouve pas une extraction vérifiée de la dernière attestation CFP. Le repli sur l’adresse entreprise sert au diagnostic et doit rester distingué de la CFP.

| Indicateur | Nombre |
|---|---|
| profiles | 187 |
| cfp_postal_present | 168 |
| org_postal_fallback | 8 |
| postal_missing | 11 |
| department_from_cfp | 168 |
| department_from_org | 8 |
| department_unresolved | 11 |
| pa_number_present | 0 |
| pa_name_present | 168 |
| field_pta_number_present | 0 |
| field_pta_number_unique | 0 |
| field_pta_number_unique_with_coverage | 0 |
| field_pta_name_present | 165 |
| field_pta_name_unique | 0 |
| manually_locked | 0 |
| exact_number_unique | 0 |
| exact_number_ambiguous | 0 |
| exact_number_missing | 0 |
| normalized_name_unique | 0 |
| normalized_name_ambiguous | 0 |
| normalized_name_missing | 168 |
| department_unique | 0 |
| department_ambiguous | 176 |
| department_without_candidate | 0 |
| proposed_by_number_and_department | 0 |
| proposed_by_name_and_department | 0 |
| proposed_by_department_alone | 0 |

### Proposition de correction en simulation uniquement

Conclusion de la simulation : **0 rattachement automatique sûr proposé**. Les 176 profils ayant un département calculable ont plusieurs points candidats ; les 11 autres n’ont pas de département calculable. Aucun numéro PTA n’est renseigné, même dans les champs historiques. Les noms de PTA présents ne correspondent pas exactement aux noms normalisés du référentiel. Il faut donc présenter les choix dans QualiOF et vérifier leur provenance CFP avant de persister un rattachement.

1. Préserver les points historiques et toutes les sélections verrouillées manuellement. Corriger séparément la couverture officielle du PTA 83 (ajout du 51, maintien du 08).
2. Pour un profil non verrouillé, proposer son numéro PTA exact uniquement s’il désigne un point unique avec email et couverture compatible avec son département vérifié. Un numéro présent mais invalide ne doit pas déclencher un repli silencieux.
3. En l’absence de numéro, proposer un nom normalisé exact seulement si unique et compatible avec la couverture. Les rapprochements approximatifs restent à examiner.
4. Sans numéro ni nom, ne proposer un point automatiquement que si la couverture départementale donne un candidat unique. Plusieurs candidats doivent être présentés pour choix ; ni ordre alphabétique ni proximité postale ne constituent une décision utilisateur.
5. Avant toute écriture, produire un aperçu sécurisé dans QualiOF des propositions et conflits, distinguer la provenance CFP de l’adresse entreprise, puis appliquer seulement les décisions validées avec contrôle de concurrence. Cet audit ne crée aucun rattachement.

## Suite recommandée

Examiner les différences, rapprocher les lignes sans PTA et préserver les rattachements existants avant une éventuelle mise à jour. Ce script ne modifie jamais les données. Les domaines et adresses issus de la source officielle restent à vérifier au moment du dépôt ; une présence dans l’annuaire ne prouve pas la délivrabilité.
