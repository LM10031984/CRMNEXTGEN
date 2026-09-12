---
description: Signature électronique (DocuSeal) et retour des documents signés dans QualiOF (spec du 04/09/2026), lot par lot — dépôt des scans d'émargement, envoi convention/AGEFICE/assiduité, certificat de signature
argument-hint: "[lot A..D | suite | --etat]"
allowed-tools: Bash(pnpm *) Bash(git *) Read Edit Write Grep Glob
---

# Signature électronique & documents signés — $ARGUMENTS

Objectif : plus aucun document signé hors de QualiOF. Les scans d'émargement se
déposent dans la fiche session ; convention, dossier AGEFICE et attestation
d'assiduité partent en signature électronique via DocuSeal et **reviennent**
(PDF signé + certificat de signature) sur la ligne `Document`. Adobe Sign et le
Drive disparaissent. **La spec est la source unique — cette commande n'en est que
le mode d'emploi.**

## 0. Sources de vérité — à lire AVANT toute ligne de code

- `.planning/specs/2026-09-04-signature-electronique-docs-signes.md` — LA spec :
  décisions O-1..O-4, modèle §4, lots §5 (A dépôt des scans, B modèle + adaptateur
  DocuSeal, C envoi + webhook + retour, D financeur + pack audit + J-15),
  décisions ouvertes D-1..D-9.
- `apps/web/src/server/actions/qualiopi-matrix.ts` (`uploadSignedDoc`) et
  `apps/web/src/components/sessions/qualiopi-matrix/` — **l'upload d'un PDF signé
  par cellule existe déjà**. On l'étend, on ne le double pas.
- `apps/web/src/lib/derive-cell-state.ts` — les états de cellule (on ajoute
  `E_SIGNED` et `PENDING_SIGNATURE`, on ne casse pas la priorité `MANUAL_OK`).
- `apps/web/src/lib/storage.ts` — adaptateur MinIO/Supabase, `DOCS_BUCKET`.
- `.planning/specs/2026-09-02-facturation-electronique-pa.md` — le pattern
  port/adaptateur à reproduire pour `SignatureProvider`.
- **Skill `docuseal-code`** — **non suivie par git** (docs fournisseur, cf. `.gitignore`). Si `.agents/skills/docuseal-code/` est absent du worktree, la réinstaller :
  ```
  npx skills add docusealco/docuseal-agent-skills --skill docuseal-code
  ```
  À charger AVANT d'écrire l'adaptateur — c'est la référence officielle de l'API (submissions, templates, text tags `{{Signature;role=…}}`, `send_email`, webhooks, audit log). La doc en ligne https://www.docuseal.com/docs/api ne sert qu'en complément.
- **MCP `docuseal`** (`claude mcp add --transport http docuseal https://mcp.docuseal.com/`) : pour OBSERVER et TESTER le compte (créer un template/submission de test, lire un statut, récupérer le certificat) — jamais pour remplacer le code : l'app appelle l'API elle-même avec `DOCUSEAL_API_KEY`, le MCP n'existe pas sur Vercel.

`--etat` : mode lecture seule — tableau A→D (migrations présentes ? drop zone ?
adaptateur ? webhook ? certificat joint au dossier AGEFICE ?), D-x encore
ouvertes, prochain lot conseillé. Aucune écriture.

## 1. Cadrer le lot

- Argument `lot X` → périmètre et « fini quand » repris de la spec §5,
  recopiés en tête de réponse. `suite` → premier lot non livré (constaté dans le
  code, pas dans les souvenirs).
- **Isolement** : travailler dans le worktree dédié `files-signature` (branche
  `feat/signature-docs-signes` depuis `cloud-migration`), JAMAIS dans `files/`
  partagé — une session = un worktree = un port. Pas de commandes à portée
  machine (`pkill -f`…). Les migrations ne partent sur Supabase qu'AVEC le
  merge/déploiement.
- Migrations : **additives**, `prisma migrate dev` (jamais `db push`), aucun
  backfill — `Document.status` reste une String, les anciennes lignes gardent
  `"generated"`.
- Avant le **10/09/2026** : interdiction de toucher l'express du stand
  (`/diagnostic`, `DiagnosticSubmission`, `lib/diagnostic/`), le mailer et le
  worker de diagnostic.
- Serveur de dev du worktree : `pnpm -F @qualiof/web dev -- -p 3300` (port 3300 réservé à `files-signature` ; 3002 = `files/`, 3200 = `files-chaine`).
- Le lot A ne dépend pas de DocuSeal : il se livre seul. Les lots B-C exigent
  une clé sandbox DocuSeal dans `.env.local` — sans clé, provider `dry-run`
  obligatoire, jamais d'appel réseau silencieux.

