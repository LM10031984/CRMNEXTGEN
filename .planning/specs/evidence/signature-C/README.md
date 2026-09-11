# Preuves du lot C.2c — les emails de la chaîne de signature

Rendus le **11/09/2026** par `apps/web/scripts/proof-signature-lot-c.ts`.
Régénérables à l'identique, sans réseau, sans base et sans `.env` :

```
pnpm -F @qualiof/web exec tsx scripts/proof-signature-lot-c.ts
```

`enveloppes.md` est **généré par le script**, jamais recopié : une preuve
recopiée ne prouve que la recopie. Il porte, pour chaque gabarit, le
**destinataire**, l'**objet** et les **pièces jointes** réellement composés.

| Fichier | Ce qu'il prouve |
|---|---|
| `signature-demande-client-responsable.html` | Le gabarit **1**, branché. Un seul lien cliquable — celui de la signature —, la pièce et la formation nommées, la date limite en toutes lettres, aucun montant. Le destinataire est appelé **« responsable de l'organisation »**. |
| `signature-demande-client-stagiaire.html` | **La pièce qui prouve le vocabulaire.** Même gabarit, même code, autre `qualiteSignataire` : le destinataire est appelé **« stagiaire »**. C'est le cas de l'indépendant qui signe sa propre convention — l'ancre du PDF dit `Client`, le régime dit `STAGIAIRE`, et c'est le **régime** qui nomme. |
| `signature-demande-of.html` | Le gabarit **2**, branché. Cas `signatoryOrder = BEFORE` : l'organisme signe en premier, donc c'est LUI qu'on prévient au moment de l'envoi. Ton interne, et « signataire de l'organisme de formation ». |
| `signature-relance-j3.html` | Le gabarit **3**. Rappelle la date d'envoi ET la date limite, et renvoie **le même lien** — jamais un lien régénéré, qui ouvrirait une seconde demande chez le prestataire. |
| `signature-relance-j7.html` | Le gabarit **4**. Même gabarit, rang 2 : l'objet dit « Dernier rappel » et le corps dit que c'est le dernier. Après, plus rien ne part. |
| `signature-exemplaire-signe.html` | Le gabarit **5**. **Aucun lien cliquable** : tout est joint. Les deux pièces sont annoncées nommément, dont le **certificat de signature** (`.audit-trail.pdf`) — c'est lui que les AGEFICE réclament. |

**Données fictives, et figées.** Organisme, noms, adresses, SIRET, NDA et dates
sont inventés et constants. Aucune donnée de production n'entre dans un fichier
versionné, et la preuve ne change pas selon le `.env` de qui la régénère.

**Le script refuse d'écrire** si l'un des rendus contient « dirigeant » (casse et
accents normalisés). Une preuve qui contredit la règle du vocabulaire n'est pas
une preuve, c'est un constat de régression versionné.

---

## Portée exacte de ces preuves — ce qu'elles ne prouvent PAS

### 1. Trois gabarits sur cinq ne sont branchés à RIEN

| Gabarit | Déclencheur | Existe-t-il aujourd'hui ? |
|---|---|---|
| 1. Demande — bénéficiaire | `sendForSignature` réussit | ✅ **oui, branché** |
| 2. « À votre tour » — organisme | rang 0 de l'ordre de signature (`signatoryOrder = BEFORE`) | ✅ **oui, branché** |
| 3. Relance J+3 | cron `signature-reminders` | ❌ **non — lot C.3** |
| 4. Relance J+7 | idem | ❌ **non — lot C.3** |
| 5. Exemplaire signé | `completedAt` + `signedPdfUrl`, écrits par le webhook | ❌ **non — lot C.3** |

Le gabarit **2** a une porte ouverte aujourd'hui, et une seule : quand
`Tenant.signatoryOrder = BEFORE`, l'organisme est le signataire de rang 0, donc
c'est lui qu'on prévient à l'envoi. Son cas nominal — « le client a signé, à
votre tour » — attend le `signedAt` que seul le webhook écrit.

