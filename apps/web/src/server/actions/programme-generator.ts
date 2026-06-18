'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { uploadFile, downloadFile, DOCS_BUCKET } from '@/lib/storage';
import { renderHtmlToPdfWeasy } from '@/lib/pdf-render';
import { renderProgrammeHtml, type ProgrammeData } from '@/lib/programme-template';
import { loadOfConfig } from '@/lib/of-config';
import { generateProgrammeForProductCore } from '@/lib/closure/programme-core';

// Phase 7 — Plan 07-01 : suppression de l'objet `const OF_DEFAULTS = { ... }`
// local qui bypassait `getOfConfig()`. Les fonctions ci-dessous appellent
// désormais `await loadOfConfig(user.tenantId)` pour lire BDD avec fallback ENV.
//
// quick 260618-gux : le cœur SANS auth `generateProgrammeForProductCore` vit
// désormais dans `@/lib/closure/programme-core` (ne tire pas `@/lib/auth`), pour
// que les scripts tsx pipeline puissent l'importer sans `react cache`. Ce fichier
// reste un wrapper (validateRequest → core → revalidatePath).

/**
 * Programme = asset PRODUIT (1 fois pour tous les apprenants — cf décision
 * Laurent 05/05/2026). Ce wrapper résout le productId depuis le participant
 * et délègue à generateProgrammeForProduct (find-or-create idempotent).
 */
