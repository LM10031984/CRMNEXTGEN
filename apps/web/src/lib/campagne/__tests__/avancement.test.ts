import { describe, it, expect } from 'vitest';
import {
  calculerAvancement,
  compterVoix,
  deadlineAdministrative,
  deadlineDepassee,
  type PreEnrollmentSnapshot,
} from '../avancement';

function pe(over: Partial<PreEnrollmentSnapshot> = {}): PreEnrollmentSnapshot {
  return {
    id: crypto.randomUUID(),
    status: 'VALIDATED',
    firstName: 'Jean',
    lastName: 'Dupont',
    submittedAt: new Date('2026-09-09T10:00:00Z'),
    cniKey: 'cni.jpg',
    ribKey: 'rib.pdf',
    cfpKey: null,
    rejectionReason: null,
    ...over,
  };
}

describe('l’avancement d’une campagne', () => {
  // Depuis l'arbitrage du 10/09/2026, « personne n'a ouvert le lien » ne se dit
  // plus par quatre zéros : les quatre personnes attendues sont quatre
  // formulaires non rendus. Un écran à zéro partout laissait croire qu'il n'y
  // avait rien à attendre.
  it('compte les attendus comme non rendus tant que personne n’a ouvert le lien', () => {
    const a = calculerAvancement({ attendus: 4, preEnrollments: [], dateOptions: [] });
    expect(a).toMatchObject({
      attendus: 4,
      pasEncoreRendus: 4,
      rendusNonTranches: 0,
      bons: 0,
      rejetes: 0,
      rendus: 0,
      piecesCompletes: 0,
      piecesIncompletes: 0,
    });
    // Personne n'a de nom à relancer : on ne relance pas un lien jamais ouvert.
    expect(a.aRelancer).toEqual([]);
  });

  it('range chaque statut du pipeline dans la bonne colonne', () => {
    const a = calculerAvancement({
      attendus: 5,
      preEnrollments: [
        pe({ status: 'PENDING_FORM' }),
        pe({ status: 'SUBMITTED' }),
        pe({ status: 'EXTRACTED' }),
        pe({ status: 'VALIDATED' }),
        pe({ status: 'CONVERTED' }),
        pe({ status: 'REJECTED', rejectionReason: 'CNI illisible' }),
      ],
      dateOptions: [],
    });
    expect(a.pasEncoreRendus).toBe(1);
    expect(a.rejetes).toBe(1);
    // SUBMITTED, EXTRACTED, VALIDATED et CONVERTED ont tous leurs pièces : rien
    // ne bloque, donc tous « bons ». Le fait que deux d'entre eux n'aient pas
    // encore été tranchés par l'admin se dit à part, en sous-libellé.
    expect(a.bons).toBe(4);
    expect(a.rendusNonTranches).toBe(2);
    expect(a.rendus).toBe(5);
  });

  // L'attestation CFP ne concerne que les TNS. L'exiger de tout le monde
  // ferait clignoter en rouge des dossiers complets, et l'admin cesserait de
  // regarder l'indicateur — un voyant toujours rouge n'est plus un voyant.
  it('n’exige que la CNI et le RIB, jamais la CFP', () => {
    const a = calculerAvancement({
      attendus: 1,
      preEnrollments: [pe({ cfpKey: null })],
      dateOptions: [],
    });
    expect(a.piecesCompletes).toBe(1);
    expect(a.piecesIncompletes).toBe(0);
    expect(a.aRelancer).toEqual([]);
  });

  it('nomme qui bloque, et sur quelle pièce', () => {
    const a = calculerAvancement({
      attendus: 1,
      // Statut non tranché : une fois l'admin passé, c'est SA décision qui
      // fait foi, pas le contrôle automatique (cf. plus bas).
      preEnrollments: [
        pe({ status: 'EXTRACTED', firstName: 'Marie', lastName: 'Curie', ribKey: null }),
      ],
      dateOptions: [],
    });
    expect(a.piecesIncompletes).toBe(1);
    expect(a.aRelancer).toEqual([
      { id: expect.any(String), nom: 'Marie Curie', motif: 'pieces-manquantes', detail: 'RIB' },
    ]);
  });

  it('remonte le motif de rejet tel qu’il a été saisi', () => {
    const a = calculerAvancement({
      attendus: 1,
      preEnrollments: [pe({ status: 'REJECTED', rejectionReason: 'CNI expirée' })],
      dateOptions: [],
    });
    expect(a.aRelancer[0]).toMatchObject({ motif: 'rejete', detail: 'CNI expirée' });
  });

  // Un formulaire jamais rendu n'a pas de pièces : le compter « incomplet »
  // le ferait apparaître DEUX fois dans la liste de relance, pour un seul
  // problème — et l'admin relancerait deux fois la même personne.
  it('ne compte pas deux fois un formulaire jamais rendu', () => {
    const a = calculerAvancement({
      attendus: 1,
      preEnrollments: [pe({ status: 'PENDING_FORM', cniKey: null, ribKey: null })],
      dateOptions: [],
    });
    expect(a.piecesIncompletes).toBe(0);
    expect(a.aRelancer).toHaveLength(1);
    expect(a.aRelancer[0]!.motif).toBe('formulaire-non-rendu');
  });

  it('supporte un participant qui n’a pas encore donné son nom', () => {
    const a = calculerAvancement({
      attendus: 1,
      preEnrollments: [pe({ status: 'PENDING_FORM', firstName: null, lastName: null })],
      dateOptions: [],
    });
    expect(a.aRelancer[0]!.nom).toBe('Participant sans nom saisi');
  });

  it('classe les dates par ordre chronologique, avec leurs voix', () => {
    const a = calculerAvancement({
      attendus: 2,
      preEnrollments: [],
      dateOptions: [
        {
          id: 'd2',
          startsAt: new Date('2026-10-20T08:00:00Z'),
          label: 'Journée 2',
          isRetained: false,
          votes: { p1: true },
        },
        {
          id: 'd1',
          startsAt: new Date('2026-10-06T08:00:00Z'),
          label: 'Journée 1',
          isRetained: true,
          votes: { p1: true, p2: true },
        },
      ],
    });
    expect(a.votesParDate.map((v) => v.dateOptionId)).toEqual(['d1', 'd2']);
    expect(a.votesParDate[0]).toMatchObject({ voix: 2, isRetained: true });
  });
});

