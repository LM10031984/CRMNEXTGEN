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
  type ChecklistAdministratif,
  type ChecklistRepas,
  type ChecklistMateriel,
} from '@/lib/closure/checklist-formation-template';
import { loadOfConfig } from '@/lib/of-config';

function buildDefaults(modality: string): {
  administratif: ChecklistAdministratif;
  repas: ChecklistRepas;
  materiel: ChecklistMateriel;
} {
  const isPresentiel = modality === 'PRESENTIEL' || modality === 'MIXTE';

  // Coches admin : tous obligatoires Qualiopi quel que soit le présentiel/distanciel
  const administratif: ChecklistAdministratif = {
    derouleP: true,
    conventionFormateur: true,
    emargement: true,
    reglementInterieur: true,
    positionnementAutoEval: true,
    certificatRealisation: true,
    lienQcm: true,
    livretStagiaires: true,
    evaluationChaud: true,
    grilleAmelioration: true,
    cleUsbSupport: true,
  };

  // Repas/pause : seulement si présentiel
  const repas: ChecklistRepas = {
    machineCafe: isPresentiel,
    cafe: isPresentiel,
    bouilloire: isPresentiel,
    the: isPresentiel,
    rallongeElectrique: isPresentiel,
    eau: isPresentiel,
    multiprise: isPresentiel,
  };

  // Matériel : PC + connexion toujours, paperboard/projecteur/écran présentiel
  const materiel: ChecklistMateriel = {
    pc: true,
    paperboard: isPresentiel,
    projecteur: isPresentiel,
    ecranAdapte: isPresentiel,
    connexionInternet: true,
  };

  return { administratif, repas, materiel };
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

  // Lieu de formation (nom + ville depuis Location)
  const locationAddr = session.location?.address as
    | { street?: string; city?: string; postalCode?: string }
    | null
    | undefined;
  const lieuFormation = session.location
    ? `${session.location.name}${locationAddr?.city ? ` — ${locationAddr.city}` : ''}`
    : 'À renseigner';
  // Contact lieu : on n'a pas de champ dédié → utilise la 1ère personne formateur ou null
  const lieuContact = null;

  const { administratif, repas, materiel } = buildDefaults(session.modality);

  // Phase 7 — pre-resolve OF config (BDD fallback ENV via D-01 hybrid)
  const of = await loadOfConfig(user.tenantId);

  const data: ChecklistFormationData = {
    formationTitre: session.product.title,
    sessionCode: session.code,
    sessionStartDate: session.startDate,
    sessionEndDate: session.endDate,
    formateurs: session.trainers.map((t) => `${t.person.firstName} ${t.person.lastName}`.trim()),
    lieuFormation,
    lieuContact,
    needsTrainerLodging: session.needsTrainerLodging,
    trainerLodgingPlace: session.trainerLodgingPlace,
    trainerLodgingDates: session.trainerLodgingDates,
    hasDisabledLearner: session.hasDisabledLearner,
    disabilityAdaptations: session.disabilityAdaptations,
    handicapReferent: of.handicapReferent,
    administratif,
    repas,
    materiel,
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
