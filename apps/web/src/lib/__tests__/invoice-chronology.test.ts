import { describe, it, expect } from 'vitest';
import { sequencePrefixOf, chronologyWarning } from '../invoice-chronology';

/**
 * Quick 260910-lon — la sentinelle de chronologie, testée en pur.
 *
 * Elle informe, elle ne bloque pas (spec §4 : « alerte douce … ne bloque pas,
 * informe »). Le module lui-même explique pourquoi elle ne parlera
 * probablement jamais en usage normal, et pourquoi elle reste malgré tout.
 */

describe('sequencePrefixOf — le préfixe se lit sur le numéro, pas sur le tenant', () => {
  it('coupe au dernier tiret et garde le tiret', () => {
    expect(sequencePrefixOf('FAC-000032')).toBe('FAC-');
    expect(sequencePrefixOf('AVO-000004')).toBe('AVO-');
  });

  it('gère un préfixe qui contient lui-même un tiret', () => {
    // Ex. une séquence par exercice. La coupure est au DERNIER tiret.
    expect(sequencePrefixOf('F-202601-214')).toBe('F-202601-');
  });

  it('refuse ce qui n’est pas une séquence', () => {
    expect(sequencePrefixOf('SANSTIRET')).toBeNull(); // pas de tiret
    expect(sequencePrefixOf('FAC-')).toBeNull(); // rien à droite
    expect(sequencePrefixOf('FAC-00A1')).toBeNull(); // droite non numérique
    expect(sequencePrefixOf('-000012')).toBeNull(); // rien à gauche
  });
});

describe('chronologyWarning — se tait quand tout va bien', () => {
  const COURANTE = { number: 'FAC-000021', issueDate: new Date('2026-09-07T10:00:00Z') };

  it('rien à comparer : première pièce de la séquence', () => {
    expect(chronologyWarning({ ...COURANTE, previous: null })).toBeNull();
  });

  it('prédécesseur sans date d’émission : on n’invente pas une rupture', () => {
    expect(
      chronologyWarning({
        ...COURANTE,
        previous: { number: 'FAC-000020', issueDate: null },
      }),
    ).toBeNull();
  });

  it('prédécesseur antérieur : c’est le cas sain, et depuis le lot B le seul', () => {
    expect(
      chronologyWarning({
        ...COURANTE,
        previous: { number: 'FAC-000020', issueDate: new Date('2026-08-12T10:00:00Z') },
      }),
    ).toBeNull();
  });

  it('prédécesseur du MÊME JOUR à une autre heure : pas une rupture', () => {
    // La comparaison est en jours calendaires. Deux factures émises le même
    // matin, l'une à 11 h l'autre à 9 h, ne cassent rien : une pièce comptable
    // porte un jour, pas un horodatage.
    expect(
      chronologyWarning({
        number: 'FAC-000021',
        issueDate: new Date('2026-09-07T09:00:00Z'),
        previous: { number: 'FAC-000020', issueDate: new Date('2026-09-07T17:45:00Z') },
      }),
    ).toBeNull();
  });
});

describe('chronologyWarning — parle quand la date recule', () => {
  // Le cas FAC-000021 du §5 de la spec, tel qu'il s'est produit le 04/09/2026.
  const RUPTURE = chronologyWarning({
    number: 'FAC-000021',
    issueDate: new Date('2026-04-23T10:00:00Z'),
    previous: { number: 'FAC-000020', issueDate: new Date('2026-08-12T10:00:00Z') },
  });

  it('rend une phrase, pas null', () => {
    expect(RUPTURE).not.toBeNull();
    expect(typeof RUPTURE).toBe('string');
  });

  it('nomme les deux pièces', () => {
    expect(RUPTURE).toContain('FAC-000021');
    expect(RUPTURE).toContain('FAC-000020');
  });

  it('donne les deux dates en jj/mm/aaaa', () => {
    expect(RUPTURE).toContain('23/04/2026');
    expect(RUPTURE).toContain('12/08/2026');
  });

  it('dit que la facture EST émise — on informe, on ne refuse pas', () => {
    expect(RUPTURE).toMatch(/émise/i);
  });

  it('parle aussi pour un recul d’un seul jour', () => {
    const veille = chronologyWarning({
      number: 'FAC-000026',
      issueDate: new Date('2026-04-13T23:00:00Z'),
      previous: { number: 'FAC-000025', issueDate: new Date('2026-04-14T01:00:00Z') },
    });
    expect(veille).not.toBeNull();
    expect(veille).toContain('13/04/2026');
    expect(veille).toContain('14/04/2026');
  });
});
