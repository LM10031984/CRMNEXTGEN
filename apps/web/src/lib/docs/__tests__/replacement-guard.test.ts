import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Lot 0 · 0.2 — LE point de contrôle du remplacement.
 *
 * Ce que ces tests verrouillent, dans l'ordre :
 *  1. le régime GROUPÉ ne remplace jamais un document engagé — pas de
 *     confirmation possible au milieu d'un traitement de masse ;
 *  2. le régime groupé ne se laisse PAS bloquer par le doute, sinon les 1416
 *     documents antérieurs au suivi des envois rendraient toute campagne de
 *     régénération impossible — et la décrue des « non vérifiables » avec ;
 *  3. le régime UNITAIRE laisse une porte, mais tracée : confirmation, puis
 *     motif écrit quand l'engagement est PROUVÉ.
 */

const { getParticipantDocEngagement } = vi.hoisted(() => ({
  getParticipantDocEngagement: vi.fn(),
}));

vi.mock('../document-engagement', async () => {
  const actual = await vi.importActual<typeof import('../document-engagement')>(
    '../document-engagement',
  );
  return { ...actual, getParticipantDocEngagement };
});

import {
  checkDocumentReplacement,
  auditTrailFor,
  MOTIF_MIN_LENGTH,
} from '../replacement-guard';

const BASE = { tenantId: 't1', participantId: 'p1', docType: 'CONVENTION' as const };

function engagement(level: 'FREE' | 'MAYBE_SENT' | 'ENGAGED', reasons: string[] = []) {
  getParticipantDocEngagement.mockResolvedValue({
    documentId: 'doc-1',
    engagement: { level, reasons },
  });
}

beforeEach(() => {
  getParticipantDocEngagement.mockReset();
});

describe('aucun document à protéger', () => {
  it('laisse passer les deux régimes', async () => {
    getParticipantDocEngagement.mockResolvedValue(null);
    for (const mode of ['unitaire', 'groupe'] as const) {
      const v = await checkDocumentReplacement({ ...BASE, mode });
      expect(v.allowed).toBe(true);
      if (v.allowed) expect(v.documentId).toBeNull();
    }
  });
});

describe('régime groupé — strict, et seulement sur l’engagement prouvé', () => {
  it('refuse de remplacer un document engagé, sans échappatoire', async () => {
    engagement('ENGAGED', ['envoyé par email le 21 septembre 2026']);
    const v = await checkDocumentReplacement({ ...BASE, mode: 'groupe' });
    expect(v.allowed).toBe(false);
    if (!v.allowed) {
      expect(v.refusal).toBe('engage_chemin_groupe');
      expect(v.warning).toContain('envoyé par email');
      expect(v.warning).toContain('avenant');
    }
  });

  it('la confirmation ne rouvre PAS la porte en groupé', async () => {
    engagement('ENGAGED', ['convention marquée signée sur l’inscription']);
    const v = await checkDocumentReplacement({
      ...BASE,
      mode: 'groupe',
      confirmEngaged: true,
      motif: 'un motif parfaitement valable',
    });
    expect(v.allowed).toBe(false);
  });

  it('laisse passer le DOUTE — sinon plus aucune campagne n’est possible', async () => {
    engagement('MAYBE_SENT', ['produit avant le suivi des envois']);
    const v = await checkDocumentReplacement({ ...BASE, mode: 'groupe' });
    expect(v.allowed).toBe(true);
  });

  it('laisse passer un document libre', async () => {
    engagement('FREE');
    const v = await checkDocumentReplacement({ ...BASE, mode: 'groupe' });
    expect(v.allowed).toBe(true);
  });
});

