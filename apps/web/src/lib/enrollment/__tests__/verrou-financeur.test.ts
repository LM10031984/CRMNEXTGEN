import { describe, it, expect } from 'vitest';

/**
 * Le verrou du changement de financeur — module pur.
 *
 * CE QUE CE FICHIER GARDE, ET POURQUOI ÇA COMPTE. Le commanditaire d'une
 * inscription devient éditable (décision Laurent 11/09/2026). Le risque n'est
 * pas qu'on ne puisse pas le changer, c'est qu'on le change APRÈS qu'un tiers
 * l'ait lu : un dossier parti chez l'AGEFICE, une convention signée, ou — depuis
 * le 11/09/2026 — une pièce PARTIE en signature électronique et pas encore
 * revenue. Ces trois situations doivent produire un refus NOMINATIF — qui nomme
 * l'apprenant et la pièce en cause — jamais un refus muet.
 *
 * ⚠ L'ORDRE DES TROIS REFUS EST TESTÉ, et ce n'est pas cosmétique. La pièce
 * envoyée est le SEUL des trois murs qu'un clic fait tomber (« Annuler
 * l'envoi »). Le nommer en premier enverrait l'admin annuler un envoi pour
 * découvrir, juste après, une convention signée que rien ne lève : un mur
 * derrière l'autre. On nomme donc toujours le refus le plus dur en premier.
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
  pieceEstPartieEnSignature,
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

describe('verrouChangementFinanceur — pièce PARTIE en signature électronique', () => {
  it("status = 'sent_for_signature' → REFUS, motif PIECE_ENVOYEE, pièce NOMMÉE en clair", () => {
    const r = verrou({ pieces: [piece({ type: 'CONVENTION', status: 'sent_for_signature' })] });
    expect(r.bloque).toBe(true);
    if (!r.bloque) throw new Error('inatteignable');
    expect(r.motif).toBe('PIECE_ENVOYEE');
    expect(r.message).toContain('Marion DELAUNAY');
    expect(r.message).toContain('Convention de formation');
    expect(r.message).not.toContain('CONVENTION');
  });

  it("le refus dit LE geste : « Annulez d'abord l'envoi en cours »", () => {
    const r = verrou({ pieces: [piece({ status: 'sent_for_signature' })] });
    expect(r.bloque).toBe(true);
    if (!r.bloque) throw new Error('inatteignable');
    // Valeur LITTÉRALE (règle n°2) : c'est la promesse faite à l'admin, pas le
    // retour d'une constante que le moteur pourrait renommer avec le test.
    expect(r.message).toContain("Annulez d'abord l'envoi en cours");
  });

  it('PUISSANCE — une pièce ENVOYÉE noyée dans des pièces seulement générées est quand même vue', () => {
    const r = verrou({
      pieces: [
        piece({ id: 'a', type: 'PROGRAMME' }),
        piece({ id: 'b', type: 'AGEFICE', status: 'sent_for_signature' }),
        piece({ id: 'c', type: 'CONVOCATION' }),
      ],
    });
    expect(r.bloque).toBe(true);
    if (!r.bloque) throw new Error('inatteignable');
    expect(r.motif).toBe('PIECE_ENVOYEE');
    expect(r.message).toContain('Fiche AGEFICE');
  });

  it("PRIORITÉ — signée ET envoyée : c'est la SIGNÉE qui parle (annuler l'envoi ne lèverait pas l'autre mur)", () => {
    const r = verrou({
      pieces: [
        piece({ id: 'a', type: 'CONVOCATION', status: 'sent_for_signature' }),
        piece({ id: 'b', type: 'CONVENTION', signedPdfUrl: 'k/convention-signee.pdf' }),
      ],
    });
    expect(r.bloque).toBe(true);
    if (!r.bloque) throw new Error('inatteignable');
    expect(r.motif).toBe('PIECE_SIGNEE');
    expect(r.message).toContain('Convention de formation');
  });

  it('PRIORITÉ — un dossier déjà parti prime sur une pièce envoyée', () => {
    const r = verrou({
      dossiers: [dossier({ status: 'SENT' })],
      pieces: [piece({ status: 'sent_for_signature' })],
    });
    expect(r.bloque).toBe(true);
    if (!r.bloque) throw new Error('inatteignable');
    expect(r.motif).toBe('DOSSIER_PARTI');
  });
});

describe('LE MOT — « commanditaire », jusque dans l’ouverture des trois refus', () => {
  /**
   * Le champ s'appelle « Organisation commanditaire » à l'écran depuis le
   * 11/09/2026 (correction n°7 bis). Les trois refus, eux, ouvraient encore sur
   * « Financeur non modifiable » : l'admin lisait un refus qui ne nommait pas le
   * champ qu'il venait d'éditer. Décision Laurent du 11/09/2026.
   *
   * ⚠ Assertions LITTÉRALES (règle n°2), et sur la PHRASE ENTIÈRE d'ouverture,
   * pas sur le seul mot : c'est la promesse faite à l'admin. Un test qui
   * comparerait au retour du moteur bougerait avec lui et ne garderait rien.
   *
   * ⚠ « financeur » N'EST PAS banni du corps des messages, et c'est délibéré :
   * le refus n°1 finit sur « ne désigneraient plus le même financeur » — là, il
   * s'agit bien de l'OPCO destinataire du dossier, pas du champ. Le mot juste
   * dépend de ce qu'on désigne, pas d'un chercher-remplacer.
   */
  const OUVERTURE = 'Commanditaire non modifiable pour Marion DELAUNAY : ';

  it('refus n°1 — dossier déjà parti', () => {
    const r = verrou({ dossiers: [dossier({ status: 'APPROVED' })] });
    expect(r.bloque).toBe(true);
    if (!r.bloque) throw new Error('inatteignable');
    expect(r.message.startsWith(OUVERTURE)).toBe(true);
  });

  it('refus n°2 — pièce signée', () => {
    const r = verrou({ pieces: [piece({ signedPdfUrl: 'k/convention-signee.pdf' })] });
    expect(r.bloque).toBe(true);
    if (!r.bloque) throw new Error('inatteignable');
    expect(r.message.startsWith(OUVERTURE)).toBe(true);
  });

  it('refus n°3 — pièce partie en signature', () => {
    const r = verrou({ pieces: [piece({ status: 'sent_for_signature' })] });
    expect(r.bloque).toBe(true);
    if (!r.bloque) throw new Error('inatteignable');
    expect(r.message.startsWith(OUVERTURE)).toBe(true);
  });

  it('aucun des trois ne rouvre sur « Financeur non modifiable »', () => {
    const messages = [
      verrou({ dossiers: [dossier({ status: 'SENT' })] }),
      verrou({ pieces: [piece({ status: 'signed' })] }),
      verrou({ pieces: [piece({ status: 'sent_for_signature' })] }),
    ].map((r) => (r.bloque ? r.message : ''));
    expect(messages).toHaveLength(3);
    for (const m of messages) expect(m).not.toContain('Financeur non modifiable');
  });

  it('le champ à corriger est NOMMÉ « commanditaire » dans les deux refus qui disent quoi faire', () => {
    const signee = verrou({ pieces: [piece({ status: 'signed' })] });
    const partie = verrou({ pieces: [piece({ status: 'sent_for_signature' })] });
    if (!signee.bloque || !partie.bloque) throw new Error('inatteignable');
    expect(signee.message).toContain('avec le bon commanditaire');
    expect(partie.message).toContain('corrigez le commanditaire');
  });

  it('PUISSANCE — le refus n°1 garde « le même financeur » : là, c’est bien l’OPCO', () => {
    const r = verrou({ dossiers: [dossier({ status: 'SENT' })] });
    expect(r.bloque).toBe(true);
    if (!r.bloque) throw new Error('inatteignable');
    expect(r.message).toContain('ne désigneraient plus le même financeur');
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

  it('pieceEstPartieEnSignature : le statut d’envoi, et lui seul', () => {
    expect(pieceEstPartieEnSignature(piece({ status: 'sent_for_signature' }))).toBe(true);
    expect(pieceEstPartieEnSignature(piece({ status: 'generated' }))).toBe(false);
    expect(pieceEstPartieEnSignature(piece({ status: 'signed' }))).toBe(false);
    // Les deux prédicats ne se recouvrent jamais : une pièce est dans UN état.
    expect(pieceEstPartieEnSignature(piece({ signedPdfUrl: 'k.pdf' }))).toBe(false);
  });
});
