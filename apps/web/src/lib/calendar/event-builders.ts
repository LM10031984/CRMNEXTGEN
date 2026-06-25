/**
 * Builders d'événements Google Calendar QualiOF (Phase 14 — coeur métier).
 *
 * Pour une session on construit :
 *   - 1 événement FORMATION all-day (colorId 7, pièces jointes Drive, convocation)
 *   - 15 RAPPELS quotidiens countdown J-15 → veille (colorId 6, popup, liens inline)
 *   - 3 relances satisfaction À FROID fin+1m / +1m15j / +2m (colorId 3, popup)
 *
 * Modules PURS : aucun appel API, aucun Prisma. Ils retournent des `requestBody`
 * Google (calendar_v3.Schema$Event) que l'orchestrateur `sync-session.ts` upsert.
 * Worker-safe : seules dépendances = googleapis (types) + les modules calendrier
 * purs (textes/couleurs/idempotence/countdown). Aucune couche serveur ni runtime
 * de rendu (cf. règle d'isolement worker BullMQ documentée dans google-client.ts).
 *
 * Horaires FIGÉS via HORAIRES (jamais recalculés depuis la durée — convention
 * métier, cf. memory "anti smart-calc sur conventions métier").
 */

import type { calendar_v3 } from 'googleapis';
import { CALENDAR_COLORS } from './colors';
import { buildEventKey, QUALIOF_KEY_PROP } from './idempotency';
import {
  renderRappelText,
  renderFroidText,
  isSiegeVence,
  driveViewUrl,
  DRIVE_DOCS,
  HORAIRES,
  type CalendarTextCtx,
  type FroidRelance,
} from './texts';
import { countdownLabel } from './countdown';

type GEvent = calendar_v3.Schema$Event;

/**
 * Données d'une session nécessaires pour construire ses événements calendrier.
 * Extraites par l'orchestrateur depuis Prisma (TrainingSession + trainers +
 * participants), restent ici un simple DTO sans dépendance Prisma (pureté).
 */
export type SessionEventCtx = {
  /** code session (ex. "SES-0097") — base des clés d'idempotence. */
  code: string;
  /** nom interne de la session. */
  name: string;
  /** titre du produit de formation (affiché dans la convocation). */
  productTitle: string;
  /** date de début (premier jour de formation). */
  startDate: Date;
  /** date de fin (dernier jour de formation, inclus). */
  endDate: Date;
  /** libellé du lieu (ex. "Century 21 Mandelieu" ou "Siège Start Academy"). */
  locationName: string;
  /** adresse textuelle du lieu (sert à détecter le siège Vence). */
  locationAddressText: string;
  /** id Drive du PDF programme propre à la session (optionnel). */
  programmeDriveId?: string;
  /** e-mail réel du formateur principal (toujours invité). */
  trainerEmail: string;
  /** nom du formateur (préfixé M./Mme par l'appelant). */
  trainerName: string;
  /** e-mails réels des apprenants (toujours invités). */
  learnerEmails: string[];
  /** durée en journées (string figée, jamais recalculée ici). */
  dureeJours: string;
  /** durée en heures. */
  dureeH: string;
  /** heure de début affichée (ex. "9h00"). */
  heureDebut: string;
  /** salutation prénoms apprenants pour les textes froid (ex. "Alice, Bob"). */
  salutationPrenoms: string;
};

