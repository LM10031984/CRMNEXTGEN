import { describe, it, expect } from 'vitest';
import {
  buildCreditNoteLine,
  buildInvoiceSource,
  buildBuyerParty,
  buildDeliveryParty,
  buildSellerParty,
  buildTrainingLines,
  checkLinesMatchTotal,
  fingerprintInvoice,
  linesTotalHT,
  missingBuyerSirenError,
  resolveSiren,
  vatCategoryFor,
} from '../invoice-snapshot';

/**
 * Lot 1 — ce qui est FIGÉ au moment de l'émission.
 *
 * Ces fonctions sont pures et c'est le point : une facture transmise à une
 * plateforme d'État ne doit plus rien devoir aux données vivantes. Ce que ces
 * tests protègent n'est pas « ça compile », c'est « la pièce dit encore la
 * même chose dans six mois ».
 */

const ORG = {
  legalName: 'BIANCO INVEST',
  siret: '12345678900019',
  siren: null,
  vatNumber: null,
  address: { street: '4 rue des Oliviers', postalCode: '06000', city: 'Nice' },
  email: 'compta@bianco.fr',
};

const SELLER_SRC = {
  legalName: 'START ACADEMY',
  siret: '98765432100014',
  siren: null,
  vatNumber: null,
  addressLine1: '12 avenue des Camélias',
  postalCode: '06800',
  city: 'Cagnes-sur-Mer',
  email: 'contact@start-academy.fr',
};

// ── SIREN ────────────────────────────────────────────────────────────────

describe('SIREN — dérivé, jamais inventé', () => {
  it('prend le SIREN quand il est là', () => {
    expect(resolveSiren({ siren: '123456789', siret: '99999999900011' })).toBe('123456789');
  });

  it('le dérive des 9 premiers chiffres du SIRET quand il manque', () => {
    // Un SIRET est un SIREN + un NIC de 5 chiffres : la dérivation est exacte,
    // ce n'est pas une devinette.
    expect(resolveSiren({ siren: null, siret: '12345678900019' })).toBe('123456789');
  });

  it('ignore les espaces de saisie', () => {
    expect(resolveSiren({ siren: ' 123 456 789 ', siret: null })).toBe('123456789');
  });

  it('rend null quand il n’y a ni SIREN ni SIRET — on ne fabrique pas un identifiant fiscal', () => {
    expect(resolveSiren({ siren: null, siret: null })).toBeNull();
    expect(resolveSiren({ siren: '', siret: '  ' })).toBeNull();
  });

  it('rend null sur un SIRET trop court plutôt qu’un SIREN tronqué', () => {
    expect(resolveSiren({ siren: null, siret: '1234' })).toBeNull();
  });
});

// ── Parties ──────────────────────────────────────────────────────────────

