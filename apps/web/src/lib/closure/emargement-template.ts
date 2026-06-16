/**
 * Fiche d'émargement — template HTML.
 *
 * Document Qualiopi indicateur 11. Tableau de signatures par demi-journée :
 * 1 ligne par stagiaire (ici nous générons UNE fiche par stagiaire avec
 * sa ligne uniquement, signée par lui + le formateur), 2 cases par jour
 * de formation (matin + après-midi). Ex : formation 3 jours → 6 cases.
 *
 * Pas d'IA — le contenu est purement structurel (jours calculés depuis
 * sessionStartDate / sessionEndDate / durationHours).
 */

import {
  type ClosureContext,
  BRAND_DARK,
  escapeHtml,
  formatDateFr,
  renderBrandHeader,
  renderInfoBox,
  renderStagiaireBlock,
  wrapHtml,
} from './shared-template';
import { isBusinessDayISO } from '@/lib/business-days';

// Horaires Start Academy figés (Laurent 2026-06-03) : journée standard 8h
// = 9h00–13h00 (matin) + 14h00–18h00 (après-midi). Convention métier
// non-négociable. Si une session particulière a des horaires différents,
// utiliser SessionSlot — non géré V1.
const HORAIRE_MATIN = '9h00–13h00' as const;
const HORAIRE_APREM = '14h00–18h00' as const;

/**
 * Calcule la liste des jours de formation entre startDate et endDate.
 * Skip samedi, dimanche et jours fériés français (Start Academy ne forme
 * pas le week-end ni les fériés). Si endDate < startDate, retombe sur
 * 1 seul jour (la startDate, même si non ouvré — cas pathologique).
 */
function computeFormationDays(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const cursor = new Date(startDay);
  const safetyMax = 90; // formation longue OK (ex: 72h sur 12 sem.)
  let i = 0;
  while (cursor <= endDay && i < safetyMax) {
    // YYYY-MM-DD local (computeFormationDays travaille en heure locale)
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    if (isBusinessDayISO(iso)) {
      days.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
    i++;
  }
  return days.length > 0 ? days : [startDay];
}

export function renderEmargementHtml(ctx: ClosureContext): string {
  const stagiaireFull = `${ctx.apprenantPrenom} ${ctx.apprenantNom}`.trim();
  const days = computeFormationDays(ctx.sessionStartDate, ctx.sessionEndDate);
  const trainer = ctx.sessionTrainers.length > 0 ? ctx.sessionTrainers.join(', ') : 'À renseigner';

  const rows = days
    .map((d) => {
      const dateLabel = formatDateFr(d);
      return `
<tr>
  <td style="text-align: center; font-weight: 600; color: ${BRAND_DARK}; width: 38mm; vertical-align: middle; font-size: 9.5pt;">${escapeHtml(dateLabel)}</td>
  <td style="height: 18mm;"></td>
  <td style="height: 18mm;"></td>
</tr>`;
    })
    .join('');

  const body = `
${renderBrandHeader()}
<main class="body">
  <h1 class="doc-title" style="margin: 4px 0 8px 0;">FICHE D'ÉMARGEMENT</h1>
  <p class="doc-subtitle" style="margin: 0 0 6px 0;">Indicateur Qualiopi 11 — Présence du stagiaire en formation</p>
  <hr class="doc-rule" style="margin: 6px 0;" />

  ${renderInfoBox(ctx)}
  ${renderStagiaireBlock(ctx)}

  <div style="margin: 6px 0; padding: 6px 10px; background: #F0F9FF; border-left: 3px solid ${BRAND_DARK}; font-size: 10pt;">
    <strong style="color: ${BRAND_DARK};">Formateur :</strong> <span style="font-weight: 600;">${escapeHtml(trainer)}</span>
  </div>

  <table class="data" style="margin-top: 6px;">
    <thead>
      <tr>
        <th style="text-align: center; vertical-align: middle;">Date</th>
        <th style="text-align: center;">Signature stagiaire<br/><span style="font-weight: 500; font-size: 9pt; color: #FFFFFF;">Matin · ${HORAIRE_MATIN}</span></th>
        <th style="text-align: center;">Signature stagiaire<br/><span style="font-weight: 500; font-size: 9pt; color: #FFFFFF;">Après-midi · ${HORAIRE_APREM}</span></th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <!-- 2 cases signature formateur en bas de page (matin + après-midi).
       Horaires retirés des libellés à la demande de Laurent 2026-06-04 :
       "une signature le matin et l'aprem sans les horaires". -->
  <div style="margin-top: 14mm; display: flex; gap: 12mm;">
    <div style="flex: 1; border: 1px solid #CBD5E1; border-radius: 4px; padding: 8px 10px;">
      <div style="font-size: 9pt; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
        Signature formateur — Matin
      </div>
      <div style="font-size: 10pt; font-weight: 600; color: ${BRAND_DARK};">
        ${escapeHtml(trainer)}
      </div>
      <div style="height: 26mm;"></div>
    </div>
    <div style="flex: 1; border: 1px solid #CBD5E1; border-radius: 4px; padding: 8px 10px;">
      <div style="font-size: 9pt; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
        Signature formateur — Après-midi
      </div>
      <div style="font-size: 10pt; font-weight: 600; color: ${BRAND_DARK};">
        ${escapeHtml(trainer)}
      </div>
      <div style="height: 26mm;"></div>
    </div>
  </div>
</main>
`;

  return wrapHtml({ title: `Émargement — ${stagiaireFull}`, bodyHtml: body });
}
