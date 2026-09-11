import { describe, it, expect } from 'vitest';

/**
 * Le verrou du changement de financeur — module pur.
 *
 * CE QUE CE FICHIER GARDE, ET POURQUOI ÇA COMPTE. Le commanditaire d'une
 * inscription devient éditable (décision Laurent 11/09/2026). Le risque n'est
 * pas qu'on ne puisse pas le changer, c'est qu'on le change APRÈS qu'un tiers
 * l'ait lu : un dossier parti chez l'AGEFICE, une convention signée. Ces deux
 * situations doivent produire un refus NOMINATIF — qui nomme l'apprenant et la
 * pièce en cause — jamais un refus muet.
 *
 * ⚠ LE TEST DE PUISSANCE de ce fichier est la LISTE NON BLOQUANTE :
 * `DRAFT` / `REJECTED` / `CANCELED` doivent laisser passer. Un dossier refusé
 * est précisément celui qu'on veut re-rattacher au bon financeur avant de le
 * resoumettre. Un verrou trop large ne protège rien : il interdit la réparation
 * et renvoie l'admin vers « désinscrire / réinscrire », c'est-à-dire vers la
 * perte de l'historique qu'on cherchait justement à éviter.
 */

import {
  STATUTS_OPCO_BLOQUANTS,
  STATUTS_OPCO_NON_BLOQUANTS,
  dossierEstParti,
  pieceEstSignee,
  verrouChangementFinanceur,
  type DossierFinanceurLu,
  type PieceLue,
} from '../verrou-financeur';

const NOM = 'Marion DELAUNAY';

function dossier(over: Partial<DossierFinanceurLu> & { status: string }): DossierFinanceurLu {
  return { id: 'sub-1', financeurLabel: 'AGEFICE Grand Est', ...over };
}

function piece(over: Partial<PieceLue> = {}): PieceLue {
  return { id: 'doc-1', type: 'CONVENTION', status: 'generated', signedPdfUrl: null, ...over };
}

function verrou(over: {
  dossiers?: DossierFinanceurLu[];
  pieces?: PieceLue[];
  nomParticipant?: string;
}) {
  return verrouChangementFinanceur({
    nomParticipant: over.nomParticipant ?? NOM,
    dossiers: over.dossiers ?? [],
    pieces: over.pieces ?? [],
  });
}

describe('verrouChangementFinanceur — dossier déjà parti chez le financeur', () => {
  it.each(['SENT', 'ACK_RECEIVED', 'APPROVED', 'REIMBURSED'])(
    'statut %s → REFUS, motif DOSSIER_PARTI',
    (statut) => {
      const r = verrou({ dossiers: [dossier({ status: statut })] });
      expect(r.bloque).toBe(true);
      if (!r.bloque) throw new Error('inatteignable');
      expect(r.motif).toBe('DOSSIER_PARTI');
    },
  );

  it('le refus NOMME l’apprenant, le financeur destinataire et le statut', () => {
    const r = verrou({ dossiers: [dossier({ status: 'APPROVED' })] });
    expect(r.bloque).toBe(true);
    if (!r.bloque) throw new Error('inatteignable');
    expect(r.message).toContain('Marion DELAUNAY');
    expect(r.message).toContain('AGEFICE Grand Est');
    expect(r.message).toContain('accord de prise en charge reçu');
    // …et dit quoi faire : un refus qui ne propose pas de sortie est un mur.
    expect(r.message).toMatch(/annuler|refuser/i);
  });

  it('financeur inconnu → le message reste lisible (« chez le financeur »), jamais « chez null »', () => {
    const r = verrou({ dossiers: [dossier({ status: 'SENT', financeurLabel: null })] });
    expect(r.bloque).toBe(true);
    if (!r.bloque) throw new Error('inatteignable');
    expect(r.message).toContain('chez le financeur');
    expect(r.message).not.toContain('null');
  });

  it('PUISSANCE — un dossier bloquant NOYÉ dans des non bloquants est quand même vu', () => {
    const r = verrou({
      dossiers: [
        dossier({ id: 'a', status: 'DRAFT' }),
        dossier({ id: 'b', status: 'REJECTED' }),
        dossier({ id: 'c', status: 'SENT' }),
        dossier({ id: 'd', status: 'CANCELED' }),
      ],
    });
    expect(r.bloque).toBe(true);
  });
});

