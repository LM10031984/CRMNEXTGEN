'use server';

/**
 * Générateurs PDF pour les docs légaux statiques tenant (BUG-15).
 *
 * - CGV : Conditions Générales de Vente (Qualiopi indic 1 — info site web)
 * - Règlement intérieur : règles internes formation (indic 9 — info déroulement)
 *
 * Source : tenant.cgvMarkdown / tenant.reglementInterieurMarkdown (édités
 * dans Paramètres). Pattern : markdown → HTML via marked → PDF via WeasyPrint.
 * Idempotent via hash sha256 (un seul PDF par version de markdown).
 */

import { createHash } from 'node:crypto';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { renderHtmlToPdfWeasy } from '@/lib/pdf-render';
import { renderLegalDocHtml } from '@/lib/legal-docs-template';
import { loadOfConfig } from '@/lib/of-config';

type LegalDocKind = 'CGV' | 'REGLEMENT_INTERIEUR';

const TITLES: Record<LegalDocKind, string> = {
  CGV: 'Conditions Générales de Vente',
  REGLEMENT_INTERIEUR: 'Règlement intérieur',
};

const PREFIXES: Record<LegalDocKind, string> = {
  CGV: 'cgv',
  REGLEMENT_INTERIEUR: 'reglement-interieur',
};

/**
 * Génère (ou récupère via cache sha256) le PDF d'un doc légal tenant.
 */
export async function generateLegalDocForTenant(
  kind: LegalDocKind,
): Promise<{ ok: boolean; documentId?: string; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { cgvMarkdown: true, reglementInterieurMarkdown: true },
  });
  if (!tenant) return { ok: false, error: 'Tenant introuvable' };

  const markdown =
    kind === 'CGV' ? tenant.cgvMarkdown : tenant.reglementInterieurMarkdown;
  if (!markdown || markdown.trim().length === 0) {
    return {
      ok: false,
      error: `Le ${kind === 'CGV' ? 'CGV' : 'règlement intérieur'} n'est pas encore rédigé. Allez dans Paramètres > Documents légaux pour le compléter.`,
    };
  }

  const of = await loadOfConfig(user.tenantId);

  let pdfBuffer: Buffer;
  try {
    const html = renderLegalDocHtml(
      { title: TITLES[kind], markdown },
      of,
      user.tenantId,
    );
    pdfBuffer = await renderHtmlToPdfWeasy(html);
  } catch (e: any) {
    return { ok: false, error: `Erreur rendu PDF ${kind} : ${e?.message ?? e}` };
  }

  const hash = createHash('sha256').update(pdfBuffer).digest('hex');

  // Idempotence : si un doc identique existe déjà → reuse
  const existing = await prisma.document.findFirst({
    where: {
      tenantId: user.tenantId,
      type: kind,
      hashSha256: hash,
      entityType: 'tenant',
    },
    select: { id: true, pdfUrl: true },
  });
  if (existing) {
    return { ok: true, documentId: existing.id };
  }

  const objectKey = `legal/${user.tenantId}/${PREFIXES[kind]}-${hash.slice(0, 8)}.pdf`;
  try {
    await uploadFile(DOCS_BUCKET, objectKey, pdfBuffer, 'application/pdf');
  } catch (e: any) {
    return { ok: false, error: `Erreur upload MinIO : ${e?.message ?? e}` };
  }

  const doc = await prisma.document.create({
    data: {
      tenantId: user.tenantId,
      type: kind,
      entityType: 'tenant',
      entityId: user.tenantId,
      pdfUrl: objectKey,
      hashSha256: hash,
    },
  });

  return { ok: true, documentId: doc.id };
}

export async function generateCgvForTenant() {
  return generateLegalDocForTenant('CGV');
}

export async function generateReglementInterieurForTenant() {
  return generateLegalDocForTenant('REGLEMENT_INTERIEUR');
}
