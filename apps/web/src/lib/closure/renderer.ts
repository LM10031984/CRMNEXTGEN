/**
 * Dispatch principal des 5 templates HTML→PDF du pack fin de formation.
 *
 * Day 2 : utilise les stubs de `stub-content.ts` pour QCM/GRILLE_OBS/ANALYSE_BESOIN.
 * Day 3 : remplacera ces stubs par des appels Ollama (génération JSON
 * structurée → templates HTML existants → Gotenberg).
 */

import { renderHtmlToPdf } from '@/lib/pdf-render';
import type { ClosureDocKind, ClosureRenderResult } from './types';
import type { ClosureContext } from './shared-template';
import { renderAttestationHtml } from './attestation-template';
import { renderCertificatHtml } from './certificat-template';
import { renderQcmHtml } from './qcm-template';
import { renderGrilleObservationHtml } from './grille-observation-template';
import { renderAnalyseBesoinHtml } from './analyse-besoin-template';
import {
  stubAnalyseBesoinContent,
  stubGrilleContent,
  stubQcmContent,
} from './stub-content';

export async function renderClosureDoc(
  kind: ClosureDocKind,
  ctx: ClosureContext,
): Promise<ClosureRenderResult> {
  switch (kind) {
    case 'ATTESTATION': {
      const html = renderAttestationHtml(ctx);
      const pdfBuffer = await renderHtmlToPdf(html, 'attestation.html');
      return { pdfBuffer };
    }
    case 'CERTIFICAT': {
      const html = renderCertificatHtml(ctx);
      const pdfBuffer = await renderHtmlToPdf(html, 'certificat.html');
      return { pdfBuffer };
    }
    case 'QCM': {
      const content = stubQcmContent(ctx);
      const html = renderQcmHtml(ctx, content);
      const pdfBuffer = await renderHtmlToPdf(html, 'qcm.html');
      return { pdfBuffer, rawJson: content };
    }
    case 'GRILLE_OBS': {
      const content = stubGrilleContent(ctx);
      const html = renderGrilleObservationHtml(ctx, content);
      const pdfBuffer = await renderHtmlToPdf(html, 'grille-observation.html');
      return { pdfBuffer, rawJson: content };
    }
    case 'ANALYSE_BESOIN': {
      const content = stubAnalyseBesoinContent(ctx);
      const html = renderAnalyseBesoinHtml(ctx, content);
      const pdfBuffer = await renderHtmlToPdf(html, 'analyse-besoin.html');
      return { pdfBuffer, rawJson: content };
    }
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Kind non supporté : ${_exhaustive}`);
    }
  }
}
