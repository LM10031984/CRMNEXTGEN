/**
 * Chargement du contexte calendrier d'une session depuis Prisma (Phase 14 — 14-05).
 *
 * `loadSessionEventCtx(tenantId, sessionId)` résout, de manière fiable et
 * tenant-scopée, toutes les données nécessaires aux builders d'événements
 * (event-builders.ts → SessionEventCtx) : code/nom session, titre produit, dates,
 * lieu + adresse à plat (pour la détection siège Vence), formateur principal réel
 * (isPrimary, fallback 1er trainer), e-mails apprenants dédupliqués, durée figée.
 *
 * Partagé par le backfill (calendar-backfill.ts) et le hook auto (Plan 14-06).
 *
 * WORKER-SAFE : ce module n'importe QUE `@qualiof/db` (autorisé) et les types des
 * builders. INTERDIT d'importer une couche serveur, des gardes RBAC/session ou le
 * runtime React (sinon crash au boot tsx du worker — cf. règle documentée dans
 * google-client.ts). Aucune notion d'utilisateur authentifié ici : le tenantId est
 * un paramètre explicite, jamais lu depuis une session.
 */

import { prisma } from '@qualiof/db';
import type { SessionEventCtx } from './event-builders';

/**
 * Résultat enrichi : le SessionEventCtx + un flag signalant l'absence de
 * formateur (e-mail vide) pour que l'appelant (script backfill) log un warning
 * et skippe proprement la session plutôt que d'inviter une adresse vide.
 */
export interface LoadSessionCtxResult {
  ctx: SessionEventCtx;
  /** true si aucun formateur (ni principal ni de secours) avec e-mail trouvé. */
  missingTrainerEmail: boolean;
}

/** Heures par journée de formation (convention métier figée, pas de smart-calc). */
const HOURS_PER_DAY = 8;

/**
 * Met à plat l'adresse JSON d'un Location en une chaîne lisible utilisée pour la
 * détection du siège Vence (`isSiegeVence`) et l'affichage du lieu. Tolère les
 * variantes de clés (street/postalCode/city) et les valeurs manquantes.
 */
function flattenAddress(address: unknown): string {
  if (!address || typeof address !== 'object') return '';
  const a = address as Record<string, unknown>;
  const street = typeof a.street === 'string' ? a.street : '';
  const postalCode = typeof a.postalCode === 'string' ? a.postalCode : '';
  const city = typeof a.city === 'string' ? a.city : '';
  const tail = [postalCode, city].filter(Boolean).join(' ');
  return [street, tail].filter(Boolean).join(', ');
}

/** Salutation prénoms apprenants pour les textes froid (ex. "Alice, Bob"). */
function joinFirstNames(names: string[]): string {
  const clean = names.filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0]!;
  return `${clean.slice(0, -1).join(', ')} et ${clean[clean.length - 1]}`;
}

/**
 * Charge le contexte calendrier d'une session. Renvoie `null` si la session
 * n'existe pas (ou n'appartient pas au tenant).
 */
export async function loadSessionEventCtx(
  tenantId: string,
  sessionId: string,
): Promise<LoadSessionCtxResult | null> {
  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId },
    select: {
      code: true,
      name: true,
      startDate: true,
      endDate: true,
      product: { select: { title: true, durationHours: true } },
      location: { select: { name: true, legalName: true, address: true } },
      trainers: {
        select: {
          isPrimary: true,
          person: { select: { firstName: true, lastName: true, email: true } },
        },
      },
      participants: {
        select: { person: { select: { firstName: true, email: true } } },
      },
    },
  });

  if (!session) return null;

  // Formateur : principal (isPrimary) sinon le premier trainer disponible.
  const primary = session.trainers.find((t) => t.isPrimary) ?? session.trainers[0];
  const trainerEmail = primary?.person.email ?? '';
  const trainerName = primary
    ? `${primary.person.firstName} ${primary.person.lastName}`.trim()
    : '';
  const missingTrainerEmail = trainerEmail === '';

  // Apprenants : e-mails non nuls, dédupliqués (Set préserve l'ordre d'apparition).
  const learnerEmails = Array.from(
    new Set(
      session.participants
        .map((p) => p.person.email)
        .filter((e): e is string => Boolean(e)),
    ),
  );

  // Prénoms apprenants (dédupliqués) pour la salutation des relances froid.
  const learnerFirstNames = Array.from(
    new Set(
      session.participants
        .map((p) => p.person.firstName)
        .filter((n): n is string => Boolean(n)),
    ),
  );

  const durationHours = session.product?.durationHours ?? 0;
  // 8h = 1 jour (convention métier). ceil pour les durées non multiples de 8.
  const dureeJoursNum = durationHours > 0 ? Math.ceil(durationHours / HOURS_PER_DAY) : 0;

  const locationName = session.location?.legalName
    ? `${session.location.legalName} — ${session.location.name}`
    : (session.location?.name ?? '');
  const locationAddressText = flattenAddress(session.location?.address);

  // programmeDriveId : le PDF programme de session est stocké en MinIO (Document.pdfUrl),
  // pas sur Google Drive — il n'y a donc pas d'id Drive exploitable ici. Laissé
  // undefined ; à brancher quand une source d'id Drive de programme par session
  // existera (les builders gèrent l'absence : 3 pièces jointes statiques seulement).
  const ctx: SessionEventCtx = {
    code: session.code,
    name: session.name ?? session.code,
    productTitle: session.product?.title ?? session.name ?? session.code,
    startDate: session.startDate,
    endDate: session.endDate ?? session.startDate,
    locationName,
    locationAddressText,
    programmeDriveId: undefined,
    trainerEmail,
    trainerName,
    learnerEmails,
    dureeJours: String(dureeJoursNum),
    dureeH: String(durationHours),
    heureDebut: '9h00',
    salutationPrenoms: joinFirstNames(learnerFirstNames),
  };

  return { ctx, missingTrainerEmail };
}
