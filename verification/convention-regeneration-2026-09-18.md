# Régénération des conventions individuelles — 18 septembre 2026

## Reproduction

- Signalement utilisateur : bouton « Régénérer » dans « Avant la formation », `qualiof.vercel.app`, Taylor et Gavina, session de deux apprenants.
- Lecture navigateur : SES-0117 affiche bien deux apprenants ; le lien de Taylor sert un ancien PDF au format entreprise. Aucun déclenchement de génération pendant l’investigation.
- Code : `generateConventionCore` retournait l’ancien groupe avant la règle de régime/payeurs, sans rendre de nouveau document.
- Tests rouges : 7 échecs sur 42 tests ciblés, pour présence du nom individuel, absence de type explicite, ancien document retourné et absence de refus pour document engagé.

## Correction

Type `INDIVIDUEL`/`ENTREPRISE` explicite dans le rendu, noms uniquement dans l’article 4 entreprise. Le cœur individuel distingue le contrat courant du format de stockage historique. Un ancien PDF groupe non engagé ne bloque plus la génération individuelle. Les documents groupe sont conservés ; la convention personnelle générée devient prioritaire dans l’affichage existant. Aucun changement de prix ni de déclenchement automatique.

## Vérifications locales

- Première suite complète : 4 441 tests réussis et 2 ignorés (web 4 002, db 231, shared 208).
- Six cas supplémentaires : appels sans force, ancres de signature, statuts engagés et employeurs SARL/EI. Suite ciblée finale : 48/48 réussis.
- Lint validé ; avertissement `alt` préexistant dans `parametres/page.tsx:228`.
- TypeScript web validé.
- Environnement unitaire isolé, base factice locale au port 1, aucun secret de production chargé.
- Aucun changement de schéma, aucun envoi ni signature, aucun document réel régénéré.

Les vérifications du pipeline et du déploiement sont rapportées dans la PR. Le contrôle local du contenu ne constitue pas une régénération du PDF réel en production.
