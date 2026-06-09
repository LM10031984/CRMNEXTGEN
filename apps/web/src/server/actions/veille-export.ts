'use server';

/**
 * Phase 13 Plan 04 (VEILLE-03) — Export PDF audit Qualiopi par thème.
 *
 * 1 PDF par indicateur (INDIC_23/24/25/26) regroupant toutes les sources
 * `status='ACTIVE'` du tenant pour ce thème. Le PDF est :
 *  1. Rendu via WeasyPrint (CSS Paged Media — footer paged répété par page,
 *     cf. feedback_footer_pdf_qualiof.md / pattern legal-docs-generator).
 *  2. Uploadé en MinIO (D-02 — pas de génération volatile, traçabilité).
 *  3. Persisté dans `Document` (type='VEILLE_AUDIT', entityType='RegulatoryWatch',
 *     entityId={theme}, hashSha256, pdfUrl=clé MinIO).
 *  4. Tracé dans `AuditLog` via `logRegulatoryWatchEvent` avec action
 *     'regulatoryWatch.exported' (7ème verbe sur 8 — reste auto_inserted Plan 05).
 *
 * RBAC : `requireRole(['ADMIN','MANAGER'])` strict (D-03 — LECTEUR ne peut
 * pas déclencher d'export).
 *
 * Multi-tenant : `findMany` scopé `tenantId: user.tenantId`. Le tenantId est
 * propagé dans `Document.create` et `AuditLog` (defense-in-depth).
 *
 * Pattern clone-target : `legal-docs-generator.ts` (BUG-15 — même flow
 * requireRole/render/uploadFile/Document.create + idempotence sha256).
 */

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { renderHtmlToPdfWeasy } from '@/lib/pdf-render';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { loadOfConfig } from '@/lib/of-config';
import {
  renderVeilleAuditHtml,
  getVeilleThemeLabel,
  snapshotFromOfConfig,
} from '@/lib/veille-audit-template';
import { logRegulatoryWatchEvent } from '@/lib/regulatoryWatch-audit';

const ROUTE = '/app/veille';

type VeilleTheme = 'INDIC_23' | 'INDIC_24' | 'INDIC_25' | 'INDIC_26';

export type GenerateVeilleAuditResult =
  | { ok: true; documentId: string; pdfUrl: string; count: number }
  | { ok: false; error: string };

/**
 * Génère le PDF audit veille pour un thème donné, l'upload en MinIO et crée
 * une ligne `Document`. Trace `regulatoryWatch.exported` dans AuditLog.
 *
 * Idempotence : pas de cache sha256 ici (vs. legal-docs). Raison : le contenu
 * change avec chaque édition d'exploitation, donc chaque export est un
 * snapshot daté unique. L'auditeur Qualiopi a besoin de toute la timeline.
 */
export async function generateVeilleAuditForTheme(
  theme: VeilleTheme,
): Promise<GenerateVeilleAuditResult> {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER']);

    // 1. Fetch données (tenant-scoped, status='ACTIVE' uniquement — pas les
    //    DRAFT inbox ni les ARCHIVED).
    const [watches, of] = await Promise.all([
      prisma.regulatoryWatch.findMany({
        where: { tenantId: user.tenantId, theme, status: 'ACTIVE' },
        orderBy: [{ dateLastReviewed: 'desc' }, { dateAdded: 'desc' }],
      }),
      loadOfConfig(user.tenantId),
    ]);

    // 2. Rendu HTML + PDF.
    const html = renderVeilleAuditHtml(
      {
        theme,
        themeLabel: getVeilleThemeLabel(theme),
        watches: watches.map((w) => ({
          title: w.title,
          url: w.url,
          source: w.source,
          responsable: w.responsable,
          frequency: w.frequency,
          exploitation: w.exploitation,
          dateLastReviewed: w.dateLastReviewed,
          dateAdded: w.dateAdded,
        })),
        generatedAt: new Date(),
        tenantName: of.name,
      },
      snapshotFromOfConfig(of),
    );

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderHtmlToPdfWeasy(html);
    } catch (e: any) {
      return {
        ok: false,
        error: `Erreur rendu PDF veille : ${e?.message ?? e}`,
      };
    }

    if (!pdfBuffer || pdfBuffer.length < 1000) {
      return {
        ok: false,
        error: 'PDF veille vide (buffer < 1KB) — vérifier WeasyPrint',
      };
    }

    const sha256 = createHash('sha256').update(pdfBuffer).digest('hex');

    // 3. Upload MinIO AVANT INSERT Document (si l'upload plante, on n'a pas
    //    de ligne orpheline en BDD).
    const timestamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const objectKey = `veille-audit/${user.tenantId}/${theme}-${timestamp}-${sha256.slice(0, 8)}.pdf`;

    try {
      await uploadFile(DOCS_BUCKET, objectKey, pdfBuffer, 'application/pdf');
    } catch (e: any) {
      return {
        ok: false,
        error: `Erreur upload MinIO : ${e?.message ?? e}`,
      };
    }

    // 4. INSERT Document (D-02 — pas de génération volatile, ligne tracée).
    const doc = await prisma.document.create({
      data: {
        tenantId: user.tenantId,
        type: 'VEILLE_AUDIT',
        entityType: 'RegulatoryWatch',
        entityId: theme,
        pdfUrl: objectKey,
        hashSha256: sha256,
      },
    });

    // 5. AuditLog `regulatoryWatch.exported` (7ème verbe — convention D-Phase 13).
    //    targetWatchId='BULK' car l'export couvre N watches, pas une seule ligne.
    await logRegulatoryWatchEvent({
      tenantId: user.tenantId,
      actorUserId: user.id,
      targetWatchId: 'BULK',
      action: 'regulatoryWatch.exported',
      diff: {
        theme,
        count: watches.length,
        documentId: doc.id,
        sha256,
      },
    });

    revalidatePath(ROUTE);
    return {
      ok: true,
      documentId: doc.id,
      pdfUrl: objectKey,
      count: watches.length,
    };
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return { ok: false, error: 'Non authentifié' };
    }
    if (e instanceof ForbiddenError) {
      return { ok: false, error: 'Accès refusé — ADMIN ou MANAGER requis' };
    }
    console.error('[generateVeilleAuditForTheme]', e);
    return { ok: false, error: (e as Error)?.message ?? 'Erreur inconnue' };
  }
}
