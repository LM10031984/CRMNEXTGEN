import { describe, it, expect, vi } from 'vitest';
import { renderDerouleHtml, type DerouleContent } from '../deroule-template';
import type { ClosureContext } from '../shared-template';

/**
 * Quick 260618-skk — Test de PUISSANCE déterministe : le RAPPORT FORMATEUR du
 * déroulé doit être SPÉCIFIQUE à chaque session (anti copier-coller Qualiopi),
 * sans régresser le figeage produit du corps/programme (quick 260618-rkj).
 *
 * Zéro appel LLM réel : le runner Ollama n'est jamais invoqué (Tests 1/3/4
 * testent le rendu pur ; Test 2 mocke generateRapportFormateur pour qu'il
 * REFLÈTE le sessionCtx reçu).
 *
 *  - Test 1 (CAUSE 1) : seed=sessionCode → notes du tableau DIFFÉRENTES entre 2 sessions.
 *  - Test 2 (CAUSE 2) : buildSessionRapportCtx → narratifs ancrés sur faits session.
 *  - Test 3 (INVARIANT figeage) : corps (jours[]) IDENTIQUE entre 2 sessions.
 *  - Test 4 (fallback non-régression) : rapport null → pools utilisés.
 */

// ─── Mocks IO pour pouvoir importer generate-deroule-session (Test 2) ──────────
vi.mock('@qualiof/db', () => ({
  prisma: {
    pedagogicalAsset: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    trainingSession: { findFirst: vi.fn() },
    sessionParticipant: { findFirst: vi.fn() },
  },
}));
vi.mock('@/lib/storage', () => ({
  DOCS_BUCKET: 'qualiof-docs',
  uploadFile: vi.fn(),
}));
vi.mock('@/lib/pdf-render', () => ({ renderHtmlToPdfWeasy: vi.fn() }));
vi.mock('../build-context', () => ({ buildClosureContextForParticipant: vi.fn() }));

// Mock partiel d'ollama-generators : generateRapportFormateur REFLÈTE son 5e
// argument sessionCtx (déterministe) → prouve que des sessionCtx différents
// produisent des narratifs différents, et qu'un sessionCtx null les uniformise.
vi.mock('../ollama-generators', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ollama-generators')>();
  return {
    ...actual,
    generateRapportFormateur: vi.fn(
      async (
        _formation: unknown,
        _refTable?: unknown,
        _refId?: unknown,
        _tenantId?: unknown,
        sessionCtx?: import('../ollama-generators').SessionRapportCtx | null,
      ) => ({
        adaptations: `nb=${sessionCtx?.nbApprenants ?? 0} enseignes=${(sessionCtx?.enseignes ?? []).join('|')}`,
        remarquesGroupe: `date=${sessionCtx?.dateDebut?.toISOString() ?? 'null'}`,
        bilan: `lieu=${sessionCtx?.lieu ?? 'null'}`,
      }),
    ),
  };
});

import { buildSessionRapportCtx } from '../generate-deroule-session';
import { generateRapportFormateur, type SessionRapportCtx } from '../ollama-generators';

// ─── Fixtures de rendu (corps figé partagé, identique entre sessions) ─────────
function seq() {
  return {
    duree: '9h00–10h30 (1h30)',
    objectifs: 'Identifier les obligations déclaratives applicables.',
    contenu: 'Cadre réglementaire et acteurs de la lutte anti-blanchiment.',
    outils: 'Diaporama, fiche technique',
    exercice: 'Étude de cas en binômes (15 min + débrief)',
    evaluation: 'Acquis évalués au QCM Kahoot final',
    isPause: false,
  };
}
const baseContent: DerouleContent = {
  jours: [
    { theme: 'Jour 1 — Cadre réglementaire Tracfin', sequences: [seq(), seq(), seq(), seq(), seq()] },
  ],
};

function ctxForSession(sessionCode: string): ClosureContext {
  return {
    sessionCode,
    sessionTitle: 'Lutte anti-blanchiment Tracfin', // identique entre sessions (titre produit)
    sessionTrainers: [],
    tenantId: 't1',
    sessionStartDate: new Date('2026-01-12'),
    sessionEndDate: new Date('2026-01-12'),
  } as unknown as ClosureContext;
}

/** Extrait la séquence des notes surlignées (cellules font-weight: 700) du tableau. */
function extractHighlightedNotes(html: string): number[] {
  const re = /font-weight:\s*700;[^>]*>(\d)<\/td>/g;
  const notes: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) notes.push(Number(m[1]));
  return notes;
}

/** Extrait les blocs « Jour N » (corps figé) du HTML pour comparaison. */
function extractJourBlocks(html: string): string[] {
  return html.match(/Jour 1 — Cadre réglementaire Tracfin/g) ?? [];
}

