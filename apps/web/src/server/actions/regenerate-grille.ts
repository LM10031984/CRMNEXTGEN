'use server';

/**
 * Régénère la grille d'observation d'un participant avec le prompt Ollama
 * mis à jour (niveaux + observations pré-remplis). Remplace l'ancien
 * PedagogicalAsset GRILLE_OBS s'il existe, sinon le crée.
 *
 * Utilisé pour rattraper les grilles historiques générées avec l'ancien
 * prompt qui laissait tout à null.
 */

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { renderHtmlToPdfWeasy } from '@/lib/pdf-render';
import { buildClosureContextForParticipant } from '@/lib/closure/build-context';
import { generateGrilleContent } from '@/lib/closure/ollama-generators';
import { renderGrilleObservationHtml } from '@/lib/closure/grille-observation-template';
import { stubGrilleContent } from '@/lib/closure/stub-content';

export async function regenerateGrilleForParticipant(
  participantId: string,
): Promise<{
  ok: boolean;
  assetId?: string;
  source?: 'ollama' | 'stub';
  pdfUrl?: string;
  error?: string;
}> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const ctx = await buildClosureContextForParticipant(participantId, user.tenantId);
  if (!ctx) return { ok: false, error: 'Inscription introuvable' };

  // 1. Tente Ollama
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
        civilite: ctx.apprenantCivility ?? null,
      },
      'PedagogicalAsset',
      null,
      user.tenantId,
    );
    if (ai) {
      content = ai;
      source = 'ollama';
    }
  } catch (e: any) {
    console.warn('[regenerateGrille] Ollama failed, fallback stub:', e?.message ?? e);
  }

  // 2. Render PDF
  const html = renderGrilleObservationHtml(ctx, content);
  const pdfBuffer = await renderHtmlToPdfWeasy(html);

  // 3. Upload MinIO
  const hash = createHash('sha256').update(pdfBuffer).digest('hex');
  const safeSlug = `${ctx.apprenantNom}-${ctx.apprenantPrenom}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .toLowerCase();
  const key = `closure/${user.tenantId}/${ctx.sessionCode}/regen-${Date.now()}/${safeSlug}-grille-${hash.slice(0, 8)}.pdf`;
  await uploadFile(DOCS_BUCKET, key, pdfBuffer, 'application/pdf');

  // 4. Upsert PedagogicalAsset
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
          tenantId: user.tenantId,
          sessionId: ctx.sessionId,
          participantId,
          kind: 'GRILLE_OBS',
          pdfUrl: key,
          hashSha256: hash,
          rawJson: rawJson as object,
        },
      });

  revalidatePath('/app/sessions');
  revalidatePath(`/app/apprenants/${participantId}`);
  return { ok: true, assetId: asset.id, source, pdfUrl: key };
}
