---
phase: quick/260910-jxr
plan: 01
subsystem: web/lib/signature + docs/rgpd
tags: [signature, docuseal, agefice, i18n, rgpd, dpa, valeur-probante]
one-liner: "Le certificat de signature DocuSeal — la pièce que l'AGEFICE réclame pour la valeur probante — est désormais demandé en français via `metadata.lang: 'fr-FR'` posé sur chaque signataire, et la fiche DPA consigne les deux limites que le code ne peut pas couvrir."
dependency-graph:
  requires:
    - "apps/web/src/lib/signature/port.ts (CreateSignatureRequestInput.signers)"
    - "DocuSeal API POST /submissions/pdf — paramètre documenté `submitters[].metadata`"
  provides:
    - "Certificat de signature aux libellés français (Journal d'audit, Journal des événements, Formulaire consulté par…)"
    - "Test de non-régression verrouillant `every(metadata.lang === 'fr-FR')` sur le corps posté"
    - "Fiche DPA à jour : action manuelle ouverte + limites résiduelles nommées"
  affects:
    - "Dossier AGEFICE : la pièce justificative devient lisible par le financeur"
    - "Lot C (envoi réel de conventions) : rien à reprendre côté langue des libellés"
tech-stack:
  added: []
  patterns:
    - "Constante littérale métier (`fr-FR`) plutôt que variable d'environnement — QualiOF est un CRM d'OF français, ce n'est pas un réglage d'exploitation"
    - "Assertion `.every()` sur le corps de requête (et non `.some()`) : casse si un seul signataire est oublié"
    - "Documentation d'une limite prestataire dans la fiche DPA plutôt que dans un commentaire de code isolé"
key-files:
  created: []
  modified:
    - "apps/web/src/lib/signature/docuseal.ts"
    - "apps/web/src/lib/signature/__tests__/docuseal.test.ts"
    - "docs/rgpd/dpa/docuseal.md"
decisions:
  - "`metadata.lang` posé sur CHAQUE signataire, pas seulement le client : DocuSeal lit la locale du dernier signataire ayant complété (generate_audit_trail.rb:39), n'en équiper qu'un rendrait le résultat dépendant de l'ordre réel des signatures"
  - "`fr-FR` en constante littérale, pas en variable d'environnement — aucune nouvelle clé dans .env.example"
  - "Les horodatages ne sont PAS couverts par le code : `I18n.l(..., locale: account.locale)` est codé en dur (l. 234 et 530) — consigné comme action manuelle du responsable de traitement, pas comme dette technique"
  - "Trois chaînes resteront anglaises quoi qu'il arrive (`User agent:`, `Time zone:`, `Signed with DocuSeal.com`) — nommées dans la fiche pour qu'aucun lecteur ne reprenne l'enquête"
  - "Aucun `D-nn` créé : correction d'exécution, pas décision d'architecture — la spec du 2026-09-04 n'est pas touchée"
metrics:
  duration: "5 min"
  completed: "2026-09-10"
  tasks: 2
  files_created: 0
  files_modified: 3
  commits: 2
---

# Quick 260910-jxr : Le certificat de signature DocuSeal en français — Résumé

## Le problème traité

Le certificat émis le 10/09/2026 sur l'envoi 1619115 était **intégralement en
anglais**. Ce n'est pas cosmétique : c'est la pièce que l'AGEFICE réclame pour
établir la valeur probante de la signature — le critère même qui a fait choisir
DocuSeal contre Yousign (décision O-2). Une justification en anglais dans un
dossier de financement français s'expose à un retour du financeur.

## Ce qui a été fait

### Tâche 1 — `metadata.lang = 'fr-FR'` sur chaque signataire (commit `6f43d87`)

