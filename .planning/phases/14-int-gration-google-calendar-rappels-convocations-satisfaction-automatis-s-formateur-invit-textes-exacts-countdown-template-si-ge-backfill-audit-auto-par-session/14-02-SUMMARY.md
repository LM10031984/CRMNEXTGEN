---
phase: 14-google-calendar
plan: 02
subsystem: calendar
tags: [google-calendar, qualiopi, textes, worker-safe, countdown, siege-vence]
requires:
  - "apps/web/src/lib/calendar/colors.ts (Plan 14-01, style module)"
provides:
  - "renderRappelText(ctx) — corps rappel/formation exact + ligne countdown conditionnelle + bloc siège conditionnel"
  - "renderFroidText(ctx, relance) — 3 relances satisfaction froid (1m / 1m15j / 2m) + lien questionnaire C7.i30"
  - "isSiegeVence(addressText) — détection siège Vence par adresse (robuste Bd/Boulevard/casse/espaces)"
  - "HORAIRES const figées (9h-13h / 14h-18h)"
  - "DRIVE_DOCS const (cgv / ri / chartePsh / questionnaireFroid)"
  - "SIEGE_BLOCK / SIEGE_ADDRESS const"
  - "driveViewUrl(fileId) helper"
  - "countdownLabel(daysUntil) — aujourd'hui / demain / dans N jours"
  - "daysBetween(from, to) — jours calendaires entiers UTC"
affects:
  - "Plan 14-04 (orchestrateur builders d'événements) consommera ces modules"
tech-stack:
  added: []
  patterns:
    - "Module pur worker-safe lib/calendar/* (0 import auth/react/server)"
    - "Convention métier figée en const (pas de smart-calc sur horaires)"
    - "Textes Qualiopi figés mot pour mot (source de vérité = pilote SES-0097)"
    - "Grep-clean : ne pas citer littéralement les tokens interdits dans les commentaires"
key-files:
  created:
    - "apps/web/src/lib/calendar/countdown.ts"
    - "apps/web/src/lib/calendar/texts.ts"
    - "apps/web/src/lib/calendar/__tests__/countdown.test.ts"
    - "apps/web/src/lib/calendar/__tests__/texts.test.ts"
  modified: []
decisions:
  - "Countdown injecté conditionnellement : événement formation all-day = countdown vide (pas de ligne), rappels quotidiens = countdown calculé. Une seule fonction renderRappelText sert les deux cas (ctx.countdown vide ou non)."
  - "Bloc siège Vence AJOUTÉ au corps standard (concat) quand isSiege=true, conformément au pilote (le bloc accès/logistique complète le corps, il ne le remplace pas)."
  - "renderFroidText(ctx, relance) avec param relance 1|2|3 plutôt que 3 fonctions distinctes — factorise l'intro/CTA communs, garde les préfixes RELANCE 2/3 exacts."
metrics:
  duration: "~6 min"
  completed: "2026-06-25"
  tasks: 3
  commits: 3
  files: 4
  tests-added: 24
---

# Phase 14 Plan 02 : Textes EXACTS Start Academy + countdown Summary

Modules `texts.ts` (textes rappel/froid figés mot pour mot + bloc siège Vence conditionnel + ids Drive + horaires const) et `countdown.ts` (formule « dans X jours » pure) verrouillés et testés, worker-safe, prêts pour les builders d'événements du Plan 14-04.

## What Was Built

