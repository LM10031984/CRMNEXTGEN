# Rapport migration storage MinIO→Supabase — 2026-07-04

- **Mode** : WRITE (écriture réelle Supabase)

## Total par bucket

| Bucket | Total clés | Simulés (DRY) | Migrés (WRITE) |
| --- | --- | --- | --- |
| qualiof-docs | 3104 | 0 | 3104 |
| preinscriptions | 5 | 0 | 5 |

## Migrés : 3109

## Orphelins (clé en base, objet absent de MinIO — AUCUNE action auto, D-04)

_Aucun._

## Clés invalides Supabase (leading /, //, %, non-ASCII — NON uploadées)

_Aucune._

## Liens morts après migration (DOIT être VIDE pour autoriser la bascule)

_Aucun (0 lien mort)._
