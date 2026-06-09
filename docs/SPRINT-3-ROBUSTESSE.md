# Sprint 3 — Robustesse

Date : 2026-06-09

Suite des [Sprint 1 Sécurité](SPRINT-1-SECURITE.md) et [Sprint 2 Observabilité](SPRINT-2-OBSERVABILITE.md).

Objectif : éliminer les failles de RBAC manquant, durcir les inputs publics
avec Zod, sortir l'envoi de mail du chemin synchrone des actions, et poser
le cadre `createAction` pour la migration future des 30 actions encore sans
validation.

---

## Audit préalable

Un audit des 44 server actions a révélé :

| Critère | Résultat |
|---|---|
| Auth présent | 94% (34/36) |
| Tenant scoping | 94% (34/36) |
| **RBAC explicite** | **50%** (18/36) ⚠️ |
| **Validation Zod** | **36%** (13/36) ❌ |
| Transactions Prisma sur multi-write | 39% (14/36) |
| Error handling try/catch | 97% |

**3 patterns de boilerplate identifiés** pour wrapper futur :
1. Document Generator (11 actions)
2. Settings Update (7 actions)
3. RBAC Multi-role Mutation (8 actions)

---

## 1. Helper `createAction` (fondation pour migrations futures)

**Livré** : [apps/web/src/server/_helpers/create-action.ts](../apps/web/src/server/_helpers/create-action.ts)

Wrapper unifié qui factorise auth + RBAC + Zod + log + try/catch + revalidate :

```ts
import { z } from 'zod';
import { createAction, ActionError } from '@/server/_helpers/create-action';

export const archiveLearner = createAction({
  name: 'archiveLearner',
  schema: z.object({ personId: z.string().uuid() }),
  roles: ['ADMIN', 'MANAGER'],
  revalidate: ['/app/apprenants'],
  async handler({ user, input, log }) {
    const person = await prisma.person.findFirst({
      where: { id: input.personId, tenantId: user.tenantId },
    });
    if (!person) throw new ActionError('Apprenant introuvable', 'NOT_FOUND');

    await prisma.person.update({
      where: { id: person.id },
      data: { archived: true },
    });

    log.info({ personId: person.id }, 'learner.archived');
    return { archivedId: person.id };
  },
});

// Côté UI :
const r = await archiveLearner({ personId: 'abc-123' });
if (!r.ok) {
  toast.error(r.error);
  return;
}
toast.success('Apprenant archivé');
```

Avantages :
- **Impossible d'oublier** auth/RBAC/Zod : le wrapper rejette dès la 1ère ligne
- **Format de réponse uniforme** : `{ ok: true, data } | { ok: false, error, code }`
- **Codes d'erreur typés** : `UNAUTHENTICATED | FORBIDDEN | VALIDATION | NOT_FOUND | CONFLICT | INTERNAL`
- **Logs structurés auto** : `action.start`, `action.ok`, `action.error.*` avec durée
- **Sécurité** : les erreurs techniques ne fuient pas le détail interne au client (mais sont loggées avec stack côté serveur)

**Tests** : [create-action.test.ts](../apps/web/src/server/_helpers/__tests__/create-action.test.ts) — 7 cas (auth KO, RBAC KO, validation Zod, handler OK, ActionError métier, masquage erreur technique, coercion Zod).

---

## 2. Correction critique : `crud-edits.ts` (RBAC manquant)

**Le bug le plus dangereux du repo** : avant ce sprint, **toutes les fonctions
de création/édition de Person, Organization, TrainingProduct, Formateur**
utilisaient `validateRequest()` seul, sans aucun check de rôle.

→ Un utilisateur `LECTEUR` ou `COMPTABLE` pouvait éditer/créer/supprimer
n'importe quelle entité métier.

**Livré** : Helper local `authWithRole` + matrices de rôles, appliquées sur les
8 fonctions qui manquaient :

