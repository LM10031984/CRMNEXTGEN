/**
 * Dispatch principal des 5 templates HTML→PDF du pack fin de formation.
 *
 * QCM/GRILLE_OBS/ANALYSE_BESOIN passent par Mistral via les generators
 * de `mistral-generators.ts`. Si Mistral échoue (timeout, JSON invalide,
 * quota), on fallback sur les stubs — le doc reste produit, mais
 * le `rawJson` est marqué `{ source: 'stub' }` pour qu'on puisse régénérer
 * plus tard.
 */

import { prisma } from '@qualiof/db';
import { renderHtmlToPdfWeasy } from '@/lib/pdf-render';
import type { ClosureDocKind, ClosureRenderResult } from './types';
import type { ClosureContext } from './shared-template';
import { renderAttestationHtml } from './attestation-template';
import { renderCertificatHtml } from './certificat-template';
import { renderQcmHtml, type QcmContent, type QcmQuestion } from './qcm-template';
import { renderGrilleObservationHtml, type GrilleContent } from './grille-observation-template';
import { renderAnalyseBesoinHtml, type AnalyseBesoinContent } from './analyse-besoin-template';
import { renderEmargementHtml } from './emargement-template';
import { renderPositionnementHtml } from './positionnement-template';
import { renderSatisfactionChaudHtml } from './satisfaction-chaud-template';
import { renderSatisfactionFroidHtml } from './satisfaction-froid-template';
import { renderDerouleHtml } from './deroule-template';
import {
  stubAnalyseBesoinContent,
  stubGrilleContent,
  stubQcmContent,
  stubPositionnementContent,
  stubSatisfactionChaudContent,
  stubSatisfactionFroidContent,
  stubDerouleContent,
} from './stub-content';
import {
  generateAnalyseBesoinContent,
  generateDerouleContent,
  generateGrilleContent,
  generatePositionnementContent,
  generateQcmContent,
  generateSatisfactionChaudContent,
  generateSatisfactionFroidContent,
  attachQcmScoring,
  type FormationCtx,
  type StagiaireCtx,
} from './mistral-generators';

const USE_MISTRAL = process.env.CLOSURE_USE_MISTRAL !== '0';

function buildFormationCtx(ctx: ClosureContext): FormationCtx {
  return {
    titre: ctx.sessionTitle,
    programmeMd: ctx.formationMeta?.programmeMd ?? '',
    nombreHeures: ctx.durationHours,
  };
}

/**
 * Cherche un QCM déjà généré pour cette session (n'importe quel participant).
 * Si trouvé, on en extrait les questions de référence (en strippant les
 * selected_answer/is_correct du précédent stagiaire) pour les réutiliser
 * sur le stagiaire courant avec un scoring propre.
 *
 * Retourne null si aucun QCM n'existe encore pour la session — l'appelant
 * doit alors générer un nouveau QCM via Mistral.
 */
async function loadSessionQcm(sessionId: string): Promise<{ questions: Omit<QcmQuestion, 'selected_answer' | 'is_correct'>[] } | null> {
  if (!sessionId || sessionId === 'mock-session-id') return null;
  const existing = await prisma.pedagogicalAsset.findFirst({
    where: { sessionId, kind: 'QCM' },
    select: { rawJson: true },
    orderBy: { generatedAt: 'asc' },
  });
  const raw = existing?.rawJson as { questions?: { question: string; options: { letter: string; text: string }[]; correct_answer: string }[] } | null | undefined;
  if (!raw?.questions || raw.questions.length < 5) return null;
  // On ne garde QUE les champs partagés (question + options + correct_answer).
  // Les selected_answer/is_correct/score étaient propres au stagiaire précédent.
  const stripped = raw.questions.map((q) => ({
    question: q.question,
    options: q.options,
    correct_answer: q.correct_answer,
  }));
  return { questions: stripped };
}

