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
  MUTED,
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
import {
  formatJourFr,
  horairesSession,
  HORAIRE_APREM_DEFAUT,
  HORAIRE_MATIN_DEFAUT,
  type JourneeHoraires,
} from '@/lib/sessions/horaires';

// Horaires Start Academy figés (Laurent 2026-06-03) : journée standard 8h
// = 9h00–13h00 (matin) + 14h00–18h00 (après-midi). Convention métier, et
// FALLBACK uniquement : dès que la session porte des `SessionSlot`, ce sont eux
// qui font foi (cf. `lib/sessions/horaires.ts`). Une session hors moule —
// SES-0111, 11 h sur 1,5 jour — sortait sinon une feuille signée avec de faux
// horaires.
const HORAIRE_MATIN = HORAIRE_MATIN_DEFAUT;
const HORAIRE_APREM = HORAIRE_APREM_DEFAUT;

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

/** Cellule de signature vide, hauteur fixe. `horaire` non nul = horaires par jour. */
function renderCaseSignature(horaire: string | null, horairesParJour: boolean): string {
  if (!horairesParJour) return '<td style="height: 18mm;"></td>';
  // Demi-journée non planifiée : surtout PAS de case à signer — un stagiaire ne
  // doit pas pouvoir émarger une demi-journée qui n'a pas eu lieu.
  if (!horaire) {
    return `<td style="height: 18mm; text-align: center; vertical-align: middle; color: ${MUTED}; background: #F8FAFC; font-size: 9pt;">—</td>`;
  }
  return `<td style="height: 18mm; vertical-align: top; padding-top: 3px;"><span style="font-size: 8.5pt; color: ${MUTED};">${escapeHtml(horaire.replace('–', ' – '))}</span></td>`;
}

