# Inscriptions publiques par session — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre d'ouvrir une session aux inscriptions via un lien public partageable, où les apprenants saisissent leurs informations et déposent leurs pièces, et où la validation admin crée l'apprenant **et** son inscription à la session.

**Architecture:** Une route publique non authentifiée `/inscription/[token]` résolue par un jeton porté par `TrainingSession`. Les pièces partent en direct du navigateur vers le Storage (URL signée), aucune ligne n'est écrite en base avant la soumission. La demande atterrit en `PreEnrollment` (statut `SUBMITTED`, `intendedSessionId` renseigné) et le worker OCR existant la traite sans modification. La validation admin étend `convertPreEnrollment` avec la création du `SessionParticipant`.

**Tech Stack:** Next.js 14 App Router (RSC + server actions), Prisma 5.22 / PostgreSQL Supabase, Supabase Storage (fallback MinIO), Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-28-inscriptions-publiques-par-session-design.md`

## Global Constraints

- **Multi-tenant** : toute server action authentifiée scope par `user.tenantId` (`CLAUDE.md`). Les actions publiques n'ont pas de session Lucia : elles valident par jeton, jamais via `validateRequest()`.
- **Migrations** : `pnpm db:migrate` en local, puis `prisma migrate deploy` sur le cloud. `prisma generate` ne remplace jamais une migration.
- **Lieu de formation** : toute composition passe par `formatLieuFormation()` de `apps/web/src/lib/locations/format-lieu.ts`. Aucune concaténation locale — 3 copies divergentes ont causé un refus AGEFICE le 28/08/2026.
- **Tarif** : hors périmètre de ce plan. Le prix est un forfait **par entreprise** saisi depuis la fiche session (`EditParticipantButton`), jamais collecté ni calculé par le formulaire public. Une inscription issue du lien public naît à `priceHT = 0` et attend sa saisie.
- **PII** : aperçu d'image par `<img>` natif, jamais `next/image` (proxy CDN interdit sur PII). Le n° de sécurité sociale ne s'écrit que dans `SensitiveData`.
- **Routes** : routes en français, kebab-case. Toute nouvelle route reçoit ses redirections 308 dans `apps/web/next.config.mjs` (avec et sans `:path*`).
- **Tests** : `pnpm --filter @qualiof/web test` (Vitest, `dotenv -e ../../.env`). Mocks Prisma via `vi.hoisted` + `vi.mock('@qualiof/db')`, comme `server/actions/__tests__/prepare-training.payer-rule.test.ts`.
- **Base locale** : `.env` pointe le **cloud** Supabase avec `connection_limit=1`. Ne jamais lancer un second `next dev` (l'instance de Laurent tourne sur le port 3010).
- **Commits** : un commit par tâche, message en français, préfixe `feat:` / `test:` / `fix:`.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `packages/db/prisma/schema.prisma` | 3 colonnes sur `TrainingSession`, 7 sur `PreEnrollment` |
| `apps/web/src/lib/enrollment/public-link.ts` | logique pure : état d'ouverture du lien, génération de jeton, construction d'URL |
| `apps/web/src/lib/enrollment/sponsor-org.ts` | logique pure : quelle organisation paye, à partir du statut déclaré |
| `apps/web/src/server/actions/session-enrollment-public.ts` | actions **non authentifiées** : URL d'upload, soumission |
| `apps/web/src/server/actions/session-enrollment-admin.ts` | actions **authentifiées** : ouvrir, fermer, révoquer, valider+inscrire |
| `apps/web/src/app/inscription/[token]/page.tsx` | page publique, 5 états d'affichage |
| `apps/web/src/components/enrollment/session-enrollment-form.tsx` | formulaire public étendu |
| `apps/web/src/components/sessions/session-enrollment-block.tsx` | bloc de pilotage du lien, fiche session |
| `apps/web/src/components/sessions/session-enrollment-requests.tsx` | liste des demandes de la session |
| `apps/web/scripts/purge-orphan-drafts.ts` | purge des brouillons abandonnés |

Les deux modules de `lib/enrollment/` sont **purs** (aucun import Prisma, aucun `'use server'`) : c'est ce qui les rend testables sans base et réutilisables des deux côtés de la frontière RSC.

---

### Task 1 : Schéma et logique du lien public

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (models `TrainingSession`, `PreEnrollment`)
- Create: `apps/web/src/lib/enrollment/public-link.ts`
- Test: `apps/web/src/lib/enrollment/__tests__/public-link.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `generatePublicToken(): string` — 32 caractères hexadécimaux.
  - `type PublicLinkState = 'ouvert' | 'jamais-ouvert' | 'ferme' | 'session-terminee' | 'complet'`
  - `publicLinkState(input: PublicLinkInput): PublicLinkState`
  - `interface PublicLinkInput { publicToken: string | null; publicFormClosedAt: Date | null; sessionStatus: string; capacityMax: number; participantCount: number; pendingRequestCount: number }`
  - `buildPublicEnrollmentUrl(token: string, baseUrl?: string): string`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `apps/web/src/lib/enrollment/__tests__/public-link.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import {
  generatePublicToken,
  publicLinkState,
  buildPublicEnrollmentUrl,
  type PublicLinkInput,
} from '../public-link';

const base: PublicLinkInput = {
  publicToken: 'a'.repeat(32),
  publicFormClosedAt: null,
  sessionStatus: 'OPEN',
  capacityMax: 12,
  participantCount: 3,
  pendingRequestCount: 1,
};

describe('generatePublicToken', () => {
  it('produit 32 caractères hexadécimaux', () => {
    const t = generatePublicToken();
    expect(t).toMatch(/^[0-9a-f]{32}$/);
  });

  it('ne produit pas deux fois le même jeton', () => {
    expect(generatePublicToken()).not.toBe(generatePublicToken());
  });
});

describe('publicLinkState', () => {
  it('ouvert quand le jeton existe, rien n’est fermé et il reste de la place', () => {
    expect(publicLinkState(base)).toBe('ouvert');
  });

  it('jamais-ouvert quand le jeton est absent', () => {
    expect(publicLinkState({ ...base, publicToken: null })).toBe('jamais-ouvert');
  });

  it('ferme quand publicFormClosedAt est renseigné', () => {
    expect(publicLinkState({ ...base, publicFormClosedAt: new Date() })).toBe('ferme');
  });

  it('session-terminee pour une session COMPLETED', () => {
    expect(publicLinkState({ ...base, sessionStatus: 'COMPLETED' })).toBe('session-terminee');
  });

  it('session-terminee pour une session CANCELLED', () => {
    expect(publicLinkState({ ...base, sessionStatus: 'CANCELLED' })).toBe('session-terminee');
  });

  it('complet quand inscrits + demandes en cours atteignent la capacité', () => {
    expect(
      publicLinkState({ ...base, participantCount: 10, pendingRequestCount: 2 }),
    ).toBe('complet');
  });

  it('la fermeture manuelle prime sur la capacité disponible', () => {
    expect(
      publicLinkState({ ...base, publicFormClosedAt: new Date(), participantCount: 0 }),
    ).toBe('ferme');
  });
});

describe('buildPublicEnrollmentUrl', () => {
  it('compose une URL absolue sans double slash', () => {
    expect(buildPublicEnrollmentUrl('abc', 'https://qualiof.vercel.app/')).toBe(
      'https://qualiof.vercel.app/inscription/abc',
    );
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

```bash
cd "apps/web" && pnpm exec vitest run src/lib/enrollment/__tests__/public-link.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "../public-link"`.

- [ ] **Step 3 : Écrire l'implémentation minimale**

Créer `apps/web/src/lib/enrollment/public-link.ts` :

```ts
/**
 * Logique PURE du lien public d'inscription par session.
 *
 * Module neutre : ni 'use server', ni 'use client', ni import Prisma — il est
 * consommé à la fois par la page serveur publique, par les server actions et
 * par le bloc client de la fiche session (convention RSC, cf. Phase 15 :
 * un helper partagé ne doit JAMAIS être défini dans un module client).
 */

import { randomUUID } from 'node:crypto';

export type PublicLinkState =
  | 'ouvert'
  | 'jamais-ouvert'
  | 'ferme'
  | 'session-terminee'
  | 'complet';

export interface PublicLinkInput {
  publicToken: string | null;
  publicFormClosedAt: Date | null;
  sessionStatus: string;
  capacityMax: number;
  /** Inscrits confirmés (SessionParticipant). */
  participantCount: number;
  /** Demandes reçues pas encore converties ni rejetées. */
  pendingRequestCount: number;
}

const STATUTS_CLOS = new Set(['COMPLETED', 'CANCELLED']);

export function generatePublicToken(): string {
  return randomUUID().replace(/-/g, '');
}

/**
 * Ordre de priorité volontaire : une fermeture manuelle ou une session close
 * l'emporte toujours sur la disponibilité de places. On ne rouvre jamais un
 * lien « par surprise » parce qu'un participant a été désinscrit.
 */
