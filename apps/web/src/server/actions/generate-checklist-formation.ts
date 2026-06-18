'use server';

/**
 * Génère la CHECK-LIST FORMATION (C4.i17 Qualiopi) pour une session.
 * 1 doc par session — coches pré-remplies selon modalité + lieu + hébergement
 * formateur + accessibilité PSH (champs saisis sur la session).
 *
 * Référent handicap : Laurent (config .env OF_HANDICAP_REFERENT).
 * Stockage : Document type=CHECKLIST_FORMATION, sessionId, entityType='session'.
 */

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { renderHtmlToPdfWeasy } from '@/lib/pdf-render';
import {
  renderChecklistFormationHtml,
  type ChecklistFormationData,
  type ChecklistZoneApportee,
  type ChecklistConditionsLieu,
} from '@/lib/closure/checklist-formation-template';

/**
 * Coches des zones 1 & 2 selon que la session est PASSÉE ou FUTURE (Laurent 17/06) :
 *  - session passée (endDate < aujourd'hui) → REMPLIE (tout coché : l'OF a apporté
 *    le matériel, le lieu a fourni les conditions)
 *  - session future → VIERGE (rien coché, à remplir le jour J)
 */
function buildZones(isPast: boolean): {
  apportee: ChecklistZoneApportee;
  conditionsLieu: ChecklistConditionsLieu;
} {
  return {
    apportee: {
      deroulePedagogique: isPast,
      emargement: isPast,
      positionnement: isPast,
      satisfaction: isPast,
      livretSupport: isPast,
      cleUsb: isPast,
      pc: isPast,
      videoprojecteur: isPast,
    },
    conditionsLieu: {
      salleAdaptee: isPast,
      paperboard: isPast,
      espacePause: isPast,
      espaceRepas: isPast,
      connexionInternet: isPast,
      prisesElectriques: isPast,
    },
  };
}

export async function generateChecklistForSession(
  sessionId: string,
  opts: { force?: boolean } = {},
): Promise<{ ok: boolean; documentId?: string; pdfUrl?: string; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  if (!opts.force) {
    const existing = await prisma.document.findFirst({
      where: {
        tenantId: user.tenantId,
        type: 'CHECKLIST_FORMATION',
        entityType: 'session',
        entityId: sessionId,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return { ok: true, documentId: existing.id, pdfUrl: existing.pdfUrl };
    }
  }

  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId: user.tenantId },
    include: {
      product: { select: { title: true } },
      location: true,
      trainers: { include: { person: true } },
    },
  });
  if (!session) return { ok: false, error: 'Session introuvable' };

  // Lieu de formation = adresse postale complète (rue, CP ville) si dispo.
  const locationAddr = session.location?.address as
    | { street?: string; city?: string; postalCode?: string }
    | null
    | undefined;
  const cityLine = [locationAddr?.postalCode, locationAddr?.city].filter(Boolean).join(' ');
  const lieuFormation = session.location
    ? locationAddr?.street
      ? [locationAddr.street, cityLine].filter(Boolean).join(', ')
      : `${session.location.name}${locationAddr?.city ? ` — ${locationAddr.city}` : ''}`
    : 'À renseigner';

  // Hors département 06 → réservation hébergement formateur obligatoire (Laurent 17/06).
  const horsDept06 = !(locationAddr?.postalCode ?? '').startsWith('06');
  const trainerLodgingReserved = horsDept06 || session.needsTrainerLodging;

  // Passé vs futur : remplie (cochée) si terminée, vierge sinon.
  const isPast = session.endDate.getTime() < Date.now();
  const { apportee, conditionsLieu } = buildZones(isPast);

  const data: ChecklistFormationData = {
    formationTitre: session.product.title,
    sessionCode: session.code,
    sessionStartDate: session.startDate,
    sessionEndDate: session.endDate,
    formateurs: session.trainers.map((t) => `${t.person.firstName} ${t.person.lastName}`.trim()),
    lieuFormation,
    isPast,
    horsDept06,
    trainerLodgingReserved,
    trainerLodgingPlace: session.trainerLodgingPlace,
    trainerLodgingDates: session.trainerLodgingDates,
    hasDisabledLearner: session.hasDisabledLearner,
    disabilityAdaptations: session.disabilityAdaptations,
    apportee,
    conditionsLieu,
  };

  let pdfBuffer: Buffer;
  try {
    const html = renderChecklistFormationHtml(data);
    pdfBuffer = await renderHtmlToPdfWeasy(html);
  } catch (e: any) {
    return { ok: false, error: `Erreur rendu PDF check-list : ${e?.message ?? e}` };
  }

  const hash = createHash('sha256').update(pdfBuffer).digest('hex');
  const objectKey = `checklists/${session.code}/${hash.slice(0, 8)}.pdf`;
  try {
    await uploadFile(DOCS_BUCKET, objectKey, pdfBuffer, 'application/pdf');
  } catch (e: any) {
    return { ok: false, error: `Erreur upload MinIO : ${e?.message ?? e}` };
  }

  const doc = await prisma.document.create({
    data: {
      tenantId: user.tenantId,
      type: 'CHECKLIST_FORMATION',
      entityType: 'session',
      entityId: sessionId,
      sessionId,
      pdfUrl: objectKey,
      hashSha256: hash,
    },
  });

  revalidatePath(`/app/sessions/${sessionId}`);
  return { ok: true, documentId: doc.id, pdfUrl: objectKey };
}