describe('le comptage des voix', () => {
  it('ne casse sur aucune forme stockée', () => {
    expect(compterVoix(null)).toBe(0);
    expect(compterVoix(undefined)).toBe(0);
    expect(compterVoix({})).toBe(0);
    expect(compterVoix([])).toBe(0);
    expect(compterVoix('deux')).toBe(0);
    expect(compterVoix({ a: true, b: true })).toBe(2);
  });

  it('ne compte pas une voix retirée', () => {
    expect(compterVoix({ a: true, b: false })).toBe(1);
  });
});

describe('la deadline administrative', () => {
  const DATES = [
    { startsAt: new Date('2026-10-20T08:00:00Z'), isRetained: false },
    { startsAt: new Date('2026-10-06T08:00:00Z'), isRetained: false },
  ];

  it('recule de 15 jours depuis la date la plus proche', () => {
    const d = deadlineAdministrative({ dateOptions: DATES, leadDaysMin: 15 });
    expect(d?.toISOString().slice(0, 10)).toBe('2026-09-21');
  });

  // Tant qu'aucune date n'est retenue, c'est la PREMIÈRE qui contraint :
  // annoncer la deadline de la plus lointaine ferait rater la première si
  // c'est finalement elle qu'on retient.
  it('sans date retenue, c’est la plus proche qui contraint', () => {
    const d = deadlineAdministrative({ dateOptions: DATES, leadDaysMin: 15 });
    const plusLointaine = deadlineAdministrative({
      dateOptions: [DATES[0]!],
      leadDaysMin: 15,
    });
    expect(d!.getTime()).toBeLessThan(plusLointaine!.getTime());
  });

  it('dès qu’une date est retenue, c’est elle qui fait foi', () => {
    const d = deadlineAdministrative({
      dateOptions: [
        { startsAt: new Date('2026-10-06T08:00:00Z'), isRetained: false },
        { startsAt: new Date('2026-10-20T08:00:00Z'), isRetained: true },
      ],
      leadDaysMin: 15,
    });
    expect(d?.toISOString().slice(0, 10)).toBe('2026-10-05');
  });

  // Une deadline inventée serait pire que pas de deadline : elle passerait
  // pour une contrainte réelle et ferait courir tout le monde pour rien.
  it('sans aucune date, ne rend rien', () => {
    expect(deadlineAdministrative({ dateOptions: [], leadDaysMin: 15 })).toBeNull();
  });

  it('dit quand la deadline est passée', () => {
    const passee = new Date('2026-09-01T00:00:00Z');
    expect(deadlineDepassee(passee, new Date('2026-09-10T00:00:00Z'))).toBe(true);
    expect(deadlineDepassee(passee, new Date('2026-08-01T00:00:00Z'))).toBe(false);
    expect(deadlineDepassee(null, new Date())).toBe(false);
  });
});

/**
 * Arbitrage de Laurent du 10/09/2026 — les compteurs doivent être EXCLUSIFS et
 * TOTALISANTS. L'aperçu affichait cinq tuiles dont la somme faisait 5 pour
 * 4 dossiers : « en cours de vérification » et « pièces manquantes » sont deux
 * axes, et un dossier tombait dans les deux. Personne ne peut lire ça.
 *
 * Quatre catégories, dans l'ordre du parcours, et une seule par dossier :
 * non rendu → pièces manquantes → rejeté → bon.
 */
