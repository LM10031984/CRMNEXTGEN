# Fiche DPA — Supabase

| Champ | Valeur |
|---|---|
| **Fournisseur** | Supabase, Inc. |
| **Rôle** | Sous-traitant (art. 28 RGPD) — hébergement des données |
| **Service utilisé** | Postgres managé (projet `gntlqyscahbgjrmsbzil`, plan payant) + Storage (buckets `qualiof-docs`, `preinscriptions`) |
| **Données transmises** | **TOUTE la base de données** : PII apprenants/formateurs/contacts (`Person`), données sensibles isolées (`SensitiveData` : n° SS, référence pièce d'identité), préinscriptions, facturation, comptes utilisateurs — **+ Storage** : pièces d'identité (CNI), RIB, attestations CFP, PDF Qualiopi générés |
| **Localisation** | **`eu-west-1` (Irlande, UE)** — région DÉFINITIVE (immuable côté Supabase ; dérogation « données en France » actée par Laurent, cf. `17-REGIONS.md` amendement D-05). Backups quotidiens (rétention 7 jours) stockés dans la **même région** que le projet (UE ✓). |
| **Document DPA public** | https://supabase.com/legal/dpa (vérifiée 200 le 2026-07-06) — **acceptation via le dashboard de l'organisation** (Organization Settings → Legal Documents / Documents). ⚠ **Action à faire si pas déjà fait : accepter le DPA dans le dashboard org et conserver la preuve** (capture/horodatage). |
| **Garanties de transfert hors UE** | Données du projet en région UE (eu-west-1). Le DPA Supabase couvre les subprocessors (infrastructure AWS pour la région du projet). |
| **Date de vérification** | 2026-07-06 (URL re-vérifiée HTTP 200) |

## Mesures techniques côté QualiOF

- Bucket Storage **privé** : accès exclusivement par signed URLs à TTL de quelques minutes ; upload direct-to-storage.
- Table `SensitiveData` séparée (1:1 Person, cascade delete).
- Connexion via pooler (:6543) chiffrée ; `SUPABASE_SERVICE_ROLE_KEY` stockée en variable d'environnement chiffrée (jamais dans le repo).

## Points ouverts / limites

- ⚠ **Statut d'acceptation du DPA dashboard à vérifier/capturer** avant la bascule (action runbook).
- ⚠ **Backups non off-site** : rétention 7 jours dans la même région que le projet — pas de copie hors vendor (backlog `pg_dump` externe, décision D-12). Limite assumée, **acceptée par le responsable de traitement le 2026-07-07** (validation du registre, gate D-13).
