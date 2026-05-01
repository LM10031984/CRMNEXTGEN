/**
 * Certificat de réalisation — template HTML statique.
 *
 * Document destiné au financeur (OPCO, AGEFICE, CPF, employeur) attestant
 * la réalisation effective de l'action de formation. Conforme à l'article
 * L.6353-1 du Code du travail. Porté depuis Qualiopi Gen
 * (`certificat-generator.ts`) en HTML+Gotenberg pour cohérence QualiOF.
 */

import { getOfConfig } from '@/lib/of-config';
import {
  type ClosureContext,
  BRAND_DARK,
  escapeHtml,
  formatDateFr,
  formatHours,
  loadSignatureDataUrl,
  renderBrandHeader,
  stagiaireLabel,
  wrapHtml,
} from './shared-template';

export function renderCertificatHtml(ctx: ClosureContext): string {
  const of = getOfConfig();
  const respFullName = `${of.resp.prenom} ${of.resp.nom}`.trim();
  const respTitre = of.resp.titre || 'Représentant légal';
  const signatureDataUrl = loadSignatureDataUrl();
  const today = formatDateFr(new Date());
  const stagiaireFull = `${ctx.apprenantPrenom} ${ctx.apprenantNom}`.trim();
  const lieuFait = of.addressVille || 'Vence';

  // Période ou date unique
  const sameDay = ctx.sessionStartDate.toDateString() === ctx.sessionEndDate.toDateString();
  const periodLabel = sameDay ? 'Date de réalisation' : 'Période de réalisation';
  const periodValue = sameDay
    ? `Le ${formatDateFr(ctx.sessionStartDate)}`
    : `Du ${formatDateFr(ctx.sessionStartDate)} au ${formatDateFr(ctx.sessionEndDate)}`;

  const body = `
${renderBrandHeader()}
<main class="body">
  <h1 class="doc-title center">CERTIFICAT DE RÉALISATION</h1>
  <p class="doc-subtitle center">En application des dispositions de l'article L.6353-1 du Code du travail</p>
  <hr class="doc-rule" />

  <p style="margin-top: 14px; font-size: 11pt;">L'organisme de formation <strong>${escapeHtml(of.name)}</strong> atteste que :</p>

  <table style="margin-top: 12px; font-size: 11pt; border-collapse: collapse;">
    <tbody>
      <tr><td style="padding: 5px 12px 5px 0; font-weight: 700; color: ${BRAND_DARK}; vertical-align: top; width: 70mm;">${escapeHtml(stagiaireLabel(ctx.apprenantCivility))} :</td><td style="padding: 5px 0;">${escapeHtml(stagiaireFull)}</td></tr>
      <tr><td style="padding: 5px 12px 5px 0; font-weight: 700; color: ${BRAND_DARK}; vertical-align: top;">A suivi la formation :</td><td style="padding: 5px 0;">${escapeHtml(ctx.sessionTitle)}</td></tr>
      <tr><td style="padding: 5px 12px 5px 0; font-weight: 700; color: ${BRAND_DARK}; vertical-align: top;">Nature de l'action de formation :</td><td style="padding: 5px 0;">Action de formation au sens de l'article L.6313-1 du Code du travail</td></tr>
      <tr><td style="padding: 5px 12px 5px 0; font-weight: 700; color: ${BRAND_DARK}; vertical-align: top;">${escapeHtml(periodLabel)} :</td><td style="padding: 5px 0;">${escapeHtml(periodValue)}</td></tr>
      <tr><td style="padding: 5px 12px 5px 0; font-weight: 700; color: ${BRAND_DARK}; vertical-align: top;">Durée :</td><td style="padding: 5px 0;">${escapeHtml(formatHours(ctx.durationHours))}</td></tr>
      ${ctx.sessionLocation ? `<tr><td style="padding: 5px 12px 5px 0; font-weight: 700; color: ${BRAND_DARK}; vertical-align: top;">Lieu :</td><td style="padding: 5px 0;">${escapeHtml(ctx.sessionLocation)}</td></tr>` : ''}
    </tbody>
  </table>

  <p style="margin-top: 18px; font-style: italic; color: #64748B; font-size: 10pt;">
    Sans préjuger des résultats des évaluations spécifiques réalisées en cours
    ou en fin de formation, le stagiaire a réalisé l'action de formation ci-dessus.
  </p>

  <p style="margin-top: 22px;">Fait à ${escapeHtml(lieuFait)}, le ${escapeHtml(today)}.</p>

  <div class="signature-block">
    <div class="col">
      <div class="label">${escapeHtml(respFullName)}</div>
      <div class="role">${escapeHtml(respTitre)} — ${escapeHtml(of.name)}</div>
      ${signatureDataUrl ? `<img class="tampon" src="${signatureDataUrl}" alt="Signature et cachet" />` : ''}
    </div>
  </div>
</main>
`;

  return wrapHtml({ title: `Certificat de réalisation — ${stagiaireFull}`, bodyHtml: body });
}