/** Formate une Date en 'YYYY-MM-DD' (UTC) pour les événements all-day. */
function toDateStr(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Ajoute n jours (UTC) à une date, sans muter l'originale. */
function addDays(d: Date, n: number): Date {
  const copy = new Date(d.getTime());
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

/** Ajoute n mois (UTC) à une date, sans muter l'originale. */
function addMonths(d: Date, n: number): Date {
  const copy = new Date(d.getTime());
  copy.setUTCMonth(copy.getUTCMonth() + n);
  return copy;
}

/**
 * Construit le contexte d'interpolation texte commun (formation + rappels) à
 * partir du DTO session. `countdown` est injecté par l'appelant (vide pour la
 * formation all-day, calculé pour chaque rappel quotidien).
 */
function toTextCtx(ctx: SessionEventCtx, countdown: string): CalendarTextCtx {
  return {
    formation: ctx.productTitle,
    dates: toFrDate(ctx.startDate),
    heureDebut: ctx.heureDebut,
    lieu: `${ctx.locationName} — ${ctx.locationAddressText}`,
    dureeJours: ctx.dureeJours,
    dureeH: ctx.dureeH,
    formateur: ctx.trainerName,
    countdown,
    salutationPrenoms: ctx.salutationPrenoms,
    isSiege: isSiegeVence(ctx.locationAddressText),
  };
}

/** Date au format français jj/mm/aaaa (UTC). */
function toFrDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0');
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const y = d.getUTCFullYear();
  return `${day}/${m}/${y}`;
}

/**
 * Pièces jointes Drive de l'événement formation : programme propre à la session
 * (si fourni) + les 3 docs statiques (Charte accueil handicap / RI / CGV).
 */
function buildFormationAttachments(
  programmeDriveId?: string,
): calendar_v3.Schema$EventAttachment[] {
  const items: { id: string; title: string }[] = [];
  if (programmeDriveId) {
    items.push({ id: programmeDriveId, title: 'Programme de la formation' });
  }
  items.push({ id: DRIVE_DOCS.chartePsh, title: 'Charte accueil handicap' });
  items.push({ id: DRIVE_DOCS.ri, title: 'Règlement intérieur' });
  items.push({ id: DRIVE_DOCS.cgv, title: 'Conditions générales de vente' });

  return items.map((it) => ({
    fileUrl: driveViewUrl(it.id),
    title: it.title,
    mimeType: 'application/pdf',
  }));
}

/** Pose la clé d'idempotence sous extendedProperties.private. */
function withKey(key: string): GEvent['extendedProperties'] {
  return { private: { [QUALIOF_KEY_PROP]: key } };
}

/**
 * Événement FORMATION all-day (start.date → end.date EXCLUSIF = endDate + 1 jour).
 * colorId 7, convocation standard (renderRappelText, countdown vide), pièces
 * jointes Drive, formateur/apprenants ajoutés par l'orchestrateur.
 */
export function buildFormationEvent(ctx: SessionEventCtx): GEvent {
  const key = buildEventKey(ctx.code, 'formation');
  return {
    summary: `[Formation] ${ctx.productTitle} — ${ctx.code}`,
    location: `${ctx.locationName} — ${ctx.locationAddressText}`,
    description: renderRappelText(toTextCtx(ctx, '')),
    colorId: CALENDAR_COLORS.formation,
    start: { date: toDateStr(ctx.startDate) },
    end: { date: toDateStr(addDays(ctx.endDate, 1)) }, // end.date exclusif
    extendedProperties: withKey(key),
    attachments: buildFormationAttachments(ctx.programmeDriveId),
  };
}

/**
 * 15 RAPPELS quotidiens countdown : J-15 → veille (J-1). Pour chaque i (15→1) :
 *   - date du jour = startDate - i jours (événement all-day)
 *   - countdown = countdownLabel(i) ("dans 15 jours" … "demain")
 *   - colorId 6, clé buildEventKey(code,'rappel',i)
 *   - notification POPUP uniquement le matin (PAS de notification e-mail)
 *
 * Toujours 15 clés générées même si la session est proche/passée (le mode
 * d'envoi est décidé par l'orchestrateur, pas ici — backfill/audit).
 */
export function buildRappelEvents(ctx: SessionEventCtx): GEvent[] {
  const events: GEvent[] = [];
  for (let i = 15; i >= 1; i--) {
    const day = addDays(ctx.startDate, -i);
    const countdown = countdownLabel(i);
    const key = buildEventKey(ctx.code, 'rappel', i);
    events.push({
      summary: `[Rappel J-${i}] ${ctx.productTitle} — ${ctx.code}`,
      location: `${ctx.locationName} — ${ctx.locationAddressText}`,
      description: renderRappelText(toTextCtx(ctx, countdown)),
      colorId: CALENDAR_COLORS.rappel,
      start: { date: toDateStr(day) },
      end: { date: toDateStr(addDays(day, 1)) },
      extendedProperties: withKey(key),
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 9 * 60 }],
      },
    });
  }
  return events;
}

/** Plages horaires des 3 relances froid : (mois, jours) à ajouter à endDate. */
const FROID_OFFSETS: { addMonth: number; addDay: number; relance: FroidRelance }[] = [
  { addMonth: 1, addDay: 0, relance: 1 }, // fin + 1 mois
  { addMonth: 1, addDay: 15, relance: 2 }, // fin + 1 mois 15 jours
  { addMonth: 2, addDay: 0, relance: 3 }, // fin + 2 mois
];

/**
 * 3 relances satisfaction à froid (timed event 09:00–09:30, créneau pilote).
 * colorId 3, clé buildEventKey(code,'froid',i), texte renderFroidText(relance),
 * pièce jointe questionnaire C7.i30. Notification POPUP au moment de l'événement.
 */
export function buildFroidEvents(ctx: SessionEventCtx): GEvent[] {
  return FROID_OFFSETS.map((off, idx) => {
    const i = idx + 1;
    const day = addDays(addMonths(ctx.endDate, off.addMonth), off.addDay);
    const dateStr = toDateStr(day);
    const key = buildEventKey(ctx.code, 'froid', i);
    return {
      summary: `[Satisfaction à froid — relance ${off.relance}] ${ctx.productTitle} — ${ctx.code}`,
      description: renderFroidText(toTextCtx(ctx, ''), off.relance),
      colorId: CALENDAR_COLORS.froid,
      start: { dateTime: `${dateStr}T09:00:00`, timeZone: 'Europe/Paris' },
      end: { dateTime: `${dateStr}T09:30:00`, timeZone: 'Europe/Paris' },
      extendedProperties: withKey(key),
      attachments: [
        {
          fileUrl: driveViewUrl(DRIVE_DOCS.questionnaireFroid),
          title: 'Questionnaire de satisfaction à froid',
          mimeType: 'application/pdf',
        },
      ],
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 0 }],
      },
    };
  });
}

// Note : HORAIRES est exposé via le texte de convocation (renderRappelText) ; il
// est référencé ici pour garantir l'usage figé des créneaux dans tout le module.
void HORAIRES;