export function publicLinkState(input: PublicLinkInput): PublicLinkState {
  if (!input.publicToken) return 'jamais-ouvert';
  if (input.publicFormClosedAt) return 'ferme';
  if (STATUTS_CLOS.has(input.sessionStatus)) return 'session-terminee';
  if (input.participantCount + input.pendingRequestCount >= input.capacityMax) {
    return 'complet';
  }
  return 'ouvert';
}

export function buildPublicEnrollmentUrl(token: string, baseUrl?: string): string {
  const root =
    baseUrl ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    'http://localhost:3000';
  return `${root.replace(/\/+$/, '')}/inscription/${token}`;
}
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

```bash
cd "apps/web" && pnpm exec vitest run src/lib/enrollment/__tests__/public-link.test.ts
```

Attendu : 10 tests PASS.

- [ ] **Step 5 : Ajouter les colonnes au schéma Prisma**

Dans `packages/db/prisma/schema.prisma`, model `TrainingSession`, après `preEnrollmentsFromMls` :

```prisma
  // Lien public d'inscription (spec 2026-08-28). publicToken null = jamais
  // ouvert ; publicFormClosedAt non null = fermé. Régénérer le jeton invalide
  // l'ancien lien immédiatement.
  publicToken           String?              @unique
  publicFormOpenedAt    DateTime?
  publicFormClosedAt    DateTime?
```

Dans le model `PreEnrollment`, après `professionalExperience` :

```prisma
  // Champs du formulaire public par session (spec 2026-08-28). Le n° de
  // sécurité sociale n'est VOLONTAIREMENT pas ici : il va directement dans
  // SensitiveData à la validation (minimisation RGPD).
  birthName              String?
  address                String?
  city                   String?
  postalCode             String?
  companyName            String?
  companySiret           String?
  managerSince           String?
```

Ajouter aussi l'index qui sert la liste des demandes d'une session :

```prisma
  @@index([intendedSessionId, status])
```

- [ ] **Step 6 : Générer et appliquer la migration**

```bash
cd "packages/db" && pnpm db:migrate --name public_enrollment_links
```

Attendu : migration créée sous `packages/db/prisma/migrations/<timestamp>_public_enrollment_links/`, client Prisma régénéré. Vérifier que le SQL ne contient que des `ADD COLUMN` et deux `CREATE INDEX` — aucun `DROP`.

- [ ] **Step 7 : Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations apps/web/src/lib/enrollment/
git commit -m "feat(inscriptions): jeton de lien public par session + colonnes formulaire"
```

---

### Task 2 : Résolution de l'organisation payeuse

**Files:**
- Create: `apps/web/src/lib/enrollment/sponsor-org.ts`
- Test: `apps/web/src/lib/enrollment/__tests__/sponsor-org.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `type SponsorDecision = { kind: 'creer-ei'; siret: string | null; legalName: string } | { kind: 'org-existante'; organizationId: string } | { kind: 'a-confirmer'; raison: string }`
  - `resolveSponsorOrg(input: SponsorInput): SponsorDecision`
  - `interface SponsorInput { professionalStatus: string | null; companyName: string | null; companySiret: string | null; firstName: string; lastName: string; matchedOrganizationId: string | null }`

`matchedOrganizationId` est le résultat d'une recherche par SIRET faite **par l'appelant** (la fonction reste pure, sans accès base).

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `apps/web/src/lib/enrollment/__tests__/sponsor-org.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { resolveSponsorOrg, type SponsorInput } from '../sponsor-org';

const base: SponsorInput = {
  professionalStatus: 'Agent commercial',
  companyName: 'MARX IMMO',
  companySiret: '123 456 789 00012',
  firstName: 'Jean',
  lastName: 'Martin',
  matchedOrganizationId: null,
};

describe('resolveSponsorOrg', () => {
  it('agent commercial : crée son EI avec le SIRET nettoyé', () => {
    expect(resolveSponsorOrg(base)).toEqual({
      kind: 'creer-ei',
      siret: '12345678900012',
      legalName: 'MARX IMMO',
    });
  });

  it('agent commercial sans raison sociale : nom de l’EI dérivé de l’identité', () => {
    const d = resolveSponsorOrg({ ...base, companyName: null });
    expect(d).toEqual({ kind: 'creer-ei', siret: '12345678900012', legalName: 'Jean MARTIN' });
  });

  it('dirigeant avec entreprise connue : réutilise l’organisation trouvée', () => {
    const d = resolveSponsorOrg({
      ...base,
      professionalStatus: 'Dirigeant',
      matchedOrganizationId: 'org-1',
    });
    expect(d).toEqual({ kind: 'org-existante', organizationId: 'org-1' });
  });

  it('dirigeant avec entreprise inconnue : crée l’EI sur le SIRET déclaré', () => {
    const d = resolveSponsorOrg({ ...base, professionalStatus: 'Dirigeant' });
    expect(d.kind).toBe('creer-ei');
  });

  it('salarié avec enseigne connue : l’enseigne paye', () => {
    const d = resolveSponsorOrg({
      ...base,
      professionalStatus: 'Salarié',
      matchedOrganizationId: 'org-enseigne',
    });
    expect(d).toEqual({ kind: 'org-existante', organizationId: 'org-enseigne' });
  });

  it('salarié avec SIRET inconnu : JAMAIS de création automatique', () => {
    const d = resolveSponsorOrg({ ...base, professionalStatus: 'Salarié' });
    expect(d.kind).toBe('a-confirmer');
  });

  it('statut non renseigné : à confirmer', () => {
    const d = resolveSponsorOrg({ ...base, professionalStatus: null });
    expect(d.kind).toBe('a-confirmer');
  });

  it('SIRET absent pour un indépendant : à confirmer', () => {
    const d = resolveSponsorOrg({ ...base, companySiret: null });
    expect(d.kind).toBe('a-confirmer');
  });

  it('SIRET de longueur invalide : à confirmer', () => {
    const d = resolveSponsorOrg({ ...base, companySiret: '1234' });
    expect(d.kind).toBe('a-confirmer');
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

```bash
cd "apps/web" && pnpm exec vitest run src/lib/enrollment/__tests__/sponsor-org.test.ts
```

Attendu : ÉCHEC — module introuvable.

- [ ] **Step 3 : Écrire l'implémentation**

Créer `apps/web/src/lib/enrollment/sponsor-org.ts` :

```ts
/**
 * Qui paye ? — règle métier figée (feedback_regle_payeur) :
 *   auto-entrepreneur / agent commercial → il paye lui-même via son EI
 *   salarié                              → sa structure paye
 *
 * Le formulaire public est ouvert sur Internet : on n'y crée JAMAIS une
 * organisation « enseigne » à partir d'un SIRET saisi librement, sous peine
 * de noyer le CRM de doublons. Un salarié dont le SIRET est inconnu part en
 * 'a-confirmer' : l'admin choisit l'organisation à la main.
 *
 * Fonction PURE : la recherche par SIRET est faite par l'appelant et passée
 * via `matchedOrganizationId`.
 */

export type SponsorDecision =
  | { kind: 'creer-ei'; siret: string | null; legalName: string }
  | { kind: 'org-existante'; organizationId: string }
  | { kind: 'a-confirmer'; raison: string };

export interface SponsorInput {
  professionalStatus: string | null;
  companyName: string | null;
  companySiret: string | null;
  firstName: string;
  lastName: string;
  matchedOrganizationId: string | null;
}

/** Un SIRET valide fait exactement 14 chiffres, séparateurs retirés. */
export function cleanSiret(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length === 14 ? digits : null;
}

const INDEPENDANTS = new Set(['Agent commercial', 'Dirigeant']);

export function resolveSponsorOrg(input: SponsorInput): SponsorDecision {
  const statut = input.professionalStatus?.trim() ?? '';
  if (!statut) {
    return { kind: 'a-confirmer', raison: 'Statut professionnel non renseigné' };
  }

  // Une organisation déjà connue gagne toujours : pas de doublon.
  if (input.matchedOrganizationId) {
    return { kind: 'org-existante', organizationId: input.matchedOrganizationId };
  }

  if (statut === 'Salarié') {
    return {
      kind: 'a-confirmer',
      raison: "Salarié dont l'entreprise n'est pas encore dans le CRM — à rattacher à la main",
    };
  }

  if (INDEPENDANTS.has(statut)) {
    const siret = cleanSiret(input.companySiret);
    if (!siret) {
      return { kind: 'a-confirmer', raison: 'SIRET absent ou invalide' };
    }
    const legalName =
      input.companyName?.trim() ||
      `${input.firstName.trim()} ${input.lastName.trim().toUpperCase()}`;
    return { kind: 'creer-ei', siret, legalName };
  }

  return { kind: 'a-confirmer', raison: `Statut « ${statut} » non pris en charge` };
}
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

```bash
cd "apps/web" && pnpm exec vitest run src/lib/enrollment/__tests__/sponsor-org.test.ts
```

Attendu : 9 tests PASS.

- [ ] **Step 5 : Commit**

```bash
git add apps/web/src/lib/enrollment/sponsor-org.ts apps/web/src/lib/enrollment/__tests__/sponsor-org.test.ts
git commit -m "feat(inscriptions): règle payeur pour les demandes publiques"
```

---

