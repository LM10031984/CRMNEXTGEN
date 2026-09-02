# Lot B — saisie R1 · vérification sur un dossier réel

Diagnostic **DIAG-0001 « Agence des Oliviers »**, joué de bout en bout dans le
navigateur sur la base locale, le 02/09/2026.

## Ce qui a été vérifié

| Point | Résultat |
|---|---|
| Création d’un diagnostic sur une agence inconnue du CRM | DIAG-0001 créé, lead créé à la volée |
| Redirection vers le premier chapitre incomplet (reprise) | ✅ rouvrir le dossier renvoie au ch.2, pas au ch.1 |
| Autosave par réponse | ✅ persistée en base, indicateur « Enregistré » |
| Grille équipe (4 agents indépendants) | ✅ 4 fiches, production N-1 lue avec espaces |
| Synthèse financement < 1 s | ✅ calcul client pur, pas d’aller-retour serveur |
| Fixture canonique reproduite à l’écran | ✅ 9 demi-journées · 72 h conventionnées · 12 000 € · 96 € de reste à charge |
| Synthèse pipeline + maillon faible | ✅ « Offres » détecté à 15 % contre 25 % attendus |
| Snapshot serveur en phase avec l’écran | ✅ après correctif (cf. ci-dessous) |
| Redirect 308 `/app/diagnostic` → `/app/diagnostics` | ✅ |

## Deux défauts trouvés en jouant le parcours, et corrigés

**1. L’autosave n’écrivait rien, en silence.** En mode strict React (actif en
dev), le composant est monté, démonté puis remonté ; le drapeau `mounted`
n’était remis à `true` qu’à l’initialisation du ref. Après le démontage simulé
il restait à `false` et la boucle d’envoi sortait immédiatement. À l’écran tout
paraissait normal — un R1 entier pouvait se saisir dans le vide. Verrouillé par
`use-autosave.test.tsx`, qui échoue si on retire le correctif.

**2. Le snapshot serveur restait en retard sur l’écran.** Il n’était recalculé
qu’au changement de chapitre : après la saisie de la grille équipe, l’écran
affichait 12 000 € tandis que la base gardait des zéros — ce que le rapport
d’audit du lot D aurait repris. Le recalcul est désormais déclenché aussi par
toute modification de la grille.

## Captures

- `evidence/synthese-financement.png` — le moment de démonstration du R1
- `evidence/synthese-pipeline.png` — le tunnel et son maillon faible
- `evidence/liste-diagnostics.png` — la liste
