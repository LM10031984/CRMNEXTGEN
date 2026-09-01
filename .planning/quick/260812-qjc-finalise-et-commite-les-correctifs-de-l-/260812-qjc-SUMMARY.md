---
id: 260812-qjc
title: Finalise et commite les correctifs de l'audit Cowork du 12/08
date: 2026-08-12
mode: quick
status: done
commit: 4fba9b6
branch: cloud-migration
---

# Quick 260812-qjc — SUMMARY

## Résultat

**1 commit `4fba9b6`** sur `cloud-migration`, 28 fichiers, +669 / −55.
Les 3 portes vertes. Aucune logique de correctif de l'audit modifiée, sauf le
**cadrage de `invoices.ts`** (voir « Écart » ci-dessous).

## Tâches

| T | Objet | Résultat |
|---|---|---|
| T1 | Patch `sessions/[id]/page.tsx` | ✅ `git apply -p0`, hunk unique, offset 35, **zéro conflit** avec `a61a8e4` |
| T2 | `pnpm install` (3 deps) | ✅ +28 / −49 paquets, `prisma generate` OK, 4,8 s |
| T3 | Portes build / lint / test | ✅ / ✅ / ✅ |
| T4 | Commit périmètre exact | ✅ 28 fichiers, exclusions respectées |

### T1 — précision technique

`git apply --3way` est **inopérant** sur ce patch : il n'a pas de ligne `index`,
donc pas de blob de base pour la fusion 3-way. `-p1` (défaut) échoue aussi car les
chemins du diff sont déjà relatifs à la racine du repo. La forme correcte est
`git apply -p0`, précédée d'un `--check` à blanc. Le repli manuel prévu par la
consigne n'a pas été nécessaire : le bloc cible était intact dans la version
post-`a61a8e4`.

### T3 — portes

| Porte | Résultat |
|---|---|
| `pnpm build` | ✅ 25,5 s (turbo, `@qualiof/web`) |
| `pnpm lint` | ✅ 3/3 paquets — 1 warning `jsx-a11y/alt-text` **préexistant** (`parametres/page.tsx:209`), hors périmètre audit |
| `pnpm test` | ✅ **1332** — 10 db + 113 shared + 1209 web |
| `dedupe.merge` | ✅ 3/3 contre `qualiof_test` |

**`.env` non modifié** : `TEST_DATABASE_URL` était déjà présent (L157 →
`postgresql://qualiof:***@localhost:5432/qualiof_test`) et la base `qualiof_test`
existait déjà (45 tables). Rien à créer.
⚠️ `DATABASE_URL` pointe le **cloud Supabase** ; le test dedupe instancie son
propre client sur `TEST_DATABASE_URL` (garde dure « nom de base finissant par
`_test` ») → aucune écriture sur le cloud pendant les tests.

## Écart — collision de snapshot sur `invoices.ts`

**Non prévu par le rapport, découvert à la relecture du `git show`.**

L'auditeur travaillait sur un snapshot de ~15h20. Or `9265b33` (17h48, « GABARIT
FACTURE refondu — modèle Laurent 12/08 ») a modifié
`apps/web/src/server/actions/invoices.ts` **après** ce snapshot. L'auditeur ayant
réécrit le fichier entier, le commiter tel quel **annulait le gabarit** :
`composeLieu`, `composeFormateur`, `MODALITE_LABEL`, et le retour de
`renderInvoiceFooterHtml` vers `renderOfStandardFooterHtml`.

C'est exactement le piège que le rapport avait anticipé pour
`sessions/[id]/page.tsx` (d'où le patch séparé) — mais il l'a raté sur
`invoices.ts`.

**Résolution** : diff de la version auditeur contre *sa propre base* (`a155a28`)
→ le vrai correctif de l'audit ne fait que **2 lignes**. Fichier restauré depuis
`0d7199e`, correctif rejoué seul :

```diff
-              amountCollected: new Prisma.Decimal(invoice.participant!.priceHT),
+              // String() : realm-safe (audit 2026-08-12, neutre en prod)
+              amountCollected: new Prisma.Decimal(String(invoice.participant!.priceHT)),
```

Portes re-jouées après correction, commit amendé (non poussé au moment de
l'amende : `origin/cloud-migration` était encore à `0d7199e`).

**Balayage exhaustif des autres collisions** : pour chacun des 26 fichiers de
code du commit, recherche du dernier commit l'ayant touché avant l'audit. Seuls
deux fichiers avaient été modifiés le 12/08 après le snapshot :
`sessions/[id]/page.tsx` (traité par patch, correct) et `invoices.ts` (corrigé
ci-dessus). **Aucune autre régression.**

## Exclusions vérifiées (restées hors commit)

`.planning/` (36 entrées) · `.gitignore` (ajout `.vercel` + `.env*`, sans rapport
avec l'audit) · `apps/web/tsconfig.tsbuildinfo` ·
`apps/web/scripts/_backfill-ape-agefice.ts` ·
`apps/web/scripts/_dump-pack-ses0094.ts` ·
`apps/web/src/app/app/factures/Facture-START ACADEMY-Jules et Lou SARL-F-2026-06-207.pdf`

## À arbitrer par Laurent

1. ~~**Règle métier trésorerie** (correctif audit #6)~~ → **VALIDÉE par Laurent le
   2026-08-13**, comportement conservé tel quel, aucun code touché. Pour mémoire :
   cocher « Paiement client » ou « Remboursement OPCO » dans un dossier **solde la
   facture liée** (`InvoicePayment` du restant dû, méthode `virement`, référence
   « … (synchro dossier OPCO) », statut `PAID`). Le dé-toggle ne reverse rien —
   une annulation d'encaissement se fait à la main côté facture. Localisé dans
   `settleInvoiceForParticipant` (`apps/web/src/server/actions/dossiers-opco.ts`).
2. **Points P2/P3 non corrigés** listés dans le rapport § « Points restants » :
   horaires convocation 9h-17h incohérents avec 9h-13h/14h-18h, compteur
   LegalLinks du rapport de sync SmartOF, `ExternalIdentity` des 5 formateurs en
   cloud prod (`entityType='Person'`, sensible à la casse), tri recherche
   apprenant, `lookupSiret` sans session, a11y dropdowns + favicon.
3. **Non poussé** : le commit est local sur `cloud-migration`.
