import { describe, it, expect } from 'vitest';
import {
  DOC_PHASES,
  PARTICIPANT_DOC_TYPES_BY_PHASE,
  coercePhase,
  phaseLabel,
  phaseOfDocType,
  phaseSlug,
  type DocPhase,
} from '../doc-phase';
import { MATRIX_DOC_TYPES } from '@/lib/doc-scope';

describe('doc-phase — source unique des phases', () => {
  it('range les documents de préparation en « avant »', () => {
    expect(phaseOfDocType('CONVENTION')).toBe('avant');
    expect(phaseOfDocType('CONVOCATION')).toBe('avant');
    expect(phaseOfDocType('ANALYSE_BESOIN')).toBe('avant');
    expect(phaseOfDocType('AGEFICE')).toBe('avant');
    expect(phaseOfDocType('PROGRAMME')).toBe('avant');
  });

  it('range ce qui se produit en salle en « pendant »', () => {
    expect(phaseOfDocType('EMARGEMENT')).toBe('pendant');
    expect(phaseOfDocType('SUPPORT_PEDAGOGIQUE')).toBe('pendant');
    expect(phaseOfDocType('GRILLE_OBS')).toBe('pendant');
  });

  it('range les preuves de fin en « après »', () => {
    expect(phaseOfDocType('ATTESTATION_FIN')).toBe('apres');
    expect(phaseOfDocType('CERTIFICAT_REALISATION')).toBe('apres');
    expect(phaseOfDocType('SATISFACTION_FROID')).toBe('apres');
    expect(phaseOfDocType('ASSIDUITE')).toBe('apres');
  });

  it('connaît les deux vocabulaires : DocType de matrice ET PedagogicalKind brut', () => {
    // resolveDocs émet `docType = pa.kind` — sans ces entrées, le ZIP raterait
    // le QCM (colonne EVALUATION_ACQUIS, kind QCM) et la grille d'observation.
    expect(phaseOfDocType('EVALUATION_ACQUIS')).toBe('apres');
    expect(phaseOfDocType('QCM')).toBe('apres');
    expect(phaseOfDocType('DEROULE_PEDAGOGIQUE')).toBe('avant');
    expect(phaseOfDocType('DEROULE')).toBe('avant');
  });

  it("ne range pas d'office un type inconnu du catalogue", () => {
    expect(phaseOfDocType('CUSTOM')).toBeNull();
    expect(phaseOfDocType('PAS_UN_TYPE')).toBeNull();
  });

  it('couvre TOUTES les colonnes de la matrice participants', () => {
    // Garde-fou anti-dérive : ajouter une colonne à la matrice sans lui donner
    // de phase la rendrait invisible des blocs par apprenant ET des ZIP.
    const orphelins = MATRIX_DOC_TYPES.filter((t) => phaseOfDocType(t) === null);
    expect(orphelins).toEqual([]);
  });

  it('affecte chaque docType participant à une seule phase', () => {
    const vus = new Map<string, DocPhase>();
    for (const phase of DOC_PHASES) {
      for (const t of PARTICIPANT_DOC_TYPES_BY_PHASE[phase.id]) {
        expect(vus.has(t)).toBe(false);
        vus.set(t, phase.id);
        // La liste par phase ne doit jamais contredire la table de vérité.
        expect(phaseOfDocType(t)).toBe(phase.id);
      }
    }
  });

  it('valide une phase reçue en query string', () => {
    expect(coercePhase('avant')).toBe('avant');
    expect(coercePhase('apres')).toBe('apres');
    expect(coercePhase('après')).toBeNull();
    expect(coercePhase(undefined)).toBeNull();
    expect(coercePhase(null)).toBeNull();
  });

  it('donne un libellé lisible et un slug ASCII', () => {
    expect(phaseLabel('apres')).toBe('Après la formation');
    expect(phaseSlug('apres')).toBe('Apres-la-formation');
    // Slug ASCII strict : il part dans un nom de fichier et une query string.
    for (const p of DOC_PHASES) expect(p.slug).toMatch(/^[A-Za-z0-9-]+$/);
  });
});
