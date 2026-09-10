import { describe, expect, it } from 'vitest';

import {
  citationAncree,
  normaliserExtraction,
  normaliserTexte,
  type PropositionIA,
  type ReponseExistante,
} from '../normalize';

/**
 * Un transcript court mais réaliste : tours de parole, hésitations, chiffres
 * donnés en passant. C'est la matière que le lot C doit savoir traiter.
 */
const TRANSCRIPT = `
Laurent : Racontez-moi, vous faites quoi exactement ?
Dirigeant : Alors nous, c'est de la transaction ancien, essentiellement. Un peu de
location aussi mais c'est marginal.
Laurent : Et en chiffre d'affaires, l'année dernière ?
Dirigeant : On a fait 720 000 euros hors taxes sur 2025. Enfin, 720 et des poussières.
Laurent : Une prise en charge refusée, déjà ?
Dirigeant : Non, jamais, on n'a jamais essuyé de refus là-dessus.
`;

const prop = (
  questionId: string,
  value: unknown,
  confidence: number,
  quote: string,
): PropositionIA => ({ questionId, value, confidence, quote });

const existante = (
  questionId: string,
  value: unknown,
  origin: 'COMMERCIAL' | 'IA_TRANSCRIPT' = 'COMMERCIAL',
  confirmed = true,
): ReponseExistante => ({ questionId, value, isSkipped: false, origin, confirmed });

const normaliser = (propositions: PropositionIA[], existantes: ReponseExistante[] = []) =>
  normaliserExtraction({
    propositions,
    transcript: TRANSCRIPT,
    variant: 'LEGER',
    existantes,
  });

const motifs = (r: ReturnType<typeof normaliser>) => r.rejets.map((x) => x.motif);

describe('Ancrage de la citation dans le transcript', () => {
  it('écrase casse, accents, ponctuation et retours à la ligne', () => {
    expect(normaliserTexte('On a fait 720 000 €,\n  hors TAXES.')).toBe('on a fait 720 000 hors taxes');
  });

  it('retrouve une citation recollée autrement par le modèle', () => {
    expect(citationAncree('ON A FAIT 720 000 EUROS hors taxes !', normaliserTexte(TRANSCRIPT))).toBe(
      true,
    );
  });

  it("refuse une reformulation, si fidèle soit-elle — ce n'est plus une citation", () => {
    expect(citationAncree('le dirigeant déclare 720 000 euros de CA', normaliserTexte(TRANSCRIPT))).toBe(
      false,
    );
  });

  it('refuse une citation trop courte pour prouver quoi que ce soit', () => {
    expect(citationAncree('720 000', normaliserTexte(TRANSCRIPT))).toBe(false);
  });
});

describe('Ce qui passe', () => {
  it('retient une réponse chiffrée, citation à l’appui, et normalise la valeur', () => {
    const r = normaliser([
      prop('identity-revenue-n1', '720 000 €', 0.95, 'On a fait 720 000 euros hors taxes sur 2025'),
    ]);
    expect(r.rejets).toEqual([]);
    expect(r.retenues).toHaveLength(1);
    // La valeur est passée par le validateur du référentiel : un nombre, pas
    // la chaîne « 720 000 € » que le moteur budget lirait en NaN.
    expect(r.retenues[0]!.value).toBe(720000);
  });

  it('retient un multichoice dont toutes les valeurs sont au référentiel', () => {
    const r = normaliser([
      prop(
        'identity-activities',
        ['transaction_ancien', 'location'],
        0.9,
        "c'est de la transaction ancien, essentiellement. Un peu de location",
      ),
    ]);
    expect(r.retenues[0]!.value).toEqual(['transaction_ancien', 'location']);
  });

  it('retient un yesno rendu au format technique', () => {
    const r = normaliser([
      prop('funding-past-refusals', 'no', 0.92, "Non, jamais, on n'a jamais essuyé de refus"),
    ]);
    expect(r.retenues[0]!.value).toBe('no');
  });
});