describe('parties figées', () => {
  it('le vendeur porte son SIREN et son adresse électronique d’annuaire', () => {
    const seller = buildSellerParty(SELLER_SRC);
    expect(seller.role).toBe('SELLER');
    expect(seller.siren).toBe('987654321');
    // 0225 = SIREN France dans l'annuaire de la réforme.
    expect(seller.electronicAddressScheme).toBe('0225');
    expect(seller.electronicAddress).toBe('987654321');
    expect(seller.countryCode).toBe('FR');
  });

  it('l’acheteur est lu depuis l’adresse Json de l’Organization', () => {
    const buyer = buildBuyerParty(ORG);
    expect(buyer.role).toBe('BUYER');
    expect(buyer.legalName).toBe('BIANCO INVEST');
    expect(buyer.siren).toBe('123456789');
    expect(buyer.addressLine1).toBe('4 rue des Oliviers');
    expect(buyer.postalCode).toBe('06000');
    expect(buyer.city).toBe('Nice');
    expect(buyer.email).toBe('compta@bianco.fr');
  });

  it('accepte l’autre orthographe d’adresse du dépôt (cp / ville)', () => {
    const buyer = buildBuyerParty({
      ...ORG,
      address: { street: '1 rue A', cp: '06400', ville: 'Cannes' },
    });
    expect(buyer.postalCode).toBe('06400');
    expect(buyer.city).toBe('Cannes');
  });

  it('sans SIREN ni SIRET, l’acheteur n’a pas d’adresse d’annuaire — et ça se voit', () => {
    const buyer = buildBuyerParty({ ...ORG, siret: null, siren: null });
    expect(buyer.siren).toBeNull();
    expect(buyer.electronicAddress).toBeNull();
    expect(buyer.electronicAddressScheme).toBeNull();
  });

  it('le lieu de formation devient la partie DELIVERY (mention obligatoire 2026)', () => {
    const d = buildDeliveryParty({
      name: 'Salle Camélias',
      legalName: null,
      address: { street: '20 rue de France', postalCode: '06000', city: 'Nice' },
    });
    expect(d).not.toBeNull();
    expect(d!.role).toBe('DELIVERY');
    expect(d!.legalName).toBe('Salle Camélias');
    expect(d!.addressLine1).toBe('20 rue de France');
    expect(d!.city).toBe('Nice');
  });

  it('pas de lieu ⇒ pas de partie DELIVERY : on préfère l’absence à une adresse inventée', () => {
    expect(buildDeliveryParty(null)).toBeNull();
    expect(buildDeliveryParty({ name: null, legalName: null, address: null })).toBeNull();
  });
});

describe('le refus d’émettre sans SIREN client', () => {
  it('nomme l’organisation et dit où corriger', () => {
    const msg = missingBuyerSirenError('BIANCO INVEST');
    expect(msg).toContain('BIANCO INVEST');
    expect(msg).toMatch(/SIREN|SIRET/);
  });
});

// ── Lignes ───────────────────────────────────────────────────────────────

const LIGNES_INPUT = {
  formationTitre: "Maîtriser l'IA",
  sessionCode: 'SES-0101',
  startDate: new Date('2026-06-01T00:00:00Z'),
  endDate: new Date('2026-06-03T00:00:00Z'),
  dureeHeures: 21,
  vatRate: 0,
  vatExemptionText: 'TVA non applicable, art. 261-4-4° du CGI.',
};

describe('lignes de facture', () => {
  it('une ligne par stagiaire, numérotées à partir de 1', () => {
    const lines = buildTrainingLines({
      ...LIGNES_INPUT,
      participants: [
        { participantId: 'p1', personFirstName: 'Jean', personLastName: 'Dupont', priceHT: 1500 },
        { participantId: 'p2', personFirstName: 'Marie', personLastName: 'Durand', priceHT: 1200 },
      ],
    });
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.position)).toEqual([1, 2]);
    expect(lines[0]!.participantId).toBe('p1');
    expect(lines[1]!.participantId).toBe('p2');
  });

  it('le libellé porte la formation ET le stagiaire — une ligne se lit seule', () => {
    const [line] = buildTrainingLines({
      ...LIGNES_INPUT,
      participants: [
        { participantId: 'p1', personFirstName: 'Jean', personLastName: 'Dupont', priceHT: 1500 },
      ],
    });
    expect(line!.label).toContain("Maîtriser l'IA");
    expect(line!.label).toContain('Jean DUPONT');
    expect(line!.label).toContain('01/06/2026');
    expect(line!.label).toContain('03/06/2026');
  });

  it('exonéré ⇒ catégorie E et le texte de la mention, jamais un code inventé (D-2 ouverte)', () => {
    const [line] = buildTrainingLines({
      ...LIGNES_INPUT,
      participants: [
        { participantId: null, personFirstName: 'Jean', personLastName: 'Dupont', priceHT: 1500 },
      ],
    });
    expect(line!.vatCategory).toBe('E');
    expect(line!.vatExemptionReasonText).toBe('TVA non applicable, art. 261-4-4° du CGI.');
    expect(line!.vatExemptionReasonCode).toBeNull();
  });

  it('TVA non nulle ⇒ catégorie S et aucune mention d’exonération', () => {
    const [line] = buildTrainingLines({
      ...LIGNES_INPUT,
      vatRate: 20,
      participants: [
        { participantId: null, personFirstName: 'Jean', personLastName: 'Dupont', priceHT: 1000 },
      ],
    });
    expect(line!.vatCategory).toBe('S');
    expect(line!.vatExemptionReasonText).toBeNull();
    expect(vatCategoryFor(20)).toBe('S');
    expect(vatCategoryFor(0)).toBe('E');
  });

  it('quantité 1 en unité C62 : le prix est une place de formation, pas une heure', () => {
    const [line] = buildTrainingLines({
      ...LIGNES_INPUT,
      participants: [
        { participantId: null, personFirstName: 'Jean', personLastName: 'Dupont', priceHT: 1500 },
      ],
    });
    expect(line!.quantity).toBe(1);
    expect(line!.unit).toBe('C62');
    expect(line!.unitPriceHT).toBe(1500);
    expect(line!.totalHT).toBe(1500);
  });
});