### Task 3 : Actions publiques (upload + soumission)

**Files:**
- Create: `apps/web/src/server/actions/session-enrollment-public.ts`
- Test: `apps/web/src/server/actions/__tests__/session-enrollment-public.test.ts`
- Read for reference: `apps/web/src/server/actions/storage-upload.ts:78-165`

**Interfaces:**
- Consumes: `publicLinkState`, `generatePublicToken` (Task 1) ; `createSignedUploadUrl`, `PREENROLLMENT_BUCKET` de `@/lib/storage`.
- Produces:
  - `createSessionEnrollmentUploadUrl(publicToken: string, draftId: string, kind: 'CNI' | 'RIB' | 'CFP', ext: string): Promise<{ ok: true; path: string; token: string; signedUrl: string } | { ok: false; error: string }>`
  - `submitSessionEnrollmentRequest(publicToken: string, draftId: string, keys: Partial<Record<'CNI' | 'RIB' | 'CFP', string>>, fields: SessionEnrollmentFields): Promise<{ ok: true } | { ok: false; error: string }>`
  - `interface SessionEnrollmentFields { firstName: string; lastName: string; birthName?: string; email: string; phone?: string; birthDate?: string; birthPlace?: string; address?: string; city?: string; postalCode?: string; socialSecurityNb?: string; educationLevel?: string; managerSince?: string; companyName?: string; companySiret?: string; professionalStatus?: string; rgpdAccepted: boolean }`

Le n° de sécurité sociale traverse cette action **sans être écrit** : il est rangé dans `extractedData.socialSecurityNb` uniquement si l'admin en a besoin à la validation — voir Step 3, décision explicite.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `apps/web/src/server/actions/__tests__/session-enrollment-public.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  sessionFindUnique: vi.fn(),
  participantCount: vi.fn(),
  preEnrollmentCount: vi.fn(),
  preEnrollmentFindFirst: vi.fn(),
  preEnrollmentCreate: vi.fn(),
  preEnrollmentUpdate: vi.fn(),
  createSignedUploadUrl: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    trainingSession: { findUnique: m.sessionFindUnique },
    sessionParticipant: { count: m.participantCount },
    preEnrollment: {
      count: m.preEnrollmentCount,
      findFirst: m.preEnrollmentFindFirst,
      create: m.preEnrollmentCreate,
      update: m.preEnrollmentUpdate,
    },
  },
}));