export function renderEmargementHtml(ctx: ClosureContext): string {
  const stagiaireFull = `${ctx.apprenantPrenom} ${ctx.apprenantNom}`.trim();
  // Les créneaux réels priment sur les dates de session : ils portent les jours
  // ET les horaires effectivement planifiés. Sans eux → comportement historique
  // (jours ouvrés déduits des dates, horaires figés en en-tête de colonne).
  const horaires = horairesSession(ctx.sessionSlots);
  const days = horaires ? [] : computeFormationDays(ctx.sessionStartDate, ctx.sessionEndDate);
  // On ne répète l'horaire sur chaque ligne que s'il varie d'un jour à l'autre.
  // Cas courant (journées identiques) : il reste en en-tête, rendu inchangé.
  const horairesParJour = horaires !== null && !horaires.uniformes;
  const enteteMatin = horaires?.matinCommun ?? HORAIRE_MATIN;
  const enteteAprem = horaires?.apresMidiCommun ?? HORAIRE_APREM;
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

  const renderRow = (dateLabel: string, jour: JourneeHoraires | null): string => {
    // Journée d'un seul tenant (`halfDay='full'`) : une case unique sur les deux
    // colonnes, sinon on ferait signer deux fois une journée qui n'a pas de coupure.
    const cases = jour?.journeeComplete
      ? `<td colspan="2" style="height: 18mm; vertical-align: top; padding-top: 3px;"><span style="font-size: 8.5pt; color: ${MUTED};">${escapeHtml(jour.journeeComplete.replace('–', ' – '))}</span></td>`
      : `${renderCaseSignature(jour?.matin ?? null, horairesParJour)}
  ${renderCaseSignature(jour?.apresMidi ?? null, horairesParJour)}`;
    return `
<tr>
  <td style="text-align: center; font-weight: 600; color: ${BRAND_DARK}; width: 38mm; vertical-align: middle; font-size: 9.5pt;">${escapeHtml(dateLabel)}</td>
  ${cases}
</tr>`;
  };

  const rows = horaires
    ? horaires.jours.map((j) => renderRow(formatJourFr(j.iso), j)).join('')
    : days.map((d) => renderRow(formatDateFr(d), null)).join('');

  const body = `
${renderBrandHeader()}
<main class="body">
  <h1 class="doc-title" style="margin: 4px 0 8px 0;">FICHE D'ÉMARGEMENT</h1>
  <p class="doc-subtitle" style="margin: 0 0 6px 0;">Présence du stagiaire en formation</p>
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
        <th style="text-align: center;">Signature stagiaire<br/><span style="font-weight: 500; font-size: 9pt; color: #FFFFFF;">Matin${horairesParJour ? '' : ` · ${enteteMatin}`}</span></th>
        <th style="text-align: center;">Signature stagiaire<br/><span style="font-weight: 500; font-size: 9pt; color: #FFFFFF;">Après-midi${horairesParJour ? '' : ` · ${enteteAprem}`}</span></th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <!-- Bloc bas de page (Laurent 2026-07-01) : signatures formateur + certification.
       IMPORTANT — PAS de break-inside:avoid ici. Ce dernier FORÇAIT tout le bloc à
       basculer en page 2 dès que le moteur estimait qu'il ne tenait pas dans
       l'espace restant, laissant du vide en page 1 ("certifié exact en page 2
       alors qu'il y a la place"). Sans lui + hauteurs compactées, le contenu coule
       naturellement et tient sur la page 1 pour une session courte. -->
  <div style="margin-top: 6mm;">
    <!-- 2 cases signature formateur (matin + après-midi). Horaires retirés
         (Laurent 2026-06-04) : "une signature le matin et l'aprem sans les horaires". -->
    <div style="display: flex; gap: 12mm;">
      <div style="flex: 1; border: 1px solid #CBD5E1; border-radius: 4px; padding: 6px 10px;">
        <div style="font-size: 9pt; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px;">
          Signature formateur — Matin
        </div>
        <div style="font-size: 10pt; font-weight: 600; color: ${BRAND_DARK};">
          ${escapeHtml(trainer)}
        </div>
        <div style="height: 12mm;"></div>
      </div>
      <div style="flex: 1; border: 1px solid #CBD5E1; border-radius: 4px; padding: 6px 10px;">
        <div style="font-size: 9pt; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px;">
          Signature formateur — Après-midi
        </div>
        <div style="font-size: 10pt; font-weight: 600; color: ${BRAND_DARK};">
          ${escapeHtml(trainer)}
        </div>
        <div style="height: 12mm;"></div>
      </div>
    </div>

    <!-- Certification Qualiopi OBLIGATOIRE (Laurent 2026-06-16) : "Certifié exact
         par [formateur]", "Fait à [lieu EXACT de formation], le [date fin]" + tampon
         (signature-pedago = Laurent Marx). Sans lieu exact, l'émargement n'est pas valide. -->
    <div style="margin-top: 5mm; padding-top: 6px; border-top: 1px solid #CBD5E1;">
      <p style="font-size: 10.5pt; font-weight: 700; color: ${BRAND_DARK}; margin: 0 0 3px 0;">
        Certifié exact par ${escapeHtml(trainer)}, formateur.
      </p>
      <p style="font-size: 10pt; margin: 0;">
        Fait à <strong>${escapeHtml(villeCertif)}</strong>, le <strong>${escapeHtml(dateCertif)}</strong>.
      </p>
      <div style="display: flex; align-items: flex-end; gap: 14mm; margin-top: 4px;">
        ${signatureDataUrl ? `<img src="${signatureDataUrl}" alt="Signature ${escapeHtml(trainer)}" style="height: 20mm;" />` : ''}
        ${stampDataUrl ? `<img src="${stampDataUrl}" alt="Tampon Start Academy" style="height: 26mm;" />` : ''}
      </div>
    </div>
  </div>
</main>
`;

  return wrapHtml({ title: `Émargement — ${stagiaireFull}`, bodyHtml: body });
}
