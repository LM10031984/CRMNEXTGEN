# AGEFICE Attestation d'assiduité — Mapping form fields

PDF : `attestation-assiduite-2023.pdf` (27 form fields, modèle janvier 2023).

BUG-12 (préparation 2026-05-22) — ce mapping sert à scaffolder le helper
`lib/agefice-attendance-fill.ts` (à écrire en session dédiée).

## Mapping field → source données

| Field name (PDF) | Source | Notes |
|---|---|---|
| `Int i tu l é de format i on` | `session.product.title` | Spaces dans le nom = pas un typo |
| `Date de démarrage` | `session.startDate` | Format JJ/MM/AAAA |
| `Date de f i n` | `session.endDate` | Format JJ/MM/AAAA |
| `Nom et qua l i té du formateur` | `trainer.firstName + lastName + ' — Formateur'` | Primary trainer |
| `Nom Prénom responsable OF` | `of.resp.prenom + ' ' + of.resp.nom` | Lucia user |
| `Qualité responsable OF` | `of.resp.titre` | Ex: "Dirigeant" |
| `Raison sociale de l'organisme de formation` | `of.name` | Tenant |
| `Numéro de déclaration d'activité` | `of.rnq` | NDA |
| `Région` | static "Provence-Alpes-Côte d'Azur" | Pas en BDD pour l'instant |
| `Nom Prénom Stagiaire` | `participant.person.firstName + ' ' + lastName` | |
| `Raison sociale entreprise` | `eiOrg.legalName` | Auto-entreprise du stagiaire (LegalLink EI_SELF) |
| `PrévueDurée en présentiel Individuel` | `splitDureeByModality(...).presIndiv` | Réutilise helper agefice-generator |
| `PrévueDurée en présentiel Collectif` | `.presColl` | |
| `PrévueDurée en FOAD Synchrone` | `.foadSync` | |
| `PrévueDurée en FOAD Asynchrone` | `.foadAsync` | |
| `RéaliséeDurée en présentiel Individuel` | `attendancesPresIndiv` | Calculer depuis `Attendance` model (sum demi-journées présentes × 4h) — TODO V2 |
| `RéaliséeDurée en présentiel Collectif` | idem | TODO V2 |
| `RéaliséeDurée en FOAD Synchrone` | idem | TODO V2 |
| `RéaliséeDurée en FOAD Asynchrone` | idem | TODO V2 |
| `Somme chiffres` | `participant.priceHT` | Format "1500.00" |
| `Somme lettres` | `numberToFrenchWords(priceHT)` | Helper à écrire (mille cinq cents) |
| `Mode règlement` | static "Virement bancaire" | Pas en BDD |
| `Date règlement` | `invoice.paidAt ?? ''` | Lire dernière Invoice du participant |
| `Lieu de délivrance attestation` | `of.addressVille` | Cagnes sur Mer |
| `Date de délivrance attestation_es_:date` | `new Date()` | Format JJ/MM/AAAA |
| `Nom Prénom Qualité responsable OF` | `of.resp.prenom + ' ' + of.resp.nom + ' — ' + of.resp.titre` | |
| `Nom Prénom Qualité stagiaire` | `firstName + ' ' + lastName + ' — Stagiaire'` | |

## V1 minimal (sans calcul réalisé)

Pour la V1, on peut laisser les 4 champs `RéaliséeDurée*` vides → l'utilisateur les remplit manuellement dans le PDF (formulaire éditable).

Pour `Somme lettres`, V1 = vide. Helper français-en-lettres à écrire en V2.

Pour `Date règlement`, lire la dernière Invoice du participant si elle existe, sinon vide.

## Plan d'implémentation (session dédiée future)

1. Créer `apps/web/src/lib/agefice-attendance-fill.ts` (clone du pattern `agefice-form-fill.ts`)
2. Créer `apps/web/src/server/actions/agefice-attendance-generator.ts` (clone du pattern `agefice-generator.ts`)
3. Câbler dans `qualiopi-matrix.ts` `regenerateParticipantDoc` :
   - docKind `ASSIDUITE` → `generateAgeficeAttendanceForParticipant`
4. Le DocType `ASSIDUITE` existe déjà dans l'enum Prisma — pas de migration nécessaire.
5. Tests : helper unitaire (mapping fields), generator integration test.

## Estimation effort

~2-3h en session dédiée.
