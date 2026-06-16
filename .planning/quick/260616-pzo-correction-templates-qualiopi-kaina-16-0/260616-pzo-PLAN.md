# Quick Task 260616-pzo : Correction templates Qualiopi (Kaïna 16/06)

**Date:** 2026-06-16
**Source:** Réunion Kaïna 16/06 — process Start Academy officiel (matérialisation Word, rien d'inventé)
**Mode:** interactif diff-par-diff (Laurent valide chaque diff avant application)
**Ordre:** P1/P4 → P5 → P2 → P3

## Tasks (commits atomiques)

### T1 — P1+P4 : Rapport du formateur (déroulé)
- Fichier: apps/web/src/lib/closure/deroule-template.ts:89
- Action: titre « Bilan du formateur » → « Rapport du formateur »
- Verify: tsc OK, grep titre

### T2 — P5 : Méthode pédagogique ind. 12 (programme)
- Fichier: apps/web/src/lib/programme-template.ts (DEFAULT_PEDAGOGICAL_METHODS + garantie l.344-350)
- Action: garantir 2 phrases (alternance théorie/pratique + tours de table) même si méthodes custom
- Verify: tsc OK

### T3 — P2 : Situation de handicap (analyse besoin, ind. 26)
- Fichier: apps/web/src/lib/closure/analyse-besoin-template.ts (avant bloc « Réalisé par »)
- Action: section STATIQUE, formulation exacte process + référent Jean-Guy Ourmières
- Verify: tsc OK ; coordonnées référent à confirmer

### T4 — P3 : Réclamations ind. 31 (2 mécanismes)
- (A) zone texte libre satisfaction chaud + froid (ind. 30)
- (B) procédure réclamation formelle tenant (legal-docs + tenant-settings + Paramètres OF) : AR 15j, réponse 30j
- (C) renvoi questionnaires → procédure
- Verify: tsc OK, build

## Garde-fous
- Pas de push, pas de prisma migrate contre Docker local, commits atomiques.
