/**
 * Renderer "mock" pour Day 1 — produit un PDF "Lorem ipsum" valide via Gotenberg.
 *
 * Day 2 remplacera cet adapter par 5 generators réels (un par kind).
 * Day 3 branchera Ollama pour les 3 docs IA-assistés.
 */

import { renderHtmlToPdf } from '@/lib/pdf-render';
import type { ClosureRenderResult, ClosureJobPayload } from './types';
import { CLOSURE_DOC_KIND_LABELS } from './types';

interface MockContext {
  participantFullName: string;
  sessionCode: string;
  sessionTitle: string;
}

export async function renderMockClosureDoc(
  payload: ClosureJobPayload,
  ctx: MockContext,
): Promise<ClosureRenderResult> {
  const label = CLOSURE_DOC_KIND_LABELS[payload.kind];
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>${label} — ${escapeHtml(ctx.participantFullName)}</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 40px; color: #1F2937; }
    h1 { color: #00527A; font-size: 22pt; margin-bottom: 8px; }
    .label { color: #00B4E6; text-transform: uppercase; font-size: 10pt; letter-spacing: 2px; }
    .meta { margin-top: 30px; padding: 14px 20px; border-left: 4px solid #00B4E6; background: #F0F9FF; }
    .meta div { margin: 4px 0; font-size: 11pt; }
    .meta strong { color: #00527A; }
    .filler { margin-top: 40px; line-height: 1.7; color: #475569; font-size: 10pt; }
    footer { margin-top: 80px; font-size: 9pt; color: #94A3B8; border-top: 1px solid #CBD5E1; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="label">[MOCK — palier 4 Day 1]</div>
  <h1>${escapeHtml(label)}</h1>

  <div class="meta">
    <div><strong>Apprenant :</strong> ${escapeHtml(ctx.participantFullName)}</div>
    <div><strong>Session :</strong> ${escapeHtml(ctx.sessionCode)} — ${escapeHtml(ctx.sessionTitle)}</div>
    <div><strong>Job ID :</strong> ${escapeHtml(payload.jobId)}</div>
    <div><strong>Batch ID :</strong> ${escapeHtml(payload.batchId)}</div>
  </div>

  <div class="filler">
    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Document généré
    par le worker BullMQ de QualiOF en mode mock. Le contenu réel sera
    produit par les templates HTML+Gotenberg (Day 2) et les prompts Ollama
    (Day 3).
  </div>

  <footer>
    QualiOF — pack fin de formation (palier 4) — généré le ${new Date().toLocaleString('fr-FR')}
  </footer>
</body>
</html>`;
  const pdfBuffer = await renderHtmlToPdf(html, `mock-${payload.kind}.html`);
  return { pdfBuffer, rawJson: { mock: true, kind: payload.kind } };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
