import { describe, it, expect } from 'vitest';
import {
  buildDocumentSource,
  compareSourceFingerprint,
  computeFingerprint,
  fingerprintDocumentSource,
  isFingerprintable,
  normalizeForFingerprint,
  stableStringify,
  type DocumentSourceContext,
} from '../source-fingerprint';

/**
 * Lot 0 · 0.2 — l'empreinte des données d'entrée (audit 28/08, E-1).
 *
 * Ce que ces tests protègent, dans l'ordre d'importance :
 *  1. l'empreinte ne bouge QUE si un champ réellement rendu bouge (sinon on
 *     fabrique du bruit, et un badge « à régénérer » permanent ne se lit plus) ;
 *  2. elle bouge à coup sûr quand ce champ bouge (sinon la détection ment) ;
 *  3. elle est stable dans le temps : aucune valeur calculée à la génération
 *     (`new Date()`) ne doit s'y glisser, sinon tout le parc devient « périmé »
 *     le lendemain.
 */

/** Faux Decimal Prisma : ce que Prisma rend pour une colonne `Decimal`. */
function decimal(n: number) {
  return { toNumber: () => n, toString: () => n.toFixed(2) };
}

function ctx(overrides: Partial<DocumentSourceContext> = {}): DocumentSourceContext {
  return {
    tenant: { legalName: 'Start Academy', siret: '12345678900012', address: '{"city":"Nice"}' },
    session: {
      code: 'SES-0042',
      name: null,
      startDate: new Date('2026-10-12T08:00:00.000Z'),
      endDate: new Date('2026-10-14T16:00:00.000Z'),
      modality: 'PRESENTIEL',
      pricePerLearner: decimal(3024),
    },
    slots: [
      { date: new Date('2026-10-12T00:00:00.000Z'), startTime: '09:00', endTime: '13:00', halfDay: 'morning' },
      { date: new Date('2026-10-12T00:00:00.000Z'), startTime: '14:00', endTime: '18:00', halfDay: 'afternoon' },
    ],
    location: { legalName: 'SARL XYZ', name: 'Agence Nice Centre', address: { city: 'Nice', postalCode: '06000' } },
    product: {
      code: 'IA-PROSPECT',
      title: 'IA et prospection immobilière',
      durationHours: 14,
      priceHT: decimal(3024),
      programMd: '# Programme\n- Jour 1',
      objectives: ['Objectif A', 'Objectif B'],
      pedagogicalMethods: 'Ateliers',
      evaluationMethods: 'QCM',
      accessibility: 'PMR',
      accessConditions: 'Sous 15 jours',
      trainerProfile: 'Formateur IA',
      ageficeFormationType: 'ACTION',
      ageficeNiveau: 'PERFECTIONNEMENT',
      ageficeCertif: 'SANS_QUALIFICATION',
      ageficeAttestation: 'ATTESTATION_STAGE',
    },
    primaryTrainer: 'Laurent MARX',
    participant: { priceHT: decimal(3024), financingMode: 'OPCO', financingRequestDate: new Date('2026-09-01T00:00:00.000Z') },
    person: { firstName: 'Catherine', lastName: 'ALENDA', email: 'c@example.fr' },
    sponsorOrg: {
      legalName: 'ALENDA Catherine EI',
      siret: '98765432100019',
      siren: '987654321',
      representative: 'Catherine ALENDA',
      city: 'Nice',
    },
    groupStagiaires: null,
    ...overrides,
  };
}

describe('normalisation', () => {
  it("l'ordre des clés ne change pas l'empreinte", () => {
    expect(computeFingerprint({ a: 1, b: 2 })).toBe(computeFingerprint({ b: 2, a: 1 }));
  });

  it('un Decimal Prisma et le nombre équivalent donnent la même empreinte', () => {
    expect(computeFingerprint({ prix: decimal(3024) })).toBe(computeFingerprint({ prix: 3024 }));
  });

  it('une Date est normalisée en ISO (le fuseau du serveur ne compte pas)', () => {
    expect(normalizeForFingerprint(new Date('2026-10-12T08:00:00.000Z'))).toBe(
      '2026-10-12T08:00:00.000Z',
    );
  });

  it('`undefined` et `null` sont indistinguables', () => {
    expect(stableStringify({ a: undefined })).toBe(stableStringify({ a: null }));
  });

  it('les espaces de bord ne changent pas l’empreinte', () => {
    expect(computeFingerprint({ n: ' ALENDA ' })).toBe(computeFingerprint({ n: 'ALENDA' }));
  });
});