## 2. Règles métier gravées

1. **La fiche d'émargement est individuelle** (1 PDF par participant, closure
   worker). Le scan revient participant par participant — jamais un statut
   « signé » posé sur toute la session d'un coup.
2. **Le PDF signé fait foi** : `/api/documents/[id]` sert `signedPdfUrl ?? pdfUrl`.
   Un document `signed` ne se régénère pas sans `force` explicite + AuditLog.
3. **Le certificat de signature (audit log DocuSeal) est une pièce à part
   entière** : stocké à côté du PDF signé (`.audit-trail.pdf`), joint au dossier
   AGEFICE (`OpcoSubmission.attachments`) et au ZIP du pack audit. C'est ce que
   les AGEFICE réclament.
4. **Signataires résolus, jamais devinés** : pas d'email du **responsable de
   l'organisation** trouvable → blocage avec message nominatif. Stagiaire =
   `Person.email`.
5. **Emails depuis QualiOF** (D-9) : `send_email: false` côté DocuSeal, envoi par
   le mailer fail-closed avec une catégorie décochable `signature`.
6. Chemins bucket : `sessions/{tenantId}/{sessionCode}/signed/…` (§4.4). L'ancien
   préfixe `signed/{tenantId}/…` reste lisible, on ne déplace rien.
7. **Le MOT : « responsable de l'organisation », jamais « dirigeant »** (Laurent,
   11/09/2026 — spec §3 ter). Pour un salarié, le signataire de la convention est
   le **responsable d'agence**, désigné par `Organization.representative` — pas
   nécessairement le représentant légal. « Dirigeant » et « représentant légal »
   affirment une qualité juridique que la donnée ne porte pas.
   **Le renommage est TEXTUEL, jamais structurel** : `SignerRole.DIRIGEANT`,
   `LinkRole.DIRIGEANT`, `OpcoCatalog.conventionSigner`, seed et migrations
   gardent leurs valeurs. Si tu juges qu'une valeur d'enum doit suivre : **dis-le
   et arrête-toi**, ne migre pas de la donnée dans un lot de libellés.
   Garde exécutable : `lib/signature/__tests__/vocabulaire-responsable.source.test.ts`.

## 3. Boucle par lot — RED → GREEN → preuve

1. Tests RED (vitest, `__tests__/` à côté du code) — commit `test(signature-<lot>)`.
   **Les deux règles de test de §3 bis s'appliquent dès l'écriture du RED** :
   test de câblage pour toute prop qui traverse `page.tsx`, valeurs littérales
   pour tout ce qui garde « vers où » ou « quel texte ».
2. Implémentation minimale — commit `feat(signature-<lot>)`.
3. Checklist server action (identique à `/quick`) : `requireRole`, tout scopé
   `tenantId`, Zod avant I/O dans `packages/shared/src/schemas/`, diff + AuditLog
   dans la transaction, `revalidatePath` de la fiche session.
4. Preuve observable, recopiée en fin de réponse :
   - A : un PDF lâché sur la cellule Émargement d'un participant → cellule
     « Signé (scan) », fichier présent dans le bucket, AuditLog écrit.
   - B : provider `dry-run` de bout en bout + en sandbox DocuSeal, une convention
     signée s'ouvre dans Adobe Reader avec le panneau de signature et le
     certificat se télécharge.
   - C : bouton « Envoyer pour signature » → badge « En attente » → webhook
     simulé → `Document.status = signed`, PDF + certificat dans le bucket.
   - D : dossier AGEFICE composé avec les versions signées + certificat ;
     alerte J-15 créée pour une session sans SignatureRequest.
5. **LES GATES SONT TROIS**, dans cet ordre, sortie RÉELLE recopiée (identique à
   `/quick` §5) :

   ```
   pnpm lint
   pnpm --filter @qualiof/web exec tsc --noEmit
   pnpm test
   ```

   Aucun lot déclaré livré sans les trois verts. Un test qui échouait déjà avant
   la modif se DIT explicitement et se consigne dans `deferred-items.md` — il ne
   se « répare » pas au passage.
6. **Muter, et constater** — cf. §3 bis. Les deux règles de test ci-dessous ne
   valent que si la mutation est réellement exécutée : une mutation non lancée
   n'est pas une preuve. Si une mutation reste verte, le dire et renforcer avant
   de déclarer le lot livré.
7. Mettre à jour le statut du lot dans la spec (§7).

