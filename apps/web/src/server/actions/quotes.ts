'use server';

/**
 * Module Devis — server actions CRUD + helpers de pré-remplissage.
 *
 * Workflow hybride :
 *  - createQuote() : devis vide DRAFT, destinataire à compléter par l'UI
 *  - prefillRecipientFromPerson() : auto-remplit nom + email + adresse depuis
 *    un Person existant (et son éventuel LegalLink employeur pour adresse pro)
 *  - prefillLineFromProduct() : ajoute une ligne avec titre/prix unit du produit
 *  - addLine/updateLine/deleteLine : édition fine des lignes
 *  - markAsSent/markAsAccepted/markAsRejected : transitions de statut
 *
 * RBAC : ADMIN + MANAGER + COMMERCIAL (les rôles qui font de la prospection).
 * Tenant-scopé sur toutes les requêtes.
 * AuditLog pour chaque action de mutation (entity='Quote').
 *
 * Numérotation DEV-NNNN : on cherche le max existant dans le tenant et on
 * incrémente. Boucle de garde 50 essais pour gérer les races (improbables
 * en mono-tenant mais coût négligeable).
 */

import { prisma, Prisma } from '@qualiof/db';
import { revalidatePath } from 'next/cache';
import { validateRequest } from '@/lib/auth';

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

const ALLOWED_ROLES = ['ADMIN', 'MANAGER', 'COMMERCIAL'];

async function requireQuoteRole() {
  const { user } = await validateRequest();
  if (!user) return { ok: false as const, error: 'Non authentifié.' };
  if (!ALLOWED_ROLES.includes(user.role)) {
    return { ok: false as const, error: 'Rôle non autorisé pour les devis.' };
  }
  return { ok: true as const, user };
}