describe('périmètre couvert', () => {
  it('couvre les 7 types dont un PDF faux se voit en audit ou chez le financeur', () => {
    for (const t of [
      'CONVENTION',
      'CONVOCATION',
      'PROGRAMME',
      'AGEFICE',
      'ASSIDUITE',
      'ATTESTATION_FIN',
      'CERTIFICAT_REALISATION',
    ]) {
      expect(isFingerprintable(t)).toBe(true);
      expect(buildDocumentSource(t, ctx())).not.toBeNull();
    }
  });

  it('laisse FACTURE au lot 2.1 et EMARGEMENT hors périmètre plutôt que de mentir', () => {
    expect(isFingerprintable('FACTURE')).toBe(false);
    expect(buildDocumentSource('FACTURE', ctx())).toBeNull();
    expect(buildDocumentSource('EMARGEMENT', ctx())).toBeNull();
    expect(fingerprintDocumentSource('FACTURE', ctx())).toBeNull();
  });
});

describe('la convention réagit à ce qu’elle porte', () => {
  const base = fingerprintDocumentSource('CONVENTION', ctx());

  it('le prix de l’inscription change → empreinte différente', () => {
    const autre = fingerprintDocumentSource(
      'CONVENTION',
      ctx({ participant: { priceHT: decimal(2500), financingMode: 'OPCO', financingRequestDate: null } }),
    );
    expect(autre).not.toBe(base);
  });

  it('les dates de session changent → empreinte différente', () => {
    const autre = fingerprintDocumentSource(
      'CONVENTION',
      ctx({
        session: { ...ctx().session!, endDate: new Date('2026-10-15T16:00:00.000Z') },
      }),
    );
    expect(autre).not.toBe(base);
  });

  it('le lieu change → empreinte différente', () => {
    const autre = fingerprintDocumentSource(
      'CONVENTION',
      ctx({ location: { legalName: 'SARL XYZ', name: 'Agence Cannes', address: { city: 'Cannes' } } }),
    );
    expect(autre).not.toBe(base);
  });

  it('le représentant du bénéficiaire change → empreinte différente', () => {
    const autre = fingerprintDocumentSource(
      'CONVENTION',
      ctx({ sponsorOrg: { ...ctx().sponsorOrg!, representative: 'Jean DUPONT' } }),
    );
    expect(autre).not.toBe(base);
  });

  it('un créneau horaire change → la convention NE bouge PAS (elle ne les porte pas)', () => {
    const autre = fingerprintDocumentSource(
      'CONVENTION',
      ctx({ slots: [{ date: new Date('2026-10-12T00:00:00.000Z'), startTime: '08:30', endTime: '12:30', halfDay: 'morning' }] }),
    );
    expect(autre).toBe(base);
  });

  it('les modalités pédagogiques du produit changent → la convention NE bouge PAS', () => {
    const autre = fingerprintDocumentSource(
      'CONVENTION',
      ctx({ product: { ...ctx().product!, pedagogicalMethods: 'Autre chose' } }),
    );
    expect(autre).toBe(base);
  });
});

describe('la convocation réagit aux horaires réels (défaut E-8)', () => {
  it('un créneau modifié rend la convocation périmée', () => {
    const base = fingerprintDocumentSource('CONVOCATION', ctx());
    const autre = fingerprintDocumentSource(
      'CONVOCATION',
      ctx({ slots: [{ date: new Date('2026-10-12T00:00:00.000Z'), startTime: '09:00', endTime: '17:00', halfDay: 'full' }] }),
    );
    expect(autre).not.toBe(base);
  });

  it('un changement de prix ne périme PAS la convocation', () => {
    const base = fingerprintDocumentSource('CONVOCATION', ctx());
    const autre = fingerprintDocumentSource(
      'CONVOCATION',
      ctx({ participant: { priceHT: decimal(1), financingMode: null, financingRequestDate: null } }),
    );
    expect(autre).toBe(base);
  });
});

describe('convention entreprise (groupe)', () => {
  const groupe = (stagiaires: { firstName: string; lastName: string; email: string | null }[]) =>
    fingerprintDocumentSource('CONVENTION', ctx({ participant: null, person: null, groupStagiaires: stagiaires }));

  const deux = [
    { firstName: 'Anne', lastName: 'MARTIN', email: 'a@x.fr' },
    { firstName: 'Bruno', lastName: 'DURAND', email: 'b@x.fr' },
  ];

  it('un salarié inscrit après coup rend la convention groupe périmée', () => {
    const trois = [...deux, { firstName: 'Chloé', lastName: 'PETIT', email: 'c@x.fr' }];
    expect(groupe(trois)).not.toBe(groupe(deux));
  });

  it('l’ordre de chargement des salariés ne change rien', () => {
    expect(groupe([...deux].reverse())).toBe(groupe(deux));
  });
});

