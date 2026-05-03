/**
 * Dispatch principal des 5 templates HTML→PDF du pack fin de formation.
 *
 * Day 3 : QCM/GRILLE_OBS/ANALYSE_BESOIN passent par Ollama via les generators
 * de `ollama-generators.ts`. Si Ollama échoue (timeout, modèle KO, JSON
 * invalide), on fallback sur les stubs Day 2 — le doc reste produit, mais
 * le `rawJson` est marqué `{ source: 'stub' }` pour qu'on puisse régénérer
 * plus tard.
 */

import { renderHtmlToPdf } from '@/lib/pdf-render';
import { renderOfStandardFooterHtml } from '@/lib/of-pdf-footer';
import type { ClosureDocKind, ClosureRenderResult } from './types';
import type { ClosureContext } from './shared-template';
import { renderAttestationHtml } from './attestation-template';
import { renderCertificatHtml } from './certificat-template';
import { renderQcmHtml, type QcmContent } from './qcm-template';
import { renderGrilleObservationHtml, type GrilleContent } from './grille-observation-template';
import { renderAnalyseBesoinHtml, type AnalyseBesoinContent } from './analyse-besoin-template';
import {
  stubAnalyseBesoinContent,
  stubGrilleContent,
  stubQcmContent,
} from './stub-content';
import {
  generateAnalyseBesoinContent,
  generateGrilleContent,
  generateQcmContent,
  type FormationCtx,
  type StagiaireCtx,
} from './ollama-generators';

const USE_OLLAMA = process.env.CLOSURE_USE_OLLAMA !== '0';

function buildFormationCtx(ctx: ClosureContext): FormationCtx {
  return {
    titre: ctx.sessionTitle,
    programmeMd: ctx.formationMeta?.programmeMd ?? '',
    nombreHeures: ctx.durationHours,
  };
}

function buildStagiaireCtx(ctx: ClosureContext): StagiaireCtx {
  return {
    prenom: ctx.apprenantPrenom,
    nom: ctx.apprenantNom,
    entreprise: ctx.stagiaireMeta?.entreprise ?? null,
    fonction: ctx.stagiaireMeta?.fonction ?? null,
    anciennete: ctx.stagiaireMeta?.anciennete ?? null,
    diplomes: ctx.stagiaireMeta?.diplomes ?? null,
    professionalStatus: ctx.stagiaireMeta?.professionalStatus ?? null,
  };
}

export async function renderClosureDoc(
  kind: ClosureDocKind,
  ctx: ClosureContext,
): Promise<ClosureRenderResult> {
  switch (kind) {
    case 'ATTESTATION': {
      const html = renderAttestationHtml(ctx);
      const pdfBuffer = await renderHtmlToPdf(html, { footerHtml: renderOfStandardFooterHtml() });
      return { pdfBuffer };
    }
    case 'CERTIFICAT': {
      const html = renderCertificatHtml(ctx);
      const pdfBuffer = await renderHtmlToPdf(html, { footerHtml: renderOfStandardFooterHtml() });
      return { pdfBuffer };
    }
    case 'QCM': {
      let content: QcmContent;
      let source: 'ollama' | 'stub' = 'stub';
      if (USE_OLLAMA) {
        const ai = await generateQcmContent(buildFormationCtx(ctx), 'PedagogicalAsset', null, ctx.tenantId ?? null);
        if (ai) {
          content = ai;
          source = 'ollama';
        } else {
          content = stubQcmContent(ctx);
        }
      } else {
        content = stubQcmContent(ctx);
      }
      const html = renderQcmHtml(ctx, content);
      const pdfBuffer = await renderHtmlToPdf(html, { footerHtml: renderOfStandardFooterHtml() });
      return { pdfBuffer, rawJson: { source, ...content }, usedStub: source === 'stub' };
    }
    case 'GRILLE_OBS': {
      let content: GrilleContent;
      let source: 'ollama' | 'stub' = 'stub';
      if (USE_OLLAMA) {
        const ai = await generateGrilleContent(buildFormationCtx(ctx), buildStagiaireCtx(ctx), 'PedagogicalAsset', null, ctx.tenantId ?? null);
        if (ai) {
          content = ai;
          source = 'ollama';
        } else {
          content = stubGrilleContent(ctx);
        }
      } else {
        content = stubGrilleContent(ctx);
      }
      const html = renderGrilleObservationHtml(ctx, content);
      const pdfBuffer = await renderHtmlToPdf(html, { footerHtml: renderOfStandardFooterHtml() });
      return { pdfBuffer, rawJson: { source, ...content }, usedStub: source === 'stub' };
    }
    case 'ANALYSE_BESOIN': {
      let content: AnalyseBesoinContent;
      let source: 'ollama' | 'stub' = 'stub';
      if (USE_OLLAMA) {
        const ai = await generateAnalyseBesoinContent(buildFormationCtx(ctx), buildStagiaireCtx(ctx), 'PedagogicalAsset', null, ctx.tenantId ?? null);
        if (ai) {
          content = ai;
          source = 'ollama';
        } else {
          content = stubAnalyseBesoinContent(ctx);
        }
      } else {
        content = stubAnalyseBesoinContent(ctx);
      }
      const html = renderAnalyseBesoinHtml(ctx, content);
      const pdfBuffer = await renderHtmlToPdf(html, { footerHtml: renderOfStandardFooterHtml() });
      return { pdfBuffer, rawJson: { source, ...content }, usedStub: source === 'stub' };
    }
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Kind non supporté : ${_exhaustive}`);
    }
  }
}
