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
  loadStampDataUrl,
  loadTrainerSignatureDataUrl,
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

  // Bloc certification Qualiopi (Laurent 2026-06-16) : « Certifié exact par
  // [formateur] », « Fait à [ville de formation], le [date fin] » + tampon/
  // signature (signature-pedago = Laurent Marx). Le lieu exact est OBLIGATOIRE :
  // sans lieu, l'émargement n'est pas valide → on signale explicitement.
  // Il figure en tête du document (bloc « Lieu de formation »), raison sociale
  // comprise — mention exigée par l'AGEFICE (refus de prise en charge du
  // 28/08/2026). Cf. `mentionsLieuManquantes` qui bloque la génération du pack
  // tant que la raison sociale, le code postal ou la ville manquent.
  // Signature du formateur réel de la session (Jean-Guy pour ses sessions),
  // PAS la signature pédago Laurent. + tampon Start Academy.
  const signatureDataUrl = loadTrainerSignatureDataUrl(ctx.tenantId, trainer);
  const stampDataUrl = loadStampDataUrl(ctx.tenantId);
  // « Fait à … » : la VILLE seule (Laurent 2026-08-28). Le lieu complet —
  // raison sociale + adresse, exigé par l'AGEFICE — est porté par le bloc
  // « Lieu » de `renderInfoBox`, pas répété ici.
  const villeCertif =
    ctx.sessionLocationCity ?? ctx.sessionLocation ?? '⚠ LIEU À RENSEIGNER';
  const dateCertif = formatDateFr(ctx.sessionEndDate);

  // `break-before: avoid` sur chaque ligne du groupe final : ceinture ET
  // bretelles avec le `break-inside: avoid` du <tbody> qui les contient.
  const ligne = (d: Date, soudee: boolean) => `
<tr${soudee ? ' style="break-before: avoid;"' : ''}>
  <td style="text-align: center; font-weight: 600; color: ${BRAND_DARK}; width: 38mm; vertical-align: middle; font-size: 9.5pt;">${escapeHtml(formatDateFr(d))}</td>
  <td style="height: 18mm;"></td>
  <td style="height: 18mm;"></td>
</tr>`;

  // LE TAMPON N'EST JAMAIS ORPHELIN (SES-0111, 21/09/2026).
  //
  // Les `LIGNES_AVEC_LE_TAMPON` derniers jours quittent le corps sécable du
  // tableau pour un second <tbody>, INSÉCABLE, qui porte aussi le bloc de fin.
  // Si ce groupe ne tient pas sous ce qui précède, il passe ENTIER à la page
  // suivante : le tampon arrive alors avec ses deux lignes, et l'en-tête du
  // tableau se répète de lui-même (<thead> = table-header-group).
  const LIGNES_AVEC_LE_TAMPON = 2;
  const coupure = Math.max(0, days.length - LIGNES_AVEC_LE_TAMPON);
  const lignesSecables = days.slice(0, coupure).map((d) => ligne(d, false)).join('');
  const lignesFinales = days.slice(coupure).map((d, i) => ligne(d, i > 0)).join('');

  const body = `
${renderBrandHeader()}
<main class="body">
  <h1 class="doc-title" style="margin: 2px 0 5px 0; line-height: 1.2;">FICHE D'ÉMARGEMENT</h1>
  <p class="doc-subtitle" style="margin: 0 0 4px 0; line-height: 1.25;">Présence du stagiaire en formation</p>
  <hr class="doc-rule" style="margin: 4px 0;" />

  ${renderInfoBox(ctx)}
  ${renderStagiaireBlock(ctx)}

  <div style="margin: 4px 0; padding: 4px 10px; line-height: 1.25; background: #F0F9FF; border-left: 3px solid ${BRAND_DARK}; font-size: 10pt;">
    <strong style="color: ${BRAND_DARK};">Formateur :</strong> <span style="font-weight: 600;">${escapeHtml(trainer)}</span>
  </div>

  <table class="data" style="margin-top: 4px; margin-bottom: 0;">
    <thead>
      <tr>
        <th style="text-align: center; vertical-align: middle;">Date</th>
        <th style="text-align: center;">Signature stagiaire<br/><span style="font-weight: 500; font-size: 9pt; color: #FFFFFF;">Matin · ${HORAIRE_MATIN}</span></th>
        <th style="text-align: center;">Signature stagiaire<br/><span style="font-weight: 500; font-size: 9pt; color: #FFFFFF;">Après-midi · ${HORAIRE_APREM}</span></th>
      </tr>
    </thead>
    ${lignesSecables ? `<tbody>${lignesSecables}</tbody>` : ''}

    <!-- LE GROUPE FINAL — insécable : les derniers jours ET le bloc de fin.

         HISTORIQUE, pour ne pas refaire le chemin à l'envers :
           · avant le 01/07 : break-inside:avoid sur le SEUL bloc du bas. Il
             sautait ENTIER en page 2 dès qu'il ne tenait plus, en laissant du
             vide en page 1 (« certifié exact en page 2 alors qu'il y a la
             place ») ;
           · du 01/07 au 21/09 : plus aucun break-inside. Le bloc coulait… et
             c'est sa QUEUE qui s'orphelinait : sur SES-0111 (2 jours), la
             signature et le tampon partaient SEULS en page 2, le texte
             « Certifié exact » restant en page 1. Toutes les durées de 2 à 7
             jours étaient touchées.
         Les deux extrêmes échouent pour la même raison : l'insécable portait
         le bloc SEUL. Il porte maintenant le bloc ET les lignes qu'il certifie
         — même correctif que l'assiduité de la PR #100.

         PAS DE FLEX ICI. Le rendu est fait par WeasyPrint, qui pagine mal une
         rangée flex en bas de page : c'est la rangée d'images en display:flex
         qui sautait, alors que ses 26 mm TENAIENT dans le vide laissé en page
         1. Des inline-block, que ce moteur sait garder en place.

         Preuve : scripts/proof-emargement-tampon.ts (rendu WeasyPrint réel). -->
    <tbody style="break-inside: avoid;">
      ${lignesFinales}
      <tr style="break-before: avoid;">
        <td colspan="3" style="border: none; background: #FFFFFF; padding: 3mm 0 0 0;">
          <!-- 2 cases signature formateur (matin + après-midi). Horaires retirés
               (Laurent 2026-06-04) : "une signature le matin et l'aprem sans les horaires". -->
          <div style="font-size: 0;">
            <div style="display: inline-block; vertical-align: top; width: 48.5%; margin-right: 3%; border: 1px solid #CBD5E1; border-radius: 4px; padding: 5px 10px; font-size: 10pt;">
              <div style="font-size: 9pt; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; line-height: 1.25;">
                Signature formateur — Matin
              </div>
              <div style="font-weight: 600; color: ${BRAND_DARK}; line-height: 1.25;">
                ${escapeHtml(trainer)}
              </div>
              <div style="height: 12mm;"></div>
            </div><div style="display: inline-block; vertical-align: top; width: 48.5%; border: 1px solid #CBD5E1; border-radius: 4px; padding: 5px 10px; font-size: 10pt;">
              <div style="font-size: 9pt; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; line-height: 1.25;">
                Signature formateur — Après-midi
              </div>
              <div style="font-weight: 600; color: ${BRAND_DARK}; line-height: 1.25;">
                ${escapeHtml(trainer)}
              </div>
              <div style="height: 12mm;"></div>
            </div>
          </div>

          <!-- Certification Qualiopi OBLIGATOIRE (Laurent 2026-06-16) : "Certifié exact
               par [formateur]", "Fait à [lieu EXACT de formation], le [date fin]" + tampon
               (signature-pedago = Laurent Marx). Sans lieu exact, l'émargement n'est pas valide. -->
          <div style="margin-top: 2mm; padding-top: 3px; border-top: 1px solid #CBD5E1;">
            <p style="font-size: 10.5pt; font-weight: 700; color: ${BRAND_DARK}; margin: 0 0 2px 0; line-height: 1.25;">
              Certifié exact par ${escapeHtml(trainer)}, formateur.
            </p>
            <p style="font-size: 10pt; margin: 0; line-height: 1.25;">
              Fait à <strong>${escapeHtml(villeCertif)}</strong>, le <strong>${escapeHtml(dateCertif)}</strong>.
            </p>
            <div style="margin-top: 2px; line-height: 0;">
              ${signatureDataUrl ? `<img src="${signatureDataUrl}" alt="Signature ${escapeHtml(trainer)}" style="display: inline-block; vertical-align: bottom; height: 20mm; margin-right: 14mm;" />` : ''}
              ${stampDataUrl ? `<img src="${stampDataUrl}" alt="Tampon Start Academy" style="display: inline-block; vertical-align: bottom; height: 26mm;" />` : ''}
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</main>
`;

  return wrapHtml({ title: `Émargement — ${stagiaireFull}`, bodyHtml: body });
}