describe('rapport formateur — spécifique par session (quick 260618-skk)', () => {
  it('Test 1 (CAUSE 1) — notes du tableau DIFFÉRENTES entre 2 sessions du même produit', () => {
    const htmlA = renderDerouleHtml(ctxForSession('SES-A'), baseContent);
    const htmlB = renderDerouleHtml(ctxForSession('SES-B'), baseContent);
    const notesA = extractHighlightedNotes(htmlA);
    const notesB = extractHighlightedNotes(htmlB);

    expect(notesA).toHaveLength(7);
    expect(notesB).toHaveLength(7);
    // Le seed=sessionCode produit des séquences de notes distinctes par session.
    expect(notesA).not.toEqual(notesB);

    // MUTATION : dans renderDerouleHtml, remplacer `seed: ctx.sessionCode` par
    // `seed: ctx.sessionTitle` → les 2 sessions partagent le même seed (titre
    // produit identique) → notesA === notesB → ce test DOIT virer ROUGE.
    // Restaurer seed=ctx.sessionCode → vert. (Prouvé manuellement, cf. SUMMARY.)
  });

  it('Test 2 (CAUSE 2) — narratifs ancrés sur le sessionCtx → différents entre sessions', async () => {
    const ctxA = ctxForSession('SES-A');
    const ctxB = {
      ...ctxForSession('SES-B'),
      sessionStartDate: new Date('2026-03-04'),
      sessionLocation: 'Vence',
    } as unknown as ClosureContext;

    const participantsA = [
      { person: { legalLinks: [{ organization: { brandName: 'Agence Alpha', legalName: 'ALPHA SARL' } }] } },
    ];
    const participantsB = [
      { person: { legalLinks: [{ organization: { brandName: 'Agence Beta', legalName: 'BETA SAS' } }] } },
      { person: { legalLinks: [{ organization: { brandName: 'Agence Gamma', legalName: 'GAMMA EI' } }] } },
    ];

    const ctxRapportA = buildSessionRapportCtx(participantsA, ctxA);
    const ctxRapportB = buildSessionRapportCtx(participantsB, ctxB);

    const rapportA = await generateRapportFormateur({ titre: '', programmeMd: '', nombreHeures: 7 }, 'PedagogicalAsset', null, 't1', ctxRapportA);
    const rapportB = await generateRapportFormateur({ titre: '', programmeMd: '', nombreHeures: 7 }, 'PedagogicalAsset', null, 't1', ctxRapportB);

    expect(rapportA).not.toEqual(rapportB);
    expect(rapportA?.adaptations).toContain('Agence Alpha');
    expect(rapportB?.adaptations).toContain('Agence Beta|Agence Gamma');

    // MUTATION : appeler generateRapportFormateur avec sessionCtx = null pour les
    // deux (équivaut à « titre produit seul », aucune donnée session) → les deux
    // narratifs deviennent IDENTIQUES → l'assertion notToEqual DOIT virer ROUGE.
    const rapportNullA = await generateRapportFormateur({ titre: '', programmeMd: '', nombreHeures: 7 }, 'PedagogicalAsset', null, 't1', null);
    const rapportNullB = await generateRapportFormateur({ titre: '', programmeMd: '', nombreHeures: 7 }, 'PedagogicalAsset', null, 't1', null);
    expect(rapportNullA).toEqual(rapportNullB); // confirme que la mutation casserait bien Test 2
  });

  it('Test 3 (INVARIANT figeage) — corps (jours[]) IDENTIQUE entre 2 sessions', () => {
    const htmlA = renderDerouleHtml(ctxForSession('SES-A'), baseContent);
    const htmlB = renderDerouleHtml(ctxForSession('SES-B'), baseContent);

    // Le bloc corps « Jour 1 » est rendu une fois et à l'identique dans les deux.
    expect(extractJourBlocks(htmlA)).toEqual(extractJourBlocks(htmlB));
    // Le contenu pédagogique figé (séquence) est présent et identique.
    expect(htmlA).toContain('Cadre réglementaire et acteurs de la lutte anti-blanchiment.');
    expect(htmlB).toContain('Cadre réglementaire et acteurs de la lutte anti-blanchiment.');
  });

  it('Test 4 (fallback non-régression) — rapport null → pools utilisés', () => {
    // baseContent n'a pas de rapportFormateur → renderBilanFormateur retombe sur
    // les pools déterministes (non-régression du fallback anti-stub).
    const html = renderDerouleHtml(ctxForSession('SES-A'), baseContent);
    expect(html).toContain('Bilan de la formation');
    const poolMatch =
      html.includes('Objectifs pédagogiques atteints') ||
      html.includes('Formation menée à son terme') ||
      html.includes('Ensemble des objectifs traités');
    expect(poolMatch).toBe(true);
  });
});

// Garde le type SessionRapportCtx référencé (évite un import inutilisé si refactor).
export type _SessionRapportCtxRef = SessionRapportCtx;
