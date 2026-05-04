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

/**
 * Calcule la liste des jours de formation entre startDate et endDate.
 * Si endDate < startDate, retombe sur 1 seul jour.
 */
function computeFormationDays(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const cursor = new Date(startDay);
  const safetyMax = 60; // évite boucle infinie sur date corrompue
  let i = 0;
  while (cursor <= endDay && i < safetyMax) {
    days.push(new Date(cursor));
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
  <td style="text-align: center; font-weight: 600; color: ${BRAND_DARK}; width: 45mm;">${escapeHtml(dateLabel)}</td>
  <td style="height: 24mm;"></td>
  <td style="height: 24mm;"></td>
</tr>`;
    })
    .join('');

  const body = `
${renderBrandHeader()}
<main class="body">
  <h1 class="doc-title">FICHE D'ÉMARGEMENT</h1>
  <p class="doc-subtitle">Indicateur Qualiopi 11 — Présence du stagiaire en formation</p>
  <hr class="doc-rule" />

  ${renderInfoBox(ctx)}
  ${renderStagiaireBlock(ctx)}

  <p style="margin: 8px 0 6px 0; font-size: 10pt; color: #475569;">
    Le stagiaire signe sa présence à chaque demi-journée (matin et après-midi).
    Le formateur atteste par sa signature unique en bas de page de la présence
    effective du stagiaire sur l'ensemble des séances.
  </p>

  <table class="data" style="margin-top: 8px;">
    <thead>
      <tr>
        <th style="text-align: center; vertical-align: middle;">Date</th>
        <th style="text-align: center;">Signature stagiaire — Matin</th>
        <th style="text-align: center;">Signature stagiaire — Après-midi</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="signature-block">
    <div class="col">
      <div class="label">Formateur</div>
      <div class="role">${escapeHtml(trainer)}</div>
      <div style="margin-top: 28mm; border-top: 1px dashed ${BRAND_DARK}; width: 70mm; padding-top: 4px; font-size: 9pt; color: #64748B;">Signature</div>
    </div>
  </div>
</main>
`;

  return wrapHtml({ title: `Émargement — ${stagiaireFull}`, bodyHtml: body });
}
