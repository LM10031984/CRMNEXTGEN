# Rapport backfill storage MinIO→Supabase — 2026-07-06

## Contexte

- **Bug déclencheur : SES-0094** (validation pack du 2026-07-06) — des objets storage référencés en base n'avaient jamais été migrés vers Supabase, produisant des liens morts potentiels côté staging.
- **Décision D-06 (Phase 21)** : audit + backfill storage OBLIGATOIRES **avant** toute vague de tests staging (TEST-01/TEST-02). Sans ce backfill, les smoke/E2E contre le staging (`STORAGE_PROVIDER=supabase`) vérifieraient des documents à liens morts (faux verts).
- **Cause racine mesurée** : la migration du 2026-07-04 (3109 objets, rapport `STORAGE-MIGRATION-REPORT-2026-07-04.md`) a été exécutée contre la **base LOCALE** de l'époque. La **base CLOUD** (restaurée Phase 19 depuis un dump antérieur) référence des clés de documents plus anciennes dont les objets vivaient dans MinIO mais n'étaient plus référencés par la base locale au 07-04 (régénérations de packs entre le dump et la migration) — ils n'avaient donc **jamais été copiés** vers Supabase. Même classe de bug que SES-0094, à échelle **733 objets**.
- **Script utilisé** : `apps/web/scripts/migrate-storage.ts` (Phase 18) — idempotent (`upsert:true`), SÉQUENTIEL (`for...of await`), try/catch par clé, clients dédiés (S3 MinIO source `localhost:9000` / supabase-js cible projet `gntlqyscahbgjrmsbzil`), indépendant du switch global `STORAGE_PROVIDER`.
- **Périmètre** : 8 champs / 2 buckets — `qualiof-docs` (Person.ribKey, SensitiveData.idDocumentUrl, Invoice.pdfUrl, Quote.pdfUrl, Document.pdfUrl, AgeficeProfile.cfpAttestationKey, PedagogicalAsset.pdfUrl) + `preinscriptions` (PreEnrollment.cniKey/ribKey/cfpKey).

## Note de méthodologie

Le mode DRY de `migrate-storage.ts` compte les objets **lisibles depuis MinIO** mais ne vérifie pas leur présence côté Supabase. Les compteurs « présents / manquants / orphelins des deux stores » ci-dessous proviennent d'un **audit d'écart complémentaire en lecture seule stricte** (réutilisant `collectAllKeys` du script, `list` Supabase paginé + `HeadObject` MinIO, aucune écriture), exécuté AVANT puis APRÈS le WRITE.

## Compteurs

### 1. Audit AVANT (DRY + audit d'écart, 2026-07-06, aucune écriture)

| Compteur | Valeur | Détail |
| --- | --- | --- |
| Clés référencées en base (cloud) | **899** | 893 `qualiof-docs` + 6 `preinscriptions` |
| Déjà présentes côté Supabase | **166** | 160 docs + 6 preinscriptions |
| **MANQUANTES (MinIO seul → à backfiller)** | **733** | 410 Document.pdfUrl + 322 PedagogicalAsset.pdfUrl + 1 Invoice.pdfUrl — toutes bucket `qualiof-docs` |
| Orphelines (absentes des DEUX stores) | **0** | — |
| Clés invalides Supabase | **0** | — |

Note : le DRY du script listait 28 « orphelins MinIO » (clés absentes de MinIO, dont 27 docs SES-0094 + 1 clé TEST-OCR). L'audit d'écart a prouvé que **ces 28 objets existent tous côté Supabase** — créés APRÈS la bascule `STORAGE_PROVIDER=supabase` du 2026-07-04, donc uploadés directement dans Supabase sans jamais passer par MinIO. Ce ne sont **pas** des orphelins.

Sessions les plus touchées par les 733 manquants : SES-0050 (170), SES-0043 (103), SES-0093 (76), SES-0044 (67), SES-0010 (66), SES-0092 (31), SES-0094 (30), SES-0095 (29), SES-0057 (27), SES-0086 (24)… Hors `closure/` : conventions (94), agefice (34), convocations (21), assiduite (9), checklists (7), programmes (5), factures (2), autres (3).

### 2. Run WRITE (2026-07-06, `WRITE=1`, exit 0)

| Compteur | Valeur |
| --- | --- |
| Clés traitées | 899 |
| **Migrées (copiées MinIO→Supabase, upsert)** | **871** (866 docs + 5 preinscriptions) |
| Orphelins MinIO (déjà présents Supabase, cf. note) | 28 |
| Clés invalides | 0 |
| **Liens morts après migration (vérif `verifyExists` sur la cible)** | **0** |

### 3. Re-vérification APRÈS (audit d'écart lecture seule, 2026-07-06)

| Compteur | Valeur |
| --- | --- |
| Clés référencées en base | 899 |
| **Présentes côté Supabase** | **899 / 899** (893 docs + 6 preinscriptions) |
| **Manquantes** | **0** |
| Orphelines (aucun store) | **0** |

Idempotence : le script est `upsert:true` — un second `WRITE=1` ne changerait rien (les 899 clés résolvent déjà toutes côté Supabase).

## Orphelins

**Aucun.** Aucune clé référencée en base n'est absente des deux stores. (Convention D-04 Phase 18 : les orphelins éventuels auraient été listés SANS action automatique — décision Phase 22.)

## Preuve

**0 lien mort — chaque clé référencée en base résout à un objet Supabase.** Les 8 champs / 2 buckets du périmètre résolvent à 899/899 ; les tests staging (`STORAGE_PROVIDER=supabase`) liront des objets réellement présents — plus de faux verts storage possibles (D-06 satisfaite, bug SES-0094 soldé).

## MinIO

**MinIO NON purgé (destructif = étape séparée, Phase 22+).** Aucune commande de suppression (rm/delete/remove) n'a été exécutée contre MinIO ni contre Supabase pendant ce backfill — le run est strictement additif (lecture MinIO, upsert Supabase).
