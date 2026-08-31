---
description: Prépare une livraison de code QualiOF sans écraser le travail fait entre-temps (règle anti-collision de snapshot) et passe les gates
argument-hint: "[branche cible ou rien pour la courante]"
allowed-tools: Bash(git *) Bash(pnpm *) Read Grep Glob Edit
---

# Livraison — $ARGUMENTS

## La leçon qui a motivé cette commande (12/08/2026)

Un audit avait produit des **fichiers entiers** sur un snapshot de 15h20.
Entre-temps, le commit `9265b33` (17h48) avait retouché `invoices.ts`. Livrer
les fichiers entiers aurait effacé `composeLieu`, `composeFormateur`,
`MODALITE_LABEL` et `renderInvoiceFooterHtml` sans que rien ne le signale.
Le vrai delta faisait deux lignes.

**Règle : on livre des diffs contre la base du snapshot, jamais des fichiers entiers.**

## 1. Vérifier la dérive — sur TOUS les fichiers livrés

```
git log --since="<heure du snapshot>" --oneline -- <chacun des fichiers>
```

Pas seulement le dernier commit, pas seulement le fichier principal. Si un
fichier a bougé : rejoue **uniquement** le delta réel sur la version actuelle.

## 2. État de l'arbre

```
git status --short
git log --oneline -10
git branch --show-current
```

Attention : ce dépôt porte plusieurs branches `worktree-agent-*` et une branche
`cloud-migration` en avance sur `main`. Vérifie sur quoi tu es avant de commiter.

## 3. Gates

```
pnpm lint
pnpm --filter @qualiof/web exec tsc --noEmit
pnpm test
```

Les trois verts, ou pas de livraison. Si un échec préexiste à ta modif :
prouve-le (`git stash` puis re-run) et consigne-le, ne le corrige pas au passage.

## 4. Commits

Convention du dépôt : `type(scope): sujet en français`, avec le slug de tâche
quand il existe (`feat(260828-lieu): ...`). En TDD, deux commits : `test(...): …
— tests RED` puis `feat(...)`/`fix(...)`.

## 5. Rappels prod

- Migration Prisma vers le cloud : `prisma migrate deploy`, **jamais** `db push`.
- PR `cloud-migration` → `main` : **merge commit**, jamais squash (un squash a
  déjà fait diverger les deux branches).
- Ne jamais poser une variable d'env sensible via stdin CLI Vercel sans newline
  (valeurs vides silencieuses) — API REST + vérification de longueur après pose.
- Aucun secret dans le diff : `git diff | rg -i 'api[_-]?key|secret|password|refresh_token'`.