**Décision Laurent du 11/09/2026** : écrire et prouver les cinq maintenant,
brancher les trois derniers avec le retour du prestataire. Le plan C.2c
proposait l'inverse (n'écrire que ce qui a un appelant, pour ne pas livrer de
fonction verte à jamais). Le risque que ce choix accepte est nommé ici : ces
trois gabarits n'ont, pour toute garde, que
`apps/web/src/lib/mailer-templates/__tests__/signature-emails.test.ts`. Il
vérifie ce qu'ils COMPOSENT. Rien ne vérifie encore que quiconque les appelle.

### 2. Aucune pièce jointe n'est réellement attachée

`Document.signedPdfUrl` n'est rempli aujourd'hui que par le **scan manuel** du
lot A (`signatureKind = MANUAL_SCAN`). Pour une signature électronique, c'est le
webhook `submission.completed` — lot C.3 — qui l'écrit, avec le certificat en
`.audit-trail.pdf`. Le gabarit 5 **annonce** ses deux pièces ; l'appelant qui
les attachera n'existe pas encore. Branché aujourd'hui, cet email joindrait au
mieux un scan, jamais l'exemplaire électronique.

La plomberie, elle, est là : `sendMail` accepte `attachments`,
`downloadFile(DOCS_BUCKET, key)` rend un `Buffer`. Ce n'est pas la plomberie qui
manque, c'est la donnée.

### 3. Rendu, pas départ

Ces HTML prouvent ce que le gabarit compose. Ils ne prouvent pas qu'un serveur
SMTP l'a accepté. La preuve du départ réel est ailleurs :

- la ligne `[mailer:dry-run]` ou le `messageId` rendu par `sendMail` ;
- le fil lui-même, gardé par
  `apps/web/src/server/actions/__tests__/signature-envoi.notification.test.ts` —
  retirer l'appel à `notifierSignataire` dans `signature-envoi.ts` fait rougir
  six tests ;
- et, pour de bon, **un envoi réel sur une session témoin**, catégorie
  « Signature électronique » cochée. Il reste à faire.

### 4. Les NON-destinataires — c'est voulu, ce n'est pas un oubli

`ANCRES_PAR_PIECE` fait foi : la convention est signée par le responsable de
l'organisation et l'organisme ; le dossier AGEFICE par le stagiaire seul ;
l'attestation d'assiduité par le stagiaire et l'organisme. Croisé avec la spec
§3 bis (« le salarié ne signe **rien** ») :

> Une session de 6 salariés financés OPCO EP produira **DEUX emails au total** —
> un au responsable de l'organisation, un à Laurent. **Zéro** aux six stagiaires.
> Ils ne recevront ni demande, ni relance, ni, plus tard, l'exemplaire signé de
> la convention qui les concerne.

**C'est le comportement voulu** (Laurent, 11/09/2026). Leur besoin d'information
est déjà couvert par la **convocation**, qui part par ailleurs. Et c'est le choix
le plus sûr : envoyer la convention d'entreprise à un salarié non signataire
ferait entrer son email et son adresse IP dans un certificat de signature qui
nomme quelqu'un d'autre — preuve inexploitable devant un financeur (amendement
n°3 du lot C).

### 5. Le vocabulaire — et où il est gardé

Aucun des six rendus n'écrit « dirigeant ». `enveloppes.md` cite, pour chacun, la
phrase exacte qui nomme le destinataire. Les gardes exécutables sont le script
lui-même (il refuse d'écrire), le test T2.12 sur les sept rendus possibles, et
`lib/signature/__tests__/vocabulaire-responsable.source.test.ts`.

⚠ **Ce README est le seul fichier du dossier à écrire le mot interdit**, et il le
fait pour énoncer la règle — on ne peut pas interdire un mot sans le nommer. La
garde porte donc sur ce qui est RENDU : les six `.html` et le `enveloppes.md`
généré. `grep -ril dirigeant *.html enveloppes.md` ne doit rien rendre.

⚠ Le renommage est **textuel, jamais structurel** : `SignerRole.DIRIGEANT`,
`LinkRole.DIRIGEANT` et `OpcoCatalog.conventionSigner` gardent leurs valeurs
d'enum. C'est le libellé qui dit « responsable de l'organisation ».
