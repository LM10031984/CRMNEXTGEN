# Quick 260908-lrj — Un seul dépôt des pièces à la création d'un apprenant

**Date :** 2026-09-08
**Branche :** `quick/260908-depot-unique-pieces` (worktree `files-lieu`, partie de `main` @ `63c2880`)
**Demande (Laurent, 2026-09-08) :** « quand je crée un apprenant, je télécharge ses pièces pour
qu'il préremplisse, et ensuite je dois télécharger à nouveau les pièces à conserver au dossier.
Est-ce qu'on ne peut pas le faire en une seule fois ? »

## L'existant

Le formulaire « Nouvel apprenant » a **deux blocs de dépôt** :

1. bloc gris « Upload + extraction » — trois `<input type="file">` gardés en mémoire
   (`cniFile`/`ribFile`/`cfpFile`), envoyés en `FormData` à `extractApprenantDocs` pour le
   pré-remplissage IA ;
2. bloc vert « Pièces à conserver au dossier (envoi direct) » — trois `DirectUploadField` qui
   envoient le fichier **directement** au stockage et remontent des clés (`directKeys`).

Au submit, `directKeys` est prioritaire ; à défaut, les fichiers du bloc 1 sont uploadés par
`uploadApprenantDocs`. Autrement dit **le bloc 1 conserve déjà les pièces** — mais rien à l'écran
ne le dit, d'où le double geste de Laurent. Et ce chemin de repli fait transiter le fichier par une
server action, donc par Vercel : **plafond 4,5 Mo**, qu'une photo de CNI dépasse vite.

## Décision

Un seul bloc, celui qui envoie directement au stockage. Le pré-remplissage IA lit ensuite les
objets **déjà stockés**, côté serveur. Conséquences : un seul geste, plus aucun octet par Vercel
(ni à la conservation, ni à l'extraction), et le plafond 4,5 Mo disparaît des deux côtés.

## Découpage

### Tâche 1 — `extractApprenantDocsFromKeys(keys)`

- Dans `extract-apprenant-docs.ts` : extraire le mapping `ExtractedDocs → data` (aujourd'hui inline)
  dans une fonction réutilisable, puis ajouter l'entrée par clés qui télécharge depuis
  `DOCS_BUCKET` avant d'appeler le même pipeline `extractDocsFromBuffers`.
- **Garde-fou de scope :** les clés viennent du navigateur. On refuse toute clé qui n'est pas sous
  `apprenants/<tenantId>/` — sinon un utilisateur pourrait faire lire au serveur un objet
  appartenant à un autre tenant. Même contrôle ajouté à `confirmApprenantUpload`, qui aujourd'hui
  renvoie les clés reçues **sans aucune validation** (même faille, une ligne à écrire).
- **verify :** tests du garde-fou de préfixe (module pur extrait).
- **done :** l'extraction fonctionne à partir de clés, et refuse une clé hors tenant.

### Tâche 2 — Un seul bloc dans le formulaire

- Supprimer le bloc gris et les états `cniFile`/`ribFile`/`cfpFile`, garder les trois
  `DirectUploadField` renommés « Pièces de l'apprenant (conservées au dossier) ».
- « Pré-remplir avec l'IA » devient actif dès qu'une pièce est déposée et appelle la nouvelle
  action avec `directKeys`.
- Retirer le chemin de repli `uploadApprenantDocs` du submit (l'action devient sans appelant →
  supprimée, elle portait le plafond 4,5 Mo).
- **done :** un seul dépôt, un seul bouton, le fichier sert aux deux usages.

### Tâche 3 — Détecter l'erreur de lecture à la source (ajout Laurent en cours de route)

« Attention à l'OCR qui a confondu EL GUERTIT avec EL GUERTIJ. » Le croisement SIRENE ne rattrape
rien ici : ce SIRET est `[NON-DIFFUSIBLE]` (vérifié le 08/09), comme beaucoup d'auto-entrepreneurs.
En revanche le nom figure sur **deux** pièces — la CNI et l'attestation URSSAF — et l'extraction
gardait la CNI en priorité **en jetant l'autre valeur sans rien dire**.

- `lib/persons/name-divergence.ts` (module pur) : compare nom et prénom entre deux pièces, tolère
  accents/casse/tirets, et distingue « à une lettre près » (erreur de lecture probable) de
  « franchement différent » (peut-être pas la même personne).
- Canal `identityWarnings` distinct des avertissements techniques, affiché en encart ambre nommé
  « Vérifie l'identité avant de valider » — pas une ligne en 10 px.
- **done :** un T lu J entre deux pièces se voit à l'écran avant la création.

## Hors scope

- Le formulaire public `/p/[token]` n'est pas touché : il utilise déjà `DirectUploadField` seul.
- L'OCR lui-même (qualité d'extraction) n'est pas modifié — même pipeline, même prompt.
