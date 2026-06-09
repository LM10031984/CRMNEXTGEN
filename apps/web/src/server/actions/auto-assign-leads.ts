'use server';

/**
 * Distribution automatique des leads aux commerciaux (round-robin équilibré
 * par charge active).
 *
 * Stratégie :
 *   - Cible = utilisateurs role=COMMERCIAL du tenant
 *   - "Charge active" = leads possédés non clos (status ≠ WON, LOST)
 *   - Le lead est assigné au commercial avec la charge la plus faible
 *   - En cas d'égalité : tie-breaker = createdAt User asc (le plus ancien)
 *
 * Idempotent : un lead déjà assigné n'est pas réassigné sauf opts.force=true.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';

interface AssignResult {
  ok: boolean;
  leadId: string;
  ownerUserId?: string;
  ownerName?: string;
  skippedReason?: string;
  error?: string;
}

import type { LeadStatus } from '@qualiof/db';

const ACTIVE_STATUSES: LeadStatus[] = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'ON_HOLD',
  'TO_FOLLOWUP',
];

interface CommercialLoad {
  userId: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
  activeLoad: number;
}

async function getCommercialsWithLoad(tenantId: string): Promise<CommercialLoad[]> {
  const commercials = await prisma.user.findMany({
    where: { tenantId, role: 'COMMERCIAL' },
    select: { id: true, firstName: true, lastName: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  if (commercials.length === 0) return [];

  // Charge active par commercial : count par owner.
  const grouped = await prisma.lead.groupBy({
    by: ['ownerUserId'],
    where: {
      tenantId,
      ownerUserId: { in: commercials.map((c) => c.id) },
      status: { in: ACTIVE_STATUSES },
    },
    _count: true,
  });
  const loadByUserId = new Map<string, number>();
  for (const g of grouped) {
    if (g.ownerUserId) loadByUserId.set(g.ownerUserId, g._count);
  }

  return commercials.map((c) => ({
    userId: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    createdAt: c.createdAt,
    activeLoad: loadByUserId.get(c.id) ?? 0,
  }));
}

function pickLeastLoaded(loads: CommercialLoad[]): CommercialLoad | null {
  if (loads.length === 0) return null;
  // Trie par charge ASC puis createdAt ASC (tie-breaker)
  const sorted = [...loads].sort((a, b) => {
    if (a.activeLoad !== b.activeLoad) return a.activeLoad - b.activeLoad;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return sorted[0] ?? null;
}

/**
 * Assigne 1 lead au commercial le moins chargé. Idempotent par défaut.
 */
export async function autoAssignLead(
  leadId: string,
  opts: { force?: boolean } = {},
): Promise<AssignResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, leadId, error: 'Non authentifié' };

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, tenantId: user.tenantId },
    select: { id: true, ownerUserId: true, status: true },
  });
  if (!lead) return { ok: false, leadId, error: 'Lead introuvable' };
  if (lead.ownerUserId && !opts.force) {
    return { ok: false, leadId, skippedReason: 'already-assigned' };
  }
  if (lead.status === 'WON' || lead.status === 'LOST') {
    return { ok: false, leadId, skippedReason: 'closed' };
  }

  const loads = await getCommercialsWithLoad(user.tenantId);
  const winner = pickLeastLoaded(loads);
  if (!winner) {
    return { ok: false, leadId, skippedReason: 'no-commercials' };
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: { ownerUserId: winner.userId },
  });
  revalidatePath('/app/leads');

  return {
    ok: true,
    leadId,
    ownerUserId: winner.userId,
    ownerName: `${winner.firstName} ${winner.lastName}`.trim(),
  };
}

export interface BulkAssignResult {
  ok: boolean;
  totalCandidates: number;
  assigned: number;
  errors: number;
  details: AssignResult[];
  /** Charge finale par commercial (utile pour debug/UI) */
  loadByCommercial: { userId: string; name: string; loadBefore: number; loadAfter: number }[];
}

/**
 * Auto-assigne tous les leads sans owner (round-robin équilibré, charge
 * recalculée à chaque itération pour éviter de surcharger le 1er commercial).
 */
export async function autoAssignUnassignedLeads(): Promise<BulkAssignResult> {
  const { user } = await validateRequest();
  if (!user) {
    return {
      ok: false,
      totalCandidates: 0,
      assigned: 0,
      errors: 0,
      details: [],
      loadByCommercial: [],
    };
  }

  const candidates = await prisma.lead.findMany({
    where: {
      tenantId: user.tenantId,
      ownerUserId: null,
      status: { in: ACTIVE_STATUSES },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });

  const initialLoads = await getCommercialsWithLoad(user.tenantId);
  const loadMap = new Map<string, CommercialLoad>(
    initialLoads.map((c) => [c.userId, { ...c }]),
  );

  const details: AssignResult[] = [];
  let assigned = 0;
  let errors = 0;

  for (const c of candidates) {
    const loads = Array.from(loadMap.values());
    const winner = pickLeastLoaded(loads);
    if (!winner) {
      details.push({ ok: false, leadId: c.id, skippedReason: 'no-commercials' });
      errors++;
      continue;
    }
    try {
      await prisma.lead.update({
        where: { id: c.id },
        data: { ownerUserId: winner.userId },
      });
      // Incrémente la charge en mémoire pour rééquilibrer la prochaine itération
      const updated = loadMap.get(winner.userId)!;
      updated.activeLoad++;
      loadMap.set(winner.userId, updated);
      details.push({
        ok: true,
        leadId: c.id,
        ownerUserId: winner.userId,
        ownerName: `${winner.firstName} ${winner.lastName}`.trim(),
      });
      assigned++;
    } catch (e: any) {
      details.push({ ok: false, leadId: c.id, error: e?.message ?? String(e) });
      errors++;
    }
  }

  revalidatePath('/app/leads');

  const loadByCommercial = initialLoads.map((c) => ({
    userId: c.userId,
    name: `${c.firstName} ${c.lastName}`.trim(),
    loadBefore: c.activeLoad,
    loadAfter: loadMap.get(c.userId)?.activeLoad ?? c.activeLoad,
  }));

  return {
    ok: true,
    totalCandidates: candidates.length,
    assigned,
    errors,
    details,
    loadByCommercial,
  };
}