/**
 * Cherche un déroulé pédagogique déjà généré pour cette session.
 * Le déroulé est PARTAGÉ : tous les stagiaires d'une formation reçoivent
 * le même document (1 seul déroulé par produit/session).
 */
async function loadSessionDeroule(sessionId: string): Promise<{ jours: { theme: string; sequences: { duree: string; objectifs: string; contenu: string; outils: string; exercice: string; evaluation: string }[] }[] } | null> {
  if (!sessionId || sessionId === 'mock-session-id') return null;
  const existing = await prisma.pedagogicalAsset.findFirst({
    where: { sessionId, kind: 'DEROULE' },
    select: { rawJson: true },
    orderBy: { generatedAt: 'asc' },
  });
  const raw = existing?.rawJson as { jours?: unknown[] } | null | undefined;
  if (!raw?.jours || !Array.isArray(raw.jours) || raw.jours.length === 0) return null;
  return raw as { jours: { theme: string; sequences: { duree: string; objectifs: string; contenu: string; outils: string; exercice: string; evaluation: string }[] }[] };
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
      const pdfBuffer = await renderHtmlToPdfWeasy(html);
      return { pdfBuffer };
    }
    case 'CERTIFICAT': {
      const html = renderCertificatHtml(ctx);
      const pdfBuffer = await renderHtmlToPdfWeasy(html);
      return { pdfBuffer };
    }
    case 'QCM': {
      // Règle métier : 1 SEUL QCM par session (mêmes questions+correct_answer
      // pour tous les stagiaires), seul le scoring (selected_answer/score) varie.
      // On cherche d'abord un QCM déjà généré pour la session ; sinon on en
      // génère un nouveau via Mistral.
      const existingQcm = await loadSessionQcm(ctx.sessionId);
      let content: QcmContent;
      let source: 'mistral' | 'stub' | 'shared' = 'stub';

      if (existingQcm) {
        // Réutilisation des questions, scoring spécifique à ce stagiaire.
        content = attachQcmScoring(existingQcm.questions);
        source = 'shared';
      } else if (USE_MISTRAL) {
        const ai = await generateQcmContent(buildFormationCtx(ctx), 'PedagogicalAsset', null, ctx.tenantId ?? null);
        if (ai) {
          content = ai;
          source = 'mistral';
        } else {
          content = stubQcmContent(ctx);
        }
      } else {
        content = stubQcmContent(ctx);
      }
      const html = renderQcmHtml(ctx, content);
      const pdfBuffer = await renderHtmlToPdfWeasy(html);
      return { pdfBuffer, rawJson: { source, ...content }, usedStub: source === 'stub' };
    }
    case 'GRILLE_OBS': {
      let content: GrilleContent;
      let source: 'mistral' | 'stub' = 'stub';
      if (USE_MISTRAL) {
        const ai = await generateGrilleContent(buildFormationCtx(ctx), buildStagiaireCtx(ctx), 'PedagogicalAsset', null, ctx.tenantId ?? null);
        if (ai) {
          content = ai;
          source = 'mistral';
        } else {
          content = stubGrilleContent(ctx);
        }
      } else {
        content = stubGrilleContent(ctx);
      }
      const html = renderGrilleObservationHtml(ctx, content);
      const pdfBuffer = await renderHtmlToPdfWeasy(html);
      return { pdfBuffer, rawJson: { source, ...content }, usedStub: source === 'stub' };
    }
    case 'ANALYSE_BESOIN': {
      let content: AnalyseBesoinContent;
      let source: 'mistral' | 'stub' = 'stub';
      if (USE_MISTRAL) {
        const ai = await generateAnalyseBesoinContent(buildFormationCtx(ctx), buildStagiaireCtx(ctx), 'PedagogicalAsset', null, ctx.tenantId ?? null);
        if (ai) {
          content = ai;
          source = 'mistral';
        } else {
          content = stubAnalyseBesoinContent(ctx);
        }
      } else {
        content = stubAnalyseBesoinContent(ctx);
      }
      const html = renderAnalyseBesoinHtml(ctx, content);
      const pdfBuffer = await renderHtmlToPdfWeasy(html);
      return { pdfBuffer, rawJson: { source, ...content }, usedStub: source === 'stub' };
    }
    case 'POSITIONNEMENT': {
      let content;
      let source: 'mistral' | 'stub' = 'stub';
      if (USE_MISTRAL) {
        const ai = await generatePositionnementContent(buildFormationCtx(ctx), buildStagiaireCtx(ctx), 'PedagogicalAsset', null, ctx.tenantId ?? null);
        if (ai) {
          content = ai;
          source = 'mistral';
        } else {
          content = stubPositionnementContent(ctx);
        }
      } else {
        content = stubPositionnementContent(ctx);
      }
      const html = renderPositionnementHtml(ctx, content);
      const pdfBuffer = await renderHtmlToPdfWeasy(html);
      return { pdfBuffer, rawJson: { source, ...content }, usedStub: source === 'stub' };
    }
    case 'SATISFACTION_CHAUD': {
      let content;
      let source: 'mistral' | 'stub' = 'stub';
      if (USE_MISTRAL) {
        const ai = await generateSatisfactionChaudContent(buildFormationCtx(ctx), buildStagiaireCtx(ctx), 'PedagogicalAsset', null, ctx.tenantId ?? null);
        if (ai) {
          content = ai;
          source = 'mistral';
        } else {
          content = stubSatisfactionChaudContent(ctx);
        }
      } else {
        content = stubSatisfactionChaudContent(ctx);
      }
      const html = renderSatisfactionChaudHtml(ctx, content);
      const pdfBuffer = await renderHtmlToPdfWeasy(html);
      return { pdfBuffer, rawJson: { source, ...content }, usedStub: source === 'stub' };
    }
    case 'SATISFACTION_FROID': {
      let content;
      let source: 'mistral' | 'stub' = 'stub';
      if (USE_MISTRAL) {
        const ai = await generateSatisfactionFroidContent(buildFormationCtx(ctx), buildStagiaireCtx(ctx), 'PedagogicalAsset', null, ctx.tenantId ?? null);
        if (ai) {
          content = ai;
          source = 'mistral';
        } else {
          content = stubSatisfactionFroidContent(ctx);
        }
      } else {
        content = stubSatisfactionFroidContent(ctx);
      }
      const html = renderSatisfactionFroidHtml(ctx, content);
      const pdfBuffer = await renderHtmlToPdfWeasy(html);
      return { pdfBuffer, rawJson: { source, ...content }, usedStub: source === 'stub' };
    }
    case 'DEROULE_PEDA': {
      // Partagé par session : 1) si un déroulé existe déjà pour la session
      // → on le réutilise. 2) Sinon Mistral. 3) Sinon stub.
      const existing = await loadSessionDeroule(ctx.sessionId);
      let content;
      let source: 'shared' | 'mistral' | 'stub' = 'stub';
      if (existing) {
        content = existing;
        source = 'shared';
      } else if (USE_MISTRAL) {
        const ai = await generateDerouleContent(buildFormationCtx(ctx), 'PedagogicalAsset', null, ctx.tenantId ?? null);
        if (ai) {
          content = ai;
          source = 'mistral';
        } else {
          content = stubDerouleContent(ctx);
        }
      } else {
        content = stubDerouleContent(ctx);
      }
      const html = renderDerouleHtml(ctx, content);
      const pdfBuffer = await renderHtmlToPdfWeasy(html);
      return { pdfBuffer, rawJson: { source, ...content }, usedStub: source === 'stub' };
    }
    case 'EMARGEMENT': {
      const html = renderEmargementHtml(ctx);
      const pdfBuffer = await renderHtmlToPdfWeasy(html);
      return { pdfBuffer, rawJson: { source: 'static' }, usedStub: false };
    }
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Kind non supporté : ${_exhaustive}`);
    }
  }
}