- **`countdown.ts`** (TDD) : `countdownLabel(daysUntil)` (0 → « aujourd'hui », 1 → « demain », n>1 → « dans N jours », clamp des négatifs) + `daysBetween(from, to)` (jours calendaires entiers UTC, tronqué à minuit, floor). Aucune librairie de dates (calcul natif `Date` UTC).
- **`texts.ts`** : textes EXACTS du pilote SES-0097 figés en const/fonctions.
  - `renderRappelText(ctx)` : corps standard mot pour mot (titre d'accroche, lieu 📍, durée ⏳, formateur 👨‍🏫, check-list ✔️, docs à lire, contact, signature « Emma de Start Academy »). Ligne countdown `📅 Votre formation commence {countdown} !` injectée seulement si `ctx.countdown` non vide. Bloc siège Vence concaténé si `ctx.isSiege`.
  - `renderFroidText(ctx, relance)` : 3 relances (RELANCE 1 avec blague PS, RELANCE 2 préfixe « 1 mois et 15 jours », RELANCE 3 préfixe « 2 mois »), salutation `Bonjour {prénoms}`, lien questionnaire C7.i30 inclus en clair.
  - `isSiegeVence(addressText)` : détecte le siège (618 + Jean Maurel + 06140/Vence), robuste aux variantes Bd/Boulevard, casse, espaces multiples.
  - Constantes : `HORAIRES` (9h-13h / 14h-18h, figées), `DRIVE_DOCS` (4 ids), `SIEGE_BLOCK`, `SIEGE_ADDRESS`, helper `driveViewUrl`.

## Tasks

| Task | Name | Type | Commit | Files |
| ---- | ---- | ---- | ------ | ----- |
| 0 | Verrouiller le wording EXACT | checkpoint:decision | (résolu hors-bande) | 14-PILOTE-TEXTS.md (source de vérité fournie) |
| 1 | countdown.ts (formule + daysBetween) | auto / tdd | f481ce2 (RED), c6553c2 (GREEN) | countdown.ts + countdown.test.ts |
| 2 | texts.ts (textes + siège + Drive + horaires) | auto | ad10cc7 | texts.ts + texts.test.ts |

Task 0 (checkpoint:decision) traité comme APPROUVÉ : les textes validés étaient fournis dans `14-PILOTE-TEXTS.md` (extraits du pilote SES-0097 créé manuellement par Laurent). Copiés mot pour mot, sans paraphrase (emojis 👨‍🏫 conservés, guillemets « », blague PS de RELANCE 1, préfixes RELANCE 2/3).

## Verification

- `pnpm vitest run src/lib/calendar/__tests__/texts.test.ts src/lib/calendar/__tests__/countdown.test.ts` → 24 passed (8 countdown + 16 texts).
- Suite calendar complète : 30 passed (idempotency 6 + countdown 8 + texts 16).
- Worker-safe : `grep -E "(server/actions|/rbac|validateRequest|requireRole|from 'react')"` sur texts.ts + countdown.ts → 0 ligne.
- Pas de smart-calc horaires : `grep -E "Math\.|durationHours"` sur texts.ts → 0 ligne.
- Pas de lib de dates : `grep -E "dayjs|date-fns"` sur countdown.ts → 0 ligne.
- `tsc --noEmit` propre sur le module calendar.
- Acceptance greps : id froid `1uNEa7…` présent, `618` présent, `9h-13h`/`14h-18h` présents.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reformulation de commentaires pour préserver le grep-clean**
- **Found during:** Tasks 1 et 2 (mêmes symptômes que Plan 14-01)
- **Issue:** Les commentaires citant littéralement « dayjs / date-fns » (countdown.ts) et « durationHours » (texts.ts) déclenchaient les greps d'acceptance qui exigent 0 ligne.
- **Fix:** Commentaires reformulés en langage naturel (« aucune librairie de manipulation de dates » / « jamais recalculés depuis la durée de la session ») — la règle reste documentée, le grep reste propre.
- **Files modified:** countdown.ts, texts.ts
- **Commits:** c6553c2, ad10cc7

## Known Stubs

Aucun. Les textes sont complets et figés ; le programme de session (PDF Drive propre à chaque session) n'est volontairement PAS dans `DRIVE_DOCS` (fourni par l'orchestrateur Plan 14-04, documenté en commentaire).

## Notes for Next Plan (14-04)

- `renderRappelText` attend `ctx.countdown` déjà calculé : l'orchestrateur appelle `countdownLabel(daysBetween(dateDuRappel, dateDebut))` puis passe le résultat.
- Pour l'événement formation all-day : passer `countdown: ''` (pas de ligne countdown).
- Détection siège : appeler `isSiegeVence(session.location.address)` pour alimenter `ctx.isSiege`.
- Froid en popup : pas d'attachment, le lien est déjà inclus dans le texte via `renderFroidText`.

## Self-Check: PASSED

- 4 fichiers créés présents sur disque (countdown.ts, texts.ts + 2 tests).
- 3 commits présents (f481ce2 RED, c6553c2 GREEN countdown, ad10cc7 texts).
- 24 tests verts, worker-safe, grep-clean.
