import { describe, expect, it } from 'vitest';

import {
  citationAncree,
  depouillerTranscript,
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

/**
 * Cas réels, relevés le 11/09/2026 sur un compte rendu de rendez-vous chez un
 * groupe immobilier — premier vrai transcript passé dans la chaîne.
 *
 * Ce qu'ils ont révélé : le contrôle de citation rejetait 5 propositions sur 6
 * pour une seule raison — un dirigeant répond au tour de parole SUIVANT la
 * question, le modèle cite les deux ensemble (ce qui est fidèle), et le texte
 * source intercale « 00:17:19 Speaker 3 » entre les deux. Le garde-fou mordait
 * la main du modèle honnête.
 *
 * PROTOCOLE DE MUTATION (vérifié le 11/09/2026) : retirer `depouillerTranscript`
 * de `normaliserTexte` fait virer ROUGE les deux tests d'enjambement, et laisse
 * VERT celui de la reformulation — c'est exactement la frontière qu'on tient.
 */
describe('Transcript diarisé — la parole traverse les tours', () => {
  const DIARISE = `00:17:08 laurent Marx
On peut mettre combien de personnes en même temps ? Mais nous,
00:17:19 Speaker 3
On doit être.
00:17:21 Speaker 1
27-28. Si on le fait 2 fois 12, 2 fois 13, c'est bien.`;

  it("ne garde que la parole, pas l'horodatage ni le locuteur", () => {
    const nu = depouillerTranscript(DIARISE);
    expect(nu).not.toContain('00:17:19');
    expect(nu).not.toContain('Speaker 3');
    expect(nu).toContain('27-28');
  });

  it('accepte une citation qui enjambe deux changements de locuteur', () => {
    // Le cas exact qui échouait : la question et sa réponse sont séparées par
    // deux en-têtes de diarisation.
    expect(
      citationAncree(
        "On peut mettre combien de personnes en même temps ? Mais nous, On doit être. 27-28.",
        normaliserTexte(DIARISE),
      ),
    ).toBe(true);
  });

  it('accepte le format WebVTT, dont les cues ne sont pas de la parole', () => {
    const vtt = `00:00:01.000 --> 00:00:05.000
Nous, avant, on était Agefis, mais ça n'existe plus aujourd'hui.
00:00:05.000 --> 00:00:09.000
Ah si, ça l'est toujours.`;
    expect(
      citationAncree("on était Agefis, mais ça n'existe plus aujourd'hui. Ah si, ça l'est toujours.", normaliserTexte(vtt)),
    ).toBe(true);
  });

  it("rejette toujours une reformulation d'un seul mot", () => {
    // Relevé le même jour : le transcript dit « l'on ne s'en sert pas », le
    // modèle a écrit « l'on ne se sert pas ». Un mot de moins, donc rejet.
    const source = `00:41:57 Speaker 1
On a changé plusieurs fois et je reconnais que l'on ne s'en sert pas.`;
    expect(
      citationAncree("On a changé plusieurs fois et je reconnais que l'on ne se sert pas.", normaliserTexte(source)),
    ).toBe(false);
  });

  it("ne prend pas une ligne de parole pour un en-tête, même si elle commence par une heure", () => {
    const source = `00:14:57 laurent Marx
9h30 est l'heure à laquelle vos clients reçoivent leur message d'anniversaire chaque matin.`;
    expect(citationAncree("9h30 est l'heure à laquelle vos clients reçoivent leur message", normaliserTexte(source))).toBe(
      true,
    );
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
