# Phase 18: Supabase Storage (migration objets + direct-to-storage) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-04
**Phase:** 18-supabase-storage-migration-objets-direct-to-storage
**Areas discussed:** Bascule et filet de sécurité, Vérification post-migration, Parcours upload CNI/RIB, Accès aux documents (TTL)

---

## Bascule et filet de sécurité

| Option | Description | Selected |
|--------|-------------|----------|
| Big-bang contrôlé | Migrer 100% (DRY→WRITE), vérifier 0 lien mort, puis switch STORAGE_PROVIDER | ✓ |
| Double-lecture transitoire | Lire Supabase, fallback MinIO si absent | |

**User's choice:** Big-bang contrôlé (recommandé)

| Option | Description | Selected |
|--------|-------------|----------|
| Jusqu'à validation manuelle | Volume MinIO conservé, suppression = étape séparée explicite | ✓ |
| 30 jours puis purge | Suppression planifiée après 30 jours | |
| Suppression immédiate après vérif | Libérer le disque dès la vérif passée | |

**User's choice:** Jusqu'à validation manuelle (recommandé)

---

## Vérification post-migration

| Option | Description | Selected |
|--------|-------------|----------|
| Fichier archivé | Rapport daté : objets migrés, liens vérifiés par table, orphelins | ✓ |
| Console seulement | Sortie terminal sans trace | |

**User's choice:** Fichier archivé (recommandé)

| Option | Description | Selected |
|--------|-------------|----------|
| Lister et décider ensemble | Orphelins listés sans action auto, décision au cas par cas | ✓ |
| Bloquer la bascule | Tolérance zéro orphelin | |
| Nettoyage automatique | Vider les champs orphelins en base | |

**User's choice:** Lister et décider ensemble (recommandé)

---

## Parcours upload CNI/RIB

| Option | Description | Selected |
|--------|-------------|----------|
| 20 Mo | Marge confortable photos smartphone | |
| Garder 10 Mo | Limite actuelle | |
| 50 Mo | Limite du bucket, très permissif | ✓ |

**User's choice:** 50 Mo
**Notes:** Implication technique consignée : downscale serveur avant OCR (limites modèles vision) — Claude's discretion.

| Option | Description | Selected |
|--------|-------------|----------|
| Barre de progression | Pourcentage réel par fichier | ✓ |
| Spinner simple | Indicateur sans pourcentage | |

**User's choice:** Barre de progression (recommandé)

| Option | Description | Selected |
|--------|-------------|----------|
| 1 retry auto puis message | Retry silencieux, puis message FR + bouton Réessayer | ✓ |
| Message immédiat | Pas de retry auto | |

**User's choice:** 1 retry auto puis message (recommandé)

| Option | Description | Selected |
|--------|-------------|----------|
| Public + admin | /p/[token] ET écran admin, même mécanique | ✓ |
| Formulaire public seul | Admin garde l'upload serveur actuel | |

**User's choice:** Public + admin (recommandé)

---

## Accès aux documents (TTL)

| Option | Description | Selected |
|--------|-------------|----------|
| 5 minutes (PII) | Court, bon signal RGPD | |
| 2 minutes (PII) | Maximum de prudence | |
| 15 minutes (PII) | Confortable onglet ouvert | |
| Other : « durée de vie indéterminée » | Réponse initiale de Laurent | ✓ (initial) |

**User's choice (initial):** « On laisse une durée de vie indéterminée » + demande que les liens soient cliquables à tout moment (contrôle Qualiopi) + idée d'export vers Drive entreprise.
**Clarification apportée:** les documents restent accessibles à tout moment via l'app (lien régénéré à chaque clic) ; seul le lien brut copié expire. L'export Drive = nouvelle capacité → différée.

| Option | Description | Selected |
|--------|-------------|----------|
| Oui, liens courts (10 min uniforme) | Régénérés à chaque clic, zéro impact usage | ✓ |
| Non, je veux en reparler | Creuser encore | |

**User's choice (final):** Oui, liens courts — TTL 10 min uniforme (recommandé)

---

## Claude's Discretion

- Nommage clés Supabase + table de correspondance ancienne→nouvelle clé
- Modèle d'accès service_role / RLS
- Downscale image avant OCR (fichiers jusqu'à 50 Mo)
- Mécanique de confirmation post-upload direct (déclenchement OCR)
- Redirect 302 vs proxy pour servir les documents (cap réponse Vercel)
- Aperçus PII en `unoptimized`

## Deferred Ideas

- Export des dossiers sessions vers le Drive entreprise (arborescence : session datée → apprenants + docs ; programme/déroulé/checklist à la racine ; emplacement paramétrable dans l'app) — nouvelle phase à ajouter au roadmap.
