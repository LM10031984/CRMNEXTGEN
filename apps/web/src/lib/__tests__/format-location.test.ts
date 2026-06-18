import { describe, it, expect } from 'vitest';

import { formatLocation } from '../format-location';

describe('formatLocation', () => {
  // Test 1 — anti-duplication SES-0087 : la ville ne doit apparaître qu'une fois.
  it('ne duplique pas la ville quand name contient déjà la ville (SES-0087)', () => {
    const out = formatLocation({
      name: 'Vitrolles — Nestenn',
      address: { street: 'Nestenn, place de provence', city: 'Vitrolles', postalCode: '13127' },
    });
    expect(out).toBeTruthy();
    // "Vitrolles" exactement une fois
    const occurrences = (out!.match(/Vitrolles/g) ?? []).length;
    expect(occurrences).toBe(1);
    // pas la forme buguée "Vitrolles — Nestenn — Vitrolles"
    expect(out).not.toContain('Vitrolles — Nestenn — Vitrolles');
    // contient l'adresse propre
    expect(out).toContain('13127');
    expect(out).toContain('Vitrolles');
  });

  // Test 2 — titlecase léger (COR-6) : la rue est capitalisée, le CP+ville restent intacts.
  it('capitalise la rue sans casser le code postal ni la ville', () => {
    const out = formatLocation({
      name: 'Vitrolles — Nestenn',
      address: { street: 'place de provence', city: 'Vitrolles', postalCode: '13127' },
    });
    expect(out).toBeTruthy();
    expect(out).toContain('Place'); // "place" → "Place"
    expect(out).toContain('Provence'); // "provence" → "Provence"
    expect(out).toContain('13127'); // code postal intact
    expect(out).toContain('Vitrolles'); // ville intacte
  });

  // Test 3 — name ne contient PAS la ville → on le conserve en préfixe.
  it('conserve le name en préfixe quand il ne contient pas la ville', () => {
    const out = formatLocation({
      name: 'Agence Centre',
      address: { street: '12 rue X', city: 'Nice', postalCode: '06000' },
    });
    expect(out).toBeTruthy();
    expect(out).toContain('Agence Centre');
    expect(out).toContain('Nice');
    expect(out).toContain('06000');
    expect(out).toContain('Rue X'); // "12 rue X" → "12 Rue X"
  });

  // Test 4 — address null → retourne le name nettoyé, pas de " — undefined".
  it('retourne le name nettoyé quand address est null', () => {
    const out = formatLocation({ name: 'Salle Provence', address: null });
    expect(out).toBeTruthy();
    expect(out).not.toContain('undefined');
    expect(out).toContain('Salle Provence');
  });

  // Test 5 — location null → null.
  it('retourne null pour une location null', () => {
    expect(formatLocation(null)).toBeNull();
  });
});
