---
description: Exécute une tâche courte QualiOF en TDD RED→GREEN avec tous les garde-fous du projet (tenantId, AuditLog, revalidatePath, gates)
argument-hint: "[description de la tâche]"
allowed-tools: Bash(pnpm *) Bash(git *) Read Edit Write Grep Glob
---

# Quick task — $ARGUMENTS

Workflow court du projet. Pas de phase GSD, mais les mêmes garde-fous.

## 1. Cadrer (avant d'écrire une ligne)

- Reformule la tâche en une phrase et en **un critère observable** (« la modale
  affiche X », « la facture porte Y »). Si tu ne sais pas l'observer, tu ne sais
  pas la finir.
- Cherche la surface existante avant d'en créer une : ce projet a déjà beaucoup
  de chemins d'écriture. Une nouvelle server action qui double une existante est
  une régression, pas une feature (cf. friction F-01 : un doc affiché 4 fois,
  personne ne sait laquelle fait foi).
- Si la tâche touche facturation ou dossiers OPCO : relis
  `settleInvoiceForParticipant` dans `dossiers-opco.ts` **avant** (règle métier
  en attente d'arbitrage — ne reverse rien au dé-toggle).

## 2. RED

Écris le(s) test(s) qui échouent. Commit `test(<slug>): ... — tests RED`.
Vitest, à côté du code (`__tests__/`). Pas de test qui passe déjà.

## 3. GREEN

Implémente le minimum. Commit `feat(<slug>):` ou `fix(<slug>):`.

### Checklist non négociable pour toute server action

- [ ] `requireRole([...])` en tête, avec le bon niveau (ADMIN/MANAGER pour les
      champs structurants, +COMMERCIAL pour l'opérationnel)
- [ ] **Toute** requête scopée `tenantId` — y compris les `findFirst` de contrôle
- [ ] Validation Zod **avant** tout I/O, schéma dans `packages/shared/src/schemas/`
      (source unique — pas de duplication de règle côté client)
- [ ] Diff `before`/`after` + `AuditLog` dans la **même transaction** que l'écriture
- [ ] No-op si rien n'a changé (pas d'AuditLog vide)
- [ ] `revalidatePath` sur **toutes** les pages qui lisent la donnée, pas juste
      celle d'où vient le clic
- [ ] Retour `{ ok: true } | { ok: false, error }` — jamais de throw pour une
      erreur métier attendue
- [ ] `Decimal` : comparer via `Number()`, sinon l'égalité est toujours fausse
- [ ] Email : passer `context: { tenantId, category, sessionId? }` au mailer
      (le type l'exige, c'est le filet exhaustivité tsc)

### Migrations

**`prisma db push` est INTERDIT — sur toutes les bases, y compris `qualiof_test`
en CI. Une évolution de schéma passe par `prisma migrate dev`, point.**
(Décision Laurent, 10/09/2026.)

Pourquoi cette interdiction, et pas seulement « en prod » : `db push` aligne une
base sur le schéma **sans écrire de migration**. La base obtenue est donc juste,
et l'historique de migrations, lui, ne l'est plus — il peut manquer un objet
sans que rien ne le signale. Une CI qui vérifie sur une base poussée par
`db push` valide le schéma contre lui-même : elle ne peut structurellement pas
voir l'écart. C'est ainsi que l'index GIN `AgeficePointAccueil.departmentsServed`
a vécu deux jours en base sans exister au schéma (constat du 10/09) — le premier
`migrate dev` venu l'aurait supprimé en silence.

- Nouvelle migration : `pnpm --filter @qualiof/db run db:migrate:local`
  (`migrate dev` sur `.env.local`). Nom explicite, migration **additive**.
- Environnement non interactif (agent, CI) où `migrate dev` refuse de tourner :
  générer le SQL avec `prisma migrate diff --from-migrations
  --to-schema-datamodel --script`, écrire le dossier de migration à la main,
  puis `migrate deploy`. Jamais `db push` comme raccourci.
- Prod : `prisma migrate deploy`, **jamais** `db push`, jamais `migrate dev`.
- Avant de livrer : `pnpm --filter @qualiof/db run check:schema` doit être vert
  (base jetable, migrations rejouées pour de vrai, diff VIDE). Ce garde tourne
  aussi en CI — s'il rougit, c'est le schéma ou la migration qui ment, pas lui.

## 4. Gates — les trois, dans cet ordre

```
pnpm lint
pnpm --filter @qualiof/web exec tsc --noEmit
pnpm test
```

Aucun commit de fin sans les trois verts. Si un test échoue et qu'il échouait
déjà avant ta modif, dis-le explicitement et consigne-le dans
`.planning/*/deferred-items.md` — ne le « répare » pas au passage.

## 5. Rendre compte

Trois lignes : ce qui change pour l'utilisateur, ce qui a été mis de côté, ce
qu'il reste à vérifier à la main.
