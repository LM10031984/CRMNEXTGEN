# Sortir le dépôt d'iCloud — procédure à valider avant exécution

_Préparée le 11/09/2026. **Rien n'a été déplacé.** Cette page se lit, se corrige,
et ne s'exécute qu'avec ton feu vert explicite._

## Pourquoi, en une ligne

`~/Documents` est synchronisé par iCloud, qui **duplique les fichiers pendant
qu'on les édite** : `tva-exoneration 2.ts` à côté de `tva-exoneration.ts`, byte
pour byte. Constaté le 11/09 : 83 copies, puis **2 nouvelles en quarante
minutes** après les avoir supprimées. Ce n'est pas un incident, c'est un régime
permanent.

Aujourd'hui ça coûte des gates rouges : la garde TVA scanne le disque (pas
l'index git) et `tsc` compile les copies. **Demain ça peut coûter l'historique** :
`.git/` est un répertoire de fichiers comme un autre. Un `pack 2.idx` ou un
`HEAD 2` au mauvais moment n'est pas un test qui tombe.

**Vérifié le 11/09 : `.git/` est encore intact, aucune copie dedans.** C'est une
raison d'agir maintenant, pas de remettre.

## Le piège : trois worktrees pointent en absolu

Un déplacement depuis le Finder les casse tous les trois. Chaque worktree porte
un fichier `.git` qui n'est pas un dossier mais **un pointeur en dur** :

| Worktree | Son fichier `.git` contient |
|---|---|
| `files-assiduite` | `gitdir: /Users/laurentmarx/Documents/CRM Next gen/files/.git/worktrees/files-assiduite` |
| `files-chaine` | `gitdir: /Users/laurentmarx/Documents/CRM Next gen/files/.git/worktrees/files-chaine` |
| `files-signature` | `gitdir: /Users/laurentmarx/Documents/CRM Next gen/files/.git/worktrees/files-signature` |

Et le dépôt principal garde, de son côté, le chemin de chaque worktree dans
`files/.git/worktrees/<nom>/gitdir`. **Les deux sens doivent être réparés.**
`git worktree repair` sait le faire — à condition qu'on le lui demande, et depuis
le bon endroit.

⚠ Un quatrième worktree vit hors de `~/Documents`, dans un répertoire temporaire
(`/private/tmp/claude-501/…/wt-numsecu`, branche `fix/260911-alertes-destinataires`).
Il **ne bouge pas** avec le dépôt, mais son pointeur casse quand même : il devra
être réparé ou retiré. À trancher — il porte peut-être du travail en cours.

## Avant de commencer — les trois conditions

1. **Aucun travail non commité**, dans AUCUN des worktrees. Un déplacement n'est
   pas le moment de découvrir un fichier modifié.
2. **Aucun serveur de dev en marche** (`pnpm dev`), aucun `tsx` en cours, aucun
   éditeur ouvert sur le dépôt. Un processus qui écrit pendant le déplacement
   laisse un état à moitié copié.
3. **La destination est hors des dossiers synchronisés par iCloud** — ni
   `~/Documents`, ni `~/Desktop`. Proposition : `~/dev/crm-next-gen`.
   `~/dev` n'est pas synchronisé par défaut ; à vérifier une fois créé.

```bash
# Condition 1 — doit tout rendre « propre »
for w in "$HOME/Documents/CRM Next gen"/files*; do
  printf '%-20s ' "$(basename "$w")"; git -C "$w" status --porcelain | wc -l
done
```

## La procédure

```bash
BASE="$HOME/Documents/CRM Next gen"
DEST="$HOME/dev/crm-next-gen"

# 0 · Filet : on sait où c'était, et on peut revenir.
mkdir -p "$HOME/dev"

# 1 · Déplacer les quatre répertoires ENSEMBLE, en une fois.
#     Les worktrees doivent rester frères du dépôt principal pour que la
#     réparation retrouve tout le monde.
mv "$BASE" "$DEST"

# 2 · Réparer les pointeurs, DEPUIS le dépôt principal, en nommant chaque
#     worktree. `repair` sans argument ne répare que le sens dépôt → worktree.
cd "$DEST/files"
git worktree repair "$DEST/files-assiduite" "$DEST/files-chaine" "$DEST/files-signature"

# 3 · Vérifier que chacun retrouve son .git — c'est le test qui compte.
for w in "$DEST"/files-*; do
  printf '%-20s ' "$(basename "$w")"
  git -C "$w" rev-parse --git-dir >/dev/null 2>&1 && echo "OK — $(git -C "$w" branch --show-current)" || echo "❌ CASSÉ"
done
git -C "$DEST/files" worktree list
```

## Ce qu'il faut remettre d'aplomb après

| Quoi | État constaté le 11/09 |
|---|---|
| `.env` / `.env.local` | **aucun chemin absolu** — rien à faire (vérifié) |
| `packages/db/scripts/import-veille-from-xlsx.ts` | contient un chemin absolu vers un classeur — **à corriger** |
| `docs/PROGRESS.md` et ~8 plans `.planning/` | mentions historiques du chemin — **cosmétique**, ne rien casser à les laisser |
| Éditeur (VS Code / Cursor) | rouvrir depuis le nouveau chemin ; les espaces de travail enregistrés pointent l'ancien |
| Terminal, onglets ouverts | `cd` obsolète — rouvrir |
| Sessions Claude Code | le répertoire de travail change ; les commandes `.claude/` suivent le dépôt, rien à modifier |
| Docker | les bases tournent dans des volumes nommés, **indépendants du chemin** — rien à faire |
| `node_modules` | suivent le déplacement ; si un binaire se plaint d'un chemin, `pnpm install` suffit |

```bash
# Le seul chemin absolu qui compte, à ajuster après le déplacement
grep -rn "Documents/CRM Next gen" packages/db/scripts/import-veille-from-xlsx.ts
```

## Comment revenir si ça tourne mal

```bash
mv "$HOME/dev/crm-next-gen" "$HOME/Documents/CRM Next gen"
cd "$HOME/Documents/CRM Next gen/files"
git worktree repair "$HOME/Documents/CRM Next gen"/files-*
```

Le déplacement ne touche **aucun commit** : l'historique voyage avec les
fichiers. Le pire cas est un pointeur cassé, et il se répare par la même
commande dans l'autre sens.

## Et si tu préfères ne pas déplacer

L'alternative est de **décocher « Dossiers Bureau et Documents » dans Réglages →
iCloud → iCloud Drive**. C'est plus simple, mais ça porte plus loin : tous tes
documents cessent d'être synchronisés, pas seulement le dépôt. À toi de voir ce
qui te gêne le moins — c'est une décision sur ton poste, pas sur le projet.

En attendant l'un ou l'autre, le pansement reste :

```bash
find apps packages -name "* [2-9].*" -not -path "*/node_modules/*" -delete
```
