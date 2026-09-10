---
quick_id: 260910-iqq
phase: quick/260910-iqq
plan: 01
subsystem: facturation / conformité comptable
tags: [factures, numerotation, chronologie, audit, lecture-seule, prisma, tdd, qualiopi]
requires:
  - "@qualiof/db (prisma.tenant, prisma.invoice — findMany uniquement)"
  - ".planning/specs/2026-09-10-datation-numerotation-factures.md (§4 l'invariante, §5 l'état des lieux, §7 lot A)"
provides:
  - "apps/web/scripts/audit-invoice-chronology.ts — inventaire lecture seule des ruptures de chronologie"
  - "parseSequenceNumber / diffInDays / auditSequence / auditTenant — helpers purs, exportés, testés"
  - "pnpm invoices:audit-chronology — la commande que Laurent lance depuis son poste"
affects:
  - "lot B (corriger pour l'avenir) : réutilisera l'invariante mesurée ici pour le test de numérotation"
  - "lot C (historique) : ne démarre pas tant que le rapport n'a pas été soumis à l'expert-comptable (D-1)"
  - "mail à Lagean (spec §6) : la phrase « X ruptures sur N pièces » vient de ce script"
tech-stack:
  added: []
  patterns:
    - "Un script d'audit qui tourne sur la production est lecture seule par PROPRIÉTÉ vérifiable au grep, pas par intention"
    - "Refuser --apply bruyamment plutôt que l'ignorer silencieusement, quand les scripts voisins en ont un"
    - "Helpers de détection purs + garde isMain : le test unitaire importe sans jamais ouvrir de connexion"
    - "Un rapport destiné à un tiers ne rend pas de verdict sur ce qu'il n'a pas pu ordonner"
key-files:
  created:
    - apps/web/scripts/audit-invoice-chronology.ts
    - apps/web/scripts/__tests__/audit-invoice-chronology.test.ts
  modified:
    - apps/web/package.json
key-decisions:
  - "Lecture seule sans échappatoire : aucune primitive d'écriture Prisma, et --apply fait sortir en 1 avec un message"
  - "Le préfixe est lu sur le numéro, pas déduit de Tenant.invoicePrefix : une pièce au préfixe abandonné reste dans le périmètre"
  - "Tri sur la valeur numérique, pas lexicographique : le zero-padding à 6 chiffres n'est pas un contrat"
  - "Comparaison en jours calendaires (minuit UTC) : deux pièces du même jour ne sont pas une rupture"
  - "Une pièce sans issueDate est comptée à part et la chaîne enjambe : jamais de rupture fantôme"
  - "Inventaire, pas gate : sortie 0 même avec des ruptures"
metrics:
  tasks: 2
  commits: 3
  tests_added: 12
  duration_min: 25
---

# Quick 260910-iqq — Lot A : l'instrument de mesure des ruptures de chronologie

**Terminé :** 2026-09-10
**Branche :** `feat/facture-electronique-lot1`
**Commits :** `7148c45`, `c7dd855`, `cb28e90`

## Ce que ça règle

Le numéro de facture est attribué à l'instant du clic ; la date d'émission vient
de la fin de prestation (`resolveInvoiceIssueDate`, décision du 13/08/2026). Deux
horloges. Facturer en septembre une session de juin produit `FAC-000021` daté du
12 juin juste après `FAC-000020` daté du 3 septembre.

L'effet de bord était **assumé et documenté** dans `invoice-dates.ts`. Ce qui ne
l'était pas, c'est son coût de conformité — et surtout son **volume**. La spec §5
le dit : 31 pièces au parc, et personne ne sait combien sont en rupture.

Ce lot ne corrige rien. Il livre l'instrument qui permettra de le dire, et de le
dire à un tiers : le rapport part chez l'expert-comptable avec la question du §6.

## Ce qui a été fait

### 1. Ce qu'une rupture doit être — `7148c45` (RED) puis `c7dd855` (GREEN)

Douze tests avant une ligne d'implémentation. Le cas de la spec en est un, au
chiffre près : `FAC-000021` daté du 12/06 et créé le 10/09, après `FAC-000020`
daté du 03/09 → une rupture, **83 jours de recul**, **90 jours d'antidatation**.

Trois choix de conception, chacun payé par un test, chacun là pour empêcher
l'inventaire de mentir :

- **Le préfixe est lu sur le numéro**, pas déduit de `Tenant.invoicePrefix`.
  Une pièce historique portant un préfixe qui n'est plus celui configuré doit
  apparaître dans le rapport, pas disparaître du périmètre. Les préfixes du
  tenant servent à **nommer** les séquences, pas à les délimiter.
- **Tri sur la valeur numérique.** Le zero-padding à 6 chiffres rend aujourd'hui
  le tri lexicographique équivalent — mais ce n'est pas un contrat. Un `FAC-9`
  non padé suffirait à faire passer `FAC-000010` avant lui et à inventer une
  rupture. Test dédié.
- **Comparaison en jours calendaires**, les deux bornes ramenées à minuit UTC.
  Sans ça, deux factures émises le même jour à 9 h et à 16 h deviendraient une
  rupture — et le rapport se remplirait de faux positifs le jour d'une
  facturation en série.

