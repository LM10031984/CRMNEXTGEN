---
phase: 15-refonte-fiche-session-onglets
plan: 03
subsystem: ui
tags: [next-app-router, session-detail, agenda, google-calendar, phase14-reuse, dedup, rsc-frontier, tdd]

# Dependency graph
requires:
  - phase: 15-refonte-fiche-session-onglets (15-01)
    provides: "<SessionTabs> coquille à 5 onglets (slot agenda placeholder)"
  - phase: 15-refonte-fiche-session-onglets (15-02)
    provides: "Onglets Avant/Après/Tous-documents remplis, drawer/cartes supprimés"
  - phase: 14-integration-google-calendar
    provides: "SessionCalendarSyncToggle + syncSessionCalendarAction + lib/calendar/* (moteur idempotent, 67 tests)"
provides:
  - "Onglet « Agenda » (<TabAgenda>) : réembarque <SessionCalendarSyncToggle> (moteur Phase 14 NON retouché) + affichage des créneaux SessionSlot jour par jour en LECTURE (date + horaires figés)"
  - "Doublon du toggle de synchro RETIRÉ de page.tsx (variante en-tête + section Paramètres « Agenda / Rappels ») — maison unique = l'onglet Agenda (« 1 surface = 1 endroit »)"
affects: [15-04-programme-produit-zombies]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Réutilisation d'un composant client Phase 14 (<SessionCalendarSyncToggle>) dans un nouvel onglet client (<TabAgenda>) — aucune re-implémentation de la synchro, grep syncSessionCalendar/events.insert = 0"
    - "Garde canEdit AU NIVEAU du conteneur (TabAgenda ne rend le toggle que pour ADMIN/MANAGER), miroir du {canEdit && ...} qui gardait le toggle dans page.tsx"
    - "Créneaux SessionSlot sérialisés (Date→ISO string) côté serveur avant passage au composant client — pas de Date brute à travers la frontière RSC"

key-files:
  created:
    - apps/web/src/components/sessions/tabs/tab-agenda.tsx
    - apps/web/src/components/sessions/tabs/__tests__/tab-agenda.test.tsx
  modified:
    - apps/web/src/app/app/sessions/[id]/page.tsx
  deleted: []

key-decisions:
  - "Le toggle Phase 14 est réutilisé en variante « drawer » (défaut) — celle qui expose le checkbox « Envoyer réellement les invitations » (session à venir) requis par le test notifyLearners. La variante « header » (compacte, sans checkbox) n'est plus rendue nulle part (elle servait le doublon en-tête supprimé)."
  - "Garde canEdit gérée dans TabAgenda (le composant SessionCalendarSyncToggle n'a pas de prop canEdit) : sans droit d'écriture, un message remplace le toggle. Reproduit fidèlement le {canEdit && <toggle/>} de page.tsx."
  - "Créneaux affichés en LECTURE seule (une ligne par SessionSlot : jour + demi-journée + horaires figés). Les créneaux éditables interactifs (SessionSlot édition) restent HORS phase (CONTEXT §deferred)."
  - "sessionSlotsAgg (déjà fetché pour le compteur d'émargement de la timeline) étendu de date/startTime/endTime/halfDay → dérive agendaSlots, PAS de requête Prisma supplémentaire."

patterns-established:
  - "Test « réembarquement sans régression » : mock de syncSessionCalendarAction (moteur Phase 14) + assertion sur { sessionId, notifyLearners } → cassable au gate (sessionId muté = rouge)."

requirements-completed: [FS-ONGLETS-AGENDA]

# Metrics
duration: 12min
completed: 2026-07-01
---

# Phase 15 Plan 03 : Onglet Agenda (synchro Google Calendar Phase 14 + créneaux lecture) Summary

**Réembarquement de la synchro Google Calendar Phase 14 (`SessionCalendarSyncToggle` → `syncSessionCalendarAction`, moteur idempotent NON retouché) dans un nouvel onglet `<TabAgenda>` qui affiche aussi les créneaux `SessionSlot` jour par jour en lecture, ET retrait du doublon du toggle de l'en-tête + des Paramètres — maison unique désormais l'onglet Agenda (« 1 surface = 1 endroit »).**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-01T15:47:12Z
- **Completed:** 2026-07-01T15:59:36Z
- **Tasks:** 3
- **Files:** 2 créés, 1 modifié, 0 supprimé

## Accomplishments

