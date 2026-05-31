'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { generateProgrammeForProduct } from './programme-generator';
import { generateConventionForParticipant } from './convention-generator';
import { generateChecklistForSession } from './generate-checklist-formation';
import { generateDerouleForProduct } from './deroule-product-generator';
import { generateConvocationForParticipant } from './convocation-generator';

export interface PrepareTrainingResult {
  ok: boolean;
  total: number;
  programmesGenerated: number;
  conventionsGenerated: number;
  convocationsGenerated: number;
  derouleGenerated: boolean;
  errors: { participantName: string; doc: 'PROGRAMME' | 'CONVENTION' | 'DEROULE' | 'CONVOCATION'; message: string }[];
  error?: string;
}

/**
 * "Préparer la formation" : génère les docs PRÉ-formation pour la session.
 *
 * Selon process Qualiopi Start Academy (cf process_startacademy.docx) :
 *  - Programme de formation (indic 1 + 6 — produit-level, idempotent)
 *  - Convention de formation (indic 6, 8 — par participant, idempotent)
 *  - Déroulé pédagogique (indic 10 — produit-level, IA Mistral, idempotent
 *    via hash sha256)
 *  - Check-list formation (indic 17 — session-level, fire & forget)
 *
 * Manquent encore (backlog) :
 *  - Convocation stagiaire (indic 9 — par participant)
 *  - CGV (statique tenant)
 *  - Règlement intérieur (statique tenant, indic 9)
 *
 * Parallélise par participant pour limiter la latence.
 */
export async function prepareTrainingForSession(
  sessionId: string,
): Promise<PrepareTrainingResult> {
  const { user } = await validateRequest();
  if (!user) {
    return {
      ok: false,
      total: 0,
      programmesGenerated: 0,
      conventionsGenerated: 0,
      convocationsGenerated: 0,
      derouleGenerated: false,
      errors: [],
      error: 'Non authentifié',
    };
  }

  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId: user.tenantId },
    select: {
      id: true,
      productId: true,
      participants: {
        select: {
          id: true,
          person: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!session) {
    return {
      ok: false,
      total: 0,
      programmesGenerated: 0,
      conventionsGenerated: 0,
      convocationsGenerated: 0,
      derouleGenerated: false,
      errors: [],
      error: 'Session introuvable',
    };
  }

  const errors: PrepareTrainingResult['errors'] = [];
  let programmesGenerated = 0;
  let conventionsGenerated = 0;
  let convocationsGenerated = 0;
  let derouleGenerated = false;

  // Programme = asset PRODUIT (1 seul appel pour toute la session,
  // find-or-create idempotent — réutilisé à chaque clic).
  const prog = await generateProgrammeForProduct(session.productId);
  if (prog.ok) programmesGenerated = 1;
  else errors.push({ participantName: '(produit)', doc: 'PROGRAMME', message: prog.error ?? 'Erreur inconnue' });

  // Déroulé pédagogique = asset PRODUIT (1 seul appel, IA Mistral, idempotent
  // via hash sha256). BUG-6 — couvre indic 10 Qualiopi (preuve adaptation).
  const der = await generateDerouleForProduct(session.productId);
  if (der.ok) derouleGenerated = true;
  else errors.push({ participantName: '(produit)', doc: 'DEROULE', message: der.error ?? 'Erreur inconnue' });

  // Check-list formation (C4.i17) = 1 par session, fire & forget si déjà existe.
  generateChecklistForSession(sessionId).catch((e) => {
    console.warn('[prepare-training] check-list non générée :', e?.message ?? e);
  });

  // Convention + Convocation = par participant (idempotentes sha256)
  await Promise.all(
    session.participants.map(async (p) => {
      const name = `${p.person.firstName} ${p.person.lastName}`;
      const [conv, convoc] = await Promise.all([
        generateConventionForParticipant(p.id),
        generateConvocationForParticipant(p.id),
      ]);
      if (conv.ok) conventionsGenerated++;
      else errors.push({ participantName: name, doc: 'CONVENTION', message: conv.error ?? 'Erreur inconnue' });
      if (convoc.ok) convocationsGenerated++;
      else errors.push({ participantName: name, doc: 'CONVOCATION', message: convoc.error ?? 'Erreur inconnue' });
    }),
  );

  revalidatePath(`/app/sessions/${sessionId}`);

  return {
    ok: true,
    total: session.participants.length,
    programmesGenerated,
    conventionsGenerated,
    convocationsGenerated,
    derouleGenerated,
    errors,
  };
}
