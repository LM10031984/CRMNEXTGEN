/**
 * QCM final — template HTML.
 *
 * Document imprimable distribué au stagiaire en fin de formation pour
 * évaluer ses acquis (indicateur Qualiopi 11). Format vierge : checkboxes
 * vides à cocher manuellement, corrigé en page séparée.
 *
 * Données attendues : un JSON `{ questions: [{ question, options: [{letter,text}], correct_answer }] }`
 * produit par Ollama (Day 3) ou par le stub (Day 2).
 */

import {
  type ClosureContext,
  BRAND_DARK,
  escapeHtml,
  renderBrandHeader,
  renderInfoBox,
  renderStagiaireBlock,
  wrapHtml,
} from './shared-template';

export interface QcmQuestion {
  question: string;
  options: { letter: string; text: string }[];
  correct_answer: string; // 'A' | 'B' | 'C' | 'D'
}

export interface QcmContent {
  questions: QcmQuestion[];
}

export function renderQcmHtml(ctx: ClosureContext, content: QcmContent): string {
  const stagiaireFull = `${ctx.apprenantPrenom} ${ctx.apprenantNom}`.trim();
  const total = content.questions.length;

  const questionsHtml = content.questions
    .map(
      (q, idx) => `
<div class="qcm-question">
  <div class="q-num">Question ${idx + 1}</div>
  <div class="q-text">${escapeHtml(q.question)}</div>
  <ul class="options">
    ${q.options
      .map(
        (opt) => `
    <li><span class="checkbox"></span><span><strong>${escapeHtml(opt.letter)}.</strong> ${escapeHtml(opt.text)}</span></li>`,
      )
      .join('')}
  </ul>
</div>`,
    )
    .join('');

  // Corrigé en page séparée (pour l'OF, retiré avant remise au stagiaire)
  const corrigeRows = content.questions
    .map(
      (q, idx) => `
<tr>
  <td style="text-align: center; font-weight: 700; color: ${BRAND_DARK};">${idx + 1}</td>
  <td>${escapeHtml(q.question)}</td>
  <td style="text-align: center; font-weight: 700; color: #16A34A;">${escapeHtml(q.correct_answer)}</td>
</tr>`,
    )
    .join('');

  const body = `
${renderBrandHeader()}
<main class="body">
  <h1 class="doc-title">QCM d'évaluation des acquis</h1>
  <p class="doc-subtitle">Indicateur Qualiopi 11 — Évaluation des connaissances en fin de formation</p>
  <hr class="doc-rule" />

  ${renderInfoBox(ctx)}
  ${renderStagiaireBlock(ctx)}

  <div class="legend-box">
    <strong style="color: ${BRAND_DARK};">Consignes :</strong> Cochez la case correspondant à la bonne réponse pour chaque question. Une seule réponse possible par question. Durée indicative : 20 minutes — ${total} questions.
  </div>

  ${questionsHtml}

  <div style="page-break-before: always;"></div>
  ${renderBrandHeader()}
  <main class="body">
    <h1 class="doc-title">Corrigé du QCM</h1>
    <p class="doc-subtitle">À l'usage exclusif du formateur — ne pas remettre au stagiaire avant correction</p>
    <hr class="doc-rule" />

    <table class="data" style="margin-top: 14px;">
      <thead>
        <tr>
          <th style="width: 14mm; text-align: center;">Q.</th>
          <th>Énoncé</th>
          <th style="width: 22mm; text-align: center;">Réponse</th>
        </tr>
      </thead>
      <tbody>
        ${corrigeRows}
      </tbody>
    </table>
  </main>
</main>
`;

  return wrapHtml({ title: `QCM — ${stagiaireFull}`, bodyHtml: body });
}