Deux règles de robustesse : une pièce sans `issueDate` est comptée à part et la
chaîne **enjambe** (le suivant se compare au dernier numéro inférieur *portant
une date*) ; un numéro qu'on ne sait pas ordonner est mis de côté, jamais
inventé.

Le curseur avance à **chaque** pièce datée, y compris après une rupture :
l'invariante du §4 porte sur des couples consécutifs, pas sur un maximum courant.
Sinon une seule facture antidatée ferait apparaître en rupture toutes celles qui
la suivent, et le chiffre envoyé à Lagean serait faux par excès.

### 2. Le rapport, la CLI, la commande — `cb28e90`

```
pnpm invoices:audit-chronology
pnpm invoices:audit-chronology --tenant=<uuid>
```

Une section par séquence (factures, avoirs, séquence hors paramétrage), un
tableau des ruptures avec le numéro fautif **et son prédécesseur** — sans le
prédécesseur, un rapport de rupture ne se relit pas. Deux écarts, parce que les
deux parlent : *Antidatée de* (`createdAt − issueDate`, de combien la pièce est
datée en arrière de son établissement réel) et *Recul / préc.*
(`issueDate(n-1) − issueDate(n)`, l'amplitude de la rupture).

Le résumé se termine par la phrase chiffrée **« X ruptures sur N pièces »**,
recopiable telle quelle dans la question du §6.

## Le garde-fou, parce que ce script tourne sur la production

`DATABASE_URL` de la racine pointe le pooler Supabase et il n'y a pas de
`.env.local` dans ce worktree : **toute exécution est une lecture de prod**.

- Aucune primitive d'écriture Prisma dans le fichier. Ce n'est pas une intention,
  c'est une propriété vérifiée au grep, dans le plan et avant chaque commit.
- Pas de mode `--apply`. Les scripts voisins (`audit-pricing-overrides.ts`,
  `backfill-invoice-lines.ts`) en ont un, donc la main le tapera. Passé, il fait
  **sortir en 1 avec un message** plutôt que d'être ignoré en silence.
- Sortie 0 quoi qu'il arrive côté ruptures : c'est un inventaire, pas une gate.

## Deux défauts trouvés en regardant la sortie, pas les tests

Corrigés dans `cb28e90`, avant commit — ils ne cassaient rien mais rendaient
illisible la pièce même qui doit partir chez un tiers.

1. **Le seau « numéros hors format » annonçait « ✓ Aucune rupture : les dates
   suivent les numéros ».** C'est un verdict de chronologie rendu sur des numéros
   dont on ignore précisément l'ordre. Il n'affiche plus que ce qu'il sait : la
   liste des pièces non ordonnables.
2. **Un nom de séquence long débordait sa colonne** et décalait toute la ligne du
   résumé. Les cellules tronquent désormais à la largeur de colonne.

## Vérification

| Gate | Résultat |
|---|---|
| Garde-fou lecture seule (grep) | aucune primitive d'écriture |
| `pnpm --filter @qualiof/web test scripts/__tests__/audit-invoice-chronology.test.ts` | 12/12 |
| `pnpm lint` | 3/3 tâches, 2 warnings préexistants sans rapport |
| `pnpm --filter @qualiof/web exec tsc --noEmit` | **0 erreur hors `.next/`** |
| `pnpm test` (suite complète) | 242 fichiers, 2252 tests, 2 skipped |

**Bout en bout joué sur la base locale `qualiof_test`**, jamais sur la
production : jeu d'essai de neuf pièces (une rupture `FAC-`, une séquence `DEV-`
hors paramétrage, un avoir, une pièce sans date, un numéro hors format), rapport
imprimé et relu ligne à ligne, jeu d'essai effacé ensuite. Les 83 j / 90 j du cas
de la spec sortent bien à l'écran.

Le bruit `tsc` préexistant (2 erreurs dans `.next/types/link.d 2.ts`, artefacts
dupliqués par le Finder) est inchangé et hors périmètre — mesuré identique avant
et après.

## Ce que ce lot ne fait pas

- `invoice-dates.ts`, `numbering.ts`, le gabarit de facture, les server actions
  et l'UI ne sont **pas** touchés. La règle de datation reste celle du 13/08.
- Aucun test d'invariante sur la fonction de numérotation : c'est le lot B.
- Aucune régularisation, aucun avoir, aucune renumérotation. Le lot C n'existe
  pas tant que **D-1 n'est pas tranchée par Lagean**.

## Ce qu'il reste à faire à la main

1. Lancer depuis le poste de Laurent, en redirigeant la sortie :
   `pnpm --filter @qualiof/web invoices:audit-chronology > audit-chronologie-2026-09-10.txt`
2. Joindre ce fichier à la question du §6 posée à Lagean.
3. Attendre sa réponse **écrite** avant d'ouvrir le lot C.

Le lot B peut démarrer sans attendre : il ne dépend que du lot A et du lot 1
e-invoicing, déjà mergé.

## Auto-vérification : PASSÉE

Fichiers annoncés présents sur le disque, commits annoncés présents dans
l'historique, `invoices:audit-chronology` présent dans `apps/web/package.json`.
