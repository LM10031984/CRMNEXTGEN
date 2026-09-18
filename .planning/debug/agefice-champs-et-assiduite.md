---
status: resolved
trigger: Champs AGEFICE incorrects et pied de page assiduité sur une seconde page
---

# AGEFICE — champs et pagination

Demandes du 18/09/2026 : forme auto-entrepreneur pour Taylor, adresse entreprise sans nom, formation en entreprise pour le lieu client, CP/ville uniquement dans leurs champs, assiduité entière sur une page.

La fiche Taylor contient AUTO_ENTREPRENEUR (vérifié dans le formulaire, sans enregistrement) ; le mapping courant du PDF connaît déjà cette valeur. Le fichier AGEFICE stocké doit être régénéré à la demande. Le code ajoute explicitement la raison sociale à l’adresse entreprise, utilise le libellé complet de lieu et prend la case entreprise sur le produit.

Plan : tests sur les champs du vrai PDF et le payload ; correction ciblée des adresses et de la source du booléen ; reproduction avec Gotenberg local de la pagination ; vérification PDF une page et mentions/signatures présentes ; tests globaux puis publication.

Aucune génération réelle ni écriture de dossier en production. Tests de rendu uniquement sur données fictives et service PDF local.

## Résultat

Adresses Cerfa séparées et case entreprise résolue depuis la session et son lieu. Assiduité : espacements réduits, date/lieu sur une ligne, notes et signatures insécables. Aucun texte ni zone de signature supprimé. Preuve sur Gotenberg local : les deux variantes à intitulé long passent de deux pages à une ; quatre variantes finales sur une page, mentions et ancres conservées.

Validation complète : `verification/agefice-champs-assiduite-2026-09-18.md`.