| Fonction | Avant | Après |
|---|---|---|
| `updatePerson` | `validateRequest` seul | `['ADMIN', 'MANAGER', 'COMMERCIAL']` |
| `updateOrganization` | — | `['ADMIN', 'MANAGER', 'COMMERCIAL']` |
| `updateTrainingProduct` | — | `['ADMIN', 'MANAGER']` |
| `createTrainingProduct` | — | `['ADMIN', 'MANAGER']` |
| `createTrainer` | — | `['ADMIN', 'MANAGER']` |
| `createPerson` | — | `['ADMIN', 'MANAGER', 'COMMERCIAL']` |
| `createOrganization` | — | `['ADMIN', 'MANAGER', 'COMMERCIAL']` |
| `createProduct` | — | `['ADMIN', 'MANAGER']` |

Les 4 `delete*` étaient déjà protégées `ADMIN/MANAGER` — non modifiées.

> Note : pas de migration vers `createAction` ici — le fichier fait 880 lignes
> et la migration complète aurait débordé du sprint. Le helper local
> `authWithRole` est un compromis qui sécurise immédiatement, et l'on
> pourra migrer vers `createAction` quand on touchera ce fichier pour
> autre chose.

---

## 3. `preinscription-public.ts` — Zod strict (endpoint PUBLIC)

**Livré** : Schéma `submitInputSchema` complet en haut du fichier, appliqué via
`safeParse(rawInput)` avant tout traitement.

Couvre :
- `token` : `^[a-f0-9]{32,128}$` (format crypto.randomBytes hex)
- `email` : RFC 5321 + max 254 chars + lowercase auto
- `firstName/lastName/birthPlace/...` : trim + bornes max (anti-DoS BDD)
- `rgpdAccepted` : `z.literal(true)` (refuse truthy non-true)
- `files` : array 1-4 items, base64 ≤ 14 Mo
- `signatureBase64` : ≤ 3 Mo (optionnel côté schéma — règle métier `obligatoire` séparée)

Combinée avec la validation magic-bytes (Sprint 1), l'endpoint public est
maintenant **doublement protégé** : Zod sur les champs structurés, magic-bytes
sur le contenu binaire.

Les checks manuels redondants (`!input.firstName?.trim()`, etc.) ont été
supprimés — couverts par Zod.

---

## 4. BullMQ — Queue `mailer-outbound`

**Problème** : les Server Actions appelaient `sendMail()` inline → l'action
attendait ~500ms-2s sur le SMTP avant de répondre. UX dégradée + risque de
timeout si le SMTP rame.

**Livré** : nouvelle queue + worker dédiés.

### Fichiers

| Fichier | Rôle |
|---|---|
| [lib/mailer-queue/queue.ts](../apps/web/src/lib/mailer-queue/queue.ts) | Queue BullMQ singleton + `enqueueMailerJob` |
| [lib/mailer-queue/worker.ts](../apps/web/src/lib/mailer-queue/worker.ts) | Worker (concurrence 5, restaure le contexte de log de la requête originale) |
| [lib/mailer-queue/enqueue.ts](../apps/web/src/lib/mailer-queue/enqueue.ts) | Helper `enqueueMail` avec **fallback inline** si Redis est down |
| [scripts/mailer-worker.ts](../apps/web/scripts/mailer-worker.ts) | Entry-point du worker (`pnpm worker:mailer`) |

### Politique de retry

- 5 tentatives avec backoff exponentiel : **30s → 1min → 2min → 4min → 8min**
- Jobs complétés gardés 7 jours
- Jobs échoués gardés 30 jours (audit RGPD)

### Idempotence

Le `idempotencyKey` passé à `enqueueMail` est promu en `jobId` BullMQ.
2 appels avec la même clé pendant que le 1er est en wait/active/delayed
sont ignorés. Empêche les double-envois sur un double-clic UI.

Conventions de clé :
- `preinscription-link:{token}` — 1 mail par token de pré-inscription
- `lead-assigned:{leadId}:{ownerId}` — 1 mail par paire lead × destinataire

