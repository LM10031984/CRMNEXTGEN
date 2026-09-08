import { describe, it, expect } from 'vitest';
import {
  buildLearnerZipEntries,
  buildLearnerZipFilename,
  type LearnerZipInput,
} from '../learner-zip-entries';
import type { UnifiedDoc } from '../resolve-docs';

/**
 * Demande Laurent 2026-09-08 : bouton « télécharger tous les documents » d'un
 * apprenant. Ces tests fixent les trois règles du plan 260908-jjj : version
 * courante seulement, jamais de PII, rien de manquant.
 */

function doc(over: Partial<UnifiedDoc> = {}): UnifiedDoc {
  return {
    sourceTable: 'Document',
    sourceId: 'doc-1',
    docType: 'CERTIFICAT_REALISATION',
    qualiopiIndicator: 'Indicateur 11',
    anchor: { level: 'participant', sessionId: 'ses-1', participantId: 'p-1', personId: 'per-1' },
    generatedAt: new Date('2026-08-03T06:50:00Z'),
    href: '/api/documents/doc-1',
    status: 'present',
    usedStub: false,
    version: 1,
    isCurrent: true,
    ...over,
  } as UnifiedDoc;
}

const BASE: Omit<LearnerZipInput, 'docs'> = {
  firstName: 'Stéphane',
  lastName: 'Rousseau',
  sessionCodeById: new Map([
    ['ses-1', 'SES-0110'],
    ['ses-2', 'SES-0094'],
  ]),
};

describe('buildLearnerZipEntries', () => {
  it('range par code de session et nomme lisiblement', () => {
    const entries = buildLearnerZipEntries({ ...BASE, docs: [doc()] });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.path).toBe(
      'SES-0110/Certificat-de-realisation-Stephane-ROUSSEAU-SES-0110.pdf',
    );
  });

  it('exclut les versions non courantes', () => {
    const entries = buildLearnerZipEntries({
      ...BASE,
      docs: [doc({ sourceId: 'v1', version: 1, isCurrent: false }), doc({ sourceId: 'v2', version: 2 })],
    });
    expect(entries.map((e) => e.sourceId)).toEqual(['v2']);
  });

  it("n'embarque JAMAIS une pièce sans href (garde-fou RGPD : CNI, RIB, CFP)", () => {
    const entries = buildLearnerZipEntries({
      ...BASE,
      docs: [
        doc({ sourceId: 'cni', docType: 'CNI', sourceTable: 'SensitiveData', href: null }),
        doc({ sourceId: 'rib', docType: 'RIB', sourceTable: 'Person', href: null }),
        doc({ sourceId: 'ok' }),
      ],
    });
    expect(entries.map((e) => e.sourceId)).toEqual(['ok']);
  });

  it('écarte les documents manquants mais garde les stubs (en les signalant)', () => {
    const entries = buildLearnerZipEntries({
      ...BASE,
      docs: [
        doc({ sourceId: 'absent', status: 'missing' }),
        doc({ sourceId: 'generique', status: 'stub', usedStub: true, docType: 'QCM' }),
      ],
    });
    expect(entries.map((e) => e.sourceId)).toEqual(['generique']);
    expect(entries[0]!.usedStub).toBe(true);
  });

  it('dédoublonne les chemins identiques au lieu de perdre un fichier', () => {
    const entries = buildLearnerZipEntries({
      ...BASE,
      docs: [doc({ sourceId: 'a' }), doc({ sourceId: 'b' }), doc({ sourceId: 'c' })],
    });
    expect(entries.map((e) => e.path)).toEqual([
      'SES-0110/Certificat-de-realisation-Stephane-ROUSSEAU-SES-0110.pdf',
      'SES-0110/Certificat-de-realisation-Stephane-ROUSSEAU-SES-0110-2.pdf',
      'SES-0110/Certificat-de-realisation-Stephane-ROUSSEAU-SES-0110-3.pdf',
    ]);
  });

  it('range sous « Hors-session » ce qui n’est rattaché à aucune session connue', () => {
    const entries = buildLearnerZipEntries({
      ...BASE,
      docs: [
        doc({
          sourceId: 'cgv',
          docType: 'CGV',
          anchor: { level: 'tenant', tenantId: 't-1' },
          href: '/api/documents/cgv',
        }),
      ],
    });
    expect(entries[0]!.path).toBe('Hors-session/Conditions-generales-de-vente-Stephane-ROUSSEAU.pdf');
  });

  it('trie par dossier puis par type — deux archives se comparent à l’œil', () => {
    const entries = buildLearnerZipEntries({
      ...BASE,
      docs: [
        doc({ sourceId: '1', docType: 'CONVENTION', anchor: { level: 'participant', sessionId: 'ses-2', participantId: 'p', personId: 'per-1' } }),
        doc({ sourceId: '2', docType: 'ATTESTATION_FIN' }),
        doc({ sourceId: '3', docType: 'ATTESTATION_FIN', anchor: { level: 'participant', sessionId: 'ses-2', participantId: 'p', personId: 'per-1' } }),
      ],
    });
    expect(entries.map((e) => e.path)).toEqual([
      'SES-0094/Attestation-Stephane-ROUSSEAU-SES-0094.pdf',
      'SES-0094/Convention-de-formation-Stephane-ROUSSEAU-SES-0094.pdf',
      'SES-0110/Attestation-Stephane-ROUSSEAU-SES-0110.pdf',
    ]);
  });

  it('liste vide → archive vide, pas de plantage', () => {
    expect(buildLearnerZipEntries({ ...BASE, docs: [] })).toEqual([]);
  });
});

describe('buildLearnerZipFilename', () => {
  it('nomme l’archive avec l’apprenant et la date du jour', () => {
    expect(buildLearnerZipFilename('Stéphane', 'Rousseau', new Date('2026-09-08T12:00:00Z'))).toBe(
      'Documents-Stephane-ROUSSEAU-20260908.zip',
    );
  });

  it('tolère un apprenant sans prénom', () => {
    expect(buildLearnerZipFilename(null, 'Rousseau', new Date('2026-09-08T12:00:00Z'))).toBe(
      'Documents-ROUSSEAU-20260908.zip',
    );
  });
});