// ── Numérotation auto DEV-NNNN ─────────────────────────────────────────────
async function generateQuoteNumber(tenantId: string): Promise<string> {
  const candidates = await prisma.quote.findMany({
    where: { tenantId, number: { startsWith: 'DEV-' } },
    select: { number: true },
  });
  const maxSeq = candidates.reduce((m, q) => {
    const match = q.number.match(/^DEV-0*(\d+)$/);
    if (!match || !match[1]) return m;
    return Math.max(m, parseInt(match[1], 10));
  }, 0);
  for (let attempt = 1; attempt <= 50; attempt++) {
    const candidate = `DEV-${String(maxSeq + attempt).padStart(4, '0')}`;
    const exists = await prisma.quote.findFirst({
      where: { tenantId, number: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  throw new Error('Impossible de générer un numéro de devis unique (50 collisions).');
}

// ── Recalcul totaux (à appeler après tout add/update/delete de ligne) ─────
async function recomputeTotals(quoteId: string): Promise<void> {
  const lines = await prisma.quoteLine.findMany({
    where: { quoteId },
    select: { quantity: true, unitPriceHT: true, vatRate: true },
  });

  let totalHT = new Prisma.Decimal(0);
  let totalVAT = new Prisma.Decimal(0);
  for (const l of lines) {
    const lineHT = l.quantity.mul(l.unitPriceHT);
    const lineVAT = lineHT.mul(l.vatRate).div(100);
    totalHT = totalHT.add(lineHT);
    totalVAT = totalVAT.add(lineVAT);
  }

  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      amountHT: totalHT,
      amountVAT: totalVAT,
      amountTTC: totalHT.add(totalVAT),
    },
  });
}

async function logAudit(
  tenantId: string,
  userId: string,
  quoteId: string,
  action: string,
  diff: Prisma.InputJsonValue,
) {
  await prisma.auditLog.create({
    data: { tenantId, userId, entity: 'Quote', entityId: quoteId, action, diff },
  });
}

// ── createQuote ────────────────────────────────────────────────────────────
export async function createQuote(input: {
  recipientName: string;
  recipientContact?: string | null;
  recipientAddress?: string | null;
  recipientEmail?: string | null;
  recipientSiret?: string | null;
  title?: string;
  validUntil?: string | null; // ISO yyyy-mm-dd
}): Promise<ActionResult<{ id: string; number: string }>> {
  const guard = await requireQuoteRole();
  if (!guard.ok) return guard;
  const { user } = guard;

  if (!input.recipientName.trim()) {
    return { ok: false, error: 'Nom du destinataire requis.' };
  }

  const number = await generateQuoteNumber(user.tenantId);
  const quote = await prisma.quote.create({
    data: {
      tenantId: user.tenantId,
      number,
      status: 'DRAFT',
      recipientName: input.recipientName.trim(),
      recipientContact: input.recipientContact?.trim() || null,
      recipientAddress: input.recipientAddress?.trim() || null,
      recipientEmail: input.recipientEmail?.trim() || null,
      recipientSiret: input.recipientSiret?.trim() || null,
      title: input.title?.trim() || 'Devis de formation',
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
    },
  });

  await logAudit(user.tenantId, user.id, quote.id, 'quotes.create', { number });
  revalidatePath('/app/devis');
  return { ok: true, data: { id: quote.id, number } };
}

// ── updateQuote (champs scalaires + entête + notes + validity) ─────────────
export async function updateQuote(input: {
  quoteId: string;
  recipientName?: string;
  recipientContact?: string | null;
  recipientAddress?: string | null;
  recipientEmail?: string | null;
  recipientSiret?: string | null;
  title?: string;
  notes?: string | null;
  headerCustomMd?: string | null;
  validUntil?: string | null;
}): Promise<ActionResult> {
  const guard = await requireQuoteRole();
  if (!guard.ok) return guard;
  const { user } = guard;

  const quote = await prisma.quote.findFirst({
    where: { id: input.quoteId, tenantId: user.tenantId },
    select: { id: true, status: true },
  });
  if (!quote) return { ok: false, error: 'Devis introuvable.' };
  if (quote.status === 'ACCEPTED' || quote.status === 'REJECTED') {
    return { ok: false, error: 'Devis figé (ACCEPTED/REJECTED), édition impossible.' };
  }

  const data: Prisma.QuoteUpdateInput = {};
  if (input.recipientName !== undefined && input.recipientName.trim())
    data.recipientName = input.recipientName.trim();
  if (input.recipientContact !== undefined) data.recipientContact = input.recipientContact?.trim() || null;
  if (input.recipientAddress !== undefined) data.recipientAddress = input.recipientAddress?.trim() || null;
  if (input.recipientEmail !== undefined) data.recipientEmail = input.recipientEmail?.trim() || null;
  if (input.recipientSiret !== undefined) data.recipientSiret = input.recipientSiret?.trim() || null;
  if (input.title !== undefined && input.title.trim()) data.title = input.title.trim();
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
  if (input.headerCustomMd !== undefined) data.headerCustomMd = input.headerCustomMd?.trim() || null;
  if (input.validUntil !== undefined) {
    data.validUntil = input.validUntil ? new Date(input.validUntil) : null;
  }

  if (Object.keys(data).length === 0) return { ok: true };
  await prisma.quote.update({ where: { id: input.quoteId }, data });
  await logAudit(user.tenantId, user.id, input.quoteId, 'quotes.update', {
    fields: Object.keys(data),
  });
  revalidatePath('/app/devis');
  revalidatePath(`/app/devis/${input.quoteId}`);
  return { ok: true };
}

// ── deleteQuote ────────────────────────────────────────────────────────────
export async function deleteQuote(quoteId: string): Promise<ActionResult> {
  const guard = await requireQuoteRole();
  if (!guard.ok) return guard;
  const { user } = guard;

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, tenantId: user.tenantId },
    select: { id: true, status: true, number: true },
  });
  if (!quote) return { ok: false, error: 'Devis introuvable.' };
  if (quote.status === 'ACCEPTED') {
    return { ok: false, error: 'Devis accepté — non supprimable (archive uniquement).' };
  }
  await prisma.quote.delete({ where: { id: quoteId } });
  await logAudit(user.tenantId, user.id, quoteId, 'quotes.delete', { number: quote.number });
  revalidatePath('/app/devis');
  return { ok: true };
}

// ── Lignes ─────────────────────────────────────────────────────────────────
export async function addLine(input: {
  quoteId: string;
  description: string;
  quantity?: number;
  unitPriceHT?: number;
  vatRate?: number;
}): Promise<ActionResult<{ lineId: string }>> {
  const guard = await requireQuoteRole();
  if (!guard.ok) return guard;
  const { user } = guard;

  const quote = await prisma.quote.findFirst({
    where: { id: input.quoteId, tenantId: user.tenantId },
    select: { id: true, status: true },
  });
  if (!quote) return { ok: false, error: 'Devis introuvable.' };
  if (quote.status === 'ACCEPTED' || quote.status === 'REJECTED') {
    return { ok: false, error: 'Devis figé, ajout de ligne impossible.' };
  }
  if (!input.description.trim()) {
    return { ok: false, error: 'Description de ligne requise.' };
  }

  const maxOrder = await prisma.quoteLine.aggregate({
    where: { quoteId: input.quoteId },
    _max: { order: true },
  });
  const nextOrder = (maxOrder._max.order ?? -1) + 1;

  const qty = new Prisma.Decimal(input.quantity ?? 1);
  const price = new Prisma.Decimal(input.unitPriceHT ?? 0);
  const line = await prisma.quoteLine.create({
    data: {
      quoteId: input.quoteId,
      order: nextOrder,
      description: input.description.trim(),
      quantity: qty,
      unitPriceHT: price,
      vatRate: new Prisma.Decimal(input.vatRate ?? 0),
      lineTotalHT: qty.mul(price),
    },
  });

  await recomputeTotals(input.quoteId);
  revalidatePath(`/app/devis/${input.quoteId}`);
  return { ok: true, data: { lineId: line.id } };
}

