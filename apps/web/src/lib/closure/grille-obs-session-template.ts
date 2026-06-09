/**
 * Grille d'observation et amélioration consolidée par SESSION (C3.i11
 * Qualiopi). Une seule grille pour tous les stagiaires présents.
 *
 * Format aligné sur le DOCX modèle "Grille observation et amelioration
 * stagiaires" :
 *   - Tableau compétences (lignes) × stagiaires (colonnes)
 *   - Niveaux : A (90-100%), B (71-89%), C (51-70%), D (-50%)
 *   - Ligne "MOYENNES" agrégée
 *   - Section "Observations et axes de progression" par stagiaire
 *
 * Ce doc est rempli par le formateur — l'IA génère une version pré-remplie
 * (niveaux + observations) basée sur le contenu de la formation et le profil
 * des stagiaires. Le formateur ajuste si besoin avant signature.
 */

import {
  type ClosureContext,
  BRAND_DARK,
  escapeHtml,
  formatDateFr,
  renderBrandHeader,
  wrapHtml,
} from './shared-template';

export type GrilleSessionNiveau = 'A' | 'B' | 'C' | 'D';

export interface GrilleSessionStagiaire {
  participantId: string;
  prenom: string;
  nom: string;
}

export interface GrilleSessionCompetence {
  nom: string;
  /** Mapping participantId → niveau (A/B/C/D) */
  niveaux: Record<string, GrilleSessionNiveau>;
}

export interface GrilleSessionObservation {
  participantId: string;
  texte: string;
}

export interface GrilleSessionContent {
  competences: GrilleSessionCompetence[];
  observations: GrilleSessionObservation[];
}

const NIVEAU_BG: Record<GrilleSessionNiveau, string> = {
  A: '#16A34A',
  B: '#3B82F6',
  C: '#F59E0B',
  D: '#DC2626',
};

const NIVEAU_LABEL: Record<GrilleSessionNiveau, string> = {
  A: 'A — 90-100%',
  B: 'B — 71-89%',
  C: 'C — 51-70%',
  D: 'D — < 50%',
};

export interface GrilleSessionTemplateData {
  formationTitre: string;
  sessionStartDate: Date;
  sessionEndDate: Date;
  formateurs: string[];
  stagiaires: GrilleSessionStagiaire[];
  content: GrilleSessionContent;
}

function moyenneNiveau(niveaux: GrilleSessionNiveau[]): GrilleSessionNiveau {
  // Pondération : A=4, B=3, C=2, D=1 → moyenne arrondie
  const map: Record<GrilleSessionNiveau, number> = { A: 4, B: 3, C: 2, D: 1 };
  if (niveaux.length === 0) return 'C';
  const avg = niveaux.reduce((s, n) => s + map[n], 0) / niveaux.length;
  if (avg >= 3.5) return 'A';
  if (avg >= 2.5) return 'B';
  if (avg >= 1.5) return 'C';
  return 'D';
}

