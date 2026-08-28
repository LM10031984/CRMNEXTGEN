---
quick_id: 260828-k3p
phase: quick/260828-k3p
plan: 01
subsystem: pré-inscriptions / sessions / tarification
tags: [inscriptions-publiques, lien-par-session, agefice, rgpd, storage, e2-prix, tdd]
requires:
  - "@/lib/sessions/payer-rule (isPersonneMoralePayeur — quick 260821-md8)"
  - "@/lib/locations/format-lieu (formatLieuFormation — source unique du lieu)"
  - "@/lib/storage (createSignedUploadUrl, DOCS_BUCKET, PREENROLLMENT_BUCKET)"
  - "@/server/actions/preinscription-convert (convertPreEnrollment)"
provides:
  - "@/lib/enrollment/public-link — generatePublicToken, publicLinkState, buildPublicEnrollmentUrl"
  - "@/lib/enrollment/sponsor-org — resolveSponsorOrg, cleanSiret"
  - "@/lib/enrollment/agefice-rights — ageficeRights, contributionFromExtractedData"
  - "@/lib/enrollment/attach-documents — copyEnrollmentDocs"
  - "@/lib/enrollment/rate-limit — rateLimitOk"
  - "@/lib/pricing/resolve-default-price — resolveDefaultParticipantPrice (source unique E-2)"
  - "@/lib/storage — listObjects, deleteFile (parité Supabase/MinIO)"
  - "@/server/actions/session-enrollment-public — createSessionEnrollmentUploadUrl, submitSessionEnrollmentRequest"
  - "@/server/actions/session-enrollment-admin — open/close/revokeSessionEnrollments"
  - "@/server/actions/enroll-from-request — enrollFromRequest"
affects:
  - "fiche session (onglet Session) : bloc « Inscriptions en ligne » + liste des demandes"
  - "écran /app/inscriptions/[id] : droits AGEFICE"
  - "convertPreEnrollment : les pièces suivent désormais l'apprenant"
  - "addParticipant, createSessionFull : prix par défaut via la source unique"
tech-stack:
  added: []
  patterns:
    - "Aucune écriture en base avant soumission d'un formulaire public (draftId côté navigateur)"
    - "Donnée sensible transportée mais non persistée tant qu'un humain n'a pas validé"
    - "Un forfait groupe ne se recopie jamais sur un inscrit : il se répartit ou il se signale"
    - "Deux buckets = copier l'objet, jamais la clé"
key-files:
  created:
    - apps/web/src/lib/enrollment/public-link.ts
    - apps/web/src/lib/enrollment/sponsor-org.ts
    - apps/web/src/lib/enrollment/agefice-rights.ts
    - apps/web/src/lib/enrollment/attach-documents.ts
    - apps/web/src/lib/enrollment/rate-limit.ts
    - apps/web/src/lib/pricing/resolve-default-price.ts
    - apps/web/src/app/inscription/[token]/page.tsx
    - apps/web/src/components/enrollment/session-enrollment-form.tsx
    - apps/web/src/components/sessions/session-enrollment-block.tsx
    - apps/web/src/components/sessions/session-enrollment-requests.tsx
    - apps/web/src/server/actions/session-enrollment-public.ts
    - apps/web/src/server/actions/session-enrollment-admin.ts
    - apps/web/src/server/actions/enroll-from-request.ts
    - apps/web/scripts/purge-orphan-drafts.ts
    - apps/web/scripts/backfill-converted-docs.ts
    - packages/db/prisma/migrations/20260828152600_public_enrollment_links/
    - packages/db/prisma/migrations/20260828160500_cni_verso/
    - .claude/commands/tarification.md
  modified:
    - packages/db/prisma/schema.prisma
    - apps/web/src/lib/storage.ts
    - apps/web/src/lib/preinscription-extractor.ts
    - apps/web/src/server/actions/preinscription-convert.ts
    - apps/web/src/server/actions/sessions.ts
    - apps/web/src/server/actions/sessions-create.ts
    - apps/web/src/components/shared/direct-upload-field.tsx
    - apps/web/src/components/preinscriptions/public-form.tsx
    - apps/web/src/app/app/sessions/[id]/page.tsx
    - apps/web/src/app/app/inscriptions/[id]/page.tsx
    - apps/web/next.config.mjs
    - docs/rgpd/REGISTRE-TRAITEMENTS.md
  deleted:
    - .claude/commands/tarif.md
