# Phase 9: Distribution leads automatique — Research

**Researched:** 2026-05-16
**Domain:** Auto-assignation Lead → Commercial · Notifications (cloche + email) · Page de charge · Toggles tenant
**Confidence:** HIGH (stack figée + patterns Phase 7/8 directement réutilisables ; deux écarts BDD/CONTEXT.md à noter et résoudre côté planning, pas côté technique)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 — Algorithme** : garder l'algo existant `autoAssignLead` / `autoAssignUnassignedLeads` dans `apps/web/src/server/actions/auto-assign-leads.ts` (round-robin équilibré par charge active, tie-breaker `User.createdAt` ASC, fallback `ownerUserId=null` + alerte admin).
- **D-02 — Triggers** : trois entry-points :
  1. Création Lead via UI (server action) → `autoAssignLead(leadId)` immédiat
  2. Pré-inscription convertie en Lead → `autoAssignLead(leadId)` après création
  3. Bouton manuel "Réassigner" → `autoAssignLead(leadId, { force: true })`
  Skip si lead déjà assigné (sauf `force`), status `WON`/`LOST`, ou aucun commercial actif.
- **D-03 — Notifications** : à l'assignation réussie, **(a)** créer une `Notification` row `type: 'lead.assigned'`, **(b)** envoyer un email via `mailer.ts` (sujet "Nouveau lead à traiter — {prospectName}", template `lead-assigned-template.ts`), **(c)** AuditLog `leads.auto_assigned` avec diff `{ leadId, assignedTo, assignedBy: 'system' | userId }`.
- **D-04 — Page de charge** : route `/app/leads/charge`, visible ADMIN+MANAGER. 4 KPI par commercial : (1) Leads en cours, (2) Leads gagnés ce mois, (3) Taux de conversion, (4) Temps moyen lead→signature. Format = tableau + camembert (répartition leads actifs).
- **D-05 — UI Lead** : sur `/app/leads/[id]`, badge commercial assigné + bouton "Réassigner" (AlertDialog → `force: true`). Visible ADMIN+MANAGER+COMMERCIAL propriétaire.
- **D-06 — Config on/off** : sous-section `/app/parametres/distribution-leads` (ADMIN only). 3 toggles : `Tenant.autoAssignLeads`, `Tenant.notifyOnLeadAssign`, `Tenant.notifyBellOnLeadAssign` (défaut `true`).
- **D-07 — AuditLog** : `leads.auto_assigned` (actor=null system), `leads.reassigned` (actor=user.id), `leads.distribution_config` (modif des toggles).

### Claude's Discretion

