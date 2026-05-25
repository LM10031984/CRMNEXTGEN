/**
 * Core sans auth de la régénération de grille d'observation — appelable
 * depuis le worker BullMQ ou un script CLI (script bulk-regen-grilles).
 *
 * Le server action `regenerateGrilleForParticipant` est un wrapper qui
 * ajoute simplement validateRequest + revalidatePath.
 */

import { createHash } from 'node:crypto';
import { prisma } from '@qualiof/db';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { renderHtmlToPdfWeasy } from '@/lib/pdf-render';
import { buildClosureContextForParticipant } from './build-context';
import { generateGrilleContent } from './ollama-generators';
import { renderGrilleObservationHtml } from './grille-observation-template';
import { stubGrilleContent } from './stub-content';

export interface RegenGrilleResult {
  ok: boolean;
  assetId?: string;
  source?: 'ollama' | 'stub';
  pdfUrl?: string;
  error?: string;
}

export async function regenerateGrilleCore(
  participantId: string,
  tenantId: string,
): Promise<RegenGrilleResult> {
  const ctx = await buildClosureContextForParticipant(participantId, tenantId);
  if (!ctx) return { ok: false, error: 'Inscription introuvable' };

  let source: 'ollama' | 'stub' = 'stub';
  let content = stubGrilleContent(ctx);
  try {
    const ai = await generateGrilleContent(
      {
        titre: ctx.sessionTitle,
        nombreHeures: ctx.durationHours,
        programmeMd: ctx.formationMeta?.programmeMd ?? '',
      },
      {
        prenom: ctx.apprenantPrenom,
        nom: ctx.apprenantNom,
        entreprise: ctx.stagiaireMeta?.entreprise ?? null,
        fonction: ctx.stagiaireMeta?.fonction ?? null,
        anciennete: ctx.stagiaireMeta?.anciennete ?? null,
        diplomes: ctx.stagiaireMeta?.diplomes ?? null,
        professionalStatus: ctx.stagiaireMeta?.professionalStatus ?? null,
      },
      'PedagogicalAsset',
      null,
      tenantId,
    );
    if (ai) {
      content = ai;
      source = 'ollama';
    }
  } catch (e: any) {
    console.warn('[regenerateGrilleCore] Ollama failed, fallback stub:', e?.message ?? e);
  }

  const html = renderGrilleObservationHtml(ctx, content);
  const pdfBuffer = await renderHtmlToPdfWeasy(html);

  const hash = createHash('sha256').update(pdfBuffer).digest('hex');
  const safeSlug = `${ctx.apprenantNom}-${ctx.apprenantPrenom}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .toLowerCase();
  const key = `closure/${tenantId}/${ctx.sessionCode}/regen-${Date.now()}/${safeSlug}-grille-${hash.slice(0, 8)}.pdf`;
  await uploadFile(DOCS_BUCKET, key, pdfBuffer, 'application/pdf');

  const existing = await prisma.pedagogicalAsset.findFirst({
    where: { participantId, kind: 'GRILLE_OBS' },
  });

  const rawJson = { source, ...content } as Record<string, unknown>;

  const asset = existing
    ? await prisma.pedagogicalAsset.update({
        where: { id: existing.id },
        data: {
          pdfUrl: key,
          hashSha256: hash,
          rawJson: rawJson as object,
        },
      })
    : await prisma.pedagogicalAsset.create({
        data: {
          tenantId,
          sessionId: ctx.sessionId,
          participantId,
          kind: 'GRILLE_OBS',
          pdfUrl: key,
          hashSha256: hash,
          rawJson: rawJson as object,
        },
      });

  return { ok: true, assetId: asset.id, source, pdfUrl: key };
}
