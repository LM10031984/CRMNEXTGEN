/**
 * Cœur SANS auth de la CHECK-LIST FORMATION (C4.i17 Qualiopi).
 *
 * Extrait de `src/server/actions/generate-checklist-formation.ts` (quick
 * 260618-gux, correctif démarrage pipeline) : ce fichier N'IMPORTE PAS
 * `@/lib/auth`, ni directement ni transitivement, pour qu'un script tsx puisse
 * l'importer sans tirer `validateRequest` → `react cache`.
 *
 * 1 doc par session — coches pré-remplies selon modalité + lieu + hébergement
 * formateur + accessibilité PSH (champs saisis sur la session).
 *
 * Le wrapper server action `generateChecklistForSession` lit `validateRequest()`,
 * délègue ici, puis fait `revalidatePath`.
 */

import { createHash } from 'node:crypto';
import { prisma } from '@qualiof/db';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { renderHtmlToPdfWeasy } from '@/lib/pdf-render';
import {
  renderChecklistFormationHtml,
  type ChecklistFormationData,
  type ChecklistZoneApportee,
  type ChecklistConditionsLieu,
} from '@/lib/closure/checklist-formation-template';

/**
 * PRNG déterministe seedé sur `sessionId` (mulberry32 / FNV-1a) : même session →
 * même résultat à chaque régénération ; 2 sessions différentes → résultats
 * différents. Pas de stockage nécessaire (la session est sa source de vérité).
 */
function makeSeededRandom(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let state = h >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Coches des zones 1 & 2 selon que la session est PASSÉE ou FUTURE (Laurent 17/06) :
 *  - session passée (endDate < aujourd'hui) → REMPLIE (l'OF a apporté le matériel,
 *    le lieu a fourni les conditions)
 *  - session future → VIERGE (rien coché, à remplir le jour J)
 *
 * Variation réaliste (Laurent 18/06) : sur une session passée, 3 items « lieu »
 * (paperboard, espace pause, espace repas) peuvent être décochés aléatoirement
 * (0, 1, 2 ou les 3) — déterministe par session — pour éviter des check-lists
 * toutes identiques (anti-pattern audit). Le reste reste coché.
 */
function buildZones(
  isPast: boolean,
  sessionId: string,
): {
  apportee: ChecklistZoneApportee;
  conditionsLieu: ChecklistConditionsLieu;
} {
  const rng = makeSeededRandom(sessionId);
  const P_MANQUE = 0.3; // ~30% de chance que l'item lieu soit absent ce jour-là
  const lieuPresent = (): boolean => isPast && rng() >= P_MANQUE;
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
      paperboard: lieuPresent(),
      espacePause: lieuPresent(),
      espaceRepas: lieuPresent(),
      connexionInternet: isPast,
      prisesElectriques: isPast,
    },
  };
}

/**
 * Cœur SANS auth de la check-list formation (réutilisable par scripts
 * pipeline). Prend `tenantId` en paramètre. NE FAIT PAS de revalidatePath
 * (laissé au wrapper). Conserve le find-or-create + PRNG seedé intacts.
 */
export async function generateChecklistCore(
  tenantId: string,
  sessionId: string,
  opts: { force?: boolean } = {},
): Promise<{ ok: boolean; documentId?: string; pdfUrl?: string; error?: string }> {
  if (!opts.force) {
    const existing = await prisma.document.findFirst({
      where: {
        tenantId,
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
    where: { id: sessionId, tenantId },
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
  const { apportee, conditionsLieu } = buildZones(isPast, sessionId);

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
      tenantId,
      type: 'CHECKLIST_FORMATION',
      entityType: 'session',
      entityId: sessionId,
      sessionId,
      pdfUrl: objectKey,
      hashSha256: hash,
    },
  });

  return { ok: true, documentId: doc.id, pdfUrl: objectKey };
}