describe('les quatre compteurs — exclusifs et totalisants', () => {
  it('chaque dossier tombe dans une case et une seule, et la somme fait l’effectif attendu', () => {
    const a = calculerAvancement({
      attendus: 4,
      preEnrollments: [
        pe({ status: 'PENDING_FORM' }),
        // En vérification ET incomplet : « pièces manquantes » l'emporte,
        // c'est l'information sur laquelle l'admin peut agir.
        pe({ status: 'EXTRACTED', cniKey: null }),
        pe({ status: 'REJECTED', rejectionReason: 'RIB illisible' }),
        pe({ status: 'VALIDATED' }),
      ],
      dateOptions: [],
    });

    expect(a.pasEncoreRendus).toBe(1);
    expect(a.piecesIncompletes).toBe(1);
    expect(a.rejetes).toBe(1);
    expect(a.bons).toBe(1);
    expect(a.pasEncoreRendus + a.piecesIncompletes + a.rejetes + a.bons).toBe(4);
  });

  it('un dossier rendu, complet mais pas encore tranché compte comme BON', () => {
    // Rien ne bloque : les pièces sont là. Que l'admin n'ait pas encore cliqué
    // « valider » ne regarde pas le participant, et ne se relance pas.
    const a = calculerAvancement({
      attendus: 1,
      preEnrollments: [pe({ status: 'EXTRACTED' })],
      dateOptions: [],
    });
    expect(a.bons).toBe(1);
    expect(a.piecesIncompletes).toBe(0);
    // L'information reste disponible, mais en sous-libellé, pas en tuile.
    expect(a.rendusNonTranches).toBe(1);
  });

  it('une validation admin l’emporte sur le contrôle automatique des pièces', () => {
    // Si l'admin a validé, la question des pièces est tranchée — la rouvrir
    // ferait clignoter en rouge un dossier que quelqu'un a déjà accepté.
    const a = calculerAvancement({
      attendus: 1,
      preEnrollments: [pe({ status: 'VALIDATED', ribKey: null })],
      dateOptions: [],
    });
    expect(a.bons).toBe(1);
    expect(a.piecesIncompletes).toBe(0);
    expect(a.aRelancer).toEqual([]);
  });

  it('les attendus qui n’ont pas même ouvert le lien comptent comme non rendus', () => {
    // Sans cela, la somme des tuiles ne vaudrait que le nombre de dossiers
    // ouverts, et une campagne où personne n'a cliqué afficherait quatre zéros
    // pour quatre personnes attendues.
    const a = calculerAvancement({
      attendus: 4,
      preEnrollments: [pe({ status: 'VALIDATED' })],
      dateOptions: [],
    });
    expect(a.bons).toBe(1);
    expect(a.pasEncoreRendus).toBe(3);
    expect(a.pasEncoreRendus + a.piecesIncompletes + a.rejetes + a.bons).toBe(4);
  });

  it('sans effectif attendu, la somme vaut simplement le nombre de dossiers', () => {
    const a = calculerAvancement({
      attendus: null,
      preEnrollments: [pe({ status: 'VALIDATED' }), pe({ status: 'PENDING_FORM' })],
      dateOptions: [],
    });
    expect(a.pasEncoreRendus + a.piecesIncompletes + a.rejetes + a.bons).toBe(2);
  });

  it('plus de dossiers que d’attendus : on dit la vérité, on ne plafonne pas', () => {
    const a = calculerAvancement({
      attendus: 1,
      preEnrollments: [pe({ status: 'VALIDATED' }), pe({ status: 'VALIDATED' })],
      dateOptions: [],
    });
    expect(a.bons).toBe(2);
    expect(a.pasEncoreRendus).toBe(0);
  });

  it('les compteurs s’accordent avec « ce qui bloque »', () => {
    const a = calculerAvancement({
      attendus: 4,
      preEnrollments: [
        pe({ status: 'PENDING_FORM' }),
        pe({ status: 'EXTRACTED', cniKey: null }),
        pe({ status: 'REJECTED', rejectionReason: 'RIB illisible' }),
        pe({ status: 'VALIDATED' }),
      ],
      dateOptions: [],
    });
    // Une ligne de relance par dossier qui n'est pas « bon ». Jamais deux pour
    // le même dossier : c'était le doublon de l'aperçu.
    expect(a.aRelancer).toHaveLength(3);
    expect(new Set(a.aRelancer.map((r) => r.id)).size).toBe(3);
    expect(a.aRelancer.length).toBe(a.pasEncoreRendus + a.piecesIncompletes + a.rejetes);
  });
});