---

# Quick 260828-k3p — Inscriptions publiques par session

## Ce que ça règle

Ouvrir une session aux inscriptions et diffuser un lien : l'apprenant saisit ses
informations, dépose ses pièces, et l'admin valide en un geste — l'apprenant est
créé **et** inscrit à la session. Équivalent de la fonction SmartOF, demandée par
Laurent le 28/08.

70 % de la plomberie existait déjà (formulaire tokenisé, OCR, écran de validation) :
ce qui manquait était le rattachement à une session et la création du
`SessionParticipant` à la validation.

## Décisions structurantes

**Aucune écriture avant soumission.** `/preinscription` créait une ligne à *chaque
visite* : un lien diffusé à une agence entière remplissait la table de dossiers
vides. Le nouveau flux téléverse sous un `draftId` généré par le navigateur et ne
crée la demande qu'à l'envoi. Contrepartie : des fichiers orphelins, purgés au-delà
de 30 jours (`pnpm storage:purge-drafts`, sec par défaut).

**Le n° de sécurité sociale n'est pas persisté avant validation.** Il transite dans
l'appel de soumission et n'est écrit qu'à la validation, dans `SensitiveData`.
Rejeter une demande le perd — c'est voulu : la table alimentée par un formulaire
ouvert sur Internet ne contient aucune donnée sensible.

**Payeur indéterminé ⇒ arrêt, jamais création.** Un salarié dont le SIRET est
inconnu bloque la validation et ouvre un sélecteur d'organisation. Créer
l'entreprise depuis un formulaire public noierait le CRM de doublons — c'est le
pilier n°3 du produit.

**Un forfait groupe ne se recopie pas.** `resolveDefaultParticipantPrice` refuse de
poser `groupFlatPrice` sur un inscrit isolé : ce serait multiplier le CA par
l'effectif (erreur du 20/08, ×8). Il renvoie 0 **signalé** avec le forfait à
répartir.

## Deux bugs trouvés en chemin

**Les pièces ne suivaient pas l'apprenant.** Après validation, la fiche apprenant
n'affichait ni CNI, ni RIB, ni attestation CFP. Deux causes empilées : la
conversion ne transférait aucune clé, et les buckets diffèrent (`preinscriptions`
vs `qualiof-docs`) — il fallait copier l'objet, pas la clé. Corrigé dans
`convertPreEnrollment`, donc les deux flux en bénéficient. Rattrapage appliqué :
1 fiche, 3 documents (`pnpm docs:backfill-converted`).

**E-2 en train de se reproduire dans le remède.** Le correctif du repli à 0 € a été
écrit trois fois (addParticipant, enroll-from-request, sessions-create). Une seule
source désormais, qui porte aussi la logique payeur.

## Vérification

- 185 fichiers de tests, **1524 tests verts**, `tsc --noEmit` propre
- 2 migrations additives appliquées sur le cloud, colonnes et index vérifiés en base
- Tests de mutation : répartition du forfait (reliquat), récursivité `listObjects`,
  recopie du forfait groupe — les trois font rougir leur test quand on les casse
- Smoke en transaction annulée sur SES-0108 : base ressortie inchangée
- Règle WAF `rate-limit-inscription` créée et vérifiée (`/app/inscriptions` non capturé)

## Ce qui reste ouvert

- **`SessionPricing`** : le prix appartient au couple (session × payeur), pas à la
  session. Phase dédiée à ouvrir — migration + backfill + déploiement pendant que
  la prod tourne. État des lieux mesuré : 283 couples, 278 homogènes, 5 à arbitrer,
  180 gelés (engagés), 0 participant à 0 €.
- **Registre RGPD v1.2** à contresigner par le responsable de traitement.
- Rien n'est déployé : la branche `cloud-migration` est en avance sur `origin`.
