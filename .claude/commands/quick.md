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

## 4. Migrations

**`prisma db push` est INTERDIT** — sur `qualiof_test` comme sur n'importe quelle
base (règle Laurent, 2026-09-10), y compris « juste pour aligner la base de test
avant de lancer les tests ». Une seule voie :

```
pnpm --filter @qualiof/db exec prisma migrate dev --name <slug>   # créer
pnpm --filter @qualiof/db exec prisma migrate deploy              # appliquer
```

Pourquoi : `db push` écrit le schéma dans la base **sans laisser de migration**.
L'historique et la base divergent alors en silence, et la production ne reçoit
jamais le changement — le déploiement rejoue `migrations/`, pas le schéma. On ne
s'en aperçoit qu'au premier `P2022` en prod, sur une colonne qui n'existe que sur
la machine où le `db push` a été lancé. Le chemin réellement utilisé en production
(`migrate deploy`, lancé par `.github/workflows/deploy.yml` à chaque push `main`)
n'est alors jamais exercé avant d'atteindre Supabase.

Aggravant : `db push` réclame `--accept-data-loss` dès qu'une contrainte se
resserre, et le réflexe est de l'ajouter pour « débloquer ». C'est une destruction
silencieuse que personne ne relit.

Ce que cette règle n'interdit pas : `prisma generate`, qui ne touche aucune base
(il ne fait que régénérer le client TypeScript).

Toute migration créée doit être appliquée (`migrate deploy`) avant d'écrire dans
la base depuis une branche en avance — sinon l'`INSERT` part avec les défauts
d'enum de la base, pas ceux du schéma.

- La migration générée se **commit avec le code** qui en dépend, jamais après.
- Base de test repartie de zéro : `prisma migrate reset`, qui rejoue l'historique —
  c'est justement ce qu'on veut vérifier.
- Ne jamais pointer une commande Prisma sur `DATABASE_URL` depuis le poste : c'est
  Supabase de production. Les migrations partent par la CI, pas à la main.

## 5. Gates — les trois, dans cet ordre

```
pnpm lint
pnpm --filter @qualiof/web exec tsc --noEmit
pnpm test
```

Aucun commit de fin sans les trois verts. Si un test échoue et qu'il échouait
déjà avant ta modif, dis-le explicitement et consigne-le dans
`.planning/*/deferred-items.md` — ne le « répare » pas au passage.

## 6. Rendre compte

Trois lignes : ce qui change pour l'utilisateur, ce qui a été mis de côté, ce
qu'il reste à vérifier à la main.
