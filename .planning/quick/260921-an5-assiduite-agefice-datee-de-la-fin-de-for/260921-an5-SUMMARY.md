---
quick_id: 260921-an5
description: Assiduité AGEFICE datée de la fin de formation, jamais du jour d'édition
date: 2026-09-21
status: livré
---

# Quick 260921-an5 — Résumé

## Ce qui a changé

**Une ligne**, `apps/web/src/server/actions/agefice-attendance-generator.ts` :

```diff
-    dateDelivrance: new Date(),
+    dateDelivrance: participant.session.endDate,
```

accompagnée du motif en commentaire, pour que la prochaine lecture du fichier n'ait pas
à redécouvrir pourquoi l'horloge est interdite ici.

**Quatre tests**, `apps/web/src/server/actions/__tests__/agefice-assiduite-date.test.ts` :

| Cas | Ce qu'il empêche |
|---|---|
| Éditée trois mois après la fin | La pièce qui atteste d'une assiduité après les faits |
| Rééditée un autre jour | Deux exemplaires du même document à deux dates |
| Éditée par anticipation | La pièce datée d'avant le dernier jour de formation |
| Règlement et fin de formation | Que les deux dates du PDF divergent |

## Portée réelle

`generateAgeficeAttendanceForParticipant` est le SEUL producteur d'attestation
d'assiduité. Ses quatre appelants — `dispatch-generate-doc`, `closure-pack`,
`qualiopi-matrix`, `signature-relacher` — passent tous par la ligne corrigée : aucun
autre chemin ne restait à traiter.

## Vérifications

- 4/4 nouveaux tests verts ; les 516 tests de `src/server/actions/__tests__` passent,
  sauf 4 échecs **préexistants** (`dispatch-generate-doc.analyse-besoin`,
  `invoices-lines-contract`), vérifiés en mettant le correctif de côté — ils échouent
  aussi sans lui.
- Test de puissance : remettre `new Date()` fait virer 3 des 4 tests au rouge.
- ESLint propre sur les deux fichiers.
- `tsc --noEmit` : 27 erreurs, toutes préexistantes et situées dans les fichiers
  signature/email (client Prisma local non régénéré), aucune dans les fichiers touchés.

## Ce qui reste à faire, côté données

- **Les assiduités déjà émises gardent leur mauvaise date.** Le générateur supprime et
  recrée le `Document` à chaque appel : un clic « régénérer » par dossier concerné.
- **SES-0111 (« Du surfeur au pilote — Étape 2 »)** : la base la donne du **28 au 29
  septembre**, avec des créneaux 9h-13h et 14h-18h les deux jours. L'assiduité sera donc
  datée du **29/09**. Laurent annonce une fin au 28 — si c'est le cas, ce sont la date de
  fin de la session et les créneaux du 29 qu'il faut corriger, pas le générateur.

## Hors périmètre, assumé

La demande de prise en charge AGEFICE et la convocation restent datées du jour : elles
précèdent la formation, leur date d'édition est la bonne.
