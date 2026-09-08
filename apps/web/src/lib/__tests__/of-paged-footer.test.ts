import { describe, it, expect, vi } from 'vitest';

/**
 * Quick 260908-ftr — le pied de page des conventions, programmes, convocations,
 * documents légaux et exports de veille doit suivre l'écran Paramètres (la
 * BASE), pas seulement les variables d'environnement de l'hôte.
 *
 * Avant : `renderOfPagedFooter()` appelait `getOfConfig()`, qui ne lit QUE
 * l'environnement. Une même convention pouvait donc afficher deux SIRET
 * différents — celui de la base dans le corps, celui de l'environnement en pied
 * de page. Ce test verrouille la correction : quand une config est passée,
 * c'est elle qui gagne.
 */

vi.mock('@/lib/of-config', () => ({
  // L'ancien chemin : ce que dirait l'environnement seul, ici volontairement
  // périmé pour que le test échoue si on y retombe.
  getOfConfig: () => ({
    name: 'ENV ACADEMY',
    siret: '95131909400011',
    rnq: '00 00 00000 00',
    addressFull: 'Ancienne adresse, 06140 Vence',
    contact: { prenom: 'Env', nom: 'ENV', email: 'env@example.com', phone: '0000000000' },
  }),
}));

import { renderOfPagedFooter } from '../of-paged-footer';

const BDD = {
  name: 'Start Academy',
  siret: '95131909400029',
  rnq: '93 06 10481 06',
  addressFull: '12 avenue des Camélias, 06800 Cagnes-sur-Mer',
  contact: {
    prenom: 'Laurent',
    nom: 'MARX',
    email: 'formation@start-academy.fr',
    phone: '0631056390',
  },
} as never;

describe('renderOfPagedFooter', () => {
  it('utilise la config passée (lue en base) et JAMAIS celle de l’environnement', () => {
    const html = renderOfPagedFooter(BDD);
    expect(html).toContain('95131909400029');
    expect(html).toContain('Start Academy');
    expect(html).toContain('12 avenue des Camélias, 06800 Cagnes-sur-Mer');
    expect(html).toContain('Laurent MARX');
    // La régression qu'on empêche : retomber sur l'environnement.
    expect(html).not.toContain('95131909400011');
    expect(html).not.toContain('ENV ACADEMY');
  });

  it('sans config passée, retombe sur l’environnement (compatibilité)', () => {
    const html = renderOfPagedFooter();
    expect(html).toContain('ENV ACADEMY');
  });

  it('affiche le NDA et les coordonnées de contact', () => {
    const html = renderOfPagedFooter(BDD);
    expect(html).toContain('93 06 10481 06');
    expect(html).toContain('formation@start-academy.fr');
    expect(html).toContain('0631056390');
  });
});