export function renderGrilleObsSessionHtml(data: GrilleSessionTemplateData): string {
  const { stagiaires, content } = data;
  const sameDay =
    data.sessionStartDate.toDateString() === data.sessionEndDate.toDateString();
  const dateStr = sameDay
    ? formatDateFr(data.sessionStartDate)
    : `Du ${formatDateFr(data.sessionStartDate)} au ${formatDateFr(data.sessionEndDate)}`;
  const formateurStr = data.formateurs.length > 0 ? data.formateurs.join(', ') : 'À renseigner';

  // Header colonnes : compétence | stagiaire 1 | stagiaire 2 | …
  const colHeaders = stagiaires
    .map(
      (s) => `<th style="text-align: center; min-width: 24mm; font-size: 9pt;">
        ${escapeHtml(s.prenom)}<br>${escapeHtml(s.nom.toUpperCase())}
      </th>`,
    )
    .join('');

  // Lignes compétences
  const compRows = content.competences
    .map((comp) => {
      const cells = stagiaires
        .map((s) => {
          const niv = comp.niveaux[s.participantId] ?? 'C';
          return `<td style="text-align: center; vertical-align: middle;">
            <span class="badge-niveau ${niv}" style="background:${NIVEAU_BG[niv]};">${niv}</span>
          </td>`;
        })
        .join('');
      return `<tr>
        <td style="font-weight: 600; vertical-align: middle;">${escapeHtml(comp.nom)}</td>
        ${cells}
      </tr>`;
    })
    .join('');

  // Ligne MOYENNES (agrégation par stagiaire sur toutes les compétences)
  const moyennesRow = `<tr style="background: #F0F9FF;">
    <td style="font-weight: 700; color: ${BRAND_DARK}; vertical-align: middle;">MOYENNE</td>
    ${stagiaires
      .map((s) => {
        const niveaux = content.competences.map((c) => c.niveaux[s.participantId] ?? 'C');
        const moy = moyenneNiveau(niveaux);
        return `<td style="text-align: center; vertical-align: middle;">
          <span class="badge-niveau ${moy}" style="background:${NIVEAU_BG[moy]};">${moy}</span>
        </td>`;
      })
      .join('')}
  </tr>`;

  // Légende des niveaux
  const legende = (['A', 'B', 'C', 'D'] as GrilleSessionNiveau[])
    .map(
      (n) =>
        `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:14px;font-size:9pt;">
          <span class="badge-niveau ${n}" style="background:${NIVEAU_BG[n]};">${n}</span>
          ${escapeHtml(NIVEAU_LABEL[n])}
        </span>`,
    )
    .join('');

  // Observations par stagiaire
  const obsByPart = new Map(content.observations.map((o) => [o.participantId, o.texte]));
  const obsBlocks = stagiaires
    .map((s) => {
      const fullName = `${s.prenom} ${s.nom.toUpperCase()}`;
      const obs = obsByPart.get(s.participantId) ?? '';
      return `<div style="margin-bottom: 10px; page-break-inside: avoid;">
        <div style="font-weight: 700; color: ${BRAND_DARK}; margin-bottom: 3px;">${escapeHtml(fullName)}</div>
        <div style="font-size: 10pt; line-height: 1.5;">${escapeHtml(obs) || '<em style="color:#94A3B8;">À compléter par le formateur</em>'}</div>
      </div>`;
    })
    .join('');

  const body = `
${renderBrandHeader()}
<main class="body">
  <h1 class="doc-title">GRILLE D'AMÉLIORATION STAGIAIRE</h1>
  <p class="doc-subtitle">Indicateur Qualiopi C3.i11 — Évaluation consolidée par session</p>
  <hr class="doc-rule" />

  <div class="info-box">
    <table>
      <tbody>
        <tr>
          <td class="label">Formation :</td>
          <td class="value" colspan="3">${escapeHtml(data.formationTitre)}</td>
        </tr>
        <tr>
          <td class="label">Date(s) :</td>
          <td class="value">${escapeHtml(dateStr)}</td>
          <td class="label" style="width:22mm;">Formateur(s) :</td>
          <td class="value">${escapeHtml(formateurStr)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div style="margin: 0 0 8px 0; font-size: 9pt; color: #475569;">
    <strong>Légende :</strong> ${legende}
  </div>

  <table class="data" style="margin-top: 4px;">
    <thead>
      <tr>
        <th style="text-align: left; min-width: 50mm;">Compétences évaluées</th>
        ${colHeaders}
      </tr>
    </thead>
    <tbody>
      ${compRows}
      ${moyennesRow}
    </tbody>
  </table>

  <h2 class="section dark upper" style="margin-top: 16px;">Observations et axes de progression</h2>
  <div style="margin-top: 8px;">
    ${obsBlocks}
  </div>

  <div class="signature-block" style="margin-top: 24px;">
    <div class="col">
      <div class="label">Formateur</div>
      <div class="role">${escapeHtml(formateurStr)}</div>
      <div style="margin-top: 22mm; border-top: 1px dashed ${BRAND_DARK}; width: 70mm; padding-top: 4px; font-size: 9pt; color: #64748B;">Signature</div>
    </div>
  </div>
</main>
`;

  return wrapHtml({ title: `Grille observation — ${data.formationTitre}`, bodyHtml: body });
}
