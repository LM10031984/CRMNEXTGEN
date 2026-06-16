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
  renderOfficialBadges,
  stagiaireLabel,
  wrapHtml,
} from './shared-template';

export function renderCertificatHtml(ctx: ClosureContext): string {
  // Phase 7 — Plan 07-01 : utilise ctx.of (pre-résolu BDD-first par le worker)
  // si disponible, sinon fallback `getOfConfig()` legacy ENV.
  const of = ctx.of ?? getOfConfig();
  const respFullName = `${of.resp.prenom} ${of.resp.nom}`.trim();
  const respTitre = of.resp.titre || 'Représentant légal';
  // Phase 7 (Plan 07-03) — résolution signature uploadée via Paramètres dans
  // `public/of-assets/{ctx.tenantId}/signature-dirigeant.png` (certificat signé
  // par le dirigeant/représentant légal), fallback bundled.
  const signatureDataUrl = loadSignatureDataUrl(ctx.tenantId, 'dirigeant');
  // Date du certificat = date de fin de formation (et non date d'édition).
  // Indicateur Qualiopi : le certificat atteste de la fin effective de l'action.
  const dateCertificat = formatDateFr(ctx.sessionEndDate);
  const stagiaireFull = `${ctx.apprenantPrenom} ${ctx.apprenantNom}`.trim();
  const lieuFait = of.addressVille || 'Vence';

  // Période ou date unique
  const sameDay = ctx.sessionStartDate.toDateString() === ctx.sessionEndDate.toDateString();
  const periodLabel = sameDay ? 'Date de réalisation' : 'Période de réalisation';
  const periodValue = sameDay
    ? `Le ${formatDateFr(ctx.sessionStartDate)}`
    : `Du ${formatDateFr(ctx.sessionStartDate)} au ${formatDateFr(ctx.sessionEndDate)}`;

  // Style "2 lignes par champ" (label en bold, valeur indentée) — fidèle à
  // la fonction `drawField` de Qualiopi Gen (certificat-generator.ts).
  const fieldHtml = (label: string, value: string) => `
    <div class="cert-field">
      <div class="cert-label">${escapeHtml(label)}</div>
      <div class="cert-value">${escapeHtml(value)}</div>
    </div>`;

  const body = `
${renderBrandHeader(ctx.of, ctx.tenantId)}
${renderOfficialBadges({ qualiopi: false })}
<main class="body">
  <h1 class="doc-title center" style="font-size: 20pt;">CERTIFICAT DE RÉALISATION</h1>
  <p class="doc-subtitle center">En application des dispositions de l'article L.6353-1 du Code du travail</p>
  <hr class="doc-rule" style="border-top-width: 0.8mm;" />

  <p style="margin-top: 16px; font-size: 11pt;">L'organisme de formation <strong>${escapeHtml(of.name)}</strong> atteste que :</p>

  <style>
    .cert-field { margin: 12px 0; }
    .cert-label { font-size: 11pt; font-weight: 700; color: ${BRAND_DARK}; }
    .cert-value { font-size: 11pt; margin-top: 3px; padding-left: 8px; }
  </style>

  ${fieldHtml(`${stagiaireLabel(ctx.apprenantCivility)} :`, stagiaireFull)}
  ${fieldHtml('A suivi la formation :', ctx.sessionTitle)}
  ${fieldHtml("Nature de l'action de formation :", "Action de formation au sens de l'article L.6313-1 du Code du travail")}
  ${fieldHtml(`${periodLabel} :`, periodValue)}
  ${fieldHtml('Durée :', formatHours(ctx.durationHours))}

  <p style="margin-top: 18px; font-style: italic; color: #64748B; font-size: 10pt;">
    Sans préjuger des résultats des évaluations spécifiques réalisées en cours
    ou en fin de formation, le stagiaire a réalisé l'action de formation ci-dessus.
  </p>

  <p style="margin-top: 22px;">Fait à ${escapeHtml(lieuFait)}, le ${escapeHtml(dateCertificat)}.</p>

  <div class="signature-block">
    <div class="col">
      <div class="label">${escapeHtml(respFullName)}</div>
      <div class="role">${escapeHtml(respTitre)} — ${escapeHtml(of.name)}</div>
      ${signatureDataUrl ? `<img class="tampon" src="${signatureDataUrl}" alt="Signature et cachet" />` : ''}
    </div>
  </div>
</main>
`;

  return wrapHtml({ title: `Certificat de réalisation — ${stagiaireFull}`, bodyHtml: body, of: ctx.of });
}
