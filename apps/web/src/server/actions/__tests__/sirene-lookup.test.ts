import { describe, it, expect } from 'vitest';
import { normalizeApe, parseSireneResult } from '@/lib/sirene';

// Forme réelle d'un résultat recherche-entreprises.api.gouv.fr (TAYLOR BRIVAL,
// SIREN 809722309), tronquée aux champs utilisés par le parseur.
const SAMPLE = {
  siren: '809722309',
  nom_complet: 'TAYLOR BRIVAL',
  nom_raison_sociale: null,
  siege: {
    activite_principale: '46.19B',
    adresse: '16 RUE MARIE BASHKIRTSEFF 06200 NICE',
    code_postal: '06200',
    commune: '06088',
    etat_administratif: 'A',
  },
};

describe('normalizeApe', () => {
  it('retire le point et met en majuscule', () => {
    expect(normalizeApe('46.19B')).toBe('4619B');
    expect(normalizeApe('46.19 b')).toBe('4619B');
  });
  it('laisse un code déjà propre', () => {
    expect(normalizeApe('6831Z')).toBe('6831Z');
  });
  it('renvoie null pour vide/nul', () => {
    expect(normalizeApe(null)).toBeNull();
    expect(normalizeApe('')).toBeNull();
  });
});

describe('parseSireneResult', () => {
  it('extrait siren, dénomination, code APE et adresse structurée', () => {
    const c = parseSireneResult(SAMPLE);
    expect(c).not.toBeNull();
    expect(c!.siren).toBe('809722309');
    expect(c!.denomination).toBe('TAYLOR BRIVAL');
    expect(c!.codeApe).toBe('4619B'); // point retiré
    expect(c!.street).toBe('16 RUE MARIE BASHKIRTSEFF');
    expect(c!.postalCode).toBe('06200');
    expect(c!.city).toBe('NICE');
    expect(c!.cessee).toBe(false);
  });

  it('gère une adresse sans motif CP/ville (rue seule)', () => {
    const c = parseSireneResult({ siren: '123456789', siege: { adresse: 'LIEU DIT LES OLIVIERS', activite_principale: '6831Z' } });
    expect(c!.street).toBe('LIEU DIT LES OLIVIERS');
    expect(c!.city).toBeNull();
    expect(c!.codeApe).toBe('6831Z');
  });

  it('renvoie null si pas de siren (résultat vide)', () => {
    expect(parseSireneResult(null)).toBeNull();
    expect(parseSireneResult({})).toBeNull();
  });

  it('détecte un établissement cessé', () => {
    const c = parseSireneResult({ siren: '999999999', siege: { etat_administratif: 'F', activite_principale: '6831Z' } });
    expect(c!.cessee).toBe(true);
  });
});
