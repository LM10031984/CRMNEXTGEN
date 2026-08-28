import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Devis rédigé depuis un compte rendu de rendez-vous — idée de Laurent (28/08) :
 *
 *   « souvent on revient de RDV avec un retranscript de notre RDV et les besoins
 *     du client. J'aimerais créer un devis où je mets juste le nombre de jours et
 *     le tarif, j'ai une case où je mets mon retranscript, et avec l'IA j'ai un
 *     devis propre et explicatif qui correspond à sa demande exacte. »
 *
 * Le retranscript est du VERBATIM : digressions, hésitations, phrases coupées.
 * L'extraction doit en tirer le besoin, pas le recopier — et surtout ne rien
 * ajouter : un devis est un engagement commercial, et les montants viennent de
 * ce que Laurent saisit, jamais du modèle.
 *
 * Test de puissance : retirer la règle « n'invente aucun chiffre » fait virer
 * ROUGE « interdit au modèle d'inventer des montants ».
 */

const { callLlmMock } = vi.hoisted(() => ({ callLlmMock: vi.fn() }));
vi.mock('@/lib/llm-client', () => ({ callLlm: callLlmMock }));

const EXTRACTION = {
  intituleFormation: 'Prospection immobilière assistée par IA',
  contexteClient: 'Cabinet de 8 négociateurs, portefeuille de mandats vieillissant.',
  besoins: ['Relancer les mandats expirés', 'Structurer la prospection téléphonique'],
  objectifs: ['Structurer une campagne de relance', 'Rédiger des annonces plus rapidement'],
  modules: ['Module 1 : audit du portefeuille', 'Module 2 : relance des mandats expirés'],
  publicConcerne: 'Négociateurs et assistantes commerciales',
  descriptionLigne: 'Formation « Prospection immobilière assistée par IA » — 3 jours (21 h)',
  // Assez long pour passer le schéma : un argumentaire de devis fait au moins
  // trois paragraphes, un modèle qui rend deux phrases n'a pas fait le travail.
  argumentaire:
    'Vous nous avez fait part de la difficulté de vos équipes à relancer les mandats arrivés à échéance, ' +
    'et du temps passé à rédiger les annonces. Nous vous proposons une formation courte, ancrée sur vos ' +
    'propres dossiers, qui outille ces deux moments du quotidien. Les participants repartent avec leurs ' +
    'modèles de relance et une méthode de prospection applicable dès le lendemain.',
};

beforeEach(() => {
  vi.clearAllMocks();
  callLlmMock.mockResolvedValue({ parsedJson: EXTRACTION, durationMs: 900 });
});

async function extraire(transcript = 'On a 8 négos, nos mandats dorment…', opts = {}) {
  const { extraireDevisDuRdv } = await import('../rdv-extraction');
  const r = await extraireDevisDuRdv(transcript, { jours: 3, tarifJourHT: 1200, ...opts });
  return { r, appel: callLlmMock.mock.calls[0]?.[0] };
}

describe('extraireDevisDuRdv', () => {
  it('renvoie le besoin structuré et l’argumentaire', async () => {
    const { r } = await extraire();
    expect(r?.intituleFormation).toBe('Prospection immobilière assistée par IA');
    expect(r?.modules).toHaveLength(2);
    expect(r?.argumentaire).toContain('Vous nous avez fait part');
  });

  it('transmet le compte rendu et les paramètres commerciaux saisis', async () => {
    const { appel } = await extraire('Le client veut former 8 personnes en octobre');
    expect(appel.prompt).toContain('Le client veut former 8 personnes en octobre');
    expect(appel.prompt).toContain('3');
    expect(appel.prompt).toContain('1200');
  });

  it('interdit au modèle d’inventer des montants ou des dates', async () => {
    const { appel } = await extraire();
    const consigne = `${appel.systemPrompt}`.toLowerCase();
    expect(consigne).toMatch(/n['’]invente|aucun (chiffre|montant)/);
    expect(consigne).toContain('montant');
  });

  /**
   * Un devis part chez un client : pas de promesse de résultat (« vous
   * doublerez vos ventes »), qui engagerait l'organisme au-delà du réel.
   */
  it('interdit les promesses de résultat', async () => {
    const { appel } = await extraire();
    expect(`${appel.systemPrompt}`.toLowerCase()).toMatch(/promesse|garantie|résultat/);
  });

  it('refuse un compte rendu vide plutôt que d’inventer un devis', async () => {
    const { extraireDevisDuRdv } = await import('../rdv-extraction');
    const r = await extraireDevisDuRdv('   ', { jours: 3, tarifJourHT: 1200 });
    expect(r).toBeNull();
    expect(callLlmMock).not.toHaveBeenCalled();
  });

  it('renvoie null quand le modèle rend un JSON hors format', async () => {
    callLlmMock.mockResolvedValue({ parsedJson: { intituleFormation: '' }, durationMs: 10 });
    const { r } = await extraire();
    expect(r).toBeNull();
  });
});