- **Onglet « Agenda »** (`<TabAgenda>`, client, `tabs/tab-agenda.tsx`) : réutilise `<SessionCalendarSyncToggle>` (Phase 14, variante drawer avec checkbox « Envoyer réellement les invitations ») + affiche les créneaux de la session jour par jour en LECTURE (une ligne par `SessionSlot` : jour formaté `fr-FR` + demi-journée + horaires figés `09:00 – 18:00`). Garde `canEdit` au niveau du conteneur (toggle rendu seulement pour ADMIN/MANAGER).
- **Aucune nouvelle logique de synchro** : le toggle, `syncSessionCalendarAction` et `lib/calendar/*` (moteur idempotent Phase 14, re-sync = 0 doublon prouvé) sont réutilisés tels quels. Grep `syncSessionCalendar\b|new google\.|events.insert` dans `tab-agenda.tsx` = **0**.
- **Doublon RETIRÉ** de `page.tsx` : la variante en-tête (`variant="header"`) ET la section Paramètres « Agenda / Rappels » du `SettingsDrawer` — les deux rendaient le toggle en double. `grep -c SessionCalendarSyncToggle page.tsx = 0`. Unique consommateur du composant dans tout le repo (hors sa propre définition/tests) = `tab-agenda.tsx` (import + 1 usage JSX).
- **Câblage** : placeholder Lot 1 (`<div>Agenda — synchro Google Calendar (Lot 3)</div>`) remplacé par `<TabAgenda sessionId isPastSession slots canEdit />`. `sessionSlotsAgg` (déjà fetché) étendu de `date/startTime/endTime/halfDay` → `agendaSlots` sérialisés (ISO), **aucune requête Prisma additionnelle**. Imports orphelins retirés (`SessionCalendarSyncToggle`, icône `Calendar`).
- **TDD strict** : test RED (Wave 0) écrit et rouge AVANT le composant, puis GREEN. Test de puissance prouvé au gate.

## Task Commits

1. **Task 1 (Wave 0) : test RED** — `fd0769d` (test) — `tab-agenda.test.tsx` : appel `syncSessionCalendarAction { sessionId, notifyLearners }` (false défaut / true si coché) + créneaux lecture + garde `canEdit`. Rouge (composant absent).
2. **Task 2 : implémentation tab-agenda (GREEN)** — `306585a` (feat) — `<TabAgenda>` réutilise le toggle Phase 14 + créneaux lecture. 4/4 GREEN, suite calendar 67/67 non régressée. Mutation `sessionId` prouvée rouge → restaurée.
3. **Task 3 : câblage page.tsx + retrait doublon** — `cdf2f7f` (feat) — `TabAgenda` câblé, `agendaSlots` dérivés, doublon en-tête + Paramètres retiré, imports orphelins nettoyés. tsc clean, suite 1105/1106.

## Files Created/Modified

**Créés :**
- `tabs/tab-agenda.tsx` — onglet Agenda (toggle Phase 14 réutilisé + créneaux lecture, garde canEdit).
- `tabs/__tests__/tab-agenda.test.tsx` — 4 tests (2 appel action + notifyLearners, 1 créneaux lecture, 1 garde canEdit).

**Modifiés :**
- `app/sessions/[id]/page.tsx` — import `TabAgenda`, `sessionSlotsAgg` étendu (4 champs) → `agendaSlots` + `isPastSession`, slot `agenda={<TabAgenda .../>}`, retrait des 2 rendus doublon du toggle + imports orphelins (`SessionCalendarSyncToggle`, `Calendar`).

## Decisions Made