describe('régime unitaire — une porte, mais tracée', () => {
  it('premier appel sur un document engagé : confirmation demandée', async () => {
    engagement('ENGAGED', ['parti dans un dossier financeur']);
    const v = await checkDocumentReplacement({ ...BASE, mode: 'unitaire' });
    expect(v.allowed).toBe(false);
    if (!v.allowed) {
      expect(v.refusal).toBe('confirmation_requise');
      expect(v.warning).toContain('dossier financeur');
    }
  });

  it('confirmé mais sans motif sur un engagement PROUVÉ : refusé', async () => {
    engagement('ENGAGED', ['convention marquée signée sur l’inscription']);
    const v = await checkDocumentReplacement({
      ...BASE,
      mode: 'unitaire',
      confirmEngaged: true,
    });
    expect(v.allowed).toBe(false);
    if (!v.allowed) {
      expect(v.refusal).toBe('motif_requis');
      expect(v.warning).toContain(String(MOTIF_MIN_LENGTH));
    }
  });

  it('un motif trop court ne passe pas pour un motif', async () => {
    engagement('ENGAGED', ['signée']);
    const v = await checkDocumentReplacement({
      ...BASE,
      mode: 'unitaire',
      confirmEngaged: true,
      motif: '   ok   ',
    });
    expect(v.allowed).toBe(false);
  });

  it('confirmé avec motif : la porte s’ouvre et le motif est retenu', async () => {
    engagement('ENGAGED', ['envoyé par email']);
    const v = await checkDocumentReplacement({
      ...BASE,
      mode: 'unitaire',
      confirmEngaged: true,
      motif: 'avenant signé le 03/09, montant corrigé',
    });
    expect(v.allowed).toBe(true);
    if (v.allowed) expect(v.motif).toBe('avenant signé le 03/09, montant corrigé');
  });

  it('le DOUTE demande une confirmation, pas un motif', async () => {
    // Sans quoi la décrue des « non vérifiables » exigerait 1416 motifs écrits.
    engagement('MAYBE_SENT', ['produit avant le suivi des envois']);
    const premier = await checkDocumentReplacement({ ...BASE, mode: 'unitaire' });
    expect(premier.allowed).toBe(false);
    if (!premier.allowed) expect(premier.refusal).toBe('confirmation_requise');

    const second = await checkDocumentReplacement({
      ...BASE,
      mode: 'unitaire',
      confirmEngaged: true,
    });
    expect(second.allowed).toBe(true);
  });

  it('un document libre ne demande rien du tout', async () => {
    engagement('FREE');
    const v = await checkDocumentReplacement({ ...BASE, mode: 'unitaire' });
    expect(v.allowed).toBe(true);
  });

  it('la formulation distingue supprimer de régénérer', async () => {
    engagement('ENGAGED', ['envoyé par email']);
    const regen = await checkDocumentReplacement({ ...BASE, mode: 'unitaire', action: 'regenerate' });
    const del = await checkDocumentReplacement({ ...BASE, mode: 'unitaire', action: 'delete' });
    expect(regen.allowed).toBe(false);
    expect(del.allowed).toBe(false);
    if (!regen.allowed && !del.allowed) expect(regen.warning).not.toBe(del.warning);
  });
});

describe('ce qui part dans l’AuditLog', () => {
  it('rien pour un document libre', async () => {
    engagement('FREE');
    const v = await checkDocumentReplacement({ ...BASE, mode: 'unitaire' });
    expect(auditTrailFor(v)).toEqual({});
  });

  it('le niveau, les motifs d’engagement et la raison écrite', async () => {
    engagement('ENGAGED', ['envoyé par email le 21 septembre 2026']);
    const v = await checkDocumentReplacement({
      ...BASE,
      mode: 'unitaire',
      confirmEngaged: true,
      motif: 'avenant signé, montant corrigé',
    });
    expect(auditTrailFor(v)).toEqual({
      confirmedOverEngagement: true,
      engagementLevel: 'ENGAGED',
      engagementReasons: ['envoyé par email le 21 septembre 2026'],
      motif: 'avenant signé, montant corrigé',
    });
  });

  it('sur le doute : tracé aussi, mais sans motif', async () => {
    engagement('MAYBE_SENT', ['produit avant le suivi des envois']);
    const v = await checkDocumentReplacement({
      ...BASE,
      mode: 'unitaire',
      confirmEngaged: true,
    });
    const trail = auditTrailFor(v);
    expect(trail.confirmedOverEngagement).toBe(true);
    expect(trail.engagementLevel).toBe('MAYBE_SENT');
    expect(trail.motif).toBeUndefined();
  });
});