`apps/web/src/lib/signature/docuseal.ts` — le `.map()` qui construit les
submitters dans `createRequest` pose `metadata: { lang: 'fr-FR' }` à côté de
`send_email: false`. C'est le **seul** endroit de QualiOF qui construit un
submitter DocuSeal (vérifié par grep sur `send_email` : `port.ts` n'en parle
qu'en commentaire, `smoke-docuseal-sandbox.ts` ne fait que **lire** les
préférences d'une réponse) — donc un point de pose unique, aucun risque d'oubli.

Le commentaire dit les trois choses qui manqueraient au prochain lecteur : le
pourquoi (pièce du dossier AGEFICE), le pourquoi-sur-tous (DocuSeal lit la
langue du dernier signataire ayant complété), et ce que ça **ne couvre pas**
(les horodatages, qui suivent la langue du compte).

`apps/web/src/lib/signature/__tests__/docuseal.test.ts` — un test
`every(s.metadata?.lang === 'fr-FR')` sur le corps posté, plus un point 5 dans
« Ce qui est verrouillé ici » et une ligne dans le bloc **PROTOCOLE DE
MUTATION**. `CREATE_RESPONSE` n'a pas été touché : c'est la réponse réelle
relevée le 04/09, elle décrit ce que l'API **répond**, pas ce qu'on lui envoie.

### Tâche 2 — La fiche DPA dit ce qui reste à faire à la main (commit `cb75ab7`)

`docs/rgpd/dpa/docuseal.md` — trois inscriptions :

1. **Mesures techniques** : le certificat est demandé en français à chaque
   envoi, portée = les libellés.
2. **Point ouvert 5** ⚠ : action manuelle du responsable de traitement — régler
   la langue du compte sur Français dans `console.docuseal.eu`. Sans ce réglage,
   les horodatages restent au format anglais. À dater une fois fait.
3. **Point ouvert 6** : trois chaînes resteront anglaises quoi qu'il arrive.

Plus `2026-09-10 (langue du certificat de signature)` en date de vérification,
sans effacer celle du 2026-09-04.

## Vérification du protocole de mutation

Le test a été **prouvé discriminant**, pas seulement vu vert. En remplaçant
temporairement la ligne par `...(s.order === 0 ? { metadata: { lang: 'fr-FR' } } : {})`
— c'est-à-dire en n'équipant que le premier signataire — la suite tombe à
`1 failed | 31 passed`, et le test rouge est bien le nouveau. Le fichier a été
restauré depuis sa sauvegarde avant le commit.

## Sortie réelle des gates

| Gate | Résultat |
|---|---|
| `pnpm --filter @qualiof/web test src/lib/signature/__tests__/docuseal.test.ts` | ✅ 32 tests passés (1 fichier) |
| `pnpm lint` | ✅ 3 tâches / 3 réussies |
| `pnpm test` | ✅ 256 fichiers, **2389 passés, 2 skipped** (2391), 3 tâches / 3 |
| `tsc --noEmit` sur `apps/web` | ✅ exit 0, aucune sortie |

`pnpm lint` remonte **deux warnings pré-existants**, dans des fichiers que cette
tâche ne touche pas (`src/app/app/parametres/page.tsx:226` `jsx-a11y/alt-text`,
`src/components/diagnostic-r1/use-autosave.ts:51` `react-hooks/exhaustive-deps`).
Hors périmètre, non corrigés.

`pnpm test` émet un `Error: Not implemented: navigation` sur stderr depuis
`edit-organization-champs.test.tsx` — bruit jsdom pré-existant sur un test qui
**passe**. Non lié.

Il n'y a pas de script `typecheck` dans ce dépôt. Le `lint` de `@qualiof/db` et
`@qualiof/shared` **est** un `tsc --noEmit` ; celui d'`apps/web` est `next lint`
seul, d'où le `tsc --noEmit` lancé à la main sur `apps/web` ci-dessus.

## Écart au plan

Un seul, sur la **forme des commandes de vérification** de la tâche 2, pas sur
le fond. Le plan attendait `grep -c "metadata.lang\|fr-FR" >= 2` et
`grep -c "User agent:\|Time zone:\|Signed with DocuSeal.com"` = 3. Or `grep -c`
compte les **lignes** correspondantes, pas les occurrences. Résultat mesuré :

| Motif | lignes (`grep -c`) | occurrences (`grep -o \| wc -l`) |
|---|---|---|
| `metadata.lang\|fr-FR` | 2 | 3 |
| `User agent:\|Time zone:\|Signed with DocuSeal.com` | **2** | 3 |
| `console.docuseal.eu` | 3 | 3 |
| `2026-09-10` | 1 | 1 |

Les trois chaînes sont bien citées chacune une fois ; `User agent:` et
`Time zone:` partagent simplement une ligne de la puce. Le critère littéral
« = 3 » n'est pas atteignable sans découper une phrase à seule fin de déplacer
un compteur — ce qui n'aurait servi aucun lecteur. Le fond est satisfait.

Une clarification a été ajoutée au passage dans le point ouvert 5 : « (`fr-FR`,
déjà posée par le code — voir mesures techniques) », pour qu'un lecteur des
points ouverts sache immédiatement ce qui est déjà couvert et ce qui reste.

## Ce que cette tâche n'a pas fait

- Aucune variable d'environnement, `.env.example` intact.
- `schema.prisma`, la spec du 2026-09-04, `REGISTRE-TRAITEMENTS.md` et les
  pièces de `.planning/specs/evidence/` : non touchés.
- Le certificat du 10/09 (`1619115-certificat-de-signature.pdf`) n'a pas été
  régénéré : il reste la preuve horodatée de l'état **avant** correction.
- La langue du compte n'a pas été réglée — action hors code, dans
  `console.docuseal.eu`, qui appartient au responsable de traitement.
- Aucun test d'intégration réseau : la suite reste hermétique (`fetch` mocké).
- ROADMAP.md non modifié (tâche quick).

## Reste à faire, hors code

**Action ouverte pour Laurent** : régler la langue du compte sur **Français**
dans `console.docuseal.eu`, puis dater le point ouvert 5 de la fiche DPA. Sans
ce geste, les libellés du prochain certificat seront français mais ses
horodatages resteront « September 10, 2026 at 12:29 PM CEST ».

## Self-Check: PASSED

- `apps/web/src/lib/signature/docuseal.ts` — présent, `metadata: { lang: 'fr-FR' }` l. 186
- `apps/web/src/lib/signature/__tests__/docuseal.test.ts` — présent, test présent
- `docs/rgpd/dpa/docuseal.md` — présent, points 5 et 6 présents
- Commit `6f43d87` — présent dans `git log`
- Commit `cb75ab7` — présent dans `git log`