vi.mock('@/lib/storage', () => ({
  PREENROLLMENT_BUCKET: 'preinscriptions',
  createSignedUploadUrl: m.createSignedUploadUrl,
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  createSessionEnrollmentUploadUrl,
  submitSessionEnrollmentRequest,
} from '../session-enrollment-public';

const SESSION_OUVERTE = {
  id: 'ses-1',
  tenantId: 'tenant-1',
  publicToken: 'tok',
  publicFormClosedAt: null,
  status: 'OPEN',
  capacityMax: 12,
  endDate: new Date('2026-10-30'),
};

const CHAMPS_VALIDES = {
  firstName: 'Jean',
  lastName: 'Martin',
  email: 'JEAN.MARTIN@Mail.com',
  companySiret: '12345678900012',
  professionalStatus: 'Agent commercial',
  rgpdAccepted: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.sessionFindUnique.mockResolvedValue(SESSION_OUVERTE);
  m.participantCount.mockResolvedValue(2);
  m.preEnrollmentCount.mockResolvedValue(1);
  m.preEnrollmentFindFirst.mockResolvedValue(null);
  m.preEnrollmentCreate.mockResolvedValue({ id: 'pe-1' });
  m.createSignedUploadUrl.mockResolvedValue({
    path: 'p',
    token: 't',
    signedUrl: 'https://storage/put',
  });
});

describe('createSessionEnrollmentUploadUrl', () => {
  it('range le fichier sous sessions/{sessionId}/{draftId}/', async () => {
    const r = await createSessionEnrollmentUploadUrl('tok', 'draft-1', 'CNI', 'pdf');
    expect(r.ok).toBe(true);
    const [bucket, path] = m.createSignedUploadUrl.mock.calls[0];
    expect(bucket).toBe('preinscriptions');
    expect(path).toMatch(/^sessions\/ses-1\/draft-1\/cni-\d+\.pdf$/);
  });

  it('refuse un jeton inconnu', async () => {
    m.sessionFindUnique.mockResolvedValue(null);
    const r = await createSessionEnrollmentUploadUrl('nope', 'draft-1', 'CNI', 'pdf');
    expect(r).toEqual({ ok: false, error: 'Lien invalide' });
  });

  it('refuse quand le lien est fermé', async () => {
    m.sessionFindUnique.mockResolvedValue({
      ...SESSION_OUVERTE,
      publicFormClosedAt: new Date(),
    });
    const r = await createSessionEnrollmentUploadUrl('tok', 'draft-1', 'CNI', 'pdf');
    expect(r.ok).toBe(false);
  });

  it('refuse une extension non autorisée', async () => {
    const r = await createSessionEnrollmentUploadUrl('tok', 'draft-1', 'CNI', 'exe');
    expect(r.ok).toBe(false);
    expect(m.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('refuse un draftId qui tente de remonter dans l’arborescence', async () => {
    const r = await createSessionEnrollmentUploadUrl('tok', '../../etc', 'CNI', 'pdf');
    expect(r.ok).toBe(false);
    expect(m.createSignedUploadUrl).not.toHaveBeenCalled();
  });
});

describe('submitSessionEnrollmentRequest', () => {
  it('crée la demande en SUBMITTED, rattachée à la session', async () => {
    const r = await submitSessionEnrollmentRequest('tok', 'draft-1', { CNI: 'k1' }, CHAMPS_VALIDES);
    expect(r.ok).toBe(true);
    const data = m.preEnrollmentCreate.mock.calls[0][0].data;
    expect(data.status).toBe('SUBMITTED');
    expect(data.intendedSessionId).toBe('ses-1');
    expect(data.tenantId).toBe('tenant-1');
    expect(data.cniKey).toBe('k1');
    expect(data.email).toBe('jean.martin@mail.com');
    expect(data.token).toMatch(/^[0-9a-f]{32}$/);
  });

  it('n’écrit JAMAIS le numéro de sécurité sociale sur PreEnrollment', async () => {
    await submitSessionEnrollmentRequest(
      'tok',
      'draft-1',
      { CNI: 'k1' },
      { ...CHAMPS_VALIDES, socialSecurityNb: '1 85 05 78 006 084 36' },
    );
    const data = m.preEnrollmentCreate.mock.calls[0][0].data;
    expect(JSON.stringify(data)).not.toContain('006 084');
    expect(JSON.stringify(data)).not.toContain('18505780060843');
  });

  it('rejoue le même draftId sans créer de doublon', async () => {
    m.preEnrollmentFindFirst.mockResolvedValue({ id: 'pe-existante' });
    const r = await submitSessionEnrollmentRequest('tok', 'draft-1', { CNI: 'k1' }, CHAMPS_VALIDES);
    expect(r.ok).toBe(true);
    expect(m.preEnrollmentCreate).not.toHaveBeenCalled();
    expect(m.preEnrollmentUpdate).toHaveBeenCalled();
  });

  it('refuse sans consentement RGPD', async () => {
    const r = await submitSessionEnrollmentRequest(
      'tok',
      'draft-1',
      { CNI: 'k1' },
      { ...CHAMPS_VALIDES, rgpdAccepted: false },
    );
    expect(r.ok).toBe(false);
    expect(m.preEnrollmentCreate).not.toHaveBeenCalled();
  });

  it('refuse sans aucune pièce', async () => {
    const r = await submitSessionEnrollmentRequest('tok', 'draft-1', {}, CHAMPS_VALIDES);
    expect(r.ok).toBe(false);
  });

  it('refuse quand la session est complète', async () => {
    m.participantCount.mockResolvedValue(11);
    m.preEnrollmentCount.mockResolvedValue(1);
    const r = await submitSessionEnrollmentRequest('tok', 'draft-1', { CNI: 'k1' }, CHAMPS_VALIDES);
    expect(r.ok).toBe(false);
    expect(m.preEnrollmentCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

```bash
cd "apps/web" && pnpm exec vitest run src/server/actions/__tests__/session-enrollment-public.test.ts
```

Attendu : ÉCHEC — module introuvable.

- [ ] **Step 3 : Écrire l'implémentation**

Créer `apps/web/src/server/actions/session-enrollment-public.ts` :

```ts
'use server';

/**
 * Actions PUBLIQUES du formulaire d'inscription par session.
 *
 * Aucune session Lucia : l'autorisation vient du `publicToken` porté par la
 * session de formation — jamais de `validateRequest()` ici.
 *
 * Rien n'est écrit en base avant la soumission : les pièces montent d'abord
 * sous un `draftId` généré par le navigateur. C'est ce qui évite qu'un lien
 * diffusé largement remplisse la table de dossiers vides (défaut de
 * /preinscription, qui crée une ligne à chaque visite).
 */

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { createSignedUploadUrl, PREENROLLMENT_BUCKET } from '@/lib/storage';
import { publicLinkState } from '@/lib/enrollment/public-link';

export type EnrollmentDocKind = 'CNI' | 'RIB' | 'CFP';

const EXTENSIONS_AUTORISEES = new Set(['pdf', 'jpg', 'jpeg', 'png']);
const DRAFT_ID_VALIDE = /^[0-9a-zA-Z-]{8,64}$/;

type ActionError = { ok: false; error: string };
type SignedUploadOk = { ok: true; path: string; token: string; signedUrl: string };

export interface SessionEnrollmentFields {
  firstName: string;
  lastName: string;
  birthName?: string;
  email: string;
  phone?: string;
  birthDate?: string;
  birthPlace?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  /** Transporté, JAMAIS persisté ici — cf. minimisation RGPD (spec §4.2). */
  socialSecurityNb?: string;
  educationLevel?: string;
  managerSince?: string;
  companyName?: string;
  companySiret?: string;
  professionalStatus?: string;
  rgpdAccepted: boolean;
}

/** Charge la session par jeton et calcule si le formulaire accepte encore des dépôts. */
async function chargerSessionOuverte(publicToken: string) {
  const session = await prisma.trainingSession.findUnique({
    where: { publicToken },
    select: {
      id: true,
      tenantId: true,
      publicToken: true,
      publicFormClosedAt: true,
      status: true,
      capacityMax: true,
      endDate: true,
    },
  });
  if (!session) return { erreur: 'Lien invalide' as const };

  const [participantCount, pendingRequestCount] = await Promise.all([
    prisma.sessionParticipant.count({ where: { sessionId: session.id } }),
    prisma.preEnrollment.count({
      where: {
        intendedSessionId: session.id,
        status: { in: ['SUBMITTED', 'EXTRACTING', 'EXTRACTED', 'VALIDATED'] },
      },
    }),
  ]);

  const etat = publicLinkState({
    publicToken: session.publicToken,
    publicFormClosedAt: session.publicFormClosedAt,
    sessionStatus: session.status,
    capacityMax: session.capacityMax,
    participantCount,
    pendingRequestCount,
  });

  if (etat === 'complet') return { erreur: 'Cette session est complète' as const };
  if (etat !== 'ouvert') return { erreur: 'Les inscriptions sont closes' as const };
  return { session };
}

export async function createSessionEnrollmentUploadUrl(
  publicToken: string,
  draftId: string,
  kind: EnrollmentDocKind,
  ext: string,
): Promise<SignedUploadOk | ActionError> {
  if (!DRAFT_ID_VALIDE.test(draftId)) {
    return { ok: false, error: 'Identifiant de dépôt invalide' };
  }
  const extension = ext.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!EXTENSIONS_AUTORISEES.has(extension)) {
    return { ok: false, error: 'Format accepté : PDF, JPG ou PNG' };
  }

  const r = await chargerSessionOuverte(publicToken);
  if ('erreur' in r) return { ok: false, error: r.erreur };

  const path = `sessions/${r.session.id}/${draftId}/${kind.toLowerCase()}-${Date.now()}.${extension}`;
  try {
    const { token, signedUrl } = await createSignedUploadUrl(PREENROLLMENT_BUCKET, path);
    return { ok: true, path, token, signedUrl };
  } catch (e: any) {
    console.error('[inscription] signed upload URL échoué', e);
    return { ok: false, error: `Préparation de l'envoi échouée : ${e?.message ?? e}` };
  }
}

export async function submitSessionEnrollmentRequest(
  publicToken: string,
  draftId: string,
  keys: Partial<Record<EnrollmentDocKind, string>>,
  fields: SessionEnrollmentFields,
): Promise<{ ok: true } | ActionError> {
  if (!DRAFT_ID_VALIDE.test(draftId)) {
    return { ok: false, error: 'Identifiant de dépôt invalide' };
  }
  if (!fields.firstName?.trim() || !fields.lastName?.trim() || !fields.email?.trim()) {
    return { ok: false, error: 'Nom, prénom et email sont obligatoires' };
  }
  if (!fields.rgpdAccepted) {
    return { ok: false, error: "Tu dois accepter le traitement de tes données pour continuer" };
  }
  if (Object.keys(keys).length === 0) {
    return { ok: false, error: 'Au moins une pièce justificative est requise' };
  }

  const r = await chargerSessionOuverte(publicToken);
  if ('erreur' in r) return { ok: false, error: r.erreur };
  const { session } = r;

  // Les données du formulaire, SANS le numéro de sécurité sociale : il n'est
  // écrit qu'à la validation, directement dans SensitiveData (spec §4.2).
  const donnees = {
    firstName: fields.firstName.trim(),
    lastName: fields.lastName.trim(),
    birthName: fields.birthName?.trim() || null,
    email: fields.email.trim().toLowerCase(),
    phone: fields.phone?.trim() || null,
    birthDate: fields.birthDate ? new Date(fields.birthDate) : null,
    birthPlace: fields.birthPlace?.trim() || null,
    address: fields.address?.trim() || null,
    city: fields.city?.trim() || null,
    postalCode: fields.postalCode?.trim() || null,
    educationLevel: fields.educationLevel?.trim() || null,
    managerSince: fields.managerSince?.trim() || null,
    companyName: fields.companyName?.trim() || null,
    companySiret: fields.companySiret?.replace(/\D/g, '') || null,
    professionalStatus: fields.professionalStatus?.trim() || null,
    cniKey: keys.CNI ?? null,
    ribKey: keys.RIB ?? null,
    cfpKey: keys.CFP ?? null,
    rgpdAcceptedAt: new Date(),
    submittedAt: new Date(),
    status: 'SUBMITTED' as const,
  };

  // Idempotence : le même brouillon renvoyé (double clic, reprise réseau) met
  // à jour la demande existante au lieu d'en créer une seconde.
  const existante = await prisma.preEnrollment.findFirst({
    where: { intendedSessionId: session.id, extractedData: { path: ['draftId'], equals: draftId } },
    select: { id: true },
  });

  if (existante) {
    await prisma.preEnrollment.update({ where: { id: existante.id }, data: donnees });
  } else {
    const expiresAt = new Date(session.endDate);
    expiresAt.setDate(expiresAt.getDate() + 30);
    await prisma.preEnrollment.create({
      data: {
        ...donnees,
        tenantId: session.tenantId,
        token: randomUUID().replace(/-/g, ''),
        expiresAt,
        intendedSessionId: session.id,
        extractedData: { draftId },
      },
    });
  }

  revalidatePath('/app/inscriptions');
  revalidatePath(`/app/sessions/${session.id}`);
  return { ok: true };
}
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

```bash
cd "apps/web" && pnpm exec vitest run src/server/actions/__tests__/session-enrollment-public.test.ts
```

Attendu : 12 tests PASS.

- [ ] **Step 5 : Vérifier que le worker OCR prendra ces demandes**

```bash
grep -n "SUBMITTED" apps/web/src/lib/preinscription-ocr-queue.ts
```

Attendu : la requête de poll filtre sur `status = 'SUBMITTED'` sans autre condition — les nouvelles demandes sont donc traitées sans modifier le worker. Si une condition supplémentaire apparaît, l'ajouter au plan avant de continuer.

- [ ] **Step 6 : Commit**

```bash
git add apps/web/src/server/actions/session-enrollment-public.ts apps/web/src/server/actions/__tests__/session-enrollment-public.test.ts
git commit -m "feat(inscriptions): actions publiques de dépôt et de soumission par session"
```

---

### Task 4 : Page publique et formulaire

**Files:**
- Create: `apps/web/src/app/inscription/[token]/page.tsx`
- Create: `apps/web/src/components/enrollment/session-enrollment-form.tsx`
- Modify: `apps/web/next.config.mjs` (redirections 308)
- Read for reference: `apps/web/src/components/preinscriptions/public-form.tsx`, `apps/web/src/app/preinscription/[token]/page.tsx`

**Interfaces:**
- Consumes: `publicLinkState` (Task 1) ; `createSessionEnrollmentUploadUrl`, `submitSessionEnrollmentRequest`, `SessionEnrollmentFields` (Task 3) ; `DirectUploadField` de `@/components/shared/direct-upload-field` ; `formatLieuFormation` de `@/lib/locations/format-lieu`.
- Produces: la route `/inscription/[token]`.

- [ ] **Step 1 : Écrire la page publique**

Créer `apps/web/src/app/inscription/[token]/page.tsx`. La page est un composant serveur : elle résout la session, calcule l'état, et n'affiche le formulaire que si l'état vaut `'ouvert'`.

```tsx
import { notFound } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { publicLinkState } from '@/lib/enrollment/public-link';
import { formatLieuFormation } from '@/lib/locations/format-lieu';
import { SessionEnrollmentForm } from '@/components/enrollment/session-enrollment-form';

export const dynamic = 'force-dynamic';

export default async function PublicSessionEnrollmentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const session = await prisma.trainingSession.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
      capacityMax: true,
      publicToken: true,
      publicFormClosedAt: true,
      product: { select: { title: true } },
      location: {
        select: { name: true, legalName: true, addressFull: true, postalCode: true, city: true },
      },
    },
  });
  if (!session) notFound();

  const [participantCount, pendingRequestCount] = await Promise.all([
    prisma.sessionParticipant.count({ where: { sessionId: session.id } }),
    prisma.preEnrollment.count({
      where: {
        intendedSessionId: session.id,
        status: { in: ['SUBMITTED', 'EXTRACTING', 'EXTRACTED', 'VALIDATED'] },
      },
    }),
  ]);

  const etat = publicLinkState({
    publicToken: session.publicToken,
    publicFormClosedAt: session.publicFormClosedAt,
    sessionStatus: session.status,
    capacityMax: session.capacityMax,
    participantCount,
    pendingRequestCount,
  });

  const dates = `Du ${formatDateFr(session.startDate)} au ${formatDateFr(session.endDate)}`;
  const lieu = formatLieuFormation(session.location, '');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-primary-50/30">
      <header className="border-b border-border bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary text-white font-bold inline-flex items-center justify-center">
            S
          </div>
          <div>
            <div className="font-semibold">Start Academy</div>
            <div className="text-xs text-muted-foreground">Organisme de formation Qualiopi</div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {session.product.title}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">{dates}</p>
          {lieu ? <p className="text-sm text-muted-foreground">{lieu}</p> : null}
        </div>

        {etat === 'ouvert' ? (
          <SessionEnrollmentForm publicToken={token} />
        ) : (
          <ClosedState etat={etat} />
        )}
      </main>

      <footer className="border-t border-border bg-white py-5 mt-10">
        <div className="max-w-3xl mx-auto px-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Données hébergées dans l'Union européenne · Qualiopi · RGPD
          </div>
          <div>© Start Academy 2026</div>
        </div>
      </footer>
    </div>
  );
}

function formatDateFr(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function ClosedState({ etat }: { etat: string }) {
  const message =
    etat === 'complet'
      ? 'Cette session affiche complet. Contacte-nous pour connaître les prochaines dates.'
      : "Les inscriptions pour cette session sont closes. Contacte-nous pour connaître les prochaines dates.";
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-12 text-center space-y-4">
      <h2 className="text-xl font-bold text-amber-900">
        {etat === 'complet' ? 'Session complète' : 'Inscriptions closes'}
      </h2>
      <p className="text-sm text-amber-800 max-w-md mx-auto">{message}</p>
      <a
        href="mailto:contact@start-academy.fr"
        className="inline-block text-sm font-medium text-primary underline"
      >
        contact@start-academy.fr
      </a>
    </div>
  );
}
```

- [ ] **Step 2 : Écrire le formulaire client**

Créer `apps/web/src/components/enrollment/session-enrollment-form.tsx`. Reprendre la structure de `components/preinscriptions/public-form.tsx` (mêmes classes, mêmes composants `Field` et slots d'upload), avec ces différences :

1. Un `draftId` stable généré une seule fois : `const [draftId] = useState(() => crypto.randomUUID());`
2. `requestUploadUrl` passé à `DirectUploadField` :
   ```tsx
   requestUploadUrl={(kind, ext) => createSessionEnrollmentUploadUrl(publicToken, draftId, kind, ext)}
   ```
3. Les champs supplémentaires, dans la section « Informations de l'apprenant » :
   `birthName` (« Nom de naissance »), `address` (« Numéro de rue et rue »), `postalCode` (« Code postal »), `city` (« Ville »), `socialSecurityNb` (« N° de sécurité sociale »), `managerSince` (« Dirigeant d'entreprise depuis »), `companyName` (« Nom de l'entreprise »), `companySiret` (« SIRET de l'entreprise »).
4. Sous le champ `socialSecurityNb`, la mention :
   ```tsx
   <p className="text-[11px] text-muted-foreground mt-1">
     Utilisé uniquement pour ton dossier de financement. Il n'est conservé qu'après validation de ton inscription.
   </p>
   ```
5. La soumission appelle `submitSessionEnrollmentRequest(publicToken, draftId, uploadedKeys, {...})`.
6. Les trois slots d'upload (CNI, RIB, CFP) sont **requis** — comme SmartOF, qui marque les trois d'un astérisque.

- [ ] **Step 3 : Ajouter les redirections 308**

Dans `apps/web/next.config.mjs`, section `redirects()`, ajouter les variantes naturelles (`CLAUDE.md` : toute nouvelle route reçoit ses redirections) :

```js
      { source: '/inscriptions/:path*', destination: '/inscription/:path*', permanent: true },
      { source: '/pre-inscription/:path*', destination: '/preinscription/:path*', permanent: true },
```

Attention : `/app/inscriptions` (écran admin) est une route **différente** et ne doit pas être capturée — la règle ci-dessus ne matche que la racine `/inscriptions`, pas `/app/inscriptions`. Vérifier ce point au Step 5.

- [ ] **Step 4 : Vérifier la compilation**

```bash
cd "apps/web" && pnpm exec tsc --noEmit
```

Attendu : aucune erreur.

- [ ] **Step 5 : Vérifier à la main dans le navigateur**

L'instance de Laurent tourne déjà sur le port 3010 — **ne pas lancer un second `next dev`** (`connection_limit=1` sur le pooler Supabase : un second serveur casse son instance). Lui demander d'ouvrir :

1. `/inscription/<jeton-inexistant>` → 404.
2. `/inscription/<jeton-valide>` → titre du produit, dates en français, lieu composé, formulaire.
3. `/app/inscriptions` → toujours l'écran admin, non redirigé.

- [ ] **Step 6 : Commit**

```bash
git add apps/web/src/app/inscription apps/web/src/components/enrollment apps/web/next.config.mjs
git commit -m "feat(inscriptions): page publique et formulaire d'inscription par session"
```

---

### Task 5 : Pilotage du lien depuis la fiche session

**Files:**
- Create: `apps/web/src/server/actions/session-enrollment-admin.ts`
- Create: `apps/web/src/components/sessions/session-enrollment-block.tsx`
- Modify: `apps/web/src/app/app/sessions/[id]/page.tsx` (onglet « Session », près de `AddParticipantDialog` ~ligne 1100)
- Test: `apps/web/src/server/actions/__tests__/session-enrollment-admin.test.ts`

**Interfaces:**
- Consumes: `generatePublicToken`, `buildPublicEnrollmentUrl` (Task 1).
- Produces:
  - `openSessionEnrollments(sessionId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }>`
  - `closeSessionEnrollments(sessionId: string): Promise<{ ok: true } | { ok: false; error: string }>`
  - `revokeSessionEnrollmentLink(sessionId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }>`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `apps/web/src/server/actions/__tests__/session-enrollment-admin.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  validateRequest: vi.fn(),
  sessionFindFirst: vi.fn(),
  sessionUpdate: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    trainingSession: { findFirst: m.sessionFindFirst, update: m.sessionUpdate },
  },
}));
vi.mock('@/lib/auth', () => ({ validateRequest: m.validateRequest }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  openSessionEnrollments,
  closeSessionEnrollments,
  revokeSessionEnrollmentLink,
} from '../session-enrollment-admin';

beforeEach(() => {
  vi.clearAllMocks();
  m.validateRequest.mockResolvedValue({ user: { id: 'u1', tenantId: 'tenant-1' } });
  m.sessionFindFirst.mockResolvedValue({ id: 'ses-1', publicToken: null });
  m.sessionUpdate.mockImplementation(({ data }: any) => ({ id: 'ses-1', ...data }));
});

describe('openSessionEnrollments', () => {
  it('refuse un utilisateur non authentifié', async () => {
    m.validateRequest.mockResolvedValue({ user: null });
    expect(await openSessionEnrollments('ses-1')).toEqual({
      ok: false,
      error: 'Non authentifié',
    });
  });

  it('scope la recherche par tenant', async () => {
    await openSessionEnrollments('ses-1');
    expect(m.sessionFindFirst.mock.calls[0][0].where).toMatchObject({
      id: 'ses-1',
      tenantId: 'tenant-1',
    });
  });

  it('génère un jeton et renvoie l’URL publique', async () => {
    const r = await openSessionEnrollments('ses-1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toMatch(/\/inscription\/[0-9a-f]{32}$/);
    expect(m.sessionUpdate.mock.calls[0][0].data.publicFormClosedAt).toBeNull();
  });

  it('réouvre sans changer le jeton existant', async () => {
    m.sessionFindFirst.mockResolvedValue({ id: 'ses-1', publicToken: 'b'.repeat(32) });
    const r = await openSessionEnrollments('ses-1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toContain('b'.repeat(32));
    expect(m.sessionUpdate.mock.calls[0][0].data.publicToken).toBeUndefined();
  });
});

describe('closeSessionEnrollments', () => {
  it('pose la date de fermeture sans effacer le jeton', async () => {
    m.sessionFindFirst.mockResolvedValue({ id: 'ses-1', publicToken: 'c'.repeat(32) });
    const r = await closeSessionEnrollments('ses-1');
    expect(r.ok).toBe(true);
    const data = m.sessionUpdate.mock.calls[0][0].data;
    expect(data.publicFormClosedAt).toBeInstanceOf(Date);
    expect(data.publicToken).toBeUndefined();
  });
});

describe('revokeSessionEnrollmentLink', () => {
  it('remplace le jeton par un nouveau', async () => {
    m.sessionFindFirst.mockResolvedValue({ id: 'ses-1', publicToken: 'd'.repeat(32) });
    const r = await revokeSessionEnrollmentLink('ses-1');
    expect(r.ok).toBe(true);
    const data = m.sessionUpdate.mock.calls[0][0].data;
    expect(data.publicToken).toMatch(/^[0-9a-f]{32}$/);
    expect(data.publicToken).not.toBe('d'.repeat(32));
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

```bash
cd "apps/web" && pnpm exec vitest run src/server/actions/__tests__/session-enrollment-admin.test.ts
```

Attendu : ÉCHEC — module introuvable.

- [ ] **Step 3 : Écrire les actions admin**

Créer `apps/web/src/server/actions/session-enrollment-admin.ts` :

```ts
'use server';

/**
 * Pilotage du lien public d'inscription depuis la fiche session.
 * Actions AUTHENTIFIÉES, scopées par tenant.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { generatePublicToken, buildPublicEnrollmentUrl } from '@/lib/enrollment/public-link';

async function chargerSession(sessionId: string) {
  const { user } = await validateRequest();
  if (!user) return { erreur: 'Non authentifié' as const };
  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId: user.tenantId },
    select: { id: true, publicToken: true },
  });
  if (!session) return { erreur: 'Session introuvable' as const };
  return { session };
}

export async function openSessionEnrollments(
  sessionId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const r = await chargerSession(sessionId);
  if ('erreur' in r) return { ok: false, error: r.erreur };

  // Réouvrir NE change PAS le jeton : les liens déjà diffusés restent valides.
  const token = r.session.publicToken ?? generatePublicToken();
  await prisma.trainingSession.update({
    where: { id: sessionId },
    data: {
      ...(r.session.publicToken ? {} : { publicToken: token }),
      publicFormOpenedAt: new Date(),
      publicFormClosedAt: null,
    },
  });

  revalidatePath(`/app/sessions/${sessionId}`);
  return { ok: true, url: buildPublicEnrollmentUrl(token) };
}

export async function closeSessionEnrollments(
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await chargerSession(sessionId);
  if ('erreur' in r) return { ok: false, error: r.erreur };

  await prisma.trainingSession.update({
    where: { id: sessionId },
    data: { publicFormClosedAt: new Date() },
  });

  revalidatePath(`/app/sessions/${sessionId}`);
  return { ok: true };
}

export async function revokeSessionEnrollmentLink(
  sessionId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const r = await chargerSession(sessionId);
  if ('erreur' in r) return { ok: false, error: r.erreur };

  const token = generatePublicToken();
  await prisma.trainingSession.update({
    where: { id: sessionId },
    data: { publicToken: token, publicFormOpenedAt: new Date(), publicFormClosedAt: null },
  });

  revalidatePath(`/app/sessions/${sessionId}`);
  return { ok: true, url: buildPublicEnrollmentUrl(token) };
}
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

```bash
cd "apps/web" && pnpm exec vitest run src/server/actions/__tests__/session-enrollment-admin.test.ts
```

Attendu : 8 tests PASS.

- [ ] **Step 5 : Écrire le bloc de la fiche session**

Créer `apps/web/src/components/sessions/session-enrollment-block.tsx` — composant client affichant, selon `etat` :

- `jamais-ouvert` / `ferme` → bouton **« Ouvrir aux inscriptions »** (appelle `openSessionEnrollments`, puis `navigator.clipboard.writeText(url)` et un toast `sonner` « Lien copié »).
- `ouvert` → champ en lecture seule avec l'URL, bouton **Copier**, bouton **Fermer les inscriptions**, bouton discret **Révoquer le lien**.
- Toujours : la ligne de compteur `{participantCount} inscrits · {pendingCount} demandes à traiter · {placesRestantes} places restantes`.

La confirmation de fermeture passe par une `window.confirm` native : dans un Radix Dialog, un clic imbriqué peut rester sans effet (`feedback_radix_dialog_fallback`).

- [ ] **Step 6 : Brancher le bloc dans la page session**

Dans `apps/web/src/app/app/sessions/[id]/page.tsx`, onglet « Session », juste au-dessus du bloc participants (`AddParticipantDialog`, ~ligne 1100), insérer `<SessionEnrollmentBlock ... />` avec les props calculées côté serveur : `sessionId`, `etat` (via `publicLinkState`), `url` (via `buildPublicEnrollmentUrl` si un jeton existe), `participantCount`, `pendingCount`, `capacityMax`.

- [ ] **Step 7 : Vérifier**

```bash
cd "apps/web" && pnpm exec tsc --noEmit && pnpm exec vitest run src/server/actions/__tests__/session-enrollment-admin.test.ts
```

Puis demander à Laurent d'ouvrir une session sur son instance : ouvrir, copier, coller dans un onglet privé, fermer, vérifier l'écran « inscriptions closes ».

- [ ] **Step 8 : Commit**

```bash
git add apps/web/src/server/actions/session-enrollment-admin.ts apps/web/src/server/actions/__tests__/session-enrollment-admin.test.ts apps/web/src/components/sessions/session-enrollment-block.tsx "apps/web/src/app/app/sessions/[id]/page.tsx"
git commit -m "feat(inscriptions): ouvrir, fermer et révoquer le lien depuis la fiche session"
```

---

### Task 6 : Validation d'une demande → inscription

**Files:**
- Modify: `apps/web/src/server/actions/preinscription-convert.ts` (ajout d'une action, pas de réécriture)
- Create: `apps/web/src/components/sessions/session-enrollment-requests.tsx`
- Modify: `apps/web/src/app/app/sessions/[id]/page.tsx` (liste des demandes sous le bloc de la Task 6)
- Test: `apps/web/src/server/actions/__tests__/enroll-from-request.test.ts`

**Interfaces:**
- Consumes: `convertPreEnrollment` (existant), `resolveSponsorOrg` (Task 2), `prepareTrainingForSession` de `@/server/actions/prepare-training`.
- Produces:
  - `enrollFromRequest(input: { preEnrollmentId: string; overrideSponsorOrgId?: string }): Promise<{ ok: true; participantId: string } | { ok: false; error: string; needsSponsor?: boolean }>`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `apps/web/src/server/actions/__tests__/enroll-from-request.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  validateRequest: vi.fn(),
  preEnrollmentFindFirst: vi.fn(),
  organizationFindFirst: vi.fn(),
  participantFindUnique: vi.fn(),
  participantCreate: vi.fn(),
  convertPreEnrollment: vi.fn(),
  prepareTrainingForSession: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    preEnrollment: { findFirst: m.preEnrollmentFindFirst },
    organization: { findFirst: m.organizationFindFirst },
    sessionParticipant: { findUnique: m.participantFindUnique, create: m.participantCreate },
  },
  Prisma: { Decimal: Number },
}));
vi.mock('@/lib/auth', () => ({ validateRequest: m.validateRequest }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../preinscription-convert', async (orig) => ({
  ...(await orig<any>()),
  convertPreEnrollment: m.convertPreEnrollment,
}));
vi.mock('../prepare-training', () => ({
  prepareTrainingForSession: m.prepareTrainingForSession,
}));

import { enrollFromRequest } from '../enroll-from-request';

const DEMANDE = {
  id: 'pe-1',
  tenantId: 'tenant-1',
  intendedSessionId: 'ses-1',
  status: 'EXTRACTED',
  firstName: 'Jean',
  lastName: 'Martin',
  email: 'jean@mail.com',
  professionalStatus: 'Agent commercial',
  companyName: 'MARX IMMO',
  companySiret: '12345678900012',
};

beforeEach(() => {
  vi.clearAllMocks();
  m.validateRequest.mockResolvedValue({ user: { id: 'u1', tenantId: 'tenant-1' } });
  m.preEnrollmentFindFirst.mockResolvedValue(DEMANDE);
  m.organizationFindFirst.mockResolvedValue(null);
  m.participantFindUnique.mockResolvedValue(null);
  m.participantCreate.mockResolvedValue({ id: 'part-1' });
  m.convertPreEnrollment.mockResolvedValue({ ok: true, personId: 'per-1', orgId: 'org-1' });
  m.prepareTrainingForSession.mockResolvedValue({ ok: true });
});

describe('enrollFromRequest', () => {
  it('convertit puis crée le participant avec priceHT à 0', async () => {
    const r = await enrollFromRequest({ preEnrollmentId: 'pe-1' });
    expect(r).toEqual({ ok: true, participantId: 'part-1' });
    const data = m.participantCreate.mock.calls[0][0].data;
    expect(data.sessionId).toBe('ses-1');
    expect(data.personId).toBe('per-1');
    expect(data.sponsorOrgId).toBe('org-1');
    expect(Number(data.priceHT)).toBe(0);
    expect(data.enrollmentStatus).toBe('PRE_ENROLLED');
  });

  it('régénère les documents pour ce participant', async () => {
    await enrollFromRequest({ preEnrollmentId: 'pe-1' });
    expect(m.prepareTrainingForSession).toHaveBeenCalledWith('ses-1');
  });

  it('refuse une demande sans session cible', async () => {
    m.preEnrollmentFindFirst.mockResolvedValue({ ...DEMANDE, intendedSessionId: null });
    const r = await enrollFromRequest({ preEnrollmentId: 'pe-1' });
    expect(r.ok).toBe(false);
    expect(m.convertPreEnrollment).not.toHaveBeenCalled();
  });

  it('salarié dont l’entreprise est inconnue : demande le payeur, sans rien créer', async () => {
    m.preEnrollmentFindFirst.mockResolvedValue({ ...DEMANDE, professionalStatus: 'Salarié' });
    const r = await enrollFromRequest({ preEnrollmentId: 'pe-1' });
    expect(r).toMatchObject({ ok: false, needsSponsor: true });
    expect(m.convertPreEnrollment).not.toHaveBeenCalled();
    expect(m.participantCreate).not.toHaveBeenCalled();
  });

  it('salarié avec payeur choisi par l’admin : inscription faite sur cette organisation', async () => {
    m.preEnrollmentFindFirst.mockResolvedValue({ ...DEMANDE, professionalStatus: 'Salarié' });
    const r = await enrollFromRequest({
      preEnrollmentId: 'pe-1',
      overrideSponsorOrgId: 'org-enseigne',
    });
    expect(r.ok).toBe(true);
    expect(m.participantCreate.mock.calls[0][0].data.sponsorOrgId).toBe('org-enseigne');
  });

  it('personne déjà inscrite : refus explicite, pas de doublon', async () => {
    m.participantFindUnique.mockResolvedValue({ id: 'part-existant' });
    const r = await enrollFromRequest({ preEnrollmentId: 'pe-1' });
    expect(r.ok).toBe(false);
    expect(m.participantCreate).not.toHaveBeenCalled();
  });

  it('remonte l’erreur de conversion sans créer de participant', async () => {
    m.convertPreEnrollment.mockResolvedValue({ ok: false, error: 'Email manquant' });
    const r = await enrollFromRequest({ preEnrollmentId: 'pe-1' });
    expect(r).toMatchObject({ ok: false, error: 'Email manquant' });
    expect(m.participantCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

```bash
cd "apps/web" && pnpm exec vitest run src/server/actions/__tests__/enroll-from-request.test.ts
```

Attendu : ÉCHEC — module introuvable.

- [ ] **Step 3 : Écrire l'action**

Créer `apps/web/src/server/actions/enroll-from-request.ts` :

```ts
'use server';

/**
 * Valider une demande d'inscription reçue par le lien public :
 * conversion en apprenant PUIS création du SessionParticipant.
 *
 * Le prix est posé à 0 : la tarification se saisit depuis la fiche session
 * (bouton « Modifier » du participant), comme pour toute inscription. Le
 * formulaire public ne touche JAMAIS au prix.
 */

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { resolveSponsorOrg, cleanSiret } from '@/lib/enrollment/sponsor-org';
import { convertPreEnrollment } from './preinscription-convert';
import { prepareTrainingForSession } from './prepare-training';

export async function enrollFromRequest(input: {
  preEnrollmentId: string;
  overrideSponsorOrgId?: string;
}): Promise<
  { ok: true; participantId: string } | { ok: false; error: string; needsSponsor?: boolean }
> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const pe = await prisma.preEnrollment.findFirst({
    where: { id: input.preEnrollmentId, tenantId: user.tenantId },
  });
  if (!pe) return { ok: false, error: 'Demande introuvable' };
  if (!pe.intendedSessionId) {
    return { ok: false, error: "Cette demande n'est rattachée à aucune session" };
  }

  // 1. Qui paye ? — recherche par SIRET faite ici, décision déléguée au module pur.
  const siret = cleanSiret(pe.companySiret);
  const matched = input.overrideSponsorOrgId
    ? { id: input.overrideSponsorOrgId }
    : siret
      ? await prisma.organization.findFirst({
          where: { tenantId: user.tenantId, siret, archived: false },
          select: { id: true },
        })
      : null;

  const decision = resolveSponsorOrg({
    professionalStatus: pe.professionalStatus,
    companyName: pe.companyName,
    companySiret: pe.companySiret,
    firstName: pe.firstName ?? '',
    lastName: pe.lastName ?? '',
    matchedOrganizationId: matched?.id ?? null,
  });

  if (decision.kind === 'a-confirmer') {
    return { ok: false, error: decision.raison, needsSponsor: true };
  }

  // 2. Conversion en apprenant (crée Person, Org EI, LegalLink, AgeficeProfile).
  const conv = await convertPreEnrollment({
    preEnrollmentId: pe.id,
    firstName: pe.firstName ?? '',
    lastName: pe.lastName ?? '',
    birthName: pe.birthName,
    email: pe.email ?? '',
    phone: pe.phone,
    birthDate: pe.birthDate?.toISOString().slice(0, 10) ?? null,
    birthPlace: pe.birthPlace,
    professionalStatus: pe.professionalStatus,
    createEiOrg: decision.kind === 'creer-ei',
    eiSiret: decision.kind === 'creer-ei' ? decision.siret : null,
    eiLegalName: decision.kind === 'creer-ei' ? decision.legalName : null,
    eiAddress: pe.address,
    eiCity: pe.city,
    eiPostalCode: pe.postalCode,
  });
  if (!conv.ok || !conv.personId) {
    return { ok: false, error: conv.error ?? 'Conversion échouée' };
  }

  const sponsorOrgId =
    decision.kind === 'org-existante' ? decision.organizationId : conv.orgId;
  if (!sponsorOrgId) {
    return { ok: false, error: "Organisation payeuse introuvable après conversion", needsSponsor: true };
  }

  // 3. Inscription — jamais deux fois la même personne sur la même session.
  const deja = await prisma.sessionParticipant.findUnique({
    where: { sessionId_personId: { sessionId: pe.intendedSessionId, personId: conv.personId } },
    select: { id: true },
  });
  if (deja) {
    return { ok: false, error: 'Cette personne est déjà inscrite à cette session' };
  }

  const participant = await prisma.sessionParticipant.create({
    data: {
      sessionId: pe.intendedSessionId,
      personId: conv.personId,
      sponsorOrgId,
      priceHT: new Prisma.Decimal(0),
      enrollmentStatus: 'PRE_ENROLLED',
      participantType: pe.professionalStatus ?? null,
    },
  });

  // 4. Documents du nouvel inscrit (find-or-create, rejouable sans doublon).
  await prepareTrainingForSession(pe.intendedSessionId).catch((e) =>
    console.warn('[inscription] préparation documentaire échouée', e?.message ?? e),
  );

  revalidatePath(`/app/sessions/${pe.intendedSessionId}`);
  revalidatePath('/app/inscriptions');
  return { ok: true, participantId: participant.id };
}
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

```bash
cd "apps/web" && pnpm exec vitest run src/server/actions/__tests__/enroll-from-request.test.ts
```

Attendu : 7 tests PASS. Si `prepareTrainingForSession` exige une signature différente, l'aligner sur la signature réelle **et** corriger le test en conséquence.

- [ ] **Step 5 : Écrire la liste des demandes**

Créer `apps/web/src/components/sessions/session-enrollment-requests.tsx` : tableau des `PreEnrollment` de la session (nom, date de dépôt, statut du pipeline, pastilles des pièces reçues), avec par ligne :
- un lien vers `/app/inscriptions/{id}` (détail existant) ;
- un bouton **« Valider et inscrire »** appelant `enrollFromRequest` ;
- si la réponse porte `needsSponsor`, un sélecteur d'organisation qui rappelle l'action avec `overrideSponsorOrgId`.

Les statuts s'affichent en français : `SUBMITTED` → « Reçue », `EXTRACTING` → « Lecture en cours », `EXTRACTED` → « À valider », `CONVERTED` → « Inscrite », `REJECTED` → « Rejetée ».

- [ ] **Step 6 : Brancher dans la page session**

Sous `<SessionEnrollmentBlock />` (Task 5), afficher `<SessionEnrollmentRequests />` uniquement s'il existe au moins une demande, en passant les `PreEnrollment` chargées côté serveur avec la session.

- [ ] **Step 7 : Vérifier**

```bash
cd "apps/web" && pnpm exec tsc --noEmit && pnpm exec vitest run src/server/actions/__tests__/
```

- [ ] **Step 8 : Commit**

```bash
git add apps/web/src/server/actions/enroll-from-request.ts apps/web/src/server/actions/__tests__/enroll-from-request.test.ts apps/web/src/components/sessions/session-enrollment-requests.tsx "apps/web/src/app/app/sessions/[id]/page.tsx"
git commit -m "feat(inscriptions): valider une demande crée l'apprenant et son inscription"
```

---

### Task 7 : Durcissement (limitation, purge, RGPD)

**Files:**
- Modify: `apps/web/src/server/actions/session-enrollment-public.ts` (limitation de débit)
- Create: `apps/web/scripts/purge-orphan-drafts.ts`
- Modify: `apps/web/src/components/enrollment/session-enrollment-form.tsx` (mention d'information)
- Create: `docs/rgpd/traitement-inscriptions-publiques.md`
- Test: `apps/web/src/server/actions/__tests__/session-enrollment-ratelimit.test.ts`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: `rateLimitOk(cle: string, max: number, fenetreMs: number): boolean` (module `apps/web/src/lib/enrollment/rate-limit.ts`).

- [ ] **Step 1 : Écrire le test de la limitation**

Créer `apps/web/src/server/actions/__tests__/session-enrollment-ratelimit.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rateLimitOk, _resetRateLimit } from '@/lib/enrollment/rate-limit';

beforeEach(() => {
  vi.useFakeTimers();
  _resetRateLimit();
});
afterEach(() => vi.useRealTimers());

describe('rateLimitOk', () => {
  it('laisse passer jusqu’au quota', () => {
    for (let i = 0; i < 5; i++) expect(rateLimitOk('ip-1', 5, 3_600_000)).toBe(true);
  });

  it('bloque au-delà du quota', () => {
    for (let i = 0; i < 5; i++) rateLimitOk('ip-1', 5, 3_600_000);
    expect(rateLimitOk('ip-1', 5, 3_600_000)).toBe(false);
  });

  it('isole les clés entre elles', () => {
    for (let i = 0; i < 5; i++) rateLimitOk('ip-1', 5, 3_600_000);
    expect(rateLimitOk('ip-2', 5, 3_600_000)).toBe(true);
  });

  it('rouvre après la fenêtre', () => {
    for (let i = 0; i < 5; i++) rateLimitOk('ip-1', 5, 3_600_000);
    vi.advanceTimersByTime(3_600_001);
    expect(rateLimitOk('ip-1', 5, 3_600_000)).toBe(true);
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

```bash
cd "apps/web" && pnpm exec vitest run src/server/actions/__tests__/session-enrollment-ratelimit.test.ts
```

Attendu : ÉCHEC — module introuvable.

- [ ] **Step 3 : Implémenter la limitation**

Créer `apps/web/src/lib/enrollment/rate-limit.ts` :

```ts
/**
 * Limitation de débit en mémoire, pour le formulaire public.
 *
 * Volontairement simple : en serverless, le compteur est par instance, donc
 * c'est un garde-fou contre le remplissage automatisé, PAS une protection
 * anti-DDoS. Suffisant ici — le formulaire n'est diffusé qu'aux stagiaires.
 */

const compteurs = new Map<string, number[]>();

export function rateLimitOk(cle: string, max: number, fenetreMs: number): boolean {
  const maintenant = Date.now();
  const recents = (compteurs.get(cle) ?? []).filter((t) => maintenant - t < fenetreMs);
  if (recents.length >= max) {
    compteurs.set(cle, recents);
    return false;
  }
  recents.push(maintenant);
  compteurs.set(cle, recents);
  return true;
}

/** Réservé aux tests. */
export function _resetRateLimit(): void {
  compteurs.clear();
}
```

Puis, dans `submitSessionEnrollmentRequest`, avant toute écriture :

```ts
import { headers } from 'next/headers';
import { rateLimitOk } from '@/lib/enrollment/rate-limit';

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'inconnue';
  if (!rateLimitOk(`submit:${ip}`, 5, 3_600_000)) {
    return { ok: false, error: 'Trop de demandes envoyées. Réessaie dans une heure.' };
  }
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

```bash
cd "apps/web" && pnpm exec vitest run src/server/actions/__tests__/session-enrollment-ratelimit.test.ts
```

Attendu : 4 tests PASS.

- [ ] **Step 5 : Écrire le script de purge**

Créer `apps/web/scripts/purge-orphan-drafts.ts` :

```ts
/**
 * Purge des brouillons abandonnés du formulaire public.
 *
 * Un visiteur peut déposer ses pièces puis fermer l'onglet sans valider : les
 * fichiers restent sous `sessions/{sessionId}/{draftId}/` sans PreEnrollment.
 * Ce script les supprime au-delà de 30 jours.
 *
 * Sec par défaut (liste seulement). Suppression réelle : WRITE=1.
 */

import { prisma } from '@qualiof/db';
import { listObjects, deleteFile, PREENROLLMENT_BUCKET } from '../src/lib/storage';

const WRITE = process.env.WRITE === '1';
const AGE_MAX_MS = 30 * 24 * 3600 * 1000;

async function main() {
  const objets = await listObjects(PREENROLLMENT_BUCKET, 'sessions/');

  // Regroupe par préfixe sessions/{sessionId}/{draftId}/
  const brouillons = new Map<string, { draftId: string; keys: string[]; dernierDepot: number }>();
  for (const o of objets) {
    const parts = o.key.split('/');
    if (parts.length < 4) continue;
    const prefixe = parts.slice(0, 3).join('/');
    const b = brouillons.get(prefixe) ?? { draftId: parts[2], keys: [], dernierDepot: 0 };
    b.keys.push(o.key);
    b.dernierDepot = Math.max(b.dernierDepot, o.lastModified?.getTime() ?? 0);
    brouillons.set(prefixe, b);
  }

  const maintenant = Date.now();
  let supprimes = 0;

  for (const [prefixe, b] of brouillons) {
    if (maintenant - b.dernierDepot < AGE_MAX_MS) continue;

    const rattachee = await prisma.preEnrollment.findFirst({
      where: { extractedData: { path: ['draftId'], equals: b.draftId } },
      select: { id: true },
    });
    if (rattachee) continue;

    console.log(`${WRITE ? 'SUPPRESSION' : 'candidat'} : ${prefixe} (${b.keys.length} fichiers)`);
    if (WRITE) {
      for (const key of b.keys) await deleteFile(PREENROLLMENT_BUCKET, key);
      supprimes += b.keys.length;
    }
  }

  console.log(
    WRITE
      ? `${supprimes} fichiers supprimés.`
      : 'Mode sec — relancer avec WRITE=1 pour supprimer.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

**Avant d'implémenter** : vérifier que `listObjects` et `deleteFile` existent bien dans `apps/web/src/lib/storage.ts` avec ces signatures.

```bash
grep -nE "^export (async )?function (listObjects|deleteFile|removeFile)" apps/web/src/lib/storage.ts
```

S'ils n'existent pas, les ajouter d'abord dans `storage.ts` avec la parité des deux fournisseurs (Supabase et MinIO), comme le fait `objectExists` — et écrire leur test dans `apps/web/src/lib/__tests__/storage.test.ts` avant de continuer.

Ajouter le script au `package.json` de `apps/web` :

```json
    "storage:purge-drafts": "dotenv -e ../../.env -- tsx scripts/purge-orphan-drafts.ts"
```

- [ ] **Step 6 : Vérifier la purge à blanc**

```bash
cd "apps/web" && pnpm storage:purge-drafts
```

Attendu : liste des préfixes candidats, **aucune suppression** (mode sec par défaut).

- [ ] **Step 7 : Documenter le traitement RGPD**

Créer `docs/rgpd/traitement-inscriptions-publiques.md` : finalité (inscription à une action de formation), catégories de données (identité, coordonnées, adresse, n° de sécurité sociale, RIB, pièce d'identité), base légale (exécution du contrat de formation), durée de conservation (demandes non converties purgées à 30 jours après la fin de session), destinataires (Start Academy, financeur OPCO/AGEFICE), sous-traitants (hébergeur base et stockage, service d'envoi d'emails), droits des personnes et adresse de contact.

- [ ] **Step 8 : Suite complète**

```bash
cd "apps/web" && pnpm exec tsc --noEmit && pnpm test
```

Attendu : suite entière au vert. Toute régression sur les tests existants doit être corrigée avant le commit.

- [ ] **Step 9 : Commit**

```bash
git add apps/web/src/lib/enrollment/rate-limit.ts apps/web/scripts/purge-orphan-drafts.ts apps/web/package.json docs/rgpd/traitement-inscriptions-publiques.md apps/web/src/server/actions/session-enrollment-public.ts apps/web/src/server/actions/__tests__/session-enrollment-ratelimit.test.ts apps/web/src/components/enrollment/session-enrollment-form.tsx
git commit -m "feat(inscriptions): limitation de débit, purge des brouillons et registre RGPD"
```

---

## Recette finale (à faire avec Laurent)

1. Sur une session de test : ouvrir les inscriptions, copier le lien.
2. Depuis un téléphone, hors du réseau local, ouvrir le lien : vérifier le titre du produit, les dates et le lieu.
3. Déposer une pièce d'identité **de plus de 5 Mo** — c'est le scénario qui casse en serverless si l'upload direct est mal branché.
4. Soumettre : la demande apparaît sur la fiche session en moins d'une minute.
5. Vérifier que le worker OCR la fait passer en « À valider ».
6. Valider : l'apprenant existe, il est inscrit, sa convention est générée.
7. Vérifier que le nouvel inscrit apparaît à 0 € avec la mention « tarif à saisir », et que le bouton « Modifier » de la fiche session permet de poser son prix.
8. Fermer les inscriptions, puis rouvrir l'ancien lien après révocation : doit afficher un 404.
