# Sortir le dépôt d'iCloud — procédure complète, à valider avant exécution

_Préparée le 11/09/2026, mise à jour après ta décision de **déplacer le dépôt**
plutôt que de décocher iCloud. **Rien n'a été déplacé.** Cette page se lit, se
corrige, et ne s'exécute qu'avec ton feu vert._

## Pourquoi

`~/Documents` est synchronisé par iCloud, qui **duplique les fichiers pendant
qu'on les édite** : `tva-exoneration 2.ts` à côté de `tva-exoneration.ts`, byte
pour byte. Constaté le 11/09 : 83 copies, puis **2 nouvelles en quarante
minutes** après les avoir supprimées. Ce n'est pas un incident, c'est un régime
permanent.

Aujourd'hui ça coûte des gates rouges — la garde TVA scanne le disque, `tsc`
compile les copies. **Demain ça peut coûter l'historique** : `.git/` est un
répertoire de fichiers comme un autre, et un `pack 2.idx` au mauvais moment n'est
pas un test qui tombe. Vérifié le 11/09 : `.git/` est **encore** intact.

---

## ⛔ Un bloquant avant tout le reste

Le dépôt principal n'est **pas propre** :

| Worktree | Branche | État |
|---|---|---|
| **`files`** | `quick/260902-diagnostic-boucle` | ⛔ **31 fichiers modifiés · 1 commit non poussé** |
| `files-assiduite` | `quick/260910-pilotage` | ✅ propre, tout poussé |
| `files-chaine` | `chore/260911-scripts-sous-tsc` | ✅ propre, tout poussé |
| `files-signature` | `feat/signature-docs-signes` | ✅ propre, tout poussé |
| `wt-numsecu` | `fix/260911-alertes-destinataires` | ✅ propre, tout poussé |

**Un déplacement n'est pas le moment de découvrir un fichier modifié.** Il faut
d'abord committer ou ranger ces 31 fichiers, et pousser le commit en attente.
C'est ton travail en cours sur `files` — je n'y touche pas.

```bash
cd "$HOME/Documents/CRM Next gen/files"
git status          # regarder ce que sont ces 31 fichiers
git push            # le commit qui attend
```

---

## Ce qui est déjà vérifié, et qui ne posera pas de problème

J'ai contrôlé chaque point avant d'écrire la procédure :

| Point | Constat du 11/09 |
|---|---|
| **Fichiers évincés vers le cloud** | **0 placeholder `.icloud`** — tout est bien téléchargé en local. Rien ne sera déplacé « à vide ». |
| `.env` et `.env.local` | **aucun chemin absolu** — rien à corriger |
| Commandes `.claude/` | **aucun chemin absolu** — elles suivent le dépôt |
| Configuration d'éditeur | **aucune dans le dépôt** (ni `.vscode`, ni `.idea`, ni `.code-workspace`) |
| Docker | bases dans des **volumes nommés**, indépendants du chemin — rien à faire |
| Chemin absolu dans le code | **un seul**, et c'est un **commentaire** (`import-veille-from-xlsx.ts:23`) |

Le seul vrai piège est ailleurs : les worktrees.

---

## Le piège : quatre worktrees pointent en absolu

Un déplacement depuis le Finder les casse tous. Chaque worktree porte un fichier
`.git` qui n'est pas un dossier mais **un pointeur en dur** vers
`…/files/.git/worktrees/<nom>`. Et le dépôt principal garde symétriquement le
chemin de chaque worktree. **Les deux sens doivent être réparés**, et
`git worktree repair` sait le faire — à condition qu'on le lui demande.

⚠ **Le quatrième worktree ne bouge pas avec les autres.** `wt-numsecu` vit dans
un répertoire temporaire (`/private/tmp/claude-501/…`). Il reste où il est, mais
son pointeur casse quand même, puisqu'il désigne l'ancien emplacement du dépôt
principal. La procédure le répare aussi.

Sa branche est **poussée** : si tu préfères t'en débarrasser plutôt que de le
réparer, rien n'est perdu — et `/private/tmp` est de toute façon vidé au
redémarrage.

---

## Destination proposée

```
~/dev/crm-next-gen
```

Ton dossier personnel, hors `Documents` et hors `Bureau`, donc hors de toute
synchronisation iCloud. `~/dev` n'est pas synchronisé par défaut — la procédure
le vérifie quand même après coup.

**Le nom perd son espace et ses majuscules, et c'est délibéré** : un chemin avec
espace oblige à des guillemets partout et casse régulièrement des scripts écrits
un peu vite. Si tu préfères la stricte équivalence, remplace par
`~/dev/CRM Next gen` — tout le reste de la procédure fonctionne à l'identique.

---

## La procédure

### 1 · Avant de toucher à quoi que ce soit

```bash
BASE="$HOME/Documents/CRM Next gen"

# a) Tout est propre et poussé, dans les CINQ répertoires ?
for w in "$BASE"/files "$BASE"/files-*; do
  printf '%-22s %-34s %s modif · %s non poussé(s)\n' \
    "$(basename "$w")" "$(git -C "$w" branch --show-current)" \
    "$(git -C "$w" status --porcelain | wc -l | tr -d ' ')" \
    "$(git -C "$w" log --oneline '@{u}..' 2>/dev/null | wc -l | tr -d ' ')"
done
# → tout doit afficher « 0 modif · 0 non poussé(s) »

# b) Aucun fichier resté dans le cloud
find "$BASE" -name ".*.icloud" -not -path "*/node_modules/*" | wc -l
# → doit afficher 0

# c) iCloud a fini de synchroniser
#    Dans le Finder, sur le dossier : aucune icône de nuage ni de progression.
```