## 3 bis. Deux règles de test OPPOSABLES

Tirées de **onze** tests de ce chantier qui se sont révélés ne rien garder.
**Aucun n'a été repéré en relecture — les onze l'ont été par mutation.** Une
règle sans son incident se fait oublier au premier lot pressé : les incidents
sont donc écrits ici, en toutes lettres.

### Règle n°1 — toute prop qui traverse `page.tsx` a un TEST DE CÂBLAGE

> **Retirer l'argument chez l'appelant doit faire rougir.**

Dès qu'une valeur est calculée d'un côté et rendue de l'autre, il faut un test
qui garde **le fil**, pas seulement le calcul et le rendu.

**L'incident (lot C.2b-8).** `signataireOf` était calculé, testé, rendu, testé.
Le retirer de l'appel de `construireVueSignature` dans
`app/app/sessions/[id]/page.tsx` faisait **disparaître l'organisme de toutes les
lignes en production** — plus de « 2. Laurent MARX (organisme de formation),
signe en dernier depuis le CRM », donc un admin qui croit la convention close au
premier paraphe. **95 tests restaient verts.** Le même trou avait déjà été trouvé
en C.2b-1, entre la fiche session et le moteur.

**Comment l'écrire.** Les `page.tsx` du dépôt sont des composants serveur
(Prisma + Lucia en tête) : ils ne se montent pas en jsdom. Le fil se garde donc
par un **test de source** — `readFileSync` + regex sur l'appel :
`lib/sessions/__tests__/fiche-session-cablage-signature.smoke.test.ts`,
`lib/signature/__tests__/signataire-of.source.test.ts`,
`lib/signature/__tests__/vocabulaire-responsable.source.test.ts`.

**Quand le typeur suffit — et quand il ne suffit pas.** Rendre la prop
**obligatoire** est plus fort qu'un test : l'oubli devient une erreur `tsc`
(c'est ce qui a été fait pour `signataireOf` le 11/09/2026, cf. le bloc
`@ts-expect-error` de `bloc-signature-vue.test.ts`). Mais `tsc` ne voit pas la
**substitution** : `signataireOf: null` compile parfaitement et produit
exactement le même écran vide. Prop obligatoire **et** assertion littérale sur la
valeur réellement passée — les deux, jamais l'une à la place de l'autre.

### Règle n°2 — aucun test ne compare sa valeur attendue au retour de la fonction qu'il teste

> **Comparer à des valeurs LITTÉRALES quand on garde « vers où » ou « quel texte ».**

**L'incident (lot C.2b-6).** Une assertion comparait le `href` d'un `<Link>` au
retour de `lienRenseignerFinanceur(...)`. Quand le constructeur a cessé de poser
ce retour, **les deux côtés ont bougé ensemble** et l'assertion est restée verte :
elle ne gardait plus rien. Même défaut latent partout où un test importe la
constante que le composant affiche pour la comparer à ce qu'il a rendu.

**Interdits, donc :**

```ts
expect(lien.getAttribute('href')).toBe(lienRenseignerFinanceur({ … })); // ❌
expect(texte).toContain(LIBELLE_ORDRE_SIGNATURE);                      // ❌
```

**À écrire :**

```ts
expect(lien.getAttribute('href')).toBe('/app/organisations/org-1?champ=opcoCode'); // ✅
expect(ordre[1]!.texte).toBe(
  '2. Laurent MARX (organisme de formation), signe en dernier depuis le CRM',      // ✅
);
```

**La seule exception**, et elle est étroite : un test dont l'objet EST la
constante (`expect(LIBELLE_RESPONSABLE_ORGANISATION).toBe('Responsable — signe
les conventions')`). Là, la valeur littérale est d'un seul côté — c'est la
définition qui est gardée, pas un aller-retour.

### Le protocole qui a trouvé les onze

Après chaque lot, **muter et constater** — la sortie réelle, pas l'intention :
retirer la prop chez l'appelant, retirer l'avertissement du rendu, remettre une
prop en optionnel. Si une mutation reste verte, **le dire** et renforcer le test
avant de déclarer le lot livré. Une mutation non exécutée n'est pas une preuve.

## 4. Interdits

- Recréer un upload de PDF signé parallèle à `uploadSignedDoc`.
- Un `Document` par scan d'émargement : le mécanisme `docStatus` existant suffit
  (sauf si un `Document` de ce type existe déjà → on le complète).
- Câbler Yousign « au cas où » : le port suffit, l'adaptateur viendra si un
  financeur l'exige.
- Toucher aux templates WeasyPrint au-delà de l'ajout des text tags invisibles.
