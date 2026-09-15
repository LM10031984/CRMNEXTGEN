# Items ouverts — dossier réel monté en local, pseudonymisé (15/09/2026)

## ① SUPPRIMER `DIAG-R001` une fois le programme relu — **à échéance**

**Statut : à faire dès que Laurent a rendu son avis sur le programme composé.**

> Une base de travail n'est pas un endroit où les dossiers clients
> s'accumulent, même pseudonymisés.

### Ce qui a été versé

| | |
|---|---|
| Référence | `DIAG-R001` |
| UUID | `454b58e6-7f88-4d95-adf6-5fc6c16ab838` |
| Base | `qualiof_dev @ localhost` — **jamais** la production |
| Libellé d'agence | `Agence A (COPIE PSEUDONYMISÉE — ne pas remettre)` |
| Contenu | 1 `Lead`, 1 `Diagnostic`, 37 `DiagnosticAnswer`, 3 `DiagnosticParticipant`, 1 `AuditLog` |
| Origine | `DIAG-0001` de production (`5f8f9aa7-9354-46a5-8b43-f6c54e0faf13`) |
| Trace | `AuditLog` action `diagnostic.import_pseudonymise` |

Aucun nom, aucun e-mail, aucun téléphone, aucune raison sociale, aucun SIRET
n'a quitté la production — la lecture ne les a pas demandés. Ce qui est descendu :
les 37 réponses verbatim et les champs **structurels** des 3 fiches (statut,
CA N-1, éligibilité OPCO), parce qu'ils pilotent le financement, donc le volume,
donc la composition.

### Le geste

```sql
-- Les answers et participants tombent en cascade ; le Lead, non.
DELETE FROM "Diagnostic" WHERE reference = 'DIAG-R001';
DELETE FROM "Lead" WHERE notes LIKE 'Agence : Agence A (COPIE PSEUDONYMISÉE%';
```

**À vérifier avant** : qu'aucune `Proposal` ni `Quote` n'a été créée depuis ce
dossier entre-temps. Si c'est le cas, les supprimer d'abord — et se demander
pourquoi une pièce commerciale est née d'une copie de prévisualisation.

### Le critère de déclenchement

La relecture du programme `.planning/DIAG-R001-programme-compose.md` par
Laurent. Tant qu'elle n'a pas eu lieu, le dossier sert ; après, il ne sert plus
et il expose.

---

## ② Le libellé porte l'avertissement — **TRANCHÉ, FERMÉ le 15/09/2026**

**Décision Laurent : on garde la mention dans le titre, telle quelle.**

> Un document qui ne doit pas circuler porte sa marque partout ; on n'échange
> jamais un marqueur de sûreté contre de l'esthétique.

Le titre lit donc `Parcours sur mesure — Agence A (COPIE PSEUDONYMISÉE — ne pas
remettre)`, et c'est le comportement voulu : en passant par `nomAgence()` —
résolution unique, celle de la production (§4 bis) — la mention suit **toute**
pièce issue du dossier, pas seulement le fichier de sonde.

Aucune action. L'item reste écrit pour que la question ne se rouvre pas au
prochain import.

---

## ②bis Les 4 demi-journées non consommées = **4 032 € de droits qui expirent**

**Statut : chiffre à porter au point 5. Aucune action sur le moteur.**

Le moteur compose 6 demi-journées quand le budget en finance 10, et refuse de
combler l'écart. **Il a raison, et pour la bonne raison** : un module sans point
de douleur derrière ne passerait pas un contrôle OPCO (§8.2). Le garde-fou fait
exactement son travail.

Mais ce n'est pas un non-événement, et il faut le nommer :

| | |
|---|---|
| Droits ouverts | 10 demi-journées |
| Parcours composé | 6 demi-journées |
| Écart | **4 demi-journées × 1 008 € = 4 032 €** |
| Échéance | 31 décembre — non consommés, perdus |

**Ce n'est pas un défaut de moteur : c'est la mesure exacte de ce que la
bibliothèque sait répondre aujourd'hui**, sur ce client. Le chiffre ne se
corrige pas en desserrant le seuil ; il se corrige en écrivant les modules qui
manquent. C'est l'argument chiffré du point 5.

---

## ②ter BIB-D070 — huit « modules » qui sont des cellules d'un tableau horaire

**Statut : trouvaille du relevé des verbes (15/09/2026). Non corrigé.**

Huit titres du rayon `BIB-D070` commencent par `|` : le découpage a pris les
lignes d'un **tableau de déroulé horaire** pour des modules.

```
| Accueil & mise en confiance              | Prospection & crédibilité marché
| Comprendre l'IA et ChatGPT (sans jargon) | Rendez-vous vendeur & image pro
| Écrire plus vite et mieux au quotidien   | Suivi client, annonces & administratif
| Synthèse & plan d'action personnel       | Pause déjeuner
```

**« Pause déjeuner » est enregistré comme un module de formation.** Le refus
d'objectif les a rendus visibles — c'est exactement le rôle d'une liste blanche
qui penche vers le refus (§4 nonies).

À reprendre au découpage (`extract-drive-catalog.ts`), pas à la main en base :
un prochain import réintroduirait les mêmes huit lignes.

## ③ L'arbitrage du balayage est lié au `questionId`, pas au TEXTE

**Statut : limite connue, sans conséquence aujourd'hui.**

`--textes-libres-arbitres=<questionId,…>` déclare qu'une réponse a été relue.
Si le texte de cette réponse **change** en production entre deux imports,
l'arbitrage continue de valoir alors qu'il portait sur un autre contenu.

Sans conséquence ici : le balayage du 15/09 a rendu **0 trouvaille sur 37
réponses**, donc aucun arbitrage n'a été donné. Le jour où l'un le sera, lier
l'arbitrage à une empreinte du texte (même mécanique que
`Diagnostic.sourceFingerprint`) fermerait la porte.

---

## ④ Les deux comptes de modules sont désormais nommés — ailleurs, non

**Statut : corrigé sur les deux sorties de ce lot. À surveiller.**

« 490 » et « 402 » se sont contredits une demi-heure. Les deux étaient justes :

| Population | Compte |
|---|---|
| Tous les `TrainingModule` de la base | **490** |
| Instantané Drive + Faros (« la bibliothèque ») | **402** (400 + 2) |
| Hors import (`sourceRef` nul) | **88** |
| Offerts au moteur, retraits déduits | **298** |

Le script d'import et la sonde les nomment maintenant. **Le reste du dépôt
n'a pas été balayé** : toute autre sortie qui annonce « N modules » sans dire
laquelle de ces quatre populations elle compte porte le même défaut (§4 quater).