describe('Ce qui est rejeté — le garde-fou du lot', () => {
  it("rejette une citation introuvable, même si la réponse est plausible", () => {
    const r = normaliser([
      prop('identity-revenue-n1', 850000, 0.95, 'notre chiffre d’affaires atteint 850 000 euros'),
    ]);
    expect(motifs(r)).toEqual(['citation-absente']);
    expect(r.retenues).toEqual([]);
  });

  it('rejette une question qui n’existe pas au référentiel', () => {
    const r = normaliser([
      prop('chiffre-affaires-2025', 720000, 0.9, 'On a fait 720 000 euros hors taxes'),
    ]);
    expect(motifs(r)).toEqual(['question-inconnue']);
  });

  it("rejette une question hors variante — un léger ne se remplit pas d'invisible", () => {
    const r = normaliser([
      prop('identity-agencies-count', 2, 0.9, 'On a fait 720 000 euros hors taxes sur 2025'),
    ]);
    expect(motifs(r)).toEqual(['hors-variante']);
  });

  it('ne touche JAMAIS une réponse du commercial (mode HYBRIDE)', () => {
    const r = normaliser(
      [prop('identity-revenue-n1', 720000, 0.99, 'On a fait 720 000 euros hors taxes sur 2025')],
      [existante('identity-revenue-n1', 690000)],
    );
    expect(motifs(r)).toEqual(['deja-repondu']);
  });

  it('ne repasse pas non plus sur une réponse IA déjà confirmée par un humain', () => {
    const r = normaliser(
      [prop('identity-revenue-n1', 720000, 0.99, 'On a fait 720 000 euros hors taxes sur 2025')],
      [existante('identity-revenue-n1', 690000, 'IA_TRANSCRIPT', true)],
    );
    expect(motifs(r)).toEqual(['deja-repondu']);
  });

  it('accepte en revanche de remplacer une extraction non encore relue', () => {
    const r = normaliser(
      [prop('identity-revenue-n1', 720000, 0.99, 'On a fait 720 000 euros hors taxes sur 2025')],
      [existante('identity-revenue-n1', 690000, 'IA_TRANSCRIPT', false)],
    );
    expect(r.rejets).toEqual([]);
    expect(r.retenues).toHaveLength(1);
  });

  it('rejette une valeur que le référentiel ne reconnaît pas', () => {
    const r = normaliser([
      prop('identity-activities', ['viager'], 0.8, "c'est de la transaction ancien, essentiellement"),
    ]);
    expect(motifs(r)).toEqual(['valeur-invalide']);
  });

  it('rejette une valeur vide — une absence n’est pas une réponse', () => {
    const r = normaliser([
      prop('identity-revenue-n1', '', 0.8, 'On a fait 720 000 euros hors taxes sur 2025'),
    ]);
    expect(motifs(r)).toEqual(['valeur-invalide']);
  });

  it('rejette une confiance hors de [0, 1]', () => {
    const r = normaliser([
      prop('identity-revenue-n1', 720000, 1.4, 'On a fait 720 000 euros hors taxes sur 2025'),
    ]);
    expect(motifs(r)).toEqual(['confiance-invalide']);
  });

  it('ne garde qu’une réponse par question', () => {
    const citation = 'On a fait 720 000 euros hors taxes sur 2025';
    const r = normaliser([
      prop('identity-revenue-n1', 720000, 0.9, citation),
      prop('identity-revenue-n1', 730000, 0.8, citation),
    ]);
    expect(r.retenues).toHaveLength(1);
    expect(motifs(r)).toEqual(['doublon']);
  });
});

describe('Conditions d’affichage', () => {
  const normaliserComplet = (propositions: PropositionIA[]) =>
    normaliserExtraction({ propositions, transcript: TRANSCRIPT, variant: 'COMPLET', existantes: [] });

  it("rejette la question de suivi quand la condition n'est pas remplie", () => {
    const r = normaliserComplet([
      prop('funding-past-refusals', 'no', 0.9, "Non, jamais, on n'a jamais essuyé de refus"),
      prop('funding-past-refusals-reason', 'dossier hors délai', 0.6, "on n'a jamais essuyé de refus là-dessus"),
    ]);
    expect(r.retenues.map((x) => x.questionId)).toEqual(['funding-past-refusals']);
    expect(motifs(r)).toEqual(['hors-condition']);
  });

  it('la garde quand la réponse dont elle dépend arrive dans le même lot', () => {
    const r = normaliserExtraction({
      propositions: [
        prop('funding-past-refusals', 'yes', 0.9, "Non, jamais, on n'a jamais essuyé de refus"),
        prop('funding-past-refusals-reason', 'dossier hors délai', 0.6, "on n'a jamais essuyé de refus là-dessus"),
      ],
      transcript: TRANSCRIPT,
      variant: 'COMPLET',
      existantes: [],
    });
    expect(r.retenues).toHaveLength(2);
  });
});
