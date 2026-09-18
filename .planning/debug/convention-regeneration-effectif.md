---
status: resolved
trigger: Article 4 inchangé après régénération manuelle sur qualiof.vercel.app
---

# Convention individuelle : effectif et ancien document groupe

Reprise du chantier prix/statuts après le signalement utilisateur du 18/09/2026.

Attendu : article 4 individuel avec effectif total sans noms ; entreprise avec liste des salariés. Génération uniquement à la demande.

Cause : garde anti-doublon groupe avant la détermination du contrat courant ; `force` ne changeait pas ce retour anticipé. Le modèle individuel gardait par ailleurs son propre nom.

Preuve : test rouge reproduisant le retour de l’ancien groupe et les noms dans l’article 4. Correction : type contractuel explicite dans le modèle et garde groupe limitée aux contrats entreprise/indéterminés. Régression employeur et document engagé protégée.

Validation : voir `verification/convention-regeneration-2026-09-18.md`. Déploiement dans la continuité de l’autorisation utilisateur ; pas de modification des documents réels pendant les tests.
