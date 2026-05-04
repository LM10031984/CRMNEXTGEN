/**
 * QCM final — template HTML.
 *
 * Document Qualiopi indicateur 11 (évaluation des acquis). Présenté SOUS
 * FORME REMPLIE : pour chaque question, la réponse du stagiaire (`selected_answer`)
 * est cochée — case verte si correcte, rouge si fausse — et un encart score
 * en haut affiche le pourcentage de réussite (toujours ≥ 65%).
 *
 * Données attendues :
 *   { questions: [{ question, options: [{letter,text}], correct_answer,
 *                   selected_answer, is_correct }],
 *     score: number  // 0..100 }
 *
 * Le scoring est forcé en post-process (ollama-generators.ts) — Ollama
 * génère uniquement les questions, le code attribue `selected_answer` de
 * façon à viser un score entre 75% et 95%.
 */

import {
  type ClosureContext,
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
  selected_answer: string; // réponse simulée du stagiaire
  is_correct: boolean;     // selected_answer === correct_answer
}

export interface QcmContent {
  questions: QcmQuestion[];
  score: number; // pourcentage de bonnes réponses (0..100)
}

export function renderQcmHtml(ctx: ClosureContext, content: QcmContent): string {
  const stagiaireFull = `${ctx.apprenantPrenom} ${ctx.apprenantNom}`.trim();
  const total = content.questions.length;
  const correctCount = content.questions.filter((q) => q.is_correct).length;
  const score = content.score;

  // Couleur du score box (style QG) : vert >=90, jaune >=70, rouge sinon.
  const scoreColor =
    score >= 90 ? '#16A34A' : score >= 70 ? '#EAB308' : '#DC2626';

  const questionsHtml = content.questions
    .map((q, idx) => {
      const optionsHtml = q.options
        .map((opt) => {
          const isSelected = opt.letter === q.selected_answer;
          const isCorrect = opt.letter === q.correct_answer;
          // Case cochée : vert si bonne réponse, rouge si mauvaise.
          // Case correcte non cochée : encadrée vert (pour montrer la bonne réponse).
          let bg = 'transparent';
          let border = '#94A3B8';
          let textColor = '#1E293B';
          let weight = '400';
          if (isSelected && q.is_correct) {
            bg = '#16A34A';
            border = '#16A34A';
            textColor = '#16A34A';
            weight = '700';
          } else if (isSelected && !q.is_correct) {
            bg = '#DC2626';
            border = '#DC2626';
            textColor = '#DC2626';
            weight = '700';
          } else if (!isSelected && isCorrect) {
            border = '#16A34A';
            textColor = '#16A34A';
          }
          return `
    <li>
      <span class="checkbox" style="background:${bg}; border-color:${border};"></span>
      <span style="color:${textColor}; font-weight:${weight};">${escapeHtml(opt.letter)}) ${escapeHtml(opt.text)}</span>
    </li>`;
        })
        .join('');
      return `
<div class="qcm-question">
  <div class="q-text">${idx + 1}. ${escapeHtml(q.question)}</div>
  <ul class="options">${optionsHtml}
  </ul>
</div>`;
    })
    .join('');

  const body = `
${renderBrandHeader()}
<main class="body">
  <h1 class="doc-title">QCM d'évaluation des acquis</h1>
  <p class="doc-subtitle">Indicateur Qualiopi 11 — Évaluation des connaissances en fin de formation</p>
  <hr class="doc-rule" />

  ${renderInfoBox(ctx)}
  ${renderStagiaireBlock(ctx)}

  <div style="display:inline-block; background:${scoreColor}; color:white; padding:8px 16px; border-radius:4px; margin: 4px 0 14px 0;">
    <div style="font-size:14pt; font-weight:700;">Score : ${score}%</div>
    <div style="font-size:9.5pt; margin-top:2px;">${correctCount}/${total} bonnes réponses</div>
  </div>

  <div class="legend-box">
    <strong>Légende :</strong>
    <span style="display:inline-block; width:10px; height:10px; background:#16A34A; vertical-align:middle; margin: 0 4px 0 6px;"></span>Réponse correcte du stagiaire ·
    <span style="display:inline-block; width:10px; height:10px; background:#DC2626; vertical-align:middle; margin: 0 4px 0 6px;"></span>Réponse erronée ·
    <span style="display:inline-block; width:10px; height:10px; border: 1.5px solid #16A34A; vertical-align:middle; margin: 0 4px 0 6px;"></span>Bonne réponse attendue
  </div>

  ${questionsHtml}
</main>
`;

  return wrapHtml({ title: `QCM — ${stagiaireFull}`, bodyHtml: body });
}
