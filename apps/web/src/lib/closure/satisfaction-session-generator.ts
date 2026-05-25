/**
 * Core sans auth de la génération satisfaction session — appelable depuis
 * le worker BullMQ (pas de session Lucia) ou depuis une server action
 * (avec auth en amont).
 */

import { createHash } from 'node:crypto';
import { prisma } from '@qualiof/db';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { renderHtmlToPdfWeasy } from '@/lib/pdf-render';
import {
  aggregateSatisfactions,
  renderSatisfactionSessionHtml,
  type SatisfactionSessionTemplateData,
} from './satisfaction-session-template';
import type {
  SatisfactionChaudContent,
  RatingValue,
} from './satisfaction-chaud-template';

const RATING_SCORE: Record<RatingValue, number> = {
  'Très bien': 100,
  'Bien': 85,
  'Moyen': 50,
  'Mauvais': 0,
};

function individualScore(c: SatisfactionChaudContent): number {
  const ratings: RatingValue[] = [
    c.organisation.communication,
    c.organisation.delai,
    c.organisation.duree,
    c.organisation.engagements,
    c.moyens.cadre,
    c.moyens.locaux,
    c.moyens.supports,
    c.moyens.materiel,
    c.pedagogie.difficulte,
    c.pedagogie.articulation,
    c.pedagogie.theorique,
    c.pedagogie.pratique,
    c.pedagogie.rythme,
    c.pedagogie.approche,
    c.pedagogie.ecoute,
    c.pedagogie.animation,
    c.groupe.ambiance,
    c.groupe.nombre,
    c.groupe.heterogeneite,
    c.groupe.attention,
  ];
  return Math.round(
    ratings.reduce((sum, r) => sum + RATING_SCORE[r], 0) / ratings.length,
  );
}

export interface SatisfactionSessionResult {
  ok: boolean;
  documentId?: string;
  nbStagiaires?: number;
  globalScore?: number;
  error?: string;
}

export async function generateSatisfactionSessionCore(
  sessionId: string,
  tenantId: string,
): Promise<SatisfactionSessionResult> {
  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId },
    include: {
      product: true,
      trainers: {
        include: { person: true },
        orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
      },
    },
  });
  if (!session) return { ok: false, error: 'Session introuvable' };

  const assets = await prisma.pedagogicalAsset.findMany({
    where: { tenantId, sessionId, kind: 'SATISFACTION_CHAUD' },
  });
  if (assets.length === 0) {
    return {
      ok: false,
      error: 'Aucune satisfaction individuelle — relance le pack de fin de formation.',
    };
  }

  const contents: SatisfactionChaudContent[] = [];
  for (const a of assets) {
    const raw = a.rawJson as Record<string, unknown> | null;
    if (!raw) continue;
    const { source: _src, ...content } = raw;
    contents.push(content as unknown as SatisfactionChaudContent);
  }
  if (contents.length === 0) {
    return { ok: false, error: 'Satisfactions individuelles vides ou corrompues' };
  }

  const agg = aggregateSatisfactions(contents);
  const stagiairesAnonyme = contents.map((c, idx) => ({
    label: `Stagiaire ${idx + 1}`,
    globalScore: individualScore(c),
    recommandation: c.recommandation,
  }));

  const primaryTrainer = session.trainers.find((t) => t.isPrimary) ?? session.trainers[0];
  const formateurPrincipal = primaryTrainer
    ? `${primaryTrainer.person.firstName} ${primaryTrainer.person.lastName}`.trim()
    : 'Formateur à renseigner';

  const data: SatisfactionSessionTemplateData = {
    formationTitre: session.product.title,
    sessionCode: session.code,
    sessionStartDate: session.startDate,
    sessionEndDate: session.endDate,
    formateurPrincipal,
    agg,
    stagiairesAnonyme,
  };

  const html = renderSatisfactionSessionHtml(data);
  const pdfBuffer = await renderHtmlToPdfWeasy(html);

  const hash = createHash('sha256').update(pdfBuffer).digest('hex');
  const key = `satisfaction-session/${session.code}/${hash.slice(0, 8)}.pdf`;
  await uploadFile(DOCS_BUCKET, key, pdfBuffer, 'application/pdf');

  const existing = await prisma.document.findFirst({
    where: { tenantId, sessionId, type: 'SATISFACTION_SESSION' },
  });

  const doc = existing
    ? await prisma.document.update({
        where: { id: existing.id },
        data: { pdfUrl: key, hashSha256: hash },
      })
    : await prisma.document.create({
        data: {
          tenantId,
          type: 'SATISFACTION_SESSION',
          entityType: 'session',
          entityId: sessionId,
          sessionId,
          pdfUrl: key,
          hashSha256: hash,
        },
      });

  return {
    ok: true,
    documentId: doc.id,
    nbStagiaires: agg.totalStagiaires,
    globalScore: agg.globalScore,
  };
}
