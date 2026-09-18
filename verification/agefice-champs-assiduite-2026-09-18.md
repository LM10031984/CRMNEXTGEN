# AGEFICE — champs et assiduité sur une page (18 septembre 2026)

## Diagnostic

- La fiche entreprise de Taylor porte bien `AUTO_ENTREPRENEUR` (lecture du select du CRM, aucune sauvegarde). Le PDF existant signalé par l’utilisateur affiche « AUTRE ». Le mapping du générateur courant est déjà correct : le test sur le formulaire officiel réel sélectionne `MICRO-ENTREPRISE / AUTO-ENTREPRISE`. Le fichier stocké devra être régénéré à la demande pour reprendre la donnée actuelle ; aucun changement de statut de Taylor n’est nécessaire.
- Le générateur préfixait explicitement l’adresse entreprise avec la raison sociale. Cette règle est remplacée par la rue seule, la raison sociale restant dans sa case.
- Le libellé de lieu partagé comprenait le CP et la ville alors que le Cerfa dispose de deux cases dédiées. Une option de formatage propre aux champs séparés conserve l’identité et la rue. Les autres documents conservent leur adresse complète.
- La case « formation en entreprise » provenait du produit et non du lieu de session. La session et sa modalité deviennent prioritaires. Les locaux OF sont reconnus par leur nom ou leur adresse ; le distanciel est exclu. Le défaut produit reste utilisé sans lieu renseigné, et son libellé l’explicite.
- L’assiduité débordait avec les intitulés longs : les quatre variantes de la preuve Gotenberg donnaient respectivement 1, 1, 2, 2 pages.

## Règle de lieu

Conformément au cas indiqué par Laurent, un lieu renseigné distinct des locaux de l’OF est traité comme lieu client. Ashley and Parker est un lieu client et donne « Oui ». Ce critère n’utilise ni le financeur ni le régime individuel/entreprise du contrat. Sans lieu, le comportement historique de repli reste accompagné de l’avertissement existant.

## Correction du modèle d’assiduité

Espacements verticaux resserrés dans l’en-tête, les tableaux, les paragraphes et les notes ; date et lieu réunis sur une ligne. Corps conservé à 10 pt, notes à 7 pt, zones de signature conservées à 24 mm. Aucun texte tronqué, masqué ou supprimé. Les blocs de notes et signatures restent ensemble. La mention « Modèle AGEFICE – Janvier 2025 » est conservée sur la première page.

## Preuves

- 10 échecs pertinents observés avant correction sur les adresses et le booléen entreprise ; tests verts après correction. Le test de forme juridique AUTO_ENTREPRENEUR était déjà vert avant la correction.
- Suite ciblée : 36 tests réussis, avec lecture des champs du vrai formulaire PDF.
- Suite complète : **4 456 tests réussis, 2 ignorés** (web 4 017, db 231, shared 208).
- TypeScript et lint validés ; seul avertissement `alt` préexistant dans `parametres/page.tsx:228`.
- `pnpm --filter @qualiof/web exec tsx scripts/proof-agefice-one-page.ts` contre un conteneur Gotenberg 8 isolé, uniquement sur `127.0.0.1:34003`. Données fictives, aucune base ni variable de production. Quatre variantes finales : standard papier, standard signature, intitulé long papier, intitulé long signature — **une page chacune**. Assertions sur le pied de page, les noms, le montant, la dernière note et les deux rôles de signature. Contrôle visuel papier/signature réussi.

Aucune migration. Aucun document réel régénéré, aucun envoi ni signature. Les PDF existants se mettent à jour via leur bouton « Régénérer » après déploiement. Aucun appel IA.