describe('verrouChangementFinanceur — les statuts qui NE bloquent PAS', () => {
  it.each(['DRAFT', 'REJECTED', 'CANCELED'])(
    'statut %s → AUTORISÉ (c’est le dossier qu’on veut re-rattacher)',
    (statut) => {
      expect(verrou({ dossiers: [dossier({ status: statut })] })).toEqual({ bloque: false });
    },
  );

  it('aucun dossier, aucune pièce → autorisé', () => {
    expect(verrou({})).toEqual({ bloque: false });
  });
});

describe('verrouChangementFinanceur — pièce signée', () => {
  it('signedPdfUrl non nul → REFUS, motif PIECE_SIGNEE, pièce NOMMÉE en clair', () => {
    const r = verrou({ pieces: [piece({ signedPdfUrl: 'tenant/doc-1-signe.pdf' })] });
    expect(r.bloque).toBe(true);
    if (!r.bloque) throw new Error('inatteignable');
    expect(r.motif).toBe('PIECE_SIGNEE');
    expect(r.message).toContain('Marion DELAUNAY');
    // Libellé humain, pas la clé brute du DocType.
    expect(r.message).toContain('Convention de formation');
    expect(r.message).not.toContain('CONVENTION');
  });

  it("status = 'signed' sans PDF stocké → REFUS quand même", () => {
    const r = verrou({ pieces: [piece({ status: 'signed', signedPdfUrl: null })] });
    expect(r.bloque).toBe(true);
    if (!r.bloque) throw new Error('inatteignable');
    expect(r.motif).toBe('PIECE_SIGNEE');
  });

  it('signedPdfUrl = "   " (chaîne vide déguisée) → PAS une signature', () => {
    expect(verrou({ pieces: [piece({ signedPdfUrl: '   ' })] })).toEqual({ bloque: false });
  });

  it('pièce seulement générée → autorisé', () => {
    expect(verrou({ pieces: [piece({ status: 'generated' })] })).toEqual({ bloque: false });
  });

  it('PUISSANCE — une pièce signée NOYÉE dans des pièces non signées est quand même vue', () => {
    const r = verrou({
      pieces: [
        piece({ id: 'a', type: 'PROGRAMME' }),
        piece({ id: 'b', type: 'CONVOCATION', status: 'sent_for_signature' }),
        piece({ id: 'c', type: 'AGEFICE', signedPdfUrl: 'k/agefice-signe.pdf' }),
      ],
    });
    expect(r.bloque).toBe(true);
    if (!r.bloque) throw new Error('inatteignable');
    expect(r.message).toContain('Fiche AGEFICE');
  });
});

describe('prédicats unitaires + sanité des listes', () => {
  it('dossierEstParti ne reconnaît QUE les quatre statuts bloquants', () => {
    for (const s of STATUTS_OPCO_BLOQUANTS) expect(dossierEstParti(s)).toBe(true);
    for (const s of STATUTS_OPCO_NON_BLOQUANTS) expect(dossierEstParti(s)).toBe(false);
    expect(dossierEstParti('STATUT_INCONNU')).toBe(false);
  });

  it('les deux listes couvrent exactement les 7 valeurs de OpcoSubmissionStatus, sans recouvrement', () => {
    const toutes = [...STATUTS_OPCO_BLOQUANTS, ...STATUTS_OPCO_NON_BLOQUANTS];
    expect(new Set(toutes).size).toBe(toutes.length);
    expect(new Set(toutes)).toEqual(
      new Set(['DRAFT', 'SENT', 'ACK_RECEIVED', 'APPROVED', 'REJECTED', 'REIMBURSED', 'CANCELED']),
    );
  });

  it('pieceEstSignee : PDF signé OU statut signé, pas autre chose', () => {
    expect(pieceEstSignee(piece({ signedPdfUrl: 'k.pdf' }))).toBe(true);
    expect(pieceEstSignee(piece({ status: 'signed' }))).toBe(true);
    expect(pieceEstSignee(piece({ status: 'sent_for_signature' }))).toBe(false);
    expect(pieceEstSignee(piece())).toBe(false);
  });
});
