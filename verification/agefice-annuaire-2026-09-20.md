# Vérification AGEFICE — 20 septembre 2026

Demande : l’écran de Gavina ne propose que neuf points d’accueil.

Rapprochement relancé à 08:57 UTC avec l’API publique de l’annuaire officiel (`https://communication-agefice.fr/ajax/json.php?dept=06`, puis tous les départements), et la production dans une transaction PostgreSQL explicitement en lecture seule.

- 101/101 départements interrogés, aucune erreur.
- 143 points officiels distincts ; tous retrouvés en production, aucune différence sur les champs comparés.
- 158 entrées en base, dont 15 historiques conservées ; aucune adresse email absente.
- Le département 06 est couvert par neuf points officiels. Le sélecteur du brouillon est filtré sur le département CFP ; il ne représente pas l’annuaire national.
- Aucune insertion ni mise à jour nécessaire. Aucun rattachement automatique effectué.

L’écran explicite désormais le nombre de résultats et le filtre ; le code postal CFP peut être corrigé après vérification par l’utilisateur.