- **Variante drawer réutilisée** (pas header) : c'est celle qui expose le checkbox `notifyLearners` (session à venir), requis par le comportement métier et le test. La variante header (compacte) servait le doublon en-tête, désormais supprimé.
- **Garde canEdit au niveau TabAgenda** : le composant Phase 14 n'a pas de prop `canEdit` ; le conteneur ne rend le toggle que pour ADMIN/MANAGER (message sinon), reproduisant le `{canEdit && ...}` de page.tsx.
- **Créneaux en lecture seule** : une ligne par `SessionSlot` (jour + demi-journée + horaires figés). Créneaux éditables = hors phase (CONTEXT §deferred).
- **Pas de requête Prisma supplémentaire** : `sessionSlotsAgg` (déjà utilisé pour le compteur d'émargement) étendu de 4 champs → dérive `agendaSlots`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reformulation des commentaires citant littéralement le nom du composant retiré**
- **Found during:** Task 3 (gate acceptance)
- **Issue:** L'acceptance du plan exige `grep -c "SessionCalendarSyncToggle" page.tsx = 0`. Après retrait des 2 rendus, il restait 2 occurrences dans des commentaires de traçabilité (« &lt;SessionCalendarSyncToggle&gt; RETIRÉ… »), faisant échouer le grep littéral.
- **Fix:** Commentaires reformulés (« le toggle de synchro agenda… ») sans citer le token — même discipline anti-grep que Phase 14 (14-01/14-02). Aucune perte d'information de traçabilité.
- **Files modified:** `app/sessions/[id]/page.tsx`
- **Verification:** `grep -c SessionCalendarSyncToggle page.tsx = 0`.
- **Committed in:** `cdf2f7f`

**2. [Rule 3 - Blocking] Retrait de l'import orphelin de l'icône `Calendar`**
- **Found during:** Task 3
- **Issue:** L'unique usage JSX de l'icône `lucide-react` `Calendar` était dans la section Paramètres « Agenda / Rappels » supprimée → import orphelin (tsc `noUnusedLocals` / lint).
- **Fix:** `Calendar` retiré de l'import `lucide-react` de page.tsx.
- **Files modified:** `app/sessions/[id]/page.tsx`
- **Verification:** `tsc --noEmit` clean.
- **Committed in:** `cdf2f7f`

---

**Total deviations:** 2 auto-fixed (Rule 3, non-bloquantes pour le périmètre). Aucune dérive : réembarquement + retrait du doublon conformes au plan. Moteur Phase 14 intact.

## Issues Encountered

- **Échec de test pré-existant HORS scope (inchangé)** : `src/lib/closure/__tests__/shared-template.test.ts:175` (MIME `image/jpeg` reçu vs `image/jpg` attendu). Présent sur la baseline AVANT ce plan (constraint #7 + `deferred-items.md`), NON causé par l'onglet Agenda, non corrigé. Suite : **1105/1106 verts** (4 nouveaux tests tab-agenda inclus, tous verts ; baseline 1101/1102 → +4).
- Filtre vitest `-- <pattern>` toujours inopérant via `pnpm test` → exécution via `pnpm --filter @qualiof/web exec vitest run <pattern>` (note Lot 1/2).

## Known Stubs

- Aucun. L'onglet Agenda est désormais rempli (toggle réel Phase 14 + créneaux lecture). Les créneaux éditables interactifs (`SessionSlot` édition) sont un chantier ultérieur explicitement HORS phase (CONTEXT §deferred), pas un stub bloquant.

## Test de puissance (mutation) — prouvé au gate

- `tab-agenda.tsx` : forcer `sessionId={'MUTANT'}` sur `<SessionCalendarSyncToggle>` → `tab-agenda` vire **ROUGE** (1 fail sur l'assertion `arg.sessionId === SESSION_ID`) → restauré → 4/4.

## Acceptance grep (0 doublon résiduel)

- `grep -c "SessionCalendarSyncToggle" page.tsx` = **0** (doublon en-tête + Paramètres retirés).
- Consommateur unique du toggle dans tout `apps/web/src` (hors sa def + tests) : `tab-agenda.tsx` (import + 1 usage JSX).
- `grep -E "syncSessionCalendar\b|new google\.|events.insert" tab-agenda.tsx` = **0** (aucune re-implémentation — moteur Phase 14 réutilisé).
- Suite calendar Phase 14 : **67/67** verts (idempotence non régressée).

## Checkpoint visuel (manuel, hors automatisé) — pour Laurent

Sur l'instance dev déjà en cours sur `:3010` (NE PAS relancer de serveur) :
1. Ouvrir `/app/sessions/<id>?tab=agenda` → bloc « Synchronisation Google Calendar » (toggle + bouton « Synchroniser l'agenda Google ») + liste des créneaux jour par jour en lecture.
2. Vérifier que le bouton/section de synchro a DISPARU de l'en-tête ET du tiroir Paramètres (plus de doublon).
3. **Idempotence (procédure 14-SMOKE.md)** : sur une session à venir, cliquer « Synchroniser l'agenda » → 1er run crée les événements ; double-clic → 2e run = **0 doublon** (toast « 0 créés, N mis à jour »).

## Next Phase Readiness

- Lot 3 livré : onglet Agenda rempli (toggle Phase 14 réutilisé + créneaux lecture), doublon retiré, moteur idempotent intact, tsc + suite (hors baseline pré-existante) verts.
- Lot 4 (15-04) : déplacer la validation IA au produit + nettoyer les batches zombies + correctifs visuels résiduels.
- Checkpoint visuel Laurent sur `:3010` à valider avant `/gsd:verify-work`.

## Self-Check: PASSED

- Fichiers créés vérifiés présents : `tab-agenda.tsx`, `tab-agenda.test.tsx`, `15-03-SUMMARY.md`.
- Commits vérifiés présents : `fd0769d` (test), `306585a` (feat), `cdf2f7f` (feat).

---
*Phase: 15-refonte-fiche-session-onglets*
*Completed: 2026-07-01*
