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

## ② Le libellé porte l'avertissement — et il déborde dans les titres

**Statut : voulu, à confirmer par Laurent.**

Le nom d'agence est résolu par `nomAgence()` — **une seule** résolution, celle
de la production (§4 bis). Y poser la mention garantit qu'aucune pièce issue de
ce dossier ne peut s'en détacher. Conséquence directe et assumée :

```
titre : Parcours sur mesure — Agence A (COPIE PSEUDONYMISÉE — ne pas remettre)
```

C'est laid, et c'est le but : §4 terdecies est né d'un programme composé en
local relu comme s'il venait de la production. L'en-tête de provenance de la
sonde coiffe le **fichier** ; ceci marque la **donnée**, qui voyage plus loin
que le fichier.

**Si Laurent préfère un titre propre pour sa relecture**, la mention se déplace
dans `Lead.source` seul — mais alors elle ne suit plus les documents, et la
protection retombe sur la seule discipline de celui qui les manipule.

---

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