export async function updateLine(input: {
  lineId: string;
  description?: string;
  quantity?: number;
  unitPriceHT?: number;
  vatRate?: number;
}): Promise<ActionResult> {
  const guard = await requireQuoteRole();
  if (!guard.ok) return guard;
  const { user } = guard;

  const line = await prisma.quoteLine.findFirst({
    where: { id: input.lineId, quote: { tenantId: user.tenantId } },
    select: { id: true, quoteId: true, quantity: true, unitPriceHT: true, quote: { select: { status: true } } },
  });
  if (!line) return { ok: false, error: 'Ligne introuvable.' };
  if (line.quote.status === 'ACCEPTED' || line.quote.status === 'REJECTED') {
    return { ok: false, error: 'Devis figé, édition de ligne impossible.' };
  }

  const data: Prisma.QuoteLineUpdateInput = {};
  if (input.description !== undefined && input.description.trim())
    data.description = input.description.trim();
  let nextQty = line.quantity;
  let nextPrice = line.unitPriceHT;
  if (input.quantity !== undefined) {
    nextQty = new Prisma.Decimal(input.quantity);
    data.quantity = nextQty;
  }
  if (input.unitPriceHT !== undefined) {
    nextPrice = new Prisma.Decimal(input.unitPriceHT);
    data.unitPriceHT = nextPrice;
  }
  if (input.vatRate !== undefined) data.vatRate = new Prisma.Decimal(input.vatRate);
  data.lineTotalHT = nextQty.mul(nextPrice);

  await prisma.quoteLine.update({ where: { id: input.lineId }, data });
  await recomputeTotals(line.quoteId);
  revalidatePath(`/app/devis/${line.quoteId}`);
  return { ok: true };
}

export async function deleteLine(lineId: string): Promise<ActionResult> {
  const guard = await requireQuoteRole();
  if (!guard.ok) return guard;
  const { user } = guard;

  const line = await prisma.quoteLine.findFirst({
    where: { id: lineId, quote: { tenantId: user.tenantId } },
    select: { id: true, quoteId: true, quote: { select: { status: true } } },
  });
  if (!line) return { ok: false, error: 'Ligne introuvable.' };
  if (line.quote.status === 'ACCEPTED' || line.quote.status === 'REJECTED') {
    return { ok: false, error: 'Devis figé, suppression de ligne impossible.' };
  }
  await prisma.quoteLine.delete({ where: { id: lineId } });
  await recomputeTotals(line.quoteId);
  revalidatePath(`/app/devis/${line.quoteId}`);
  return { ok: true };
}

// ── Pré-remplissage depuis catalogue ───────────────────────────────────────
export async function prefillLineFromProduct(input: {
  quoteId: string;
  productId: string;
  quantity?: number;
}): Promise<ActionResult<{ lineId: string }>> {
  const guard = await requireQuoteRole();
  if (!guard.ok) return guard;
  const { user } = guard;

  const product = await prisma.trainingProduct.findFirst({
    where: { id: input.productId, tenantId: user.tenantId },
    select: { id: true, code: true, title: true, durationHours: true, priceHT: true },
  });
  if (!product) return { ok: false, error: 'Produit introuvable.' };

  const description = `${product.code} — ${product.title} (${product.durationHours}h)`;
  const r = await addLine({
    quoteId: input.quoteId,
    description,
    quantity: input.quantity ?? 1,
    unitPriceHT: Number(product.priceHT),
    vatRate: 0, // formation pro = exonérée TVA (article 261-4-4° CGI) par défaut
  });
  if (!r.ok) return r;
  await prisma.quote.update({
    where: { id: input.quoteId },
    data: { sourceProductId: product.id },
  });
  return r;
}

