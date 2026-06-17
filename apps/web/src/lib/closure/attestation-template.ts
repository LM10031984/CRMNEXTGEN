/**
 * Attestation de fin de formation — template HTML statique conforme à
 * l'article L.6353-1 du Code du travail et à l'indicateur Qualiopi 11.
 *
 * Document délivré au stagiaire à l'issue de la formation, attestant qu'il
 * a bien suivi l'action de formation. Texte différent du certificat de
 * réalisation (qui lui est destiné au financeur).
 */

import { getOfConfig } from '@/lib/of-config';
import {
  type ClosureContext,
  civilityLabel,
  escapeHtml,
  formatDateFr,
  formatHours,
  loadSignatureDataUrl,
  renderBrandHeader,
  renderOfficialBadges,
  soussigneLabel,
  wrapHtml,
} from './shared-template';

export function renderAttestationHtml(ctx: ClosureContext): string {
  // Phase 7 — Plan 07-01 : utilise ctx.of (pre-résolu BDD-first par le worker)
  // si disponible, sinon fallback `getOfConfig()` legacy ENV.
  const of = ctx.of ?? getOfConfig();
  const respFullName = `${of.resp.prenom} ${of.resp.nom}`.trim();
  const respTitre = of.resp.titre || 'Représentant légal';
  // Phase 7 (Plan 07-03) — résolution signature pédago uploadée via Paramètres
  // (signature-pedago.png), fallback bundled signature-laurent.png.
  const signatureDataUrl = loadSignatureDataUrl(ctx.tenantId, 'pedago');
  const today = formatDateFr(new Date());
  const dateStr =
    ctx.sessionStartDate.toDateString() === ctx.sessionEndDate.toDateString()
      ? `le ${formatDateFr(ctx.sessionStartDate)}`
      : `du ${formatDateFr(ctx.sessionStartDate)} au ${formatDateFr(ctx.sessionEndDate)}`;
  const stagiaireFull = `${ctx.apprenantPrenom} ${ctx.apprenantNom}`.trim();
  const apprenantPrefix = civilityLabel(ctx.apprenantCivility); // null si inconnu → on n'affiche rien
  const lieuFait = of.addressVille || 'Vence';

  const body = `
${renderBrandHeader(ctx.of, ctx.tenantId)}
${renderOfficialBadges({ qualiopi: false })}
<main class="body">
  <h1 class="doc-title center">ATTESTATION DE FIN DE FORMATION</h1>
  <p class="doc-subtitle center">Conformément à l'article L.6353-1 du Code du travail — indicateur Qualiopi 11</p>
  <hr class="doc-rule" />

  <section class="attestation-body">
    <p>${escapeHtml(soussigneLabel(of.resp.civilite))} <strong>${escapeHtml(respFullName)}</strong>, ${escapeHtml(respTitre)} de l'organisme de formation <strong>${escapeHtml(of.name)}</strong> (SIRET ${escapeHtml(of.siret)} — N° de déclaration ${escapeHtml(of.rnq)}), atteste que :</p>

    <p style="margin-top: 14px;"><strong>${apprenantPrefix ? escapeHtml(apprenantPrefix) + ' ' : ''}${escapeHtml(stagiaireFull)}</strong></p>

    <p>a suivi avec assiduité l'action de formation intitulée :</p>

    <p><strong>« ${escapeHtml(ctx.sessionTitle)} »</strong></p>

    <p>qui s'est déroulée ${escapeHtml(dateStr)}, pour une durée totale de <strong>${escapeHtml(formatHours(ctx.durationHours))}</strong>${ctx.sessionLocation ? `, à <strong>${escapeHtml(ctx.sessionLocation)}</strong>` : ''}.</p>

    <p>Cette attestation est délivrée pour servir et valoir ce que de droit.</p>
  </section>

  <p style="margin-top: 24px;">Fait à ${escapeHtml(lieuFait)}, le ${escapeHtml(today)}.</p>

  <div class="signature-block">
    <div class="col">
      <div class="label">${escapeHtml(respFullName)}</div>
      <div class="role">${escapeHtml(respTitre)} — ${escapeHtml(of.name)}</div>
      ${signatureDataUrl ? `<img class="tampon" src="${signatureDataUrl}" alt="Signature et cachet" />` : ''}
    </div>
  </div>
</main>
`;

  return wrapHtml({ title: `Attestation de fin de formation — ${stagiaireFull}`, bodyHtml: body, of: ctx.of });
}