- Camembert : Recharts ou SVG custom (à arbitrer planning — Finding #7 recommande SVG inline).
- Email synchrone vs background job (Finding #5 recommande synchrone vu petit volume).
- Layout exact page charge (tableau vs cards — Finding #6 recommande tableau + 4 KPI globaux haut + camembert à droite).

### Deferred Ideas (OUT OF SCOPE)

- Règles avancées (zone, enseigne, historique de conversion) — Q1A explicite hors scope.
- Reassignment auto si commercial absent/en congé.
- Score "fit" prospect-commercial.
- Notifications mobile push.
- Rebalance périodique automatique.
- Vue de charge visible par les commerciaux.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LEAD-01 | Auto-assignation Lead → Commercial à la création (et au manuel "Réassigner") | Findings #1, #2, #3, #5 — algo existe, mais le **trigger de création n'a pas de call-site code aujourd'hui** ; il faut créer la server action `createLead` et le formulaire `/app/leads/new` dans cette phase (cf. Open Question #1). |
| LEAD-02 | Vue de charge par commercial avec 4 KPI + camembert | Findings #6, #7 — `getCommercialsWithLoad` réutilisable pour KPI 1 ; KPI 2/3/4 demandent **un champ `winDate` qui n'existe pas** (cf. Open Question #2) ; SVG inline pour camembert recommandé (pas de recharts en deps). |
</phase_requirements>

## Summary

Phase 9 part d'un socle **partiellement déjà construit** : `autoAssignLead(leadId)` et `autoAssignUnassignedLeads()` sont en production et idempotents, et la page `/app/leads/page.tsx` montre déjà un bouton "Auto-assigner" + KPI sommaires. L'effort principal est donc **branchement** (wirer `autoAssignLead` dans les call-sites de création/réassignation, créer la sous-route paramètres, étendre la cloche) + **trois extensions BDD** : `Tenant` (3 booleans config), un mécanisme de notifications persisté pour le commercial, et un champ Lead pour mesurer le temps de signature (KPI 4).

Deux **écarts** structurants à arbitrer en planning :

1. **Aucune server action `createLead` n'existe** dans le code — les leads arrivent en BDD via seed/import. Il faut **créer** la route `/app/leads/new` + `server/actions/leads.ts` (`createLead`, `reassignLead`, `updateLead`) pour que D-02 trigger 1 ait un call-site réel.
2. **Aucun model `Notification` n'existe** en BDD — la cloche TopBar Phase 4 (`notifications-bell.tsx` + `getNotifications()`) calcule ses items **en dérivé** (pré-inscriptions à valider, sessions à clôturer, etc.). D-03 dit "créer une Notification row avec `type: 'lead.assigned'`" — il faut donc **soit créer le model `Notification` persistant** (recommandé : c'est la première notification "événementielle" du produit), soit dériver `lead.assigned` depuis `Lead.ownerUserId + Lead.createdAt + last_seen_per_user`. La voie persistée est plus propre et matche D-03 littéralement.

Le reste est mécanique : Tenant +3 colonnes + Zod + UI 3 toggles ; template email cloné depuis `user-invitation.ts` ; sous-item sidebar via `nav-config.ts` + `allowedRoles` ; AuditLog conventions étendues via le helper existant `prisma.auditLog.create` (Phase 7 pattern direct).

**Primary recommendation:** Découper en **4 plans + 1 bookkeeping**, dans cet ordre :
1. Schema/migrations (Tenant +3 cols, Notification model + index, Lead +`wonAt`) + Zod schemas + tests purs.
2. Server actions `leads.ts` (createLead/updateLead/reassignLead, statut→`wonAt`) + wiring `autoAssignLead` + notification + email + AuditLog.
3. Page `/app/leads/charge` (4 KPI globaux + tableau commercial × KPI + camembert SVG inline) + sidebar entry.
4. Page `/app/parametres/distribution-leads` + extension cloche (`getNotifications` reads `Notification` rows `type='lead.assigned' unread`) + fiche Lead `/app/leads/[id]` minimaliste avec bouton Réassigner.
5. Bookkeeping smoke vitest + validation phase.

## Project Constraints (from CLAUDE.md)

- **Tech stack figé** : Next.js 14.2 App Router + Prisma 5 + Vitest 2.1 + Tailwind 3.4 + Radix UI + sonner — pas d'ajout de dépendance lourde (recharts à éviter, cf. Finding #7).
- **Multi-tenant** : toute query Prisma scope `where: { tenantId: user.tenantId }`. `autoAssignLead` le respecte déjà ; toute nouvelle server action (createLead, toggles config, etc.) doit suivre.
- **Server Actions discriminées** `{ ok: true, ... } | { ok: false; error: string; fieldErrors? }` — pattern Phase 7/8.
- **kebab-case** fichiers et URLs : `/app/leads/charge`, `/app/parametres/distribution-leads`, `lead-assigned-template.ts`, `leads.ts` (server action).
- **Zod dans `packages/shared/src/schemas/`** — schéma `lead.ts` à créer (CreateLeadSchema + ToggleDistributionConfigSchema).
- **`requireRole` (Phase 8 `lib/rbac.ts`)** est non-négociable sur toute mutation sensible : `createLead` (ADMIN+MANAGER+COMMERCIAL), `reassignLead` (idem), `updateDistributionConfig` (ADMIN), page `/app/leads/charge` (ADMIN+MANAGER), page `/app/parametres/distribution-leads` (ADMIN).
- **AuditLog convention namespacée** : `leads.auto_assigned`, `leads.reassigned`, `leads.distribution_config` (D-07). Helper actuel `prisma.auditLog.create` suffit (pas besoin de helper `logLeadAction` dédié — cohérent Phase 7).
- **PII** : email du commercial dans `EmailMessage`/payload. Pas d'IBAN/SIRET ici → pas de besoin MinIO/SensitiveData.
- **Tests Vitest** colocalisés `__tests__/`.
- **Pas de secrets en variables custom** (CLAUDE.md global) — n/a ici, on touche pas au SMTP_PASS.

## Standard Stack

### Core (réutilisé tel quel)
| Brique | Version / Path | Purpose | Why Standard |
|---|---|---|---|
| Prisma 5.22 | `packages/db/prisma/schema.prisma` | Schema Lead + Tenant + User + AuditLog | Source de vérité BDD, migrations versionnées |
| Vitest 2.1 | `apps/web/vitest.config.ts` | Tests unités + smoke pages | Déjà utilisé Phases 7/8, conftest existant |
| Lucia 3.2 + RBAC helper | `lib/auth.ts` + `lib/rbac.ts` | Auth + `requireRole(allowed)` | Phase 8 livré, doit être appliqué partout |
| Radix Dialog/DropdownMenu | `@radix-ui/react-*` | AlertDialog Réassigner, DropdownMenu cloche | Phases 4/8, a11y OK |
| sonner 2.0 | toast | Confirmations CTA | Phases 4/7/8 |
| Nodemailer 8 + mailer.ts | `lib/mailer.ts` | Send email assignation | Mode dry-run si SMTP_HOST absent — testable sans SMTP |
| audit-log helpers | `lib/audit-log.ts` (`logUserAction`, `prisma.auditLog.create`) | Persiste AuditLog `leads.*` | Phase 7+8 |
| autoAssignLead | `server/actions/auto-assign-leads.ts` | Algo round-robin équilibré | Déjà testé E2E par le bouton "Auto-assigner" page leads |

### Nouvelles briques (à créer)
| Brique | Where | Purpose |
|---|---|---|
| `server/actions/leads.ts` | `apps/web/src/server/actions/leads.ts` | `createLead`, `reassignLead`, `updateLeadStatus` (set `wonAt` si transition → WON) |
| `lib/mailer-templates/lead-assigned.ts` | nouveau fichier | Render email assignation (clone `user-invitation.ts`) |
| `packages/shared/src/schemas/lead.ts` | nouveau | `CreateLeadSchema` + `DistributionConfigSchema` |
| `app/app/leads/charge/page.tsx` | nouveau | Vue de charge ADMIN+MANAGER |
| `app/app/leads/[id]/page.tsx` | nouveau | Fiche Lead avec bouton Réassigner |
| `app/app/leads/new/page.tsx` (ou Dialog dans `/app/leads`) | nouveau | Formulaire création (RHF + zodResolver) |
| `app/app/parametres/distribution-leads/page.tsx` | nouveau | 3 toggles Tenant |
| `components/leads/lead-distribution-pie.tsx` | nouveau | Camembert SVG inline pur (cf. Finding #7) |

### Alternatives Considérées
| Au lieu de | On aurait pu | Tradeoff |
|---|---|---|
| Persister Notification (model SQL) | Étendre `getNotifications()` dérivé avec un `lastSeenBellAt` par user | Plus simple côté schema mais (a) on perd l'audit "qui a reçu/lu", (b) la cloche actuelle affiche déjà 4 kinds dérivés agrégés, "lead.assigned" devrait être *par user* pas *par tenant* → re-architecture du composant. **→ Persister recommandé.** |
| SVG inline pur (~40 lignes) | Ajouter recharts (~430 KB gzip) | recharts trop lourd pour 1 camembert. Phase 6 a montré que la sobriété (collapsible-section + PrioCard) suffit. **→ SVG inline.** |
| Email synchrone dans `autoAssignLead` | Job BullMQ async | BullMQ est réservé au closure pack (LLM lourd, retry, concurrency=3). Email assignation = 1 SMTP call, < 1s, sync OK. Le mode dry-run protège déjà dev. **→ Sync.** |
| Server action `leads.ts` séparée | Étendre `crud-edits.ts` | `crud-edits.ts` est pour edits inline générique (champ-par-champ). La création Lead a un wizard léger (RHF + multi-champ) → fichier dédié plus lisible et testable. **→ Fichier dédié.** |
| Convention `assignedBy: 'system' \| userId` dans diff | Champ AuditLog dédié | Le model AuditLog n'a pas de col "actor type" ; on encode via `userId=null` (system) ou `userId=user.id` (manuel). Cohérent avec `logUserAction` Phase 8 qui accepte déjà `actorUserId: string \| null`. **→ userId nullable.** |

**Installation:**
Aucune nouvelle dépendance — tout est en stock. (`pnpm install` après migration Prisma uniquement.)

**Version verification (recall):**
Pas de nouvelle lib à versionner.

## Architecture Patterns

### Recommended Project Structure
```
apps/web/src/
├── app/app/
│   ├── leads/
│   │   ├── page.tsx               # liste (existe)
│   │   ├── new/page.tsx           # NOUVEAU — création
│   │   ├── [id]/page.tsx          # NOUVEAU — fiche détail + Réassigner
│   │   └── charge/page.tsx        # NOUVEAU — vue de charge ADMIN+MANAGER
│   └── parametres/
│       └── distribution-leads/page.tsx  # NOUVEAU — 3 toggles
├── components/leads/
│   ├── auto-assign-button.tsx     # existe
│   ├── lead-create-form.tsx       # NOUVEAU
│   ├── reassign-lead-button.tsx   # NOUVEAU
│   ├── lead-distribution-pie.tsx  # NOUVEAU — SVG camembert
│   └── lead-load-table.tsx        # NOUVEAU — tableau commercial × KPI
├── server/actions/
│   ├── auto-assign-leads.ts       # existe — wiring INSIDE createLead/reassignLead
│   ├── leads.ts                   # NOUVEAU — createLead/reassignLead/updateLeadStatus
│   └── distribution-config.ts     # NOUVEAU — updateDistributionConfig (toggles)
├── lib/
│   ├── mailer-templates/
│   │   └── lead-assigned.ts       # NOUVEAU
│   └── lead-load-stats.ts         # NOUVEAU — getCommercialsWithKpis() pour /charge
packages/shared/src/schemas/
└── lead.ts                        # NOUVEAU — Zod
packages/db/prisma/
└── schema.prisma                  # MIGRATION : Tenant +3 cols, Notification (nouveau), Lead +wonAt
```

### Pattern 1: Trigger auto-assignation après création Lead

```ts
// apps/web/src/server/actions/leads.ts
'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { requireRole } from '@/lib/rbac';
import { autoAssignLead } from './auto-assign-leads';
import { CreateLeadSchema } from '@qualiof/shared/schemas/lead';

export async function createLead(input: unknown) {
  const user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);
  const parsed = CreateLeadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Validation', fieldErrors: parsed.error.flatten().fieldErrors };

  // Lit le toggle distribution
  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { autoAssignLeads: true },
  });

  const lead = await prisma.lead.create({
    data: {
      tenantId: user.tenantId,
      ...parsed.data,
      // Pas de ownerUserId ici — laissé null pour que autoAssignLead le choisisse
    },
  });

  // Trigger sous condition
  if (tenant?.autoAssignLeads !== false) {
    const r = await autoAssignLead(lead.id);
    // autoAssignLead écrit déjà Lead.ownerUserId + revalidatePath('/app/leads')
    // côté caller : si r.ok → notification + email (cf. Pattern 2)
    if (r.ok && r.ownerUserId) {
      await notifyLeadAssigned({
        leadId: lead.id,
        ownerUserId: r.ownerUserId,
        assignedBy: null, // system
        tenantId: user.tenantId,
      });
    }
  }

  revalidatePath('/app/leads');
  return { ok: true, leadId: lead.id };
}
```

### Pattern 2: Centraliser side-effects (notif + email + audit) dans un helper

```ts
// apps/web/src/lib/lead-notifications.ts (nouveau)
'use server';

import { prisma } from '@qualiof/db';
import { sendMail } from './mailer';
import { renderLeadAssignedEmail } from './mailer-templates/lead-assigned';
import { loadOfConfig } from './of-config';

export async function notifyLeadAssigned(opts: {
  leadId: string;
  ownerUserId: string;
  assignedBy: string | null; // null = system (auto)
  tenantId: string;
}) {
  const [lead, owner, tenant] = await Promise.all([
    prisma.lead.findUnique({
      where: { id: opts.leadId },
      include: { person: true, interestedProduct: true },
    }),
    prisma.user.findUnique({ where: { id: opts.ownerUserId } }),
    prisma.tenant.findUnique({
      where: { id: opts.tenantId },
      select: { notifyOnLeadAssign: true, notifyBellOnLeadAssign: true },
    }),
  ]);
  if (!lead || !owner || !tenant) return;

  const prospectName = lead.person
    ? `${lead.person.firstName} ${lead.person.lastName}`.trim()
    : `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() || 'Prospect';

  // 1. Notification cloche (si activé)
  if (tenant.notifyBellOnLeadAssign !== false) {
    await prisma.notification.create({
      data: {
        tenantId: opts.tenantId,
        userId: opts.ownerUserId,
        type: 'lead.assigned',
        payload: { leadId: opts.leadId, prospectName, source: lead.source ?? null },
      },
    });
  }

  // 2. Email (si activé)
  if (tenant.notifyOnLeadAssign !== false && owner.email) {
    const of = await loadOfConfig(opts.tenantId);
    const { subject, html, text } = renderLeadAssignedEmail(
      {
        commercialFirstName: owner.firstName,
        prospectName,
        leadSource: lead.source ?? null,
        productTitle: lead.interestedProduct?.title ?? null,
        leadUrl: `${process.env.APP_URL ?? ''}/app/leads/${opts.leadId}`,
      },
      of,
    );
    await sendMail({ to: owner.email, subject, html, text });
  }

  // 3. AuditLog (toujours)
  await prisma.auditLog.create({
    data: {
      tenantId: opts.tenantId,
      userId: opts.assignedBy, // null = system
      entity: 'Lead',
      entityId: opts.leadId,
      action: opts.assignedBy ? 'leads.reassigned' : 'leads.auto_assigned',
      diff: {
        assignedTo: opts.ownerUserId,
        assignedBy: opts.assignedBy ?? 'system',
      },
    },
  });
}
```

### Pattern 3: Vue de charge — query strategy

```ts
// apps/web/src/lib/lead-load-stats.ts (nouveau)
import { prisma } from '@qualiof/db';

const ACTIVE = ['NEW','CONTACTED','QUALIFIED','PROPOSAL_SENT','NEGOTIATION','ON_HOLD','TO_FOLLOWUP'] as const;

export async function getCommercialsWithKpis(tenantId: string) {
  const commercials = await prisma.user.findMany({
    where: { tenantId, role: 'COMMERCIAL', disabledAt: null },
    select: { id: true, firstName: true, lastName: true },
  });

  // KPI 1: leads en cours par owner (status actifs)
  const active = await prisma.lead.groupBy({
    by: ['ownerUserId'],
    where: { tenantId, ownerUserId: { in: commercials.map((c) => c.id) }, status: { in: ACTIVE } },
    _count: { _all: true },
  });

  // KPI 2: leads WON ce mois (mois courant)
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const wonThisMonth = await prisma.lead.groupBy({
    by: ['ownerUserId'],
    where: { tenantId, ownerUserId: { in: commercials.map((c) => c.id) }, status: 'WON', wonAt: { gte: startOfMonth } },
    _count: { _all: true },
  });

  // KPI 3: total + won (pour conversion)
  const totals = await prisma.lead.groupBy({
    by: ['ownerUserId', 'status'],
    where: { tenantId, ownerUserId: { in: commercials.map((c) => c.id) } },
    _count: { _all: true },
  });

  // KPI 4: temps moyen createdAt → wonAt (en jours) — par owner via raw query
  const avgTimeRows = await prisma.$queryRaw<{ ownerUserId: string; avgDays: number }[]>`
    SELECT "ownerUserId", AVG(EXTRACT(EPOCH FROM ("wonAt" - "createdAt"))/86400)::float AS "avgDays"
    FROM "Lead"
    WHERE "tenantId" = ${tenantId} AND status = 'WON' AND "wonAt" IS NOT NULL AND "ownerUserId" IS NOT NULL
    GROUP BY "ownerUserId";
  `;

  // Compose les 4 KPI par commercial
  return commercials.map((c) => {
    const totalForC = totals.filter((t) => t.ownerUserId === c.id).reduce((s, t) => s + t._count._all, 0);
    const wonForC = totals.find((t) => t.ownerUserId === c.id && t.status === 'WON')?._count._all ?? 0;
    return {
      userId: c.id,
      name: `${c.firstName} ${c.lastName}`.trim(),
      kpis: {
        leadsActifs: active.find((a) => a.ownerUserId === c.id)?._count._all ?? 0,
        leadsWonThisMonth: wonThisMonth.find((w) => w.ownerUserId === c.id)?._count._all ?? 0,
        conversionPct: totalForC > 0 ? Math.round((wonForC / totalForC) * 100) : 0,
        avgDaysToWin: avgTimeRows.find((r) => r.ownerUserId === c.id)?.avgDays ?? null,
      },
    };
  });
}
```

### Pattern 4: Camembert SVG inline (Finding #7)

```tsx
// apps/web/src/components/leads/lead-distribution-pie.tsx
'use client';

interface Slice {
  label: string;
  value: number;
  color: string;
}

export function LeadDistributionPie({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <div className="text-sm text-muted-foreground">Aucun lead actif</div>;

  let cumulative = 0;
  const cx = 80, cy = 80, r = 70;
  const arcs = slices.map((s) => {
    const startAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    cumulative += s.value;
    const endAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
    const large = s.value / total > 0.5 ? 1 : 0;
    return { d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`, color: s.color, label: s.label };
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 160 160" width={160} height={160} role="img" aria-label="Répartition leads par commercial">
        {arcs.map((a, i) => (
          <path key={i} d={a.d} fill={a.color} stroke="white" strokeWidth={1}>
            <title>{a.label}</title>
          </path>
        ))}
      </svg>
      <ul className="text-xs space-y-1">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: s.color }} />
            <span>{s.label} <span className="text-muted-foreground">({s.value})</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Anti-Patterns to Avoid

- **Wirer `autoAssignLead` dans une mutation Prisma générique** (ex. `crud-edits.ts`). Le trigger doit vivre à côté du call-site métier où on connaît la sémantique "création de Lead", pas dans un upsert générique qui pourrait toucher d'autres entités.
- **Faire l'email/notification dans `autoAssignLead` directement.** L'algo est volontairement pur (input → write → return). Ajouter les side-effects côté caller (`createLead` ou `reassignLead`) garde l'algo testable.
- **Ajouter une dépendance chart UI** (recharts, chart.js) pour 1 seul camembert sur 1 seule page. SVG inline natif suffit (~40 lignes — cf. Pattern 4).
- **Stocker les payloads notification en `String JSON`.** Utiliser `Json` Prisma (typage runtime cassant garanti sinon).
- **AuditLog `entity: 'AutoAssignment'` ou `entity: 'System'`.** Garder `entity: 'Lead'` + `entityId: lead.id` (cohérent Phase 7/8) — l'action namespacée porte la sémantique.
- **Tester le SMTP réel** dans Vitest. Le mode dry-run de `mailer.ts` couvre 100% de la logique pure (template render + appel `sendMail`) — pas besoin de container SMTP en CI.

## Don't Hand-Roll

| Problème | Ne pas (re)construire | Utiliser à la place | Why |
|---|---|---|---|
| Algo round-robin équilibré | Un nouveau `dispatch.ts` | `autoAssignLead` existant | Déjà testé indirectement par le bouton "Auto-assigner", idempotent, scope tenant OK |
| Helper `getCommercialsWithLoad` | Refaire `prisma.user.findMany + groupBy` | Importer la fn existante (privée à `auto-assign-leads.ts`) | Pour la page `/charge` il vaut mieux **exporter** ce helper depuis `auto-assign-leads.ts` plutôt que dupliquer. Mais NE PAS exporter `pickLeastLoaded` (interne). |
| Render email HTML | Concaténation manuelle | Cloner `mailer-templates/user-invitation.ts` | Patterns inline CSS / escapeHtml / OfConfig footer déjà standardisés Phase 8 |
| Filter sidebar par rôle | Conditions JSX dans `sidebar-nav.tsx` | `nav-config.ts` + `allowedRoles` + `filterNavForRole(NAV, role)` | Phase 8 Plan 08-04 a déjà figé le pattern ; ajouter 1 ligne `allowedRoles: ['ADMIN', 'MANAGER']` pour `Vue de charge` |
| Camembert chart | Recharts/Chart.js | SVG inline (`<path d="M ... A r r 0 ..."/>`) | 40 lignes pures, aucune dep, accessible (`role="img"` + `<title>`) |
| AuditLog "system" actor | Champ enum `actorType` | `userId: null` (déjà supporté par schema + `logUserAction`) | Pattern Phase 8 déjà en place |
| RBAC checks | If-else manuel | `requireRole(['ADMIN', 'MANAGER'])` (Phase 8) | Throw UnauthorizedError/ForbiddenError, mapping `{ ok: false }` cohérent |
| Migration "soft" Tenant 3 cols | Default null + backfill manuel | Prisma `@default(true)` sur les 3 booleans | Migration triviale, pas de backfill (les rows existantes héritent du default) |

**Key insight:** ~70% du code de cette phase est **branchement** d'briques existantes (algo, mailer, RBAC, audit-log, nav-config). La part vraiment nouvelle = model `Notification`, server actions `leads.ts`, page de charge UI. Garder cette répartition mentale aide à dimensionner les plans.

## Runtime State Inventory

> Phase 9 est **majoritairement code/config** (nouvelles routes, server actions, migration BDD, templates). Quelques points sensibles malgré tout :

| Catégorie | Items trouvés | Action requise |
|---|---|---|
| **Stored data** | (1) `Lead.ownerUserId` existant en BDD avec valeurs nullables → la nouvelle UI doit gérer `null` ; (2) Aucune row `Notification` n'existe (model inexistant) → migration crée la table vide, pas de backfill nécessaire ; (3) `Tenant.autoAssignLeads/notifyOnLeadAssign/notifyBellOnLeadAssign` n'existent pas → migration avec `@default(true)` pour rétro-compat (= comportement actuel `autoAssignUnassignedLeads()` toujours actif). | Migration Prisma `npx prisma migrate dev --name phase09_distribution` |
| **Live service config** | Aucun service externe affecté (pas de n8n/Datadog dans ce projet). SMTP existant reste tel quel. | Aucune |
| **OS-registered state** | Aucun job cron/scheduler OS dédié leads aujourd'hui. Pas de BullMQ pour leads (réservé closure pack). | Aucune |
| **Secrets/env vars** | `APP_URL` (utilisé pour `leadUrl` dans l'email) doit être présent — sinon fallback `process.env.APP_URL ?? ''` rend une URL relative. Vérifier `.env.example`. `SMTP_*` déjà documentés. | Vérifier que `APP_URL` est dans `.env.example` — sinon l'ajouter Plan 09-02 |
| **Build artifacts** | `.next/` à clean (cf. memory `dev:full doit toujours auto-clean .next` — déjà appliqué via `pnpm dev:full`). `node_modules/@prisma/client` doit être regen après `prisma migrate dev`. | `pnpm --filter @qualiof/db db:generate` + `pnpm --filter @qualiof/web build` post-migration |

**Nothing found in category:** Live service config + OS-registered state — vérifiés par grep `n8n|datadog|cron|launchd|systemd` (aucun résultat dans le repo).

## Common Pitfalls

### Pitfall 1: Race condition `createLead` puis `autoAssignLead` dans deux transactions séparées
**What goes wrong:** Si deux leads sont créés simultanément, `getCommercialsWithLoad()` peut renvoyer le même winner pour les deux, créant un déséquilibre.
**Why it happens:** `autoAssignLead` lit la charge AVANT d'écrire, sans verrou.
**How to avoid:** Pour ce volume (1-5 leads/jour selon CONTEXT.md), c'est négligeable. Si scale > 50/jour, soit (a) faire la création + auto-assign dans une seule `prisma.$transaction(async (tx) => { ... })`, soit (b) ajouter un `SELECT FOR UPDATE` sur les rows commerciaux. **Documenter en commentaire JSDoc dans `createLead` — pas de fix urgent.**
**Warning signs:** Logs showing same `ownerUserId` returned in two consecutive `autoAssignLead` calls within < 100ms.

### Pitfall 2: Notification persistée vs cloche dérivée — double comptage
**What goes wrong:** Si on ajoute le model `Notification` et qu'on lit aussi les anciens "kinds" dérivés dans `getNotifications()`, l'utilisateur voit le même incident deux fois (une fois persistée, une fois dérivée).
**Why it happens:** Les 4 kinds actuels (`preinscription`, `session_no_attendee`, etc.) sont dérivés des autres tables. Ajouter `lead.assigned` persisté change le paradigme.
**How to avoid:** **Choisir le modèle hybride** : `getNotifications()` retourne un union `[dérivé tenant-wide, persisté user-scoped]`. Les `Notification` rows sont **par-user** (`userId`), les dérivés sont **par-tenant** (admin global). Documenter clairement dans le helper que `lead.assigned` est *unique au commercial assigné*, donc filtrer par `where: { userId: user.id, readAt: null }`.
**Warning signs:** Lead assigné apparaît dans la cloche pour TOUS les users (pas seulement le commercial concerné).

### Pitfall 3: `Lead.wonAt` jamais set car aucune mutation Lead n'existe aujourd'hui
**What goes wrong:** KPI 2/4 (gagnés ce mois, temps moyen) ne retournent rien parce qu'aucune row Lead n'a `wonAt != null`.
**Why it happens:** Le code n'a pas de `updateLeadStatus(id, 'WON')` server action. Les transitions de statut Lead ne sont pas exposées par l'UI actuelle.
**How to avoid:** Inclure dans `server/actions/leads.ts` une fonction `updateLeadStatus(leadId, newStatus)` qui set `wonAt: new Date()` si la transition est vers `WON`, ou `wonAt: null` sinon. **Et** ajouter dans la page `/app/leads/[id]` un sélecteur de statut (sinon les KPI restent vides → page de charge inutile sur les 3 KPI temps-dépendants).
**Warning signs:** Page `/charge` affiche `0` partout sauf KPI 1 (leads actifs) après quelques semaines.

### Pitfall 4: Toggle `autoAssignLeads = false` mais bouton "Réassigner" force = true → admin contourne sa propre config
**What goes wrong:** L'admin désactive la distribution, puis clique "Réassigner" sur un lead → l'algo tourne quand même.
**Why it happens:** D-02 dit `force: true` skip les checks. Mais doit-il aussi skip le toggle tenant `autoAssignLeads` ?
**How to avoid:** **Décision produit à arbitrer planning** : le toggle = "le système ne distribue plus automatiquement à la création" MAIS le bouton manuel reste actif (sinon il sert à rien). Recommandation : `force: true` ne lit pas le toggle Tenant (cohérent UX — admin sait ce qu'il fait). **Documenter dans le JSDoc de `reassignLead`.**
**Warning signs:** Confusion utilisateur ; ticket "j'ai désactivé la distribution mais ça assigne quand même" → expliquer la sémantique.

### Pitfall 5: Email envoyé en dry-run mais AuditLog logged comme "envoyé"
**What goes wrong:** En dev (pas de `SMTP_HOST`), l'email est juste loggé console. Si l'AuditLog `leads.auto_assigned` indique "email envoyé", c'est faux.
**Why it happens:** `sendMail({...})` retourne `{ ok: true, dryRun: true }` mais on n'inspecte pas le `dryRun` flag.
**How to avoid:** Soit (a) ajouter `emailSent: result.dryRun ? 'dry-run' : 'sent'` dans le diff AuditLog, soit (b) ne pas indiquer `emailSent` dans le diff du tout — l'AuditLog `leads.auto_assigned` indique uniquement *que l'assignation a eu lieu*, pas que l'email est parti (qui appartient à `EmailMessage` model). **Recommandation : option (b).**
**Warning signs:** Tests SMTP en prod : confiance excessive dans l'AuditLog comme preuve d'envoi.

### Pitfall 6: `Notification.payload` schema-less → drift typage entre writer et reader
**What goes wrong:** `payload: { leadId, prospectName }` côté writer, mais le reader lit `payload.lead_id` → undefined silencieux.
**Why it happens:** Prisma `Json` ne type pas le contenu.
**How to avoid:** Définir dans `packages/shared/src/schemas/notification.ts` un union typé `NotificationPayload` + Zod parser. Le reader cloche fait `LeadAssignedPayloadSchema.parse(notif.payload)`.
**Warning signs:** Cloche affiche "undefined" ou crash UI silencieux en prod.

## Code Examples

### Migration Prisma (schema.prisma — additions)

```prisma
// AJOUTER dans model Tenant :
model Tenant {
  // ... existant ...
  autoAssignLeads          Boolean @default(true)  // D-06
  notifyOnLeadAssign       Boolean @default(true)  // D-06 — email
  notifyBellOnLeadAssign   Boolean @default(true)  // D-06 — cloche
}

// AJOUTER dans model Lead :
model Lead {
  // ... existant ...
  wonAt DateTime?  // Date de signature WON — KPI 4 temps moyen
  @@index([tenantId, status, wonAt])  // KPI 2 — leads WON ce mois
}

// NOUVEAU model :
model Notification {
  id        String   @id @default(uuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  userId    String                              // destinataire (le commercial assigné)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      String                              // 'lead.assigned' (extensible futures phases)
  payload   Json                                // { leadId, prospectName, source? }
  readAt    DateTime?                           // null = non lue
  createdAt DateTime @default(now())

  @@index([tenantId, userId, readAt])           // requête cloche
  @@index([tenantId, type, createdAt])          // futurs filtres admin
}

// AJOUTER dans model User :
model User {
  // ... existant ...
  notifications Notification[]
}
```

### Zod schema (`packages/shared/src/schemas/lead.ts`)

```ts
import { z } from 'zod';
import type { LeadStatus, LeadPriority } from '@qualiof/db';

export const CreateLeadSchema = z.object({
  source: z.string().trim().max(80).optional().nullable(),
  status: z.enum(['NEW','CONTACTED','QUALIFIED','PROPOSAL_SENT','NEGOTIATION','WON','LOST','ON_HOLD','TO_FOLLOWUP']).default('NEW'),
  priority: z.enum(['LOW','MEDIUM','HIGH','URGENT']).default('MEDIUM'),
  personId: z.string().uuid().optional().nullable(),
  firstName: z.string().trim().max(80).optional().nullable(),
  lastName: z.string().trim().max(80).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('').transform(() => null)),
  phone: z.string().trim().max(40).optional().nullable(),
  interestedProductId: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
}).refine(
  (d) => d.personId || (d.firstName && d.lastName),
  { message: 'Personne existante OU nom+prénom requis', path: ['lastName'] },
);

export const DistributionConfigSchema = z.object({
  autoAssignLeads: z.boolean(),
  notifyOnLeadAssign: z.boolean(),
  notifyBellOnLeadAssign: z.boolean(),
});

export const LeadAssignedPayloadSchema = z.object({
  leadId: z.string().uuid(),
  prospectName: z.string(),
  source: z.string().nullable().optional(),
});
export type LeadAssignedPayload = z.infer<typeof LeadAssignedPayloadSchema>;
```

### Sidebar nav entry (extension `nav-config.ts`)

```ts
// Dans section 'Suivi', SOUS l'item Leads existant :
{
  label: 'Leads',
  href: '/app/leads',
  icon: Megaphone,
  allowedRoles: ['ADMIN', 'MANAGER', 'COMMERCIAL'],
},
{
  label: 'Vue de charge',
  href: '/app/leads/charge',
  icon: TrendingUp, // import depuis lucide-react
  allowedRoles: ['ADMIN', 'MANAGER'],  // PAS COMMERCIAL — cohérent CONTEXT D-04 + Deferred
},
// Dans section 'Configuration' (collapsible) :
{
  label: 'Distribution des leads',
  href: '/app/parametres/distribution-leads',
  icon: Sliders, // ou Megaphone variant
  allowedRoles: ['ADMIN'],
},
```

### Extension cloche pour `type: 'lead.assigned'`

```ts
// apps/web/src/server/actions/notifications.ts — patch
export type NotificationKind = 'preinscription' | 'session_no_attendee' | 'session_to_close' | 'cleanup' | 'lead.assigned';

export async function getNotifications() {
  const { user } = await validateRequest();
  if (!user) return { total: 0, items: [] };

  // ... existant (4 kinds dérivés) ...

  // NOUVEAU : lire les Notification rows non lues pour CE user
  const userNotifs = await prisma.notification.findMany({
    where: { tenantId: user.tenantId, userId: user.id, readAt: null },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  for (const n of userNotifs) {
    if (n.type === 'lead.assigned') {
      const p = LeadAssignedPayloadSchema.safeParse(n.payload);
      if (!p.success) continue;
      items.push({
        kind: 'lead.assigned',
        label: `Nouveau lead à traiter : ${p.data.prospectName}`,
        href: `/app/leads/${p.data.leadId}`,
        count: 1,
        severity: 'info',
      });
    }
  }
  // ... return ...
}
```

### Email template (résumé)

```ts
// apps/web/src/lib/mailer-templates/lead-assigned.ts
export interface LeadAssignedEmailInput {
  commercialFirstName: string;
  prospectName: string;
  leadSource: string | null;
  productTitle: string | null;
  leadUrl: string;
}

export function renderLeadAssignedEmail(input: LeadAssignedEmailInput, of: OfConfig) {
  const subject = `Nouveau lead à traiter — ${input.prospectName}`;
  // ... clone strict de user-invitation.ts (BRAND_DARK, escapeHtml, footer OF) ...
  // CTA button : "Voir le lead" → leadUrl
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Bouton "Auto-assigner" bulk dans la page liste (`autoAssignUnassignedLeads`) | Trigger à la création + manuel "Réassigner" par lead | Phase 9 (cette phase) | UX moins frustrante : le commercial reçoit ses leads en temps réel, pas par batch admin |
| Notifications cloche 100% dérivées | Hybride : 4 kinds dérivés tenant-wide + N kinds persistés par-user | Phase 9 | Permet notifications événementielles fines, futur-proof pour QBLANC-02 alertes proactives |
| AuditLog Phase 7 = `parameters.*` puis Phase 8 = `users.*` + `auth.*` | Phase 9 ajoute `leads.*` (3 actions) | Phase 9 | Convention namespacée tient — pas de breaking change. Page Historique Phase 8 affichera ces nouvelles actions automatiquement (pas de hardcoded enum côté UI Historique). |

**Deprecated/outdated:** rien à retirer — pure addition.

## Open Questions

1. **`server/actions/leads.ts` n'existe pas — où créer les Leads aujourd'hui ?**
   - What we know: aucune mutation Lead dans `apps/web/src/server/actions/*`. La page `/app/leads/page.tsx` est purement lecture. `autoAssignLead` lit/update mais ne crée jamais.
   - What's unclear: les Leads viennent du seed/import ? Si oui, le D-02 trigger "Création de Lead via UI" implique de **créer la flow de création** dans cette phase.
   - Recommendation: **Inclure dans Plan 09-02 la création de `createLead` + `/app/leads/new` (Dialog OU page)**. Sans ça, D-02 trigger 1 est mort. Confirmer avec Laurent en planning : "On crée aussi la flow Lead-création dans cette phase, OU on assume que les leads sont déjà en BDD via import et le trigger 1 est inutile ?"

2. **Conversion pré-inscription → Lead n'existe pas non plus**
   - What we know: `preinscription-convert.ts` convertit en `Person + Org + LegalLink + AgeficeProfile`, **PAS** en `Lead`.
   - What's unclear: D-02 trigger 2 ("Pré-inscription convertie en Lead → idem appel autoAssignLead") suppose qu'on crée aussi un Lead. Mais aujourd'hui une pré-inscription validée devient un Apprenant (Person), pas un Lead.
   - Recommendation: **Arbitrer planning** : (a) Ajouter une étape `await tx.lead.create({...})` dans `preinscription-convert.ts` après la création Person (mais sémantiquement contestable — la pré-inscription est *déjà passée* du stade lead vers apprenant) ; OU (b) Reformuler D-02 : trigger 2 = "création publique d'un lead via formulaire de contact" (à créer si on veut un formulaire public). Recommandation produit : **option (a)** seulement si Laurent veut tracker la conversion comme un événement commercial WON ; sinon **descoper trigger 2**.

3. **Comment marquer une `Notification` comme lue ?**
   - What we know: champ `readAt` prévu, mais aucun mécanisme dans CONTEXT.md (bouton "Marquer lu" / clic sur l'item / TTL ?).
   - What's unclear: D-03 dit "affichée dans le panel cloche" — implicite : disparait quand lue. Mais quand est-elle "lue" ?
   - Recommendation: **À clarifier** en planning. Recommandation produit : "lue dès clic sur l'item" (cohérent avec `setOpen(false)` actuel dans `notifications-bell.tsx`). Bouton "Marquer tout comme lu" optionnel en deferred.

4. **Le bouton "Réassigner" doit-il proposer un commercial spécifique OU forcer l'algo ?**
   - What we know: D-05 dit "AlertDialog confirmation → call autoAssignLead(force: true)". Implicite : l'algo choisit.
   - What's unclear: et si l'admin veut assigner manuellement à un commercial précis ?
   - Recommendation: **Phase 9 = algo only** (deferred manuel). Si besoin manuel apparait, ajouter un dropdown plus tard. À confirmer en planning.

5. **Layout `/app/leads/charge` : tableau seul ou tableau + camembert + KPI globaux haut ?**
   - What we know: CONTEXT.md D-04 "tableau + graphique camembert" + "réutilisation PrioCard pour les 4 KPI globaux en haut".
   - What's unclear: les 4 KPI **globaux** en haut = somme tous commerciaux (leads actifs total, won this month total, conversion globale, temps moyen global) ?
   - Recommendation: **Oui** — pattern dashboard Phase 6 (`À l'essentiel` : 4 PrioCard grand format). Documenter dans Plan 09-03.

## Environment Availability

| Dépendance | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js 20+ | tout | ✓ | 20.x (`.nvmrc`) | — |
| pnpm 10 | install | ✓ | 10.33.2 (package.json) | — |
| Prisma 5.22 | migration `phase09_distribution` | ✓ | 5.22.0 | — |
| PostgreSQL 16 | BDD multi-tenant | ✓ | docker-compose.yml | — |
| Vitest 2.1 | tests unités + smoke | ✓ | 2.1.8 | — |
| Nodemailer | envoi email | ✓ | 8.0.7 (mode dry-run si pas de `SMTP_HOST`) | dry-run = no-op, OK pour dev |
| `APP_URL` env var | construire `leadUrl` dans email | ❓ | À vérifier dans `.env.example` | `process.env.APP_URL ?? ''` → URL relative dans le mail (utilisable mais moche). |

**Missing dependencies with no fallback:** Aucune.

**Missing dependencies with fallback:** `APP_URL` peut manquer → mail toujours envoyé mais lien pas cliquable depuis client distant. **Action Plan 09-02 : vérifier/ajouter `APP_URL` dans `.env.example`**.

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | Vitest 2.1.8 (existant dans `apps/web` + `packages/shared`) |
| Config file | `apps/web/vitest.config.ts` (existant) |
| Quick run command | `pnpm --filter @qualiof/web test --run` |
| Full suite command | `pnpm --filter @qualiof/web test --run && pnpm --filter @qualiof/web build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| LEAD-01 | `CreateLeadSchema` Zod accepte / refuse les bonnes formes | unit | `pnpm --filter @qualiof/web test --run src/lib/__tests__/lead-schema.test.ts` | ❌ Wave 0 |
| LEAD-01 | `createLead` server action wire `autoAssignLead` quand `tenant.autoAssignLeads=true` | unit (mock prisma) | `pnpm --filter @qualiof/web test --run src/server/actions/__tests__/leads.test.ts` | ❌ Wave 0 |
| LEAD-01 | `createLead` ne wire PAS `autoAssignLead` quand `tenant.autoAssignLeads=false` | unit (mock prisma) | idem ci-dessus | ❌ Wave 0 |
| LEAD-01 | `reassignLead` appelle `autoAssignLead(force: true)` + AuditLog `leads.reassigned` avec `userId=admin.id` | unit | idem | ❌ Wave 0 |
| LEAD-01 | `notifyLeadAssigned` crée Notification + envoie email + AuditLog (respecte les 3 toggles tenant) | unit (mock prisma + mailer dry-run) | `pnpm --filter @qualiof/web test --run src/lib/__tests__/lead-notifications.test.ts` | ❌ Wave 0 |
| LEAD-01 | `renderLeadAssignedEmail` produit subject + html + text avec escape HTML | unit pur | `pnpm --filter @qualiof/web test --run src/lib/mailer-templates/__tests__/lead-assigned.test.ts` | ❌ Wave 0 |
| LEAD-01 | Page `/app/leads/[id]` render + bouton Réassigner visible si role ADMIN/MANAGER/COMMERCIAL | smoke | `pnpm --filter @qualiof/web test --run src/app/app/leads/[id]/__tests__/page.smoke.test.ts` | ❌ Wave 0 |
| LEAD-01 | Page `/app/parametres/distribution-leads` render + 3 toggles + RBAC ADMIN | smoke | `pnpm --filter @qualiof/web test --run src/app/app/parametres/distribution-leads/__tests__/page.smoke.test.ts` | ❌ Wave 0 |
| LEAD-01 | `updateDistributionConfig` AuditLog `leads.distribution_config` avec diff | unit | `pnpm --filter @qualiof/web test --run src/server/actions/__tests__/distribution-config.test.ts` | ❌ Wave 0 |
| LEAD-02 | `getCommercialsWithKpis` retourne les 4 KPI agrégés correctement (fixtures Lead variées) | unit (sqlite in-memory ou mock) | `pnpm --filter @qualiof/web test --run src/lib/__tests__/lead-load-stats.test.ts` | ❌ Wave 0 |
| LEAD-02 | Page `/app/leads/charge` render + RBAC ADMIN+MANAGER (forbidden si COMMERCIAL) | smoke | `pnpm --filter @qualiof/web test --run src/app/app/leads/charge/__tests__/page.smoke.test.ts` | ❌ Wave 0 |
| LEAD-02 | `LeadDistributionPie` rend `<svg>` avec N paths pour N slices, accessible | unit composant | `pnpm --filter @qualiof/web test --run src/components/leads/__tests__/lead-distribution-pie.test.tsx` | ❌ Wave 0 |
| LEAD-02 | Sidebar `Vue de charge` visible ADMIN/MANAGER, masquée COMMERCIAL | unit pur sur `filterNavForRole` | `pnpm --filter @qualiof/web test --run src/components/layout/__tests__/nav-config.test.ts` (étendre) | ✅ existe (étendre) |
| LEAD-02 | Extension `getNotifications()` lit Notification rows `lead.assigned` user-scoped | unit (mock prisma) | `pnpm --filter @qualiof/web test --run src/server/actions/__tests__/notifications.test.ts` | ❌ Wave 0 |

**Manuel (DevTools) :**
- Création Lead via UI → vérif owner assigné automatiquement (vu la mémoire utilisateur "petit volume", manuel = la vraie validation).
- Toggle `autoAssignLeads=false` → créer un lead → owner reste null + admin alerté.
- Bouton Réassigner → confirmation AlertDialog → owner change + cloche commercial nouvelle + email reçu (en SMTP réel).
- Page `/charge` : visu camembert, hover slices, 4 KPI cohérents.

### Sampling Rate
- **Per task commit:** `pnpm --filter @qualiof/web test --run` (Vitest seul, < 30s)
- **Per wave merge:** `pnpm --filter @qualiof/web test --run && pnpm --filter @qualiof/web build` (Vitest + Next build)
- **Phase gate:** Full suite green + smoke manuel DevTools sur les 4 flows clés (création lead, réassignation, toggle config, vue charge).

### Wave 0 Gaps
- [ ] `apps/web/src/lib/__tests__/lead-schema.test.ts` — couvre LEAD-01 validation
- [ ] `apps/web/src/server/actions/__tests__/leads.test.ts` — couvre LEAD-01 wiring
- [ ] `apps/web/src/lib/__tests__/lead-notifications.test.ts` — couvre LEAD-01 side-effects + toggles
- [ ] `apps/web/src/lib/mailer-templates/__tests__/lead-assigned.test.ts` — couvre template email
- [ ] `apps/web/src/app/app/leads/[id]/__tests__/page.smoke.test.ts` — smoke fiche Lead
- [ ] `apps/web/src/app/app/parametres/distribution-leads/__tests__/page.smoke.test.ts` — smoke config
- [ ] `apps/web/src/server/actions/__tests__/distribution-config.test.ts` — toggles + AuditLog
- [ ] `apps/web/src/lib/__tests__/lead-load-stats.test.ts` — 4 KPI agrégés
- [ ] `apps/web/src/app/app/leads/charge/__tests__/page.smoke.test.ts` — smoke vue charge
- [ ] `apps/web/src/components/leads/__tests__/lead-distribution-pie.test.tsx` — SVG composant
- [ ] Étendre `apps/web/src/components/layout/__tests__/nav-config.test.ts` — assertions visibilité Vue de charge
- [ ] Étendre `apps/web/src/server/actions/__tests__/notifications.test.ts` — lecture Notification rows user-scoped

*(Pas de framework manquant. Vitest + conftest pattern Phase 8 utilisables tels quels.)*

## Recommendations — Proposed Plan Breakdown

**4 plans + 1 bookkeeping** (plus petit que Phase 8 qui en avait 6) :

### Plan 09-01 — Schema, types, helpers purs (BDD + Zod + utilities)
- Migration Prisma : `Tenant` +3 booleans (`autoAssignLeads`, `notifyOnLeadAssign`, `notifyBellOnLeadAssign` defaults `true`), `Lead` + `wonAt: DateTime?` + index `(tenantId, status, wonAt)`, NEW `Notification` model + 2 index.
- `pnpm --filter @qualiof/db db:generate` + commit migration SQL.
- `packages/shared/src/schemas/lead.ts` : `CreateLeadSchema`, `DistributionConfigSchema`, `LeadAssignedPayloadSchema`.
- `apps/web/src/lib/lead-load-stats.ts` : `getCommercialsWithKpis(tenantId)` (Pattern 3).
- `apps/web/src/lib/mailer-templates/lead-assigned.ts` : `renderLeadAssignedEmail`.
- Tests Vitest purs : `lead-schema.test.ts`, `lead-load-stats.test.ts` (avec fixtures Lead), `lead-assigned.test.ts` (snapshot HTML/text).
- AuditLog : pas d'helper dédié, on appelle `prisma.auditLog.create` directement (cohérent Phase 7 — seul `logUserAction` Phase 8 est partagé pour User entity).

### Plan 09-02 — Server actions + wiring (mutation + side-effects)
- `apps/web/src/server/actions/leads.ts` : `createLead`, `reassignLead`, `updateLeadStatus` (set `wonAt` sur transition WON), tous avec `requireRole`.
- `apps/web/src/lib/lead-notifications.ts` : `notifyLeadAssigned(opts)` (Pattern 2) — orchestre Notification + Email + AuditLog en respectant les 3 toggles tenant.
- `apps/web/src/server/actions/distribution-config.ts` : `updateDistributionConfig({ autoAssignLeads, notifyOnLeadAssign, notifyBellOnLeadAssign })` avec `requireRole(['ADMIN'])` + AuditLog `leads.distribution_config`.
- Wiring : `createLead` lit `tenant.autoAssignLeads` → si true, appelle `autoAssignLead(lead.id)` puis `notifyLeadAssigned`. `reassignLead` appelle `autoAssignLead(lead.id, { force: true })` puis `notifyLeadAssigned(assignedBy=user.id)`.
- Tests Vitest : `leads.test.ts`, `lead-notifications.test.ts`, `distribution-config.test.ts`.
- Vérifier `APP_URL` dans `.env.example`, l'ajouter sinon.

### Plan 09-03 — UI pages métier (charge + fiche lead + création)
- `app/app/leads/charge/page.tsx` : Server Component, `requireRole(['ADMIN', 'MANAGER'])`, fetch `getCommercialsWithKpis(user.tenantId)`. Layout : 4 PrioCard globaux (Pattern Phase 6) en haut + tableau commercial × 4 KPI + camembert SVG à droite.
- `components/leads/lead-distribution-pie.tsx` (Pattern 4).
- `components/leads/lead-load-table.tsx`.
- `app/app/leads/[id]/page.tsx` : Server Component, affiche lead + badge owner + bouton "Réassigner" (component client `reassign-lead-button.tsx` avec AlertDialog Radix). Sélecteur statut Lead (cf. Pitfall 3) — pour qu'on puisse set WON et faire vivre les KPI 2/3/4.
- `app/app/leads/new/page.tsx` (ou Dialog dans `/app/leads`) : form RHF + zodResolver(`CreateLeadSchema`), submit → `createLead(...)`.
- Sidebar : éditer `nav-config.ts` (entrées `Vue de charge` + `Distribution des leads`), étendre `nav-config.test.ts`.
- Tests : 2 smoke pages + `lead-distribution-pie.test.tsx`.

### Plan 09-04 — Cloche + page config tenant
- `app/app/parametres/distribution-leads/page.tsx` : 3 toggles (RHF, useTransition, submit → `updateDistributionConfig`). RBAC ADMIN. Toast confirmation.
- Extension `server/actions/notifications.ts` : ajouter lecture `prisma.notification.findMany({ where: { userId, readAt: null, type: 'lead.assigned' } })` + parse `LeadAssignedPayloadSchema`.
- Étendre `components/layout/notifications-bell.tsx` : ajouter icône pour `lead.assigned` (Lucide `UserPlus` ?). Si le user clique l'item, appeler une nouvelle server action `markNotificationRead(notifId)` (et set `readAt: now()`).
- Tests : smoke page distribution-leads + extension `notifications.test.ts`.

### Plan 09-05 — Bookkeeping (smoke + validation + commit docs)
- `.planning/phases/09-distribution-leads-automatique/09-VALIDATION.md` (approuvé)
- `.planning/phases/09-distribution-leads-automatique/09-SMOKE.md` (script manuel DevTools : 4 flows)
- `09-SUMMARY.md` final.
- Optionnel : mettre à jour `MEMORY.md` après merge avec un fichier `project_phase9_done_YYYY_MM_DD.md`.

**Effort estimé** (anchored sur Phase 8 = 6 plans / ~12 commits) : ~4 plans / ~7-10 commits, plus léger car beaucoup de réutilisation et 0 nouvelle dépendance externe.

## Sources

### Primary (HIGH confidence)
- `apps/web/src/server/actions/auto-assign-leads.ts` (228 lignes lues intégralement) — algo round-robin idempotent prêt à wirer
- `apps/web/src/server/actions/preinscription-convert.ts` (242 lignes lues) — confirme **absence** de création Lead côté pré-inscription
- `apps/web/src/server/actions/notifications.ts` (102 lignes lues) — confirme **absence** de model Notification persistant (calcul dérivé)
- `apps/web/src/components/layout/notifications-bell.tsx` (113 lignes lues) — pattern Radix DropdownMenu + polling 60s + Lucide icons
- `apps/web/src/components/layout/nav-config.ts` (188 lignes lues) — pattern `allowedRoles` + `filterNavForRole` Phase 8
- `apps/web/src/lib/mailer.ts` (98 lignes lues) — mode dry-run automatique si `SMTP_HOST` absent
- `apps/web/src/lib/mailer-templates/user-invitation.ts` (112 lignes lues) — pattern HTML + escapeHtml + OfConfig footer
- `apps/web/src/lib/audit-log.ts` (113 lignes lues) — helpers Phase 7+8, `logUserAction` accepte `actorUserId: null`
- `apps/web/src/lib/rbac.ts` (94 lignes lues) — `requireRole` Phase 8 directement réutilisable
- `packages/db/prisma/schema.prisma` Tenant (lignes 24-46), User (57-81), Lead (648-687), AuditLog (1030-1045) — confirmation absence `Notification`, `wonAt`, toggles Tenant
- `apps/web/src/app/app/leads/page.tsx` (222 lignes lues) — pas de `/app/leads/[id]`, pas de `/app/leads/new`
- `apps/web/src/components/leads/auto-assign-button.tsx` (68 lignes lues) — pattern client transition + sonner + `router.refresh()`
- `.planning/phases/08-multi-utilisateurs-et-rbac/08-RESEARCH.md` + `08-VALIDATION.md` (modèles pour structure du fichier actuel)
- `apps/web/package.json` (dépendances complètes verrouillées) — confirmation : aucune lib chart
- `.planning/config.json` — `nyquist_validation: true` → section Validation obligatoire

### Secondary (MEDIUM confidence)
- Pattern Phase 6 `PrioCard` + `CollapsibleSection` (memory) — réutilisable pour les 4 KPI globaux haut de la page de charge
- Convention "Pas de Recharts" inférée de l'absence systématique dans tous les dashboards existants (Phase 6 a livré le dashboard sans chart lib)

### Tertiary (LOW confidence)
- (aucune — toutes les décisions reposent sur lecture directe du code)

## Metadata

**Confidence breakdown:**
- Standard stack : HIGH — toutes les briques (Prisma, Vitest, Lucia/RBAC, mailer, audit-log, nav-config, Radix) sont en stock et patternisées Phase 7/8
- Architecture : HIGH — 4 patterns documentés sont des extensions directes du pattern Phase 7/8 (Server Action discriminé + `requireRole` + `revalidatePath` + AuditLog)
- Pitfalls : HIGH — 6 pitfalls identifiés, dont 2 (Pitfall 2 cloche dérivée vs persistée + Pitfall 3 `wonAt` jamais set) sont des écueils **réels** liés à l'état actuel du code
- Open questions : 5 questions structurantes à arbitrer en planning — la majorité (#1, #2) concernent l'écart entre l'intention CONTEXT.md et l'état actuel du code Lead

**Research date:** 2026-05-16
**Valid until:** 2026-06-15 (30 jours — stack figée + Phase 9 ne consomme aucune dépendance amont à risque de churn court terme)