**Et fermer tout ce qui tient le dépôt** : serveurs `pnpm dev`, scripts `tsx`,
éditeurs, onglets de terminal, sessions Claude Code. Un processus qui écrit
pendant le déplacement laisse un état à moitié copié.

### 2 · Déplacer

```bash
BASE="$HOME/Documents/CRM Next gen"
DEST="$HOME/dev/crm-next-gen"

mkdir -p "$HOME/dev"
mv "$BASE" "$DEST"
```

Les cinq répertoires bougent **ensemble, en une fois** : les worktrees doivent
rester frères du dépôt principal pour que la réparation les retrouve. Le
déplacement est un simple renommage sur le même disque — instantané, même pour
6,3 Go.

### 3 · Réparer les pointeurs

```bash
cd "$DEST/files"

# Depuis le dépôt principal, en NOMMANT chaque worktree — y compris celui
# resté dans /private/tmp, dont le pointeur désigne encore l'ancien chemin.
git worktree repair \
  "$DEST/files-assiduite" \
  "$DEST/files-chaine" \
  "$DEST/files-signature" \
  "/private/tmp/claude-501/-Users-laurentmarx-Documents-CRM-Next-gen/89c7f72f-68b3-42ba-a244-6a3fb968c424/scratchpad/wt-numsecu"
```

### 4 · Vérifier — c'est l'étape qui compte

```bash
DEST="$HOME/dev/crm-next-gen"
WTMP="/private/tmp/claude-501/-Users-laurentmarx-Documents-CRM-Next-gen/89c7f72f-68b3-42ba-a244-6a3fb968c424/scratchpad/wt-numsecu"

for w in "$DEST"/files "$DEST"/files-* "$WTMP"; do
  [ -d "$w" ] || continue
  printf '%-22s ' "$(basename "$w")"
  if git -C "$w" rev-parse --git-dir >/dev/null 2>&1; then
    echo "OK — branche $(git -C "$w" branch --show-current)"
  else
    echo "❌ CASSÉ"
  fi
done

git -C "$DEST/files" worktree list
```

Chacun des cinq doit répondre **OK** avec **la branche du tableau plus haut**.
Un worktree qui retrouve son `.git` mais pas sa branche n'est pas réparé — c'est
le signe qu'on regarde le mauvais répertoire.

### 5 · Confirmer qu'on est bien sorti d'iCloud

```bash
# Plus aucune copie ne doit réapparaître après quelques minutes de travail
find "$HOME/dev/crm-next-gen" -name "* [2-9].*" -not -path "*/node_modules/*" | wc -l
# → 0, et il doit RESTER à 0 (c'est ça, le vrai test)

brctl status 2>/dev/null | grep -ci "dev/crm-next-gen"
# → 0 : le nouveau chemin n'est pas connu d'iCloud
```

### 6 · Le seul chemin absolu du code

```bash
cd "$HOME/dev/crm-next-gen/files-chaine"
grep -n "Documents/CRM Next gen" packages/db/scripts/import-veille-from-xlsx.ts
```

C'est un **commentaire d'exemple d'usage**, pas du code exécuté — l'import prend
son classeur en argument. Rien ne casse si on l'oublie, mais autant le corriger
pendant qu'on y est, pour que l'exemple reste juste.

### 7 · Remettre d'aplomb ce qui est hors du dépôt

| Quoi | Ce qu'il faut faire |
|---|---|
| Éditeur (VS Code / Cursor) | rouvrir depuis le nouveau chemin ; les espaces de travail enregistrés pointent l'ancien |
| Onglets de terminal | leurs `cd` sont obsolètes — les rouvrir |
| `node_modules` | ils suivent le déplacement ; si un binaire se plaint d'un chemin, `pnpm install` suffit |
| Alias, scripts perso, Raccourcis | tout ce qui contient `Documents/CRM Next gen` |

```bash
# Pour balayer large sur ton poste
grep -rl "Documents/CRM Next gen" ~/.zshrc ~/.zprofile ~/.config 2>/dev/null
```

---

## Comment revenir si ça tourne mal

```bash
mv "$HOME/dev/crm-next-gen" "$HOME/Documents/CRM Next gen"
cd "$HOME/Documents/CRM Next gen/files"
git worktree repair "$HOME/Documents/CRM Next gen"/files-*
```

Le déplacement ne touche **aucun commit** : l'historique voyage avec les
fichiers, et tout est poussé sur GitHub de toute façon. Le pire cas est un
pointeur cassé, et il se répare par la même commande dans l'autre sens.

---

## ⚠️ À faire en dernier, et à ne pas oublier

**Le dossier devra être reconnecté dans l'application Claude.** Son chemin a
changé, et l'app continue de désigner `~/Documents/CRM Next gen` — elle ne
trouvera plus rien, ou pire, retrouvera un dossier vide au même endroit.

Dans Claude : retirer l'ancien dossier de la liste des projets, puis ajouter
`~/dev/crm-next-gen`. Les commandes `.claude/` et la mémoire du projet suivent
les fichiers — il n'y a rien à recopier, seulement à repointer.
