# Lot D — moteur ratios/scoring + rapport d'audit

Vérifié sur DIAG-0001 « Agence des Oliviers », base locale, 02/09/2026.

| Point | Résultat |
|---|---|
| Rapport 17 pages, conforme à la maquette | ✅ `evidence/audit-DIAG-0001.pdf` |
| Financement en DERNIÈRE page | ✅ page 17, aucune page après |
| Restitution de toutes les réponses | ✅ 22/22, libellés écrits, valeurs en français |
| Score global + par chapitre + couverture | ✅ 65/100, barème `bareme-v1-2026-09` |
| PDF → MinIO → `Document` (DIAGNOSTIC_AUDIT) | ✅ + AuditLog `diagnostic.audit.generated` |
| Empreinte anti-péremption | ✅ bandeau après modification d'une réponse |

## Quatre défauts trouvés en regardant le PDF, pas le code

**1. La feuille de style était corrompue par mon extraction.** Une regex gourmande
sur `.specimen` avait mangé le `:not(.specimen)` d'une AUTRE règle, produisant du
CSS invalide. Le parseur abandonnait tout ce qui suivait : le PDF sortait sans
mise en forme, et aucun test unitaire ne le voyait. Verrouillé depuis par un test
d'intégrité (accolades équilibrées, règles clés présentes).

**2. WeasyPrint ne substitue pas les variables CSS dans les propriétés
raccourcies.** `color:var(--ok)` fonctionne, `background:var(--ok-bg)` est ignoré
en silence. Résultat : en-têtes de tableau blancs sur blanc, tuiles sans bordure,
pastilles sans fond. La palette est désormais résolue en valeurs littérales à la
génération, et un test interdit tout `var(--` résiduel.

**3. Ni CSS Grid ni `gap` ne sont supportés.** Toutes les grilles s'empilaient en
une colonne, et sur la couverture le montant chevauchait littéralement le texte.
Un bloc de compatibilité explicite (flex + marges) est ajouté APRÈS la maquette,
jamais à sa place.

**4. Le titre de priorité reprenait toute la phrase du levier**, ce qui donnait un
plan 90 jours illisible. Titre court et action complète sont maintenant deux
champs distincts.

## Ce qui reste ouvert

- **« Notre lecture » est heuristique**, pas rédigée par IA. C'est le repli prévu
  par la spec (E-3) et `generationSource` le dit dans le document. Le branchement
  Ollama reste à faire, avec relecture obligatoire avant envoi.
- **D-9** : le barème v1 demande à être recalibré sur trois audits réels.
- Les glyphes ✓/⚠/✗ de la maquette n'existent pas dans la police du conteneur :
  remplacés par « au niveau » / « écart » / « prioritaire ».
