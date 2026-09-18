# Différé — planning lot 1

- Lot 2 : déclarer, modifier et supprimer des indisponibilités (RBAC FORMATEUR propriétaire / ADMIN / MANAGER), dialog et validation. Aucun début d'implémentation dans ce lot.
- Export ICS / synchronisation Google Calendar des indisponibilités.
- Filtre « mes sessions » propre au rôle FORMATEUR.
- Réaffectation par glisser-déposer.
- Édition des SessionSlot depuis le planning.

Constats hors périmètre : lint signale déjà un attribut alt manquant dans apps/web/src/app/app/parametres/page.tsx:228 ; la gate reste à 0. Deux tests de la suite existante sont skipped. Aucun échec laissé ouvert.