export async function generateProgrammeForParticipant(
  participantId: string,
): Promise<{ ok: boolean; documentId?: string; pdfUrl?: string; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const participant = await prisma.sessionParticipant.findFirst({
    where: { id: participantId, session: { tenantId: user.tenantId } },
    select: { session: { select: { productId: true, id: true } }, person: { select: { id: true } } },
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };

  const r = await generateProgrammeForProduct(participant.session.productId);
  revalidatePath(`/app/sessions/${participant.session.id}`);
  revalidatePath(`/app/apprenants/${participant.person.id}`);
  return r;
}

/**
 * Ancienne implémentation par-participant (générait 1 PDF par stagiaire avec
 * son nom dans le footer). Conservée pour référence mais plus appelée nulle
 * part — supprimer si validé en run.
 */
async function _legacy_generateProgrammeForParticipant(
  participantId: string,
): Promise<{ ok: boolean; documentId?: string; pdfUrl?: string; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  // 1. Charge le participant + relations
  const participant = await prisma.sessionParticipant.findFirst({
    where: { id: participantId, session: { tenantId: user.tenantId } },
    include: {
      person: true,
      session: {
        include: {
          product: true,
          location: true,
          trainers: { include: { person: true } },
        },
      },
    },
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };

  const session = participant.session;
  const product = session.product;

  // Phase 7 — pre-resolve OF config (BDD fallback ENV via D-01 hybrid)
  const of = await loadOfConfig(user.tenantId);

  // 2. Construit le payload
  const objectives = Array.isArray(product.objectives) ? (product.objectives as string[]) : [];
  const lieu = session.location
    ? `${session.location.name}${(session.location.address as any)?.city ? ` — ${(session.location.address as any).city}` : ''}`
    : null;

  const data: ProgrammeData = {
    apprenantPrenom: participant.person.firstName,
    apprenantNom: participant.person.lastName,
    apprenantEmail: participant.person.email,
    sessionCode: session.code,
    sessionName: session.name ?? product.title,
    sessionStartDate: session.startDate,
    sessionEndDate: session.endDate,
    sessionLieu: lieu,
    sessionModalite: session.modality,
    sessionFormateurs: session.trainers.map((t) => `${t.person.firstName} ${t.person.lastName}`),
    produitTitre: product.title,
    produitCode: product.code,
    produitDureeHeures: product.durationHours,
    produitPriceHT: Number(product.priceHT),
    produitObjectifs: objectives,
    produitProgrammeMd: product.programMd ?? '',
    produitPrerequisites: product.prerequisites,
    produitTargetAudience: product.targetAudience,
    produitPedagogicalMethods: product.pedagogicalMethods,
    produitEvaluationMethods: product.evaluationMethods,
    produitAccessibility: product.accessibility,
    produitAccessConditions: product.accessConditions,
    produitTrainerProfile: product.trainerProfile,
    produitPedagogicalSupport: product.pedagogicalSupport,
    ofName: of.name,
    ofSiret: of.siret,
    ofAddress: of.addressFull,
    ofRnq: of.rnq,
    ofPhone: of.phone,
    ofEmail: of.email,
    // Phase 7 (Plan 07-03) — permet à `renderProgrammeHtml` de résoudre le
    // logo uploadé via Paramètres dans `public/of-assets/{tenantId}/`.
    tenantId: user.tenantId,
  };

  // 3. Render HTML → PDF
  let pdfBuffer: Buffer;
  try {
    const html = renderProgrammeHtml(data, of);
    pdfBuffer = await renderHtmlToPdfWeasy(html);
  } catch (e: any) {
    return { ok: false, error: `Erreur génération PDF : ${e?.message ?? e}` };
  }

  // 4. Upload MinIO
  const hash = createHash('sha256').update(pdfBuffer).digest('hex');
  const safePersonSlug = `${participant.person.lastName}-${participant.person.firstName}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  const key = `programmes/${session.code}/${safePersonSlug}-${hash.slice(0, 8)}.pdf`;
  try {
    await uploadFile(DOCS_BUCKET, key, pdfBuffer, 'application/pdf');
  } catch (e: any) {
    return { ok: false, error: `Erreur upload MinIO : ${e?.message ?? e}` };
  }

  // 5. Crée le record Document (idempotent : si même hash existe déjà, on retourne)
  const existing = await prisma.document.findFirst({
    where: { tenantId: user.tenantId, hashSha256: hash, type: 'PROGRAMME' },
  });
  if (existing) {
    return { ok: true, documentId: existing.id, pdfUrl: existing.pdfUrl };
  }

  const doc = await prisma.document.create({
    data: {
      tenantId: user.tenantId,
      type: 'PROGRAMME',
      entityType: 'participant',
      entityId: participantId,
      pdfUrl: key, // clé S3 (pour récupérer via lib/storage.downloadFile)
      hashSha256: hash,
      sessionId: session.id,
      participantId,
    },
  });

  revalidatePath(`/app/sessions/${session.id}`);
  revalidatePath(`/app/apprenants/${participant.person.id}`);

  return { ok: true, documentId: doc.id, pdfUrl: key };
}

/**
 * Genere un programme PDF generique au PRODUIT (pas a l'apprenant). Le
 * programme est par definition une description du contenu pedagogique du
 * produit — il ne change pas par session. Utilise sur la fiche produit
 * (/app/produits/[id]) pour avoir le PDF a la demande lors d'un controle
 * Qualiopi sans avoir a passer par une session/inscription.
 *
 * Strategie de cache : si un Document type=PROGRAMME existe deja pour ce
 * produit (entityType="product", entityId=productId) avec un hash identique,
 * on le reutilise au lieu de regenerer.
 */
export async function generateProgrammeForProduct(
  productId: string,
  opts: { force?: boolean } = {},
): Promise<{ ok: boolean; documentId?: string; pdfUrl?: string; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const r = await generateProgrammeForProductCore(user.tenantId, productId, opts);
  revalidatePath(`/app/produits/${productId}`);
  return r;
}

/**
 * Stream le PDF d'un Document existant (utilisé par la route /api/documents/[id]).
 */
export async function getDocumentPdfBuffer(documentId: string): Promise<Buffer | null> {
  const { user } = await validateRequest();
  if (!user) return null;
  const doc = await prisma.document.findFirst({
    where: { id: documentId, tenantId: user.tenantId },
  });
  if (!doc) return null;
  return downloadFile(DOCS_BUCKET, doc.pdfUrl);
}
