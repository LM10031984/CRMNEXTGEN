import { describe, it, expect } from 'vitest';
import {
  grouperAlertesSubmission,
  sujetAlerteSubmission,
  type SubmissionSnapshot,
} from '../preinscription-digest';

const T = (h: number, m = 0) => new Date(`2026-09-10T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);

function sub(over: Partial<SubmissionSnapshot> = {}): SubmissionSnapshot {
  return {
    id: crypto.randomUUID(),
    batchId: 'batch-1',
    batchLabel: 'RDV OPTIMMO',
    firstName: 'Jean',
    lastName: 'Dupont',
    submittedAt: T(10),
    ...over,
  };
}

describe('le regroupement des alertes de pré-inscription', () => {
  it('ne produit rien quand rien n’a été déposé', () => {
    expect(grouperAlertesSubmission([])).toEqual([]);
  });

  it('annonce seul un dossier isolé', () => {
    const a = grouperAlertesSubmission([sub({ firstName: 'Marie', lastName: 'Curie' })]);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: 'unitaire', nom: 'Marie Curie' });
  });

  // Le cas qui a motivé la règle : un dirigeant diffuse le lien, son équipe
  // remplit dans le même quart d'heure. Sans regroupement, l'admin reçoit
  // huit emails, et le neuvième — celui qui méritait un regard — se perd.
  it('regroupe une même campagne déposée dans l’heure', () => {
    const a = grouperAlertesSubmission([
      sub({ submittedAt: T(10, 0), firstName: 'A' }),
      sub({ submittedAt: T(10, 5), firstName: 'B' }),
      sub({ submittedAt: T(10, 40), firstName: 'C' }),
    ]);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: 'digest' });
    expect(a[0]!.preEnrollmentIds).toHaveLength(3);
  });

  // La fenêtre est ancrée sur le PREMIER du groupe. Sinon des dépôts qui
  // s'enchaînent toutes les 50 minutes formeraient un digest sans fin, jamais
  // envoyé — et l'admin ne serait jamais prévenu.
  it('n’étire pas la fenêtre indéfiniment', () => {
    const a = grouperAlertesSubmission([
      sub({ submittedAt: T(10, 0), firstName: 'A' }),
      sub({ submittedAt: T(10, 50), firstName: 'B' }),
      sub({ submittedAt: T(11, 30), firstName: 'C' }),
    ]);
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({ kind: 'digest' });
    expect(a[1]).toMatchObject({ kind: 'unitaire', nom: 'C Dupont' });
  });

  it('sépare deux campagnes déposées à la même minute', () => {
    const a = grouperAlertesSubmission([
      sub({ batchId: 'b1', batchLabel: 'OPTIMMO', submittedAt: T(10) }),
      sub({ batchId: 'b1', batchLabel: 'OPTIMMO', submittedAt: T(10) }),
      sub({ batchId: 'b2', batchLabel: 'LAFORÊT', submittedAt: T(10) }),
    ]);
    expect(a).toHaveLength(2);
    const digest = a.find((x) => x.kind === 'digest');
    expect(digest?.batchLabel).toBe('OPTIMMO');
    const seul = a.find((x) => x.kind === 'unitaire');
    expect(seul?.batchLabel).toBe('LAFORÊT');
  });

  // Un dossier hors campagne vient d'un envoi nominatif : quelqu'un l'attend
  // personnellement. Le noyer dans un digest lui ferait perdre son urgence.
  it('ne regroupe jamais un dossier hors campagne', () => {
    const a = grouperAlertesSubmission([
      sub({ batchId: null, batchLabel: null, submittedAt: T(10), firstName: 'X' }),
      sub({ batchId: null, batchLabel: null, submittedAt: T(10, 1), firstName: 'Y' }),
    ]);
    expect(a).toHaveLength(2);
    expect(a.every((x) => x.kind === 'unitaire')).toBe(true);
  });

  it('supporte un participant qui n’a pas donné son nom', () => {
    const a = grouperAlertesSubmission([sub({ firstName: null, lastName: null })]);
    expect(a[0]).toMatchObject({ nom: 'Participant sans nom saisi' });
  });

  it('n’oublie aucun dossier, quelle que soit la découpe', () => {
    const entrees = [
      sub({ batchId: 'b1', submittedAt: T(9) }),
      sub({ batchId: 'b1', submittedAt: T(11) }),
      sub({ batchId: 'b2', submittedAt: T(9, 30) }),
      sub({ batchId: null, batchLabel: null, submittedAt: T(9, 30) }),
    ];
    const a = grouperAlertesSubmission(entrees);
    const ids = a.flatMap((x) => x.preEnrollmentIds).sort();
    expect(ids).toEqual(entrees.map((e) => e.id).sort());
  });
});

describe('l’objet de l’alerte', () => {
  it('dit le nom quand il n’y en a qu’un', () => {
    const a = grouperAlertesSubmission([sub({ firstName: 'Marie', lastName: 'Curie' })]);
    expect(sujetAlerteSubmission(a[0]!)).toBe(
      'Dossier de pré-inscription déposé : Marie Curie — RDV OPTIMMO',
    );
  });

  it('dit le nombre quand il y en a plusieurs', () => {
    const a = grouperAlertesSubmission([
      sub({ submittedAt: T(10) }),
      sub({ submittedAt: T(10, 5) }),
    ]);
    expect(sujetAlerteSubmission(a[0]!)).toBe('2 dossiers de pré-inscription déposés — RDV OPTIMMO');
  });

  it('se passe du libellé de campagne quand il n’y en a pas', () => {
    const a = grouperAlertesSubmission([
      sub({ batchId: null, batchLabel: null, firstName: 'Jean', lastName: 'Valjean' }),
    ]);
    expect(sujetAlerteSubmission(a[0]!)).toBe('Dossier de pré-inscription déposé : Jean Valjean');
  });
});
