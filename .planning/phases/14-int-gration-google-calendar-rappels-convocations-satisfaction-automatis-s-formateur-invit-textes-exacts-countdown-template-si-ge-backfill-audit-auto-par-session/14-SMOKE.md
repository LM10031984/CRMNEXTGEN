# Phase 14 — Smoke / Vérification idempotence E2E (Task 3, gaté Laurent)

> NON EXÉCUTÉ par l'exécuteur 14-06 (HARD_SCOPE_LIMIT : aucune synchro réelle contre
> l'agenda live « Rappel Formations »). À dérouler manuellement par Laurent depuis l'UI.

## Pré-requis
- App lancée (`pnpm dev:full`, port 3010), connecté en ADMIN ou MANAGER.
- Une session À VENIR avec formateur (e-mail) + apprenants (idéalement pilote SES-0097).
- Accès Google Calendar OK (refresh token `files/secrets/google-token.json`).

## Procédure
1. Ouvrir la fiche session → section « Agenda / Rappels » (visible ADMIN/MANAGER).
2. Toggle OFF (pas de notif apprenants) → cliquer « Synchroniser l'agenda Google ».
   - Toast attendu : ~19 créés (1 formation + 15 rappels + 3 froid), 0 mis à jour.
3. Ouvrir l'agenda « Rappel Formations » :
   - 1 event formation (colorId 7), 15 rappels quotidiens (colorId 6) countdown « dans X jours » décroissant J-15→« demain » (J-1), 3 relances froid (colorId 3).
   - Formateur réel invité ; apprenants en invités (pas de notif si toggle OFF).
4. Re-cliquer « Synchroniser l'agenda Google » :
   - Toast attendu : 0 créés, ~19 mis à jour — PREUVE idempotence.
   - Agenda : AUCUN doublon.
5. Si lieu = siège Vence (618 Bd Jean Maurel inférieur, 06140 Vence) : la description
   contient le bloc étendu accès/transports/restauration/hébergement.

## Critères d'acceptation
- [ ] 1er run : ~19 créés, couleurs 7/6/3 correctes, formateur invité, apprenants en invités
- [ ] Countdown « dans X jours » exact J-15 → « demain »
- [ ] 2e run : 0 créés, ~19 mis à jour, 0 doublon (idempotence prouvée)
- [ ] Siège Vence : bloc étendu présent quand applicable
- [ ] Table SessionCalendarSync tracée pour la session
- [ ] AuditLog `sessions.calendarSynced` créé à chaque clic (page Historique)

## Résultats du run
- 1er run : _(à remplir)_
- 2e run : _(à remplir)_
- Couleurs / invités / countdown : _(à remplir)_
- Siège : _(à remplir)_
- Verdict : _(approved / écarts)_
