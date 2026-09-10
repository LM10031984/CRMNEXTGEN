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
4. **Signataires résolus, jamais devinés** : pas d'email de dirigeant trouvable →
   blocage avec message nominatif. Stagiaire = `Person.email`.
5. **Emails depuis QualiOF** (D-9) : `send_email: false` côté DocuSeal, envoi par
   le mailer fail-closed avec une catégorie décochable `signature`.
6. Chemins bucket : `sessions/{tenantId}/{sessionCode}/signed/…` (§4.4). L'ancien
   préfixe `signed/{tenantId}/…` reste lisible, on ne déplace rien.

## 3. Boucle par lot — RED → GREEN → preuve

1. Tests RED (vitest, `__tests__/` à côté du code) — commit `test(signature-<lot>)`.
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
5. `pnpm -F @qualiof/web typecheck && pnpm -F @qualiof/web test` verts avant de
   déclarer un lot livré. Mettre à jour le statut du lot dans la spec (§7).

## 4. Interdits

- Recréer un upload de PDF signé parallèle à `uploadSignedDoc`.
- Un `Document` par scan d'émargement : le mécanisme `docStatus` existant suffit
  (sauf si un `Document` de ce type existe déjà → on le complète).
- Câbler Yousign « au cas où » : le port suffit, l'adaptateur viendra si un
  financeur l'exige.
- Toucher aux templates WeasyPrint au-delà de l'ajout des text tags invisibles.