describe('programme', () => {
  it('le tarif de session distingue le programme de session du programme catalogue', () => {
    const catalogue = fingerprintDocumentSource('PROGRAMME', ctx({ session: null }));
    const sessionPrix3024 = fingerprintDocumentSource('PROGRAMME', ctx());
    const sessionPrix2500 = fingerprintDocumentSource(
      'PROGRAMME',
      ctx({ session: { ...ctx().session!, pricePerLearner: decimal(2500) } }),
    );
    expect(sessionPrix3024).not.toBe(sessionPrix2500);
    expect(catalogue).not.toBe(sessionPrix2500);
  });

  it('le contenu pédagogique modifié périme le programme', () => {
    const base = fingerprintDocumentSource('PROGRAMME', ctx());
    const autre = fingerprintDocumentSource(
      'PROGRAMME',
      ctx({ product: { ...ctx().product!, programMd: '# Programme\n- Jour 1\n- Jour 2' } }),
    );
    expect(autre).not.toBe(base);
  });
});

describe('attestation / certificat', () => {
  it('ne portent pas le prix : le changer ne les périme pas', () => {
    for (const type of ['ATTESTATION_FIN', 'CERTIFICAT_REALISATION']) {
      const base = fingerprintDocumentSource(type, ctx());
      const autre = fingerprintDocumentSource(
        type,
        ctx({ participant: { priceHT: decimal(1), financingMode: null, financingRequestDate: null } }),
      );
      expect(autre).toBe(base);
    }
  });

  it('la durée du produit les périme (elle est imprimée sur le document)', () => {
    const base = fingerprintDocumentSource('CERTIFICAT_REALISATION', ctx());
    const autre = fingerprintDocumentSource(
      'CERTIFICAT_REALISATION',
      ctx({ product: { ...ctx().product!, durationHours: 21 } }),
    );
    expect(autre).not.toBe(base);
  });

  it('le formateur signataire les périme', () => {
    const base = fingerprintDocumentSource('ATTESTATION_FIN', ctx());
    const autre = fingerprintDocumentSource('ATTESTATION_FIN', ctx({ primaryTrainer: 'Autre FORMATEUR' }));
    expect(autre).not.toBe(base);
  });
});

describe('stabilité dans le temps', () => {
  it('deux calculs successifs sur la même donnée donnent la même empreinte', () => {
    // Garde-fou de la règle 2 : aucune valeur dérivée de `new Date()` ne doit
    // entrer dans la projection, sinon un document devient « périmé » sans que
    // rien n'ait bougé.
    for (const type of ['CONVENTION', 'CONVOCATION', 'AGEFICE', 'ASSIDUITE', 'PROGRAMME']) {
      expect(fingerprintDocumentSource(type, ctx())).toBe(fingerprintDocumentSource(type, ctx()));
    }
  });

  it('aucune projection n’introduit une date absente du contexte', () => {
    // Toutes les dates du contexte de test, sous leur forme normalisée.
    const datesDuContexte = new Set(
      (stableStringify(ctx()).match(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g) ?? []),
    );
    for (const type of ['CONVENTION', 'CONVOCATION', 'AGEFICE', 'ASSIDUITE', 'PROGRAMME', 'ATTESTATION_FIN']) {
      const datesRendues = stableStringify(buildDocumentSource(type, ctx())).match(
        /\d{4}-\d{2}-\d{2}T[\d:.]+Z/g,
      ) ?? [];
      for (const d of datesRendues) {
        expect(datesDuContexte.has(d), `${type} : date ${d} absente du contexte`).toBe(true);
      }
    }
  });
});

describe('verdict', () => {
  it('sans empreinte stockée le verdict est « inconnu », jamais « à jour »', () => {
    expect(compareSourceFingerprint(null, 'abc')).toBe('unknown');
    expect(compareSourceFingerprint(undefined, 'abc')).toBe('unknown');
  });

  it('type non couvert (empreinte courante nulle) → inconnu', () => {
    expect(compareSourceFingerprint('abc', null)).toBe('unknown');
  });

  it('empreintes identiques → à jour ; différentes → périmé', () => {
    expect(compareSourceFingerprint('abc', 'abc')).toBe('fresh');
    expect(compareSourceFingerprint('abc', 'def')).toBe('stale');
  });
});