describe('ligne d’avoir', () => {
  it('est NÉGATIVE — la convention de stockage du dépôt, pas celle de l’EN 16931', () => {
    const line = buildCreditNoteLine({
      originalNumber: 'FAC-000123',
      motif: 'Annulation stagiaire',
      amountHtToCredit: 500,
      vatRate: 0,
      vatExemptionText: null,
      participantId: 'p1',
    });
    expect(line.totalHT).toBe(-500);
    expect(line.unitPriceHT).toBe(-500);
    expect(line.quantity).toBe(1);
  });

  it('cite la facture d’origine et le motif dans son libellé', () => {
    const line = buildCreditNoteLine({
      originalNumber: 'FAC-000123',
      motif: 'Annulation stagiaire',
      amountHtToCredit: 500,
      vatRate: 0,
      vatExemptionText: null,
      participantId: null,
    });
    expect(line.label).toContain('FAC-000123');
    expect(line.label).toContain('Annulation stagiaire');
  });
});

// ── Contrat de montants ──────────────────────────────────────────────────

describe('contrat amountHT === Σ lines.totalHT', () => {
  const lines = (...totaux: number[]) =>
    totaux.map((t, i) => ({
      position: i + 1,
      label: 'x',
      quantity: 1,
      unit: 'C62',
      unitPriceHT: t,
      vatRate: 0,
      vatCategory: 'E' as const,
      vatExemptionReasonCode: null,
      vatExemptionReasonText: null,
      participantId: null,
      totalHT: t,
    }));

  it('somme les lignes en Number — comparer des Decimal rendrait l’égalité toujours fausse', () => {
    expect(linesTotalHT(lines(1500, 1200))).toBe(2700);
  });

  it('accepte une facture cohérente', () => {
    expect(checkLinesMatchTotal(2700, lines(1500, 1200)).ok).toBe(true);
  });

  it('refuse une facture dont les lignes ne redonnent pas le total', () => {
    const r = checkLinesMatchTotal(2700, lines(1500, 1100));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('2600');
  });

  it('tolère l’arrondi au centime, pas au-delà', () => {
    expect(checkLinesMatchTotal(1000.0, lines(333.33, 333.33, 333.34)).ok).toBe(true);
    expect(checkLinesMatchTotal(1000.0, lines(333.33, 333.33, 333.33)).ok).toBe(false);
  });

  it('vaut aussi pour un avoir, en négatif', () => {
    expect(checkLinesMatchTotal(-500, lines(-500)).ok).toBe(true);
  });

  it('refuse une facture SANS ligne : c’est exactement la facture « vide » que le lot interdit', () => {
    expect(checkLinesMatchTotal(2700, []).ok).toBe(false);
  });
});

// ── Empreinte ────────────────────────────────────────────────────────────

