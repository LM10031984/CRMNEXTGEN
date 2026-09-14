# Items ouverts — navigation de chapitre (14/09/2026)

## ① La CAUSE reste ouverte : les server actions en file

**Statut : non corrigé, délibérément. Le correctif du 14/09 borne le SYMPTÔME.**

> Un symptôme qui disparaît n'est pas une cause qui se referme.

### Ce qui est établi

`goTo` (`chapter-workspace.tsx`) déclenche `recomputeDiagnosticSnapshot` à
**chaque** changement de chapitre, et `onTeamChanged` en déclenche un de plus
**plus un `router.refresh()`** à chaque modification de la grille équipe —
grille qui n'existe qu'au chapitre 2.

Next.js App Router **sérialise les server actions** (une requête à la fois, pour
préserver l'ordre des revalidations). Si c'est bien le cas ici, les
`saveDiagnosticAnswer` poussés par `flushNow` au chapitre 4 font la queue
derrière les recalculs lancés depuis le 2, et la dette s'accumule chapitre après
chapitre.

**Ce que ça donne après le correctif** : le commercial n'est plus bloqué — mais
ses enregistrements peuvent rester **en retard d'un chapitre**. Invisible, sauf
si on le mesure.

### Le critère — ce qu'il faut mesurer pour trancher

Pendant un R1 réel, arrivé au chapitre 4, onglet **Réseau** des outils du
navigateur, filtre `Fetch/XHR`, méthode `POST` :

1. **Combien de requêtes sont en vol** (statut `pending`) au moment du clic ?
2. **Combien d'entre elles sont des `recomputeDiagnosticSnapshot`** plutôt que
   des `saveDiagnosticAnswer` ?
3. **Partent-elles en parallèle ou l'une après l'autre ?** C'est ce qui confirme
   ou infirme la sérialisation. Regarder la colonne *Waterfall* : des barres qui
   se suivent bout à bout = file ; des barres qui se chevauchent = parallèle.

Seuil d'alerte : **plus d'un recompute en vol** signifie que le recalcul est
lancé plus souvent qu'il n'est consommé.

### La question de conception, à trancher avant tout correctif

**Pourquoi un recalcul de synthèse doit-il être synchrone avec la navigation ?**

Le snapshot serveur nourrit le rapport d'audit et les synthèses. Rien n'exige
qu'il soit à jour à l'instant où le commercial change d'écran — il doit l'être
**quand on lit le rapport**.

Trois pistes, à arbitrer (aucune n'est écrite) :

| Piste | Ce que ça change | Risque |
|---|---|---|
| **Recalcul à la lecture** — le rapport recalcule s'il est périmé | 0 recompute pendant la saisie | un premier affichage du rapport plus lent |
| **Débounce global** — un seul recompute au plus toutes les N secondes | divise par ~10 le nombre d'appels | fenêtre où le snapshot est en retard |
| **Recalcul en sortie de diagnostic** — au `finish` seulement | le plus simple | les synthèses intermédiaires ne sont plus persistées |

**Recommandation à discuter** : le recalcul à la lecture. C'est le seul qui
supprime la dépendance plutôt que de la lisser, et il aligne le coût sur l'usage
réel — on recalcule quand quelqu'un regarde.

**Ne pas corriger dans la même PR que la borne** : ce sont deux défauts, et les
mélanger rendrait la relecture de l'un impossible.

---

## ② Piste écartée mais à ne pas oublier

Le relevé initial soupçonnait une **promesse pendante** (`write.run()` qui ne
revient jamais). **Écartée par l'observation de Laurent le 14/09 : « c'est
passé »** — une promesse pendante ne se règle jamais. C'était donc bien une
file, pas un blocage définitif.

Reste que la borne protège **aussi** contre la promesse pendante, qui n'est pas
impossible (timeout réseau mal géré, action serveur qui throw hors du try). Le
correctif vaut pour les deux.
