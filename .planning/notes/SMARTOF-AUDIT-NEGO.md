# Audit `Session.pricePerLearner` — 24 NEGO à reviewer manuellement
# Date : 2026-06-03 — branche cloud-migration

Sessions dont `pricePerLearner` n'est ni le prix unitaire SmartOF, ni un
multiple net du nombre de participants. Probablement des tarifs négociés
ponctuels — à confirmer par Laurent et soit corriger soit laisser tel quel.

## Pattern 0.71× unit (× 5/7) — Probable discount 28.57%

| Session | NbP | PPL actuel | SmartOF unit | Ratio | Hypothèse |
|---------|-----|-----------:|-------------:|-------|-----------|
| SES-0088 | 1 | 480 € | 672 € | 0.71 | -28.57% |
| SES-0087 | 1 | 240 € | 336 € | 0.71 | -28.57% |
| SES-0075 | 1 | 480 € | 672 € | 0.71 | -28.57% |
| SES-0078 | 1 | 1200 € | 1680 € | 0.71 | -28.57% |
| SES-0039 | 1 | 2160 € | 3024 € | 0.71 | -28.57% |

→ **5 sessions** toutes à 1 stagiaire avec exactement 5/7 du tarif catalogue.

## Pattern 1.43× unit (× 10/7) — Probable discount × 2 stagiaires

| Session | NbP | PPL actuel | SmartOF unit | Ratio |
|---------|-----|-----------:|-------------:|-------|
| SES-0077 | 2 | 960 € | 672 € | 1.43 |
| SES-0091 | 6 | 480 € | 336 € | 1.43 |
| SES-0076 | 2 | 480 € | 336 € | 1.43 |

## Pattern 1.71× unit (× 12/7) — Pattern proche

| Session | NbP | PPL actuel | SmartOF unit | Ratio |
|---------|-----|-----------:|-------------:|-------|
| SES-0059 | 2 | 2880 € | 1680 € | 1.71 |
| SES-0058 | 2 | 1728 € | 1008 € | 1.71 |
| SES-0057 | 2 | 576 € | 336 € | 1.71 |

## Sessions groupe avec forte remise

| Session | NbP | PPL actuel | SmartOF unit | CA attendu | Réel/Attendu |
|---------|-----|-----------:|-------------:|-----------:|-------------:|
| SES-0086 | 29 | 4176 € | 168 € | 4872 € | 86% |
| SES-0050 | 25 | 10464 € | 672 € | 16800 € | 62% |
| SES-0079 | 15 | 4416 € | 672 € | 10080 € | 44% |
| SES-0040 | 5 | 1200 € | 336 € | 1680 € | 71% |
| SES-0049 | 5 | 2880 € | 1008 € | 5040 € | 57% |
| SES-0009 | 5 | 1488 € | 336 € | 1680 € | 89% |
| SES-0030 | 5 | 14256 € | 3024 € | 15120 € | 94% |

## Sessions avec ratio bizarre

| Session | NbP | PPL actuel | SmartOF unit | Ratio | Note |
|---------|-----|-----------:|-------------:|-------|------|
| SES-0018 | 9 | 27720 € | 2625 € | 10.56 | Plus que nbP ! |
| SES-0031 | 10 | 27216 € | 3024 € | 9.00 | Exactement 9× pas 10× |
| SES-0027 | 4 | 9808 € | 3024 € | 3.24 | 4 parts × 3024 = 12096 (diff 2288) |
| SES-0029 | 2 | 6160 € | 2625 € | 2.35 | 2 parts × 2625 = 5250 |
| SES-0012 | 5 | 1296 € | 336 € | 3.86 | 5 parts × 336 = 1680 |
| SES-0048 | 2 | 1800 € | 1008 € | 1.79 | 2 parts × 1008 = 2016 |

## Hypothèses à valider avec Laurent

1. **Le ×0.71** (= 5/7) sur 5 sessions à 1 stagiaire : tarif fixe négocié type "remise revendeur" ?
2. **Le ×1.43** et **×1.71** : variantes du tarif 0.71 multipliées par 2-3 (CA total avec discount) ?
3. **Les sessions groupe** : barème de prix dégressif selon le nombre ?
4. **Les sessions "plus que nbP"** (×10.56, ×9.00) : ajout de prestations annexes (hébergement formateur, salle, support) ?

## Action proposée

- **A.** Garder tel quel (sécuritaire) — le code et factures s'appuieront sur `participant.priceHT` (qui est maintenant correct via SmartOF). Le `Session.pricePerLearner` reste "déco" jusqu'à clarification.
- **B.** Pour les 5 sessions ×0.71 à 1 stagiaire : aligner `pricePerLearner` = `participant.priceHT` réel (= 5/7 × SmartOF) pour cohérence ?
- **C.** Pour les sessions groupe, ouvrir une colonne `Session.priceTotalNegotiated` séparée pour stocker le CA total négocié à part du prix unitaire.

→ Recommandation : **option A**, laisser et revoir au cas par cas si l'audit Qualiopi du 03/07 le demande.