const SOURCE_FACTURE = {
  kind: 'FACTURE' as const,
  seller: buildSellerParty(SELLER_SRC),
  buyer: buildBuyerParty(ORG),
  delivery: null,
  formation: {
    titre: "Maîtriser l'IA",
    code: 'SES-0101',
    debut: new Date('2026-06-01T00:00:00Z'),
    fin: new Date('2026-06-03T00:00:00Z'),
    dureeHeures: 21,
    lieu: '20 rue de France à Nice',
    formateur: 'M. Jean-Guy Ourmières',
    modalite: 'en présentiel',
  },
  stagiaires: ['Jean DUPONT'],
  montants: { amountHT: 1500, vatRate: 0, amountTTC: 1500 },
  notes: null,
  reglement: { iban: 'FR7612345', bic: 'CCBPFRPP' },
};

describe('empreinte des données rendues', () => {
  it('est stable d’un appel à l’autre', () => {
    expect(fingerprintInvoice(SOURCE_FACTURE)).toBe(fingerprintInvoice(SOURCE_FACTURE));
  });

  it('change quand le PRIX change — c’est tout l’objet de E-1', () => {
    const modifie = {
      ...SOURCE_FACTURE,
      montants: { ...SOURCE_FACTURE.montants, amountHT: 1600 },
    };
    expect(fingerprintInvoice(modifie)).not.toBe(fingerprintInvoice(SOURCE_FACTURE));
  });

  it('change quand la raison sociale du payeur change', () => {
    const modifie = {
      ...SOURCE_FACTURE,
      buyer: { ...SOURCE_FACTURE.buyer, legalName: 'BIANCO HOLDING' },
    };
    expect(fingerprintInvoice(modifie)).not.toBe(fingerprintInvoice(SOURCE_FACTURE));
  });

  it('ne bouge pas si l’ORDRE des stagiaires change — un groupe est un ensemble', () => {
    const a = { ...SOURCE_FACTURE, stagiaires: ['Jean DUPONT', 'Marie DURAND'] };
    const b = { ...SOURCE_FACTURE, stagiaires: ['Marie DURAND', 'Jean DUPONT'] };
    expect(fingerprintInvoice(a)).toBe(fingerprintInvoice(b));
  });

  it('ne porte AUCUNE valeur calculée à la génération : ni numéro, ni émission, ni échéance', () => {
    // Si l'empreinte portait `new Date()`, la date d'échéance comptée depuis
    // aujourd'hui, ou la date d'émission (qui retombe sur le jour courant quand
    // la session n'est pas finie), toute facture deviendrait « périmée » le
    // lendemain sans que rien n'ait bougé. Règle 2 de source-fingerprint.ts.
    const source = JSON.stringify(buildInvoiceSource(SOURCE_FACTURE));
    for (const interdit of ['numero', 'number', 'issueDate', 'dueDate', 'echeance']) {
      expect(source).not.toContain(interdit);
    }
  });

  it('un avoir a sa propre projection — mêmes primitives, source différente', () => {
    const avoir = fingerprintInvoice({
      kind: 'AVOIR',
      seller: SOURCE_FACTURE.seller,
      buyer: SOURCE_FACTURE.buyer,
      originalNumber: 'FAC-000123',
      motif: 'Annulation stagiaire',
      montants: { amountHT: -500, vatRate: 0, amountTTC: -500 },
    });
    expect(avoir).toHaveLength(64);
    expect(avoir).not.toBe(fingerprintInvoice(SOURCE_FACTURE));
  });

  it('le motif fait partie de ce que l’avoir porte', () => {
    const base = {
      kind: 'AVOIR' as const,
      seller: SOURCE_FACTURE.seller,
      buyer: SOURCE_FACTURE.buyer,
      originalNumber: 'FAC-000123',
      montants: { amountHT: -500, vatRate: 0, amountTTC: -500 },
    };
    expect(fingerprintInvoice({ ...base, motif: 'A' })).not.toBe(
      fingerprintInvoice({ ...base, motif: 'B' }),
    );
  });
});
