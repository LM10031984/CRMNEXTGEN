import { describe, it, expect } from 'vitest';
import {
  buildSessionLearnerZipEntries,
  buildSessionLearnerZipFilename,
  type LearnerDocRef,
} from '../session-learner-zip-entries';

const PERSONNE = { firstName: 'Johanna', lastName: 'Fourneau', sessionCode: 'SES-0110' };

const REFS: LearnerDocRef[] = [
  { docType: 'CONVENTION', kind: 'document', id: 'd1' },
  { docType: 'CONVOCATION', kind: 'document', id: 'd2' },
  { docType: 'EMARGEMENT', kind: 'asset', id: 'a1' },
  { docType: 'CERTIFICAT_REALISATION', kind: 'document', id: 'd3' },
  { docType: 'SATISFACTION_CHAUD', kind: 'asset', id: 'a2' },
];

describe('buildSessionLearnerZipEntries', () => {
  it("ne garde que les documents de la phase demandée", () => {
    const entries = buildSessionLearnerZipEntries({ refs: REFS, phase: 'avant', ...PERSONNE });
    expect(entries.map((e) => e.docType).sort()).toEqual(['CONVENTION', 'CONVOCATION']);
  });

  it('nomme chaque pièce avec son type, l’apprenant et la session', () => {
    const entries = buildSessionLearnerZipEntries({ refs: REFS, phase: 'avant', ...PERSONNE });
    expect(entries.map((e) => e.path)).toContain('Convention-de-formation-Johanna-FOURNEAU-SES-0110.pdf');
  });

  it('met l’archive à plat quand une seule phase est demandée', () => {
    const entries = buildSessionLearnerZipEntries({ refs: REFS, phase: 'apres', ...PERSONNE });
    expect(entries.every((e) => !e.path.includes('/'))).toBe(true);
  });

  it('range le dossier complet en sous-dossiers par phase', () => {
    const entries = buildSessionLearnerZipEntries({ refs: REFS, phase: null, ...PERSONNE });
    const dossiers = new Set(entries.map((e) => e.path.split('/')[0]));
    expect(dossiers).toEqual(
      new Set(['Avant-la-formation', 'Pendant-la-formation', 'Apres-la-formation']),
    );
    expect(entries).toHaveLength(REFS.length);
  });

  it('n’empaquette pas deux fois la même pièce résolue sur deux types', () => {
    // Le programme produit est partagé : la matrice le résout pour plusieurs
    // colonnes, l'archive ne doit le porter qu'une fois.
    const entries = buildSessionLearnerZipEntries({
      refs: [
        { docType: 'PROGRAMME', kind: 'document', id: 'partage' },
        { docType: 'SUPPORT_PEDAGOGIQUE', kind: 'document', id: 'partage' },
      ],
      phase: null,
      ...PERSONNE,
    });
    expect(entries).toHaveLength(1);
  });

  it('dédoublonne deux noms identiques plutôt que de perdre un fichier', () => {
    const entries = buildSessionLearnerZipEntries({
      refs: [
        { docType: 'CONVENTION', kind: 'document', id: 'd1' },
        { docType: 'CONVENTION', kind: 'document', id: 'd2' },
      ],
      phase: 'avant',
      ...PERSONNE,
    });
    expect(entries.map((e) => e.path)).toEqual([
      'Convention-de-formation-Johanna-FOURNEAU-SES-0110.pdf',
      'Convention-de-formation-Johanna-FOURNEAU-SES-0110-2.pdf',
    ]);
  });

  it('ignore un type hors catalogue quand une phase est demandée', () => {
    const entries = buildSessionLearnerZipEntries({
      refs: [{ docType: 'CUSTOM', kind: 'document', id: 'x' }],
      phase: 'avant',
      ...PERSONNE,
    });
    expect(entries).toEqual([]);
  });
});

describe('buildSessionLearnerZipFilename', () => {
  it('met la phase en tête, puis l’apprenant, puis la session', () => {
    expect(buildSessionLearnerZipFilename({ phase: 'avant', ...PERSONNE })).toBe(
      'Avant-la-formation-Johanna-FOURNEAU-SES-0110.zip',
    );
    expect(buildSessionLearnerZipFilename({ phase: 'apres', ...PERSONNE })).toBe(
      'Apres-la-formation-Johanna-FOURNEAU-SES-0110.zip',
    );
  });

  it('nomme « Dossier-complet » quand aucune phase n’est demandée', () => {
    expect(buildSessionLearnerZipFilename({ phase: null, ...PERSONNE })).toBe(
      'Dossier-complet-Johanna-FOURNEAU-SES-0110.zip',
    );
  });

  it('reste ASCII et non vide même sans nom ni code de session', () => {
    const name = buildSessionLearnerZipFilename({
      phase: 'pendant',
      firstName: null,
      lastName: null,
      sessionCode: null,
    });
    expect(name).toBe('Pendant-la-formation.zip');
    expect(name).toMatch(/^[A-Za-z0-9.-]+$/);
  });
});