### Migrations appliquées (2 callsites comme exemple)

| Fichier | Avant | Après |
|---|---|---|
| `server/actions/preinscriptions.ts` (envoi du lien) | `await sendMail(...)` inline | `await enqueueMail({ idempotencyKey: 'preinscription-link:...' })` |
| `lib/lead-notifications.ts` (notif assignation) | `await sendMail(...)` inline | `await enqueueMail({ idempotencyKey: 'lead-assigned:...' })` |

Les 6 autres callsites (`closure/worker.ts`, `invoice-reminders/worker.ts`,
`invoices.ts`, etc.) restent en `sendMail` direct pour ce sprint —
migration au fil de l'eau dans les sprints suivants.

### Démarrage du worker

```bash
pnpm --filter @qualiof/web worker:mailer
```

> Si tu n'as PAS Redis lancé (ou si le worker n'est pas démarré), le
> helper `enqueueMail` **bascule automatiquement en envoi inline** —
> aucune perte de mail.

---

## 5. Vitest config

**Livré** : [apps/web/vitest.config.ts](../apps/web/vitest.config.ts)

Avant ce sprint il n'y avait pas de `vitest.config` — les tests devaient
utiliser des imports relatifs `'../foo'`. Pour les nouveaux tests qui
touchent du code utilisant l'alias `@/`, on l'a maintenant résolu
explicitement (Vitest ne lit pas `tsconfig.json paths` par défaut).

---

## Tests

Total Sprint 1+2+3 : **23 tests verts**, 0 erreur TypeScript.

| Fichier | Tests | Couvre |
|---|---|---|
| `file-validation.test.ts` | 11 | Magic-bytes PDF/JPEG/PNG, bornes, falsification |
| `logger.test.ts` | 5 | AsyncLocalStorage, isolation runs concurrents, childLogger |
| `create-action.test.ts` | 7 | Auth KO, RBAC KO, Zod KO, OK, ActionError, masquage erreur, coercion |

---

## Récap fichiers créés / modifiés

| Type | Chemin |
|---|---|
| Nouveau | `apps/web/src/server/_helpers/create-action.ts` |
| Nouveau | `apps/web/src/server/_helpers/__tests__/create-action.test.ts` |
| Nouveau | `apps/web/src/lib/mailer-queue/queue.ts` |
| Nouveau | `apps/web/src/lib/mailer-queue/worker.ts` |
| Nouveau | `apps/web/src/lib/mailer-queue/enqueue.ts` |
| Nouveau | `apps/web/scripts/mailer-worker.ts` |
| Nouveau | `apps/web/vitest.config.ts` |
| Nouveau | `docs/SPRINT-3-ROBUSTESSE.md` |
| Modifié | `apps/web/src/server/actions/crud-edits.ts` (helper RBAC + 8 fonctions migrées) |
| Modifié | `apps/web/src/server/actions/preinscription-public.ts` (Zod strict) |
| Modifié | `apps/web/src/server/actions/preinscriptions.ts` (enqueueMail) |
| Modifié | `apps/web/src/lib/lead-notifications.ts` (enqueueMail) |
| Modifié | `apps/web/package.json` (`worker:mailer` script) |

## Reste à faire (Sprint 4)

- **Migration progressive** des 24 actions restantes sans Zod vers `createAction`
  (priorité : dossiers-opco-bulk, invoices, leads — les plus critiques)
- **Migration des 6 callsites sendMail** restants vers `enqueueMail`
- **Prisma extension multi-tenant automatique** — `$extends({ query: ... })`
  qui injecte `where: { tenantId }` partout (anti-oubli cross-tenant)
- **Idempotency keys** sur les autres queues (closure-generation,
  invoice-reminders) — déjà partiellement présentes mais à durcir
- **Retry policies audit** : aligner les concurrences et backoff de toutes
  les queues sur une stratégie commune documentée
