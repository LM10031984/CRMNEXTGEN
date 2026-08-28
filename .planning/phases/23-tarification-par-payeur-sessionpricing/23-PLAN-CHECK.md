# Phase 23 — Vérification des plans

**Date :** 2026-08-28
**Méthode :** vérification menée à la main. L'agent vérificateur a été interrompu
(mise en veille de la machine) avant d'avoir écrit son rapport ; les plans n'ont donc
**pas** eu de relecture indépendante. Ce document dit ce qui a été vérifié et ce qui
ne l'a pas été.

## Verdict

| Plan | Verdict | Motif |
|---|---|---|
| 23-01 — Modèle et cascade | **PASS** | Symboles vérifiés, SQL confirmé par la recherche |
| 23-02 — Quotes-parts et verrous | **PASS** | Fixtures en dur, verrous réutilisés |
| 23-03 — Convention et facture | **CORRIGÉ** puis PASS | Créait un blocage concurrent — voir ci-dessous |
| 23-04 — Panneau Tarifs | **PASS** après ajout de l'export manquant | — |

## Ce qui a été vérifié dans le code

Chaque symbole cité par les plans existe, avec la signature supposée :

| Symbole | Emplacement réel | Conforme |
|---|---|---|
| `createInvoiceForSponsorGroup({sessionId, sponsorOrgId, vatRate?, dueDateDays?, notes?})` | `server/actions/invoices.ts:255` | ✅ la facture par payeur existe déjà |
| `prixGlobalHT` | `lib/closure/convention-core.ts:352` | ✅ point d'insertion du forfait confirmé |
| `classifyParticipantPrice` | `lib/pricing/classify-participant.ts` | ✅ 4 classes `FACTURE`/`ENGAGE_OPCO`/`SIGNE`/`LIBRE` |
| `isPersonneMoralePayeur` | `lib/sessions/payer-rule.ts` | ✅ seule définition |
| `blocagesDocsEntreprise` | `lib/docs/blocages-docs-entreprise.ts:56` | ✅ mais voir la correction |
| `parsePriceInput` | `lib/pricing/parse-price-input.ts` | ✅ livré le 28/08 |

Chaînage inter-plans : `SessionPricingLine` / `pickPricingLine` (23-01) →
`distributeGroupShares` / `redistributeGroupShares` (23-02) → `ensurePricingLineForSponsor`
(23-04). Aucun symbole utilisé sans être produit.

## La correction qui comptait — 23-03

Le plan ajoutait un blocage `tarif_non_saisi`. Or `blocages-docs-entreprise.ts` porte
**déjà** `prix_manquants` :

```ts
const sansPrix = input.participants.filter((p) => !(p.priceHT > 0));
```

Deux règles concurrentes sur le même sujet, c'est **E-2 une troisième fois** — après les
trois copies du repli tarifaire et le `|| 0` du dialog.

Plus grave : **cette règle devient fausse** avec un forfait, exactement comme
`convention-core.ts:352`. Les deux supposent que la convention est la somme des `priceHT` :

- avant répartition, les inscrits d'un forfait sont légitimement à 0 € → la règle actuelle
  bloque une situation normale ;
- après répartition, tous ont un prix > 0 même si le **forfait** n'est pas saisi → la règle
  actuelle laisse passer, et la convention annonce la somme des quotes-parts au lieu du
  montant négocié.

Le plan corrigé impose une règle **unique** : forfait ⇒ `amountHT` fait foi ; sinon, règle
historique inchangée. Et les deux fichiers évoluent ensemble, dans le même plan.

## Ce qui n'a PAS été vérifié

Faute de relecture indépendante, ces points restent ouverts et doivent être traités à
l'exécution :

1. **Parallélisme wave 2** — 23-02 et 23-03 modifient tous deux
   `apps/web/src/server/actions/` ; 23-02 touche `session-pricing.ts`, 23-03 `invoices.ts`.
   Pas de fichier commun repéré, mais l'exécution en parallèle n'a pas été prouvée sûre.
   **Par prudence : exécuter 23-02 puis 23-03 en séquence.**
2. **Couverture des 8 critères du ROADMAP** — mappée à la main, non contre-vérifiée.
   Le critère 7 (clause de fermeté en convention) repose sur 23-03 tâche 4 ; le critère 3
   (refus si engagé) sur 23-02 tâches 4-5.
3. **Validation Nyquist** — non évaluée.
4. **Numéros de ligne** — valides au 28/08 sur `cloud-migration`, branche à deux sessions
   actives. Retrouver les symboles, pas les lignes.

## Recommandation

Les plans sont exécutables. Exécuter la wave 2 en **séquence** plutôt qu'en parallèle, et
relancer une relecture indépendante (`gsd-plan-checker`) avant `/gsd:execute-phase 23` si
la machine reste allumée — la vérification de ce document est celle de l'auteur des plans,
ce qui n'a pas la même valeur.