export async function prefillRecipientFromPerson(input: {
  quoteId: string;
  personId: string;
}): Promise<ActionResult> {
  const guard = await requireQuoteRole();
  if (!guard.ok) return guard;
  const { user } = guard;

  // SALARIE = paye via la structure (employeur),
  // EI_SELF = paye lui-même (mais a quand même une EI rattachée pour facturation).
  // AGENT_COMMERCIAL = pattern dominant (indépendant + enseigne) — l'enseigne est commanditaire potentiel.
  const person = await prisma.person.findFirst({
    where: { id: input.personId, tenantId: user.tenantId },
    include: {
      legalLinks: {
        where: { role: { in: ['SALARIE', 'EI_SELF', 'AGENT_COMMERCIAL'] } },
        include: { organization: true },
        orderBy: { isPrimary: 'desc' },
        take: 1,
      },
    },
  });
  if (!person) return { ok: false, error: 'Personne introuvable.' };

  const employer = person.legalLinks[0]?.organization ?? null;
  const recipientName = employer?.legalName ?? `${person.firstName} ${person.lastName}`;
  const recipientContact = employer ? `À l'attention de ${person.firstName} ${person.lastName}` : null;
  const recipientSiret = employer?.siret ?? null;

  await prisma.quote.update({
    where: { id: input.quoteId },
    data: {
      recipientName,
      recipientContact,
      recipientEmail: person.email ?? undefined,
      recipientSiret,
      sourcePersonId: person.id,
      sourceOrgId: employer?.id ?? null,
    },
  });
  await logAudit(user.tenantId, user.id, input.quoteId, 'quotes.prefill_recipient', {
    personId: person.id,
    orgId: employer?.id ?? null,
  });
  revalidatePath(`/app/devis/${input.quoteId}`);
  return { ok: true };
}

// ── Transitions de statut ──────────────────────────────────────────────────
export async function markAsSent(quoteId: string): Promise<ActionResult> {
  const guard = await requireQuoteRole();
  if (!guard.ok) return guard;
  const { user } = guard;
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, tenantId: user.tenantId },
    select: { status: true },
  });
  if (!quote) return { ok: false, error: 'Devis introuvable.' };
  if (quote.status !== 'DRAFT') {
    return { ok: false, error: `Devis déjà en statut ${quote.status}.` };
  }
  await prisma.quote.update({
    where: { id: quoteId },
    data: { status: 'SENT', issuedAt: new Date() },
  });
  await logAudit(user.tenantId, user.id, quoteId, 'quotes.mark_sent', {});
  revalidatePath('/app/devis');
  revalidatePath(`/app/devis/${quoteId}`);
  return { ok: true };
}

export async function markAsAccepted(quoteId: string): Promise<ActionResult> {
  const guard = await requireQuoteRole();
  if (!guard.ok) return guard;
  const { user } = guard;
  await prisma.quote.update({
    where: { id: quoteId },
    data: { status: 'ACCEPTED', acceptedAt: new Date() },
  });
  await logAudit(user.tenantId, user.id, quoteId, 'quotes.mark_accepted', {});
  revalidatePath('/app/devis');
  revalidatePath(`/app/devis/${quoteId}`);
  return { ok: true };
}

export async function markAsRejected(quoteId: string): Promise<ActionResult> {
  const guard = await requireQuoteRole();
  if (!guard.ok) return guard;
  const { user } = guard;
  await prisma.quote.update({
    where: { id: quoteId },
    data: { status: 'REJECTED', rejectedAt: new Date() },
  });
  await logAudit(user.tenantId, user.id, quoteId, 'quotes.mark_rejected', {});
  revalidatePath('/app/devis');
  revalidatePath(`/app/devis/${quoteId}`);
  return { ok: true };
}

export async function reopenQuote(quoteId: string): Promise<ActionResult> {
  const guard = await requireQuoteRole();
  if (!guard.ok) return guard;
  const { user } = guard;
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, tenantId: user.tenantId },
    select: { status: true },
  });
  if (!quote) return { ok: false, error: 'Devis introuvable.' };
  if (quote.status === 'DRAFT') return { ok: true };
  await prisma.quote.update({
    where: { id: quoteId },
    data: { status: 'DRAFT', issuedAt: null, acceptedAt: null, rejectedAt: null },
  });
  await logAudit(user.tenantId, user.id, quoteId, 'quotes.reopen', {});
  revalidatePath('/app/devis');
  revalidatePath(`/app/devis/${quoteId}`);
  return { ok: true };
}
