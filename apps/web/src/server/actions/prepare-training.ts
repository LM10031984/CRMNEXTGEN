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
 *  - Déroulé pédagogique (indic 10 — produit-level, IA Ollama, idempotent
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
      pricePerLearner: true,
      product: { select: { id: true, title: true, priceHT: true } },
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

  // Garde-fou conformité Qualiopi : tarif obligatoire (jamais 0€ dans un
  // programme/convention sinon NON CONFORME audit). Cf feedback Laurent
  // 2026-05-25 — "ça ne doit jamais arriver".
  const productPriceHT = Number(session.product?.priceHT ?? 0);
  const sessionPrice = Number(session.pricePerLearner ?? 0);
  if (productPriceHT === 0 && sessionPrice === 0) {
    return {
      ok: false,
      total: 0,
      programmesGenerated: 0,
      conventionsGenerated: 0,
      convocationsGenerated: 0,
      derouleGenerated: false,
      errors: [],
      error: `Tarif manquant. Le produit "${session.product?.title ?? '(sans titre)'}" a un prix HT à 0 €. Renseigne-le sur /app/produits/${session.productId} avant de préparer la formation. Un programme Qualiopi avec tarif 0 € est non conforme.`,
    };
  }
  // Cas import SmartOF : tarif côté session uniquement, produit resté à 0.
  // On propage session.pricePerLearner → product.priceHT pour que le générateur
  // de programme l'utilise (le programme lit product.priceHT). Évite à Laurent
  // d'avoir à resaisir sur la fiche produit.
  if (productPriceHT === 0 && sessionPrice > 0) {
    await prisma.trainingProduct.update({
      where: { id: session.productId },
      data: { priceHT: sessionPrice },
    });
    console.info(
      `[prepare-training] product ${session.productId} priceHT 0 → ${sessionPrice} (propagé depuis session ${sessionId})`,
    );
    // Supprime aussi le doc Programme obsolète (forcé à 0€) pour forcer regen
    // avec le bon prix. Document est polymorphique : entityType + entityId.
    await prisma.document.deleteMany({
      where: {
        tenantId: user.tenantId,
        entityType: 'TrainingProduct',
        entityId: session.productId,
        type: 'PROGRAMME',
      },
    });
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

  // Déroulé pédagogique = asset PRODUIT (1 seul appel, IA Ollama, idempotent
  // via hash sha256). BUG-6 — couvre indic 10 Qualiopi (preuve adaptation).
  const der = await generateDerouleForProduct(session.productId);
  if (der.ok) derouleGenerated = true;
  else errors.push({ participantName: '(produit)', doc: 'DEROULE', message: der.error ?? 'Erreur inconnue' });

  // Check-list formation (C4.i17) = 1 par session, fire & forget si déjà existe.
  generateChecklistForSession(sessionId).catch((e) => {
    console.warn('[prepare-training] check-list non générée :', e?.message ?? e);
  });
  // NB : Grille d'observation formateur (C3.i11) = doc POST-formation, généré
  // uniquement par closure-pack quand les participants sont CONFIRMED/ATTENDED.

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
