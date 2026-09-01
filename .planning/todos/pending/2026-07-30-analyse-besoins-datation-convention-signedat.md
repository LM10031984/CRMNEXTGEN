---
created: 2026-07-30T18:19:23.296Z
title: Analyse des besoins — champ conventionSignedAt + règle de datation crédible audit
area: general
files:
  - apps/web/src/lib/jours-feries-fr.ts:74 (computeAnalyseDate, minDaysBefore=15 actuel)
  - apps/web/src/lib/closure/analyse-besoin-template.ts:101 (appel computeAnalyseDate(sessionStartDate, 15, seed))
  - packages/db/prisma/schema.prisma (SessionParticipant — conventionSigned boolean existe, PAS de date)
---

## Problem

Demande Laurent 2026-07-30 (pendant la bascule prod Phase 22). Deux problèmes sur l'analyse des besoins :

1. **Datation trop tardive** : l'analyse des besoins est datée automatiquement à J-15 jours ouvrés
   minimum (+0-7 j de variation par seed) avant le début de session. Trop court pour être crédible
   en audit Qualiopi (ind. 4/5) : l'ordre métier réel est analyse des besoins → signature de la
   convention → formation, avec du recul. Laurent veut minimum ~3 semaines/1 mois avant, ou mieux :
   un ancrage sur la date réelle de signature de la convention.
2. **Analyse absente d'un pack témoin** : Laurent a constaté qu'un pack témoin ne contenait pas
   l'analyse des besoins. Un contrôle de présence a été ajouté au go/no-go SES-0094 de la bascule
   22-06 — si elle manque là aussi, la cause sera dans le rapport go/no-go ; sinon, identifier
   quel pack était concerné et pourquoi (kind non généré ? exclusion ? pipeline _gen-session-pack ?).

## Solution

- Migration Prisma : ajouter `conventionSignedAt DateTime?` sur SessionParticipant (la case
  conventionSigned boolean existe déjà) + saisie dans la fiche participant + reprise à l'import.
- Règle de datation (convention figée → constantes, pas de calcul « élégant ») :
  - si conventionSignedAt renseignée → analyse datée quelques jours OUVRÉS avant cette date ;
  - repli sinon → minimum 21 jours ouvrés avant le début de session (au lieu de 15 dans
    computeAnalyseDate).
- Garder la variation par seed (dates distinctes entre stagiaires, anti-uniformité audit).
- Produits déjà générés = re-run si besoin (les analyses existantes gardent leur date).
