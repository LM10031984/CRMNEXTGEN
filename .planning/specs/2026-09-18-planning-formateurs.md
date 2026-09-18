# Spec — Planning des formateurs (qui est dispo, sur quelle session, quel régime)

**Date** : 18/09/2026 · **Auteur** : Laurent (besoin) / Claude (rédaction) · **Statut** : à lancer
**Base auditée** : `origin/main` dc61a40f (18/09, PR #99) — pas une branche de travail.
**Dépend de** : PR #96 (`TrainingSession.regime`), PR #85 (conflit formateur = avertissement, plus un blocage).
**Commandes** : `/quick` (worktree + base + port), règles de test du dépôt.

---

## 0. Le besoin, tel que formulé le 18/09

> Actuellement il y a une possibilité de gérer les formateurs lors de l'inscription à la session,
> mais j'aimerais un visuel sur un calendrier qui me permette de voir qui est dispo et sur quelle
> session il est (session auto-entrepreneurs ou OPCO). Ce serait très utile.

Traduction : une **vue ressources** (une ligne par formateur, une colonne par jour), pas un
calendrier d'événements. Ce que Laurent cherche en un coup d'œil : les trous (dispo), les barres
(pris), la couleur (régime), et les chevauchements suspects.

---

## 1. Ce qui existe déjà — vérifié sur `main` le 18/09

| Brique | État | Où |
|---|---|---|
| Formateur ↔ session (principal / co-formateur, taux journalier) | ✅ en prod | `SessionTrainer` |
| Jours et demi-journées d'une session | ✅ en prod | `SessionSlot` (date, startTime, endTime, halfDay) — créés par le wizard (`persistSessionSlotsAction`) |
| Indisponibilités déclarées | ⚠ modèle présent, **aucune écriture dans l'app** (données importées d'Airtable uniquement) | `TrainerAvailability` (status `available` / `busy` / `tentative`) |
| Détection de conflit formateur | ✅ en prod, affichée dans le wizard étape 2 comme avertissement (PR #85) | `lib/schedule/trainer-availability.ts` → `checkTrainerAvailability` |
| Régime de la session | ✅ en prod depuis PR #96, `null` sur l'historique (pas de rétro-remplissage, voulu) | `TrainingSession.regime` : `ENTREPRISE` \| `INDIVIDUEL` |
| Liste des formateurs | ✅ mais **inline dans la page** | `app/app/formateurs/page.tsx` : Person avec un `LegalLink role=FORMATEUR` OU une `ExternalIdentity entityType=Person.Trainer` |
| Promesse non tenue | « Bientôt disponible : calendrier de disponibilités cliquable (palier 3) » | `app/app/formateurs/[id]/page.tsx` |

Conclusion : **pas de migration**. Tout le chantier est de la lecture + un premier chemin d'écriture
sur `TrainerAvailability`.

---

## 2. Décisions

- **D-1 — Régime = `session.regime`, et rien d'autre.** `INDIVIDUEL` → « Agents co / AGEFICE »,
  `ENTREPRISE` → « Entreprise / OPCO », `null` → « Régime non déclaré » (gris). On ne déduit
  jamais le régime des inscrits dans cette vue (la règle vit dans `payer-rule.ts` et n'est
  recalculée nulle part ailleurs — PR #92).
- **D-2 — Deux sessions de régimes différents, même formateur, mêmes dates = normal.** C'est
  la conséquence de la décision du 16/09 (une session mixte devient deux sessions) et de PR #85.
  Elles s'affichent **empilées** dans la même case, sans alerte.
- **D-3 — Un conflit, c'est :** (a) deux sessions de **même régime** sur le même formateur le
  même jour ; (b) une session posée sur une indisponibilité `busy`. Affiché en rouge, jamais
  bloquant (on est en lecture).
- **D-4 — Les jours d'une session viennent des `SessionSlot`.** Une session sans créneau (cas
  historique) est étalée sur ses jours ouvrés `startDate → endDate` et marquée « dates estimées »
  (bordure pointillée). Aucune génération de slots à la volée dans cette vue.
- **D-5 — Statuts affichés par défaut** : Planifiée, Ouverte, Validée, En cours. Brouillons et
  Terminées masqués mais activables par filtre. Annulées jamais.
- **D-6 — L'indisponibilité se déclare depuis le planning** (lot 2) : une plage `startsAt →
  endsAt`, statut `busy` ou `tentative`, note libre. Elle est visible aussitôt dans le wizard
  (même table, même fonction `checkTrainerAvailability`) — zéro logique dupliquée.
- **D-7 — Un formateur (rôle `FORMATEUR`) voit tout le planning mais ne déclare que ses propres
  indisponibilités.** ADMIN / MANAGER déclarent pour tous. LECTEUR : lecture.
- **D-8 — Pas de bibliothèque de calendrier.** Grille CSS (`grid-template-columns`), en-tête
  de colonnes et première colonne collants (sticky) — attention au chantier `fix/260917-matrice-
  sticky-zindex` en cours sur un problème de z-index sticky ailleurs : réutiliser sa solution
  si elle est mergée avant.

---

## 3. L'écran — `/app/planning`

Entrée dans la nav sous **Formateurs** (icône `CalendarRange`), `allowedRoles` identiques à
Formateurs : ADMIN, MANAGER, FORMATEUR, LECTEUR. Un lien « Voir le planning » aussi depuis
`/app/formateurs` (en-tête) et depuis chaque fiche formateur (remplace le bloc « Bientôt
disponible »).

**Barre du haut** : ‹ mois › (défaut : mois courant), bouton « Aujourd'hui », bascule
**Mois / Semaine**, filtres en chips : formateur (multi), régime (Agents co / Entreprise / Non
déclaré), statut (cf. D-5), case « Afficher les brouillons ».

**Grille** :
- Première colonne : nom du formateur + pastille « principal sur N sessions ce mois ».
- Une colonne par jour ; week-ends grisés ; jour courant surligné.
- Une session = une barre continue sur ses jours, libellée `CODE · nom court`, couleur du régime
  (voir palette), bordure pleine si formateur principal, fine si co-formateur. Clic → fiche
  session (`/app/sessions/[id]`). Survol → tooltip : produit, dates, lieu, effectif / capacité,
  statut.
- Indisponibilité `busy` = hachures grises sur la plage ; `tentative` = hachures claires.
  Clic → édition / suppression (lot 2).
- Case vide = disponible. Clic → « Déclarer une indisponibilité » (lot 2), pré-rempli sur ce jour.
- Conflit (D-3) = liseré rouge sur les barres concernées + compteur « N conflits ce mois » dans
  la barre du haut (clic → liste).

**Vue Semaine** : mêmes lignes, 7 colonnes, chaque jour scindé matin / après-midi d'après
`SessionSlot.halfDay` (`morning` / `afternoon` / `full`).

**Palette** (tokens du thème, pas de couleurs en dur) : `INDIVIDUEL` → teinte primaire,
`ENTREPRISE` → teinte info (bleu), `null` → muted. Les libellés participant / admin ne sont
pas concernés (écran interne uniquement) — la règle « jamais h conventionnées côté participant »
n'entre pas en jeu ici.

**Vide** : aucun formateur → « Aucun formateur. Un formateur est une personne rattachée à une
organisation avec le rôle Formateur. » ; aucune session sur le mois → grille vide, pas de
message bloquant.

---

## 4. Architecture

```
apps/web/src/
  app/app/planning/page.tsx                 # server : charge la plage, rend <PlanningGrid>
  lib/planning/build-planning-grid.ts       # FONCTION PURE : (formateurs, sessions+slots+trainers,
                                            #   availabilities, plage) → lignes / cellules / conflits
  lib/planning/list-trainers.ts             # extraction du critère « qui est formateur » de
                                            #   app/app/formateurs/page.tsx (réutilisé par la page)
  server/actions/trainer-availability.ts    # lot 2 : create / update / delete (RBAC D-7)
  components/planning/planning-grid.tsx     # client : grille, sticky, tooltips
  components/planning/planning-toolbar.tsx  # mois/semaine, filtres (état dans l'URL : ?m=2026-10&view=month)
  components/planning/availability-dialog.tsx  # lot 2
```

**Requête serveur** (une seule, sur la plage affichée ± 7 jours pour les barres qui débordent) :
`trainingSession.findMany` avec `where: { tenantId, status in <filtre>, startDate <= fin,
endDate >= début }`, `include: { trainers: { include: { person } }, slots, product: { select:
{ name, code } }, location: { select: { name } }, _count: { participants } }` ;
`trainerAvailability.findMany` sur la même plage. L'état des filtres vit dans l'URL (partageable,
retour arrière naturel), comme `/app/sessions`.

**`buildPlanningGrid` est le cœur testable** : entrée sérialisée (dates ISO), sortie
déterministe, aucune dépendance Prisma. C'est elle qui applique D-2, D-3, D-4 et D-5.

---

## 5. Lots

**Lot 1 — Planning en lecture** (l'essentiel du besoin)
- `list-trainers.ts` + refacto de `/app/formateurs` pour l'utiliser (zéro changement visible).
- `build-planning-grid.ts` + tests.
- Page, grille, toolbar, vue mois et semaine, conflits, entrée de nav, liens depuis Formateurs.
- Test E2E smoke : route `/app/planning` répond, une session de seed apparaît sur la ligne de
  son formateur avec la classe du bon régime.

**Lot 2 — Déclarer une indisponibilité**
- Action serveur `trainer-availability.ts` (create / update / delete), garde RBAC D-7, validation
  `startsAt < endsAt`, tenant.
- Dialog depuis une case vide ou depuis la fiche formateur (le bloc « Bientôt disponible »
  disparaît, la liste « Prochaines disponibilités » de la fiche devient éditable).
- Vérification manuelle : une indisponibilité posée ici fait apparaître le badge « conflit »
  dans le wizard étape 2 sans autre modification.

**Deferred (à consigner, pas à faire)**
- Export ICS / synchro Google Calendar des indisponibilités (la synchro Phase 14 ne couvre que
  les sessions).
- Vue par formateur restreinte à « mes sessions » pour le rôle FORMATEUR.
- Glisser-déposer pour réaffecter un formateur d'une session à l'autre.
- Édition des `SessionSlot` depuis le planning (l'onglet Agenda de la session reste en lecture,
  décision Phase 15).

---

## 6. Tests exigés

`lib/planning/__tests__/build-planning-grid.test.ts` (vitest, pur) :
1. Une session avec slots sur 3 jours → 3 cellules sur la ligne du formateur principal, régime
   `INDIVIDUEL`.
2. Session sans slot, `startDate` vendredi → `endDate` mardi → lundi et mardi + vendredi
   seulement (pas le week-end), marquées `estimated: true` (D-4).
3. Deux sessions `INDIVIDUEL` + `ENTREPRISE`, même formateur, même jour → deux barres, **aucun
   conflit** (D-2).
4. Deux sessions `INDIVIDUEL`, même formateur, même jour → conflit `same_regime` sur les deux
   (D-3a).
5. Session sur une plage `busy` → conflit `unavailable` ; sur une plage `tentative` → pas de
   conflit, plage affichée (D-3b).
6. Session `CANCELLED` jamais rendue ; `DRAFT` rendue seulement si `includeDrafts` (D-5).
7. Co-formateur → la session apparaît sur sa ligne aussi, `isPrimary: false`.
8. Session `regime: null` → régime `undeclared`, pas d'erreur.

Lot 2 : test de l'action (PostgreSQL jetable comme dans PR #96) : FORMATEUR ne peut écrire que
sur son `personId` ; `startsAt >= endsAt` refusé ; suppression scoped tenant.

---

## 7. Hors périmètre / garde-fous

- Aucune modification de `SessionTrainer`, du wizard, ni de `checkTrainerAvailability`.
- Aucune migration Prisma. Si le chantier en réclame une, c'est que la spec a dérivé — s'arrêter.
- Pas de rétro-remplissage de `regime` sur l'historique (règle PR #96) : le gris est normal.
- Pas de couleur codée en dur, pas de bibliothèque de calendrier (D-8).
