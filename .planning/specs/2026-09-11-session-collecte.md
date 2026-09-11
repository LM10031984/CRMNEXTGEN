# Spec — Session « en collecte » (ouvrir les inscriptions avant de fixer programme et dates)

Date : 2026-09-11 · Auteur : Laurent (via Cowork) · Statut : à implémenter

## Besoin

Créer une session avec juste un nom (« Formation agence Dupont »), ouvrir tout de suite les
inscriptions et diffuser le lien, récupérer les infos des inscrits, PUIS seulement choisir le
programme (produit), les dates, le formateur, le lieu. Le lien diffusé ne doit jamais changer.

## État actuel (bloquant)

- `sessions-create.ts` : `Produit obligatoire`, `Dates obligatoires`, `Au moins un formateur`.
- `TrainingSession` : `productId String` non nul, `startDate`/`endDate` `DateTime` non nuls,
  `name` dérivé de `product.title + date`.
- `/inscription/[token]` affiche `session.product.title` et « Du X au Y » en dur.
- `enroll-from-request.ts` lit `session.product.priceHT / groupFlatPrice` pour le prix par défaut.
- `SessionDatesEditor` → `updateSessionDates` ne touche pas les `SessionSlot` (seul
  `persistSessionSlotsAction`, appelé uniquement par le wizard, replanifie).
- 14 server actions + 9 composants lisent `session.product` ; ~20 actions lisent `startDate`.

## Décisions de design

1. Nouveau statut `COLLECTING` (« En collecte ») dans `SessionStatus`, avant `PLANNED`.
   Une session en collecte est une vraie `TrainingSession` (même code SES-xxxx, même jeton
   public, mêmes participants) — pas une entité à part, sinon il faudrait migrer les inscrits.
2. `productId`, `startDate`, `endDate` deviennent nullables. Une session est « complète »
   quand `productId && startDate && endDate && trainers.length > 0`.
3. `name` devient la source du titre affiché partout (fiche, liste, formulaire public) ;
   fallback `product.title - date` uniquement si `name` vide (comportement actuel conservé
   pour les sessions existantes).
4. Le jeton public est conservé lors de la complétion (règle déjà en place dans
   `openSessionEnrollments` : réouvrir ne change pas le jeton).
5. Aucun document (convention, convocation, AGEFICE, facture, closure-pack, agenda calendrier)
   ne peut être généré tant que la session n'est pas complète → erreur explicite, jamais un
   crash sur `session.product` null.

## Lots

### Lot 1 — Modèle & migration
- `enum SessionStatus` : ajouter `COLLECTING`.
- `TrainingSession.productId String?`, `product TrainingProduct?`, `startDate DateTime?`,
  `endDate DateTime?`. Migration Prisma sans reprise de données (les sessions existantes
  restent complètes).
- Helper partagé `isSessionComplete(session)` + `assertSessionComplete(session)` (throw une
  erreur métier `SessionIncompleteError` avec message « Complétez le programme, les dates et le
  formateur avant cette action »).
- `updateSessionStatus` : transitions autorisées `COLLECTING → PLANNED | OPEN | CANCELLED`
  uniquement si complète (sauf CANCELLED).

### Lot 2 — Création rapide « Ouvrir une session aux inscriptions »
- Sur `/app/sessions` : second bouton à côté de « Nouvelle session » → modal minimal :
  `name` (obligatoire), `capacityMax` (défaut 12), `modality` (défaut PRESENTIEL),
  `locationName/City` (optionnel), `internalNotes` (optionnel).
- Action `createCollectingSession(input)` : crée la session `COLLECTING`, code SES-xxxx,
  puis appelle `openSessionEnrollments` dans la même transaction logique → retourne `{ id, url }`.
- La modal affiche l'URL avec bouton « Copier le lien » et un lien vers la fiche.

### Lot 3 — Formulaire public tolérant
- `/inscription/[token]` : titre = `session.name ?? session.product?.title`.
  Dates : si `startDate` null → « Dates à confirmer » (pas de « Du … au … »). Lieu masqué si null.
- `publicLinkState` : `COLLECTING` compte comme `ouvert` (pas dans `STATUTS_CLOS`).
- `enroll-from-request.ts` : `resolveDefaultParticipantPrice` reçoit `product: null` → prix
  par défaut `null` (à fixer à la complétion, cohérent avec la décision SessionPricing :
  forfait groupe par entreprise + tarif indépendant, aucune reprise).
- E-mails de confirmation de pré-inscription : ne pas afficher de dates si null.

### Lot 4 — Compléter la session depuis la fiche
- Bandeau « Session en collecte — N inscrits » sur la fiche, avec checklist :
  programme ○ · dates ○ · formateur ○ · lieu (optionnel).
- Panneau « Compléter » réutilisant les étapes 1 et 2 du wizard (`searchProducts`,
  `proposeScheduleAction`, `checkTrainerAvailability`, `persistSessionSlotsAction`).
- Action `completeCollectingSession({ sessionId, productId, startDate, durationHours,
  hoursPerDay?, trainerPersonIds, locationName?, modality? })` : met à jour la session,
  replanifie les créneaux (drop + recreate), NE touche PAS le jeton ni les participants,
  passe le statut à `PLANNED`, recalcule le prix par défaut des participants dont le prix
  est encore `null` selon la règle SessionPricing.
- Bonus (dette déjà identifiée) : `updateSessionDates` doit aussi replanifier les créneaux
  via la même logique que `persistSessionSlotsAction`, avec un avertissement si des documents
  ont déjà été générés.

### Lot 5 — Garde-fous sur les générateurs
- Ajouter `assertSessionComplete` en tête de : convention, convocation, AGEFICE (dossier +
  attestation), invoices (3 points d'entrée), closure-pack, calendar-sync, opco-submission,
  grille-obs, dossier-reminder, notifications (filtrer `startDate: not null`),
  budget-agefice (ignorer les sessions sans date).
- Les composants qui lisent `session.product` : optional chaining + libellé « Programme à
  définir ».
- Liste des sessions : filtre/badge « En collecte » ; tri par `startDate` avec les `null` en tête.

## Tests attendus
- Création collecte → lien ouvert → pré-inscription publique acceptée sans produit ni dates.
- Complétion → jeton inchangé, participants conservés, créneaux créés, statut PLANNED.
- Toute génération de document sur une session incomplète → `SessionIncompleteError`, pas de 500.
- `publicLinkState('COLLECTING')` = `ouvert`.

## Hors scope (à décider plus tard)
- Notifier automatiquement les inscrits quand les dates sont fixées.
- Convertir une session DRAFT existante en COLLECTING.
