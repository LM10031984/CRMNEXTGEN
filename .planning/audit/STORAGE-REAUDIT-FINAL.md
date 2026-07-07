# Re-audit storage FINAL avant bascule — 2026-07-06 (D-02, plan 22-03)

## Contexte

- **Objet** : re-jouer l'audit storage du 21-02 contre l'état **FINAL** de la base cloud (post-E2E 21-06, post-régénérations, post-backfill du matin) pour prouver que le pack témoin SES-0094 (gate go/no-go 22) ne peut pas produire de faux verts storage.
- **Exécution** : 2026-07-06, ~20h40 UTC.
- **Base auditée** : cloud Supabase (projet `gntlqyscahbgjrmsbzil`, eu-west-1) via `DATABASE_URL` du `.env` racine.
- **Script** : `apps/web/scripts/migrate-storage.ts` — **0 modification** (`git diff` vide) ; mode DRY par défaut.
- **Méthode** (identique 21-02) : ① DRY `pnpm exec dotenv -e ../../.env -- tsx scripts/migrate-storage.ts` ; ② audit d'écart complémentaire **lecture seule stricte** via script temporaire `_gap-audit-22-03.ts` (réutilise `collectAllKeys` exporté + `list` Supabase paginé avec cache par préfixe + `HeadObject` MinIO — aucune écriture), **supprimé après exécution** (non commité).

## Compteurs

### ① DRY (`migrate-storage.ts`, aucune écriture)

| Compteur | Valeur | Détail |
| --- | ---: | --- |
| Clés référencées en base (cloud, 8 champs / 2 buckets) | **903** | 897 `qualiof-docs` + 6 `preinscriptions` |
| Simulées (lisibles depuis MinIO) | 871 | 866 docs + 5 preinscriptions |
| « Orphelins MinIO » du DRY | 32 | clés absentes de MinIO — voir note ci-dessous |
| Clés invalides Supabase | **0** | — |
| Liens morts | 0 | « bascule autorisée » (sortie script) |

Note : comme au 21-02, les « orphelins MinIO » du DRY ne sont **pas** des orphelins — ce sont des objets créés APRÈS la bascule `STORAGE_PROVIDER=supabase` du 2026-07-04 (docs SES-0094, régénérations et documents générés côté cloud les 05-06/07), uploadés directement dans Supabase sans jamais passer par MinIO. L'audit d'écart ② le prouve : les 903/903 résolvent côté Supabase.

### ② Audit d'écart lecture seule (état FINAL)

| Compteur | Valeur |
| --- | ---: |
| Clés référencées en base (cloud) | **903** |
| **Présentes côté Supabase** | **903 / 903** |
| **MANQUANTES (MinIO seul, à backfiller)** | **0** |
| Orphelines (absentes des DEUX stores) | **0** |

### ③/④ WRITE

**Aucun WRITE exécuté** : manquants = 0 dès l'audit ② (branche ④ du plan). Le run est resté 100 % lecture seule.

## Comparaison à la baseline du 2026-07-06 matin (STORAGE-BACKFILL-REPORT-2026-07-06.md)

| | Baseline matin (post-backfill 21-02) | Re-audit final (ce rapport) |
| --- | ---: | ---: |
| Clés référencées | 899 (puis 902 à la re-vérification) | **903** |
| Présentes Supabase | 899/899 (puis 902/902) | **903/903** |
| Manquantes | 0 | **0** |
| Orphelines | 0 | **0** |

**Délta +4 clés depuis le rapport du matin (899→903)** : documents générés côté cloud dans la journée du 06/07 (activité staging/validation, dernier `Document.createdAt` cloud = 2026-07-06T16:54Z), uploadés en direct vers Supabase (`STORAGE_PROVIDER=supabase`) — tous résolvent.

## Preuve

**0 lien mort — chaque clé référencée en base résout à un objet Supabase (état final pré-bascule).** Les 8 champs / 2 buckets du périmètre (Person.ribKey, SensitiveData.idDocumentUrl, Invoice.pdfUrl, Quote.pdfUrl, Document.pdfUrl, AgeficeProfile.cfpAttestationKey, PedagogicalAsset.pdfUrl + PreEnrollment.cniKey/ribKey/cfpKey) résolvent à 903/903. Le pack témoin SES-0094 ne peut plus produire de faux verts storage (D-02 satisfaite côté storage).

## MinIO

**MinIO NON purgé** — destructif = étape séparée (plan 22-10, après pg_dump d'archive + snapshot et validation utilisateur explicite). Aucune commande de suppression exécutée contre MinIO ni Supabase pendant ce re-audit ; le run est strictement lecture seule.

## ⚠ Portée du verdict (lien avec 22-DATA-GAP-AUDIT.md)

Ce re-audit prouve la cohérence **base cloud ACTUELLE ↔ storage Supabase**. Il ne préjuge PAS de la complétude de la base cloud elle-même : l'audit d'écart D-01 (22-DATA-GAP-AUDIT.md) avait un verdict **FAIL** au 06/07 (base cloud = snapshot du 16/06, données métier locales 16/06→03/07 absentes). **Si la décision Laurent conduit à reporter des données vers le cloud (ex. SES-0101), ce re-audit storage devra être re-joué après le report** (les clés référencées changeront) — ré-exécution triviale : DRY + audit d'écart, même méthode.

## Post-report — 2026-07-07 (re-vérification après remédiation D-01)

Le report sélectif `report-data-gap.ts` (décision Laurent option 1, 1 414 lignes reportées — voir 22-DATA-GAP-AUDIT.md §Remédiation) a été suivi d'un re-run de l'audit d'écart storage lecture seule (même méthode, script temporaire supprimé après) :

| Compteur | Valeur |
| --- | ---: |
| Clés référencées en base (cloud, post-report) | **903** (897 `qualiof-docs` + 6 `preinscriptions`) — **inchangé** |
| Présentes côté Supabase | **903 / 903** |
| Manquantes | **0** |
| Orphelines | **0** |

Les 1 414 lignes reportées n'introduisent **aucune nouvelle clé storage** (les champs `Person.ribKey` / `SensitiveData.idDocumentUrl` des lignes reportées sont vides). **La preuve « 0 lien mort » reste valide sur l'état final post-remédiation** — aucun WRITE storage n'a été nécessaire à aucun moment du plan 22-03.
