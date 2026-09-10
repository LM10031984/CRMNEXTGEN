# Quick 260908-lhg — Corriger le nom d'un apprenant corrige aussi son auto-entreprise

**Date :** 2026-09-08
**Branche :** `quick/260908-nom-apprenant-vers-ei` (worktree `files-lieu`, partie de `main` @ `71b227e`)
**Demande (Laurent, 2026-09-08) :** « pour l'apprenant EL GUERTIT, [l'OCR] a confondu […] on a dû
repasser dans l'apprenant pour modifier. […] dans la convention il ne modifie pas le nom partout.
Je pense que c'est parce que ça a été aussi créé dans l'organisation. Et ça me fait pareil dans
l'attestation d'assiduité. »

Diagnostic confirmé : à la création d'un apprenant avec un SIRET, `crud-edits.ts:477` fige
`Organization.legalName = "Prénom Nom"`. `updatePerson` ne touche **jamais** cette raison sociale.
La convention affiche les deux — le nom de la personne (corrigé) et la raison sociale du payeur
(restée fausse) — d'où la correction à moitié. Vérifié en base : `HOUSSAIN EL GUERTIT`, personne
modifiée à 10h52, organisation à 11h50 (Laurent est repassé à la main).

## Ce que la base impose comme prudence

Scan des 238 liens `EI_SELF` en production (2026-09-08) : **207 alignés**, **31 divergents**, de
quatre natures très différentes :

| Nature | Exemple | Décision |
|---|---|---|
| Vraie société liée en EI_SELF | `Anthony Maietta` ↔ « EVIMERIA » (SAS) | **jamais renommer** |
| Nom de naissance / nom d'usage | `sylvie JEAN-DOAT` ↔ « LOUCHART JEAN-DOAT Sylvie » (EI) | **jamais écraser** — c'est le nom légal |
| Lien manifestement erroné | `Marion Maino` ↔ « Wilfried GILBERT » | signaler, ne pas corriger |
| Variante avec suffixe | `Adrien Monfort` ↔ « ADRIEN MONFORT EI » | signaler |

Un renommage « dès que ça ressemble » casserait les deux premières catégories — la raison sociale
d'un auto-entrepreneur est une donnée **légale** qui figure sur les conventions et les pièces OPCO.

## Règle retenue

Le renommage automatique n'a lieu QUE si la raison sociale actuelle est **exactement** l'ancien nom
de la personne, à la casse, aux accents, à la ponctuation et à l'ordre près (comparaison par
ensemble de mots normalisés). Autrement dit : on ne corrige que ce que l'application avait
elle-même dérivé du nom à la création.

Sinon, deux cas :
- la raison sociale **contient** l'ancien nom de famille → **avertissement** à l'écran (« l'entreprise
  X porte encore l'ancien nom — à vérifier »), aucune écriture ;
- rien à voir → silence.

## Découpage

### Tâche 1 — Module pur `lib/persons/ei-organization-name.ts`

- `personNameKey(first, last)` / `legalNameKey(raw)` — mots normalisés, triés, sans accents.
- `classifyEiRename({ legalName, oldFirst, oldLast })` → `'rename' | 'warn' | 'ignore'`.
- `buildEiLegalName(first, last)` → même format qu'à la création (`Prénom Nom`).
- **verify :** tests couvrant les 4 natures relevées en base + le cas témoin EL GUERTIT.
- **done :** module + tests verts.

### Tâche 2 — Câblage dans `updatePerson`

- Lire `firstName`/`lastName` **avant** l'écriture (aujourd'hui le `select` ne prend que `id`).
- Après l'update, si le nom a changé : parcourir les liens `EI_SELF`, appliquer la règle,
  renommer les organisations concernées, écrire un `AuditLog` `organization.update` par
  renommage (traçabilité : c'est une donnée légale).
- Retourner `{ ok, renamedOrgs: string[], warnings: string[] }` pour l'affichage.
- **verify :** `tsc`, suite complète, lint.
- **done :** corriger un nom corrige l'auto-entreprise dans la même action.

### Tâche 3 — Retour à l'écran

- Le formulaire d'édition affiche un toast de succès enrichi (« L'entreprise HOUSSAIN EL GUERTIT a
  été renommée elle aussi ») et un toast d'avertissement pour les cas à vérifier.
- **done :** Laurent sait ce qui a été touché sans aller vérifier.

## Hors scope (assumé, à dire à Laurent)

- **Les documents déjà générés ne se corrigent pas tout seuls** : un PDF est figé. Après correction
  du nom, il faut régénérer convention et attestation d'assiduité — mais désormais une seule fois,
  puisque les deux sources sont alignées avant la régénération.
- Les 31 divergences existantes ne sont pas nettoyées : plusieurs sont légitimes (nom de naissance,
  vraie société) et les autres relèvent d'une correction de données à faire par Laurent, pas d'un
  script automatique.
