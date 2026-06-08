import { describe, it, expect } from 'vitest';
import {
  UpdateSessionDetailsInputSchema,
  ModalityEnum,
  SessionNameSchema,
  SessionPricePerLearnerSchema,
  SessionInternalNotesSchema,
  type UpdateSessionDetailsInput,
} from '../session';

/**
 * Tests Quick task 260523-oze — schéma Zod `UpdateSessionDetailsInputSchema`.
 *
 * Coverage :
 *  - parse OK : payload complet valide (sessionId UUID + tous les champs)
 *  - parse OK : payload minimal { sessionId }
 *  - parse OK : nullable explicites (name=null, pricePerLearner=null, internalNotes=null)
 *  - reject : sessionId pas UUID
 *  - reject : endDate < startDate (refine cross-field)
 *  - reject : capacityMax < capacityMin (refine cross-field)
 *  - reject : capacityMin < 1
 *  - reject : pricePerLearner < 0
 *  - reject : modality hors enum
 *  - reject : language vide
 *  - reject : language > 8 chars
 *  - reject : name > 200 chars
 *
 * Pattern clone-strict invoice.test.ts (Phase 11 Plan 11-04).
 */

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

describe('UpdateSessionDetailsInputSchema', () => {
  it('Test 1 — accepte un payload complet valide', () => {
    const input: UpdateSessionDetailsInput = {
      sessionId: VALID_UUID,
      name: 'Formation IA agents commerciaux',
      startDate: '2026-06-01',
      endDate: '2026-06-05',
      capacityMin: 4,
      capacityMax: 12,
      modality: 'PRESENTIEL',
      pricePerLearner: 1500.5,
      language: 'fr',
      internalNotes: 'Notes internes',
    };
    const parsed = UpdateSessionDetailsInputSchema.parse(input);
    expect(parsed.sessionId).toBe(VALID_UUID);
    expect(parsed.modality).toBe('PRESENTIEL');
    expect(parsed.pricePerLearner).toBe(1500.5);
  });

  it('Test 2 — accepte un payload minimal { sessionId }', () => {
    const parsed = UpdateSessionDetailsInputSchema.parse({
      sessionId: VALID_UUID,
    });
    expect(parsed.sessionId).toBe(VALID_UUID);
    expect(parsed.name).toBeUndefined();
    expect(parsed.startDate).toBeUndefined();
  });

  it('Test 3 — accepte les nullables explicites (name=null, pricePerLearner=null, internalNotes=null)', () => {
    const parsed = UpdateSessionDetailsInputSchema.parse({
      sessionId: VALID_UUID,
      name: null,
      pricePerLearner: null,
      internalNotes: null,
    });
    expect(parsed.name).toBeNull();
    expect(parsed.pricePerLearner).toBeNull();
    expect(parsed.internalNotes).toBeNull();
  });

  it('Test 4 — rejette sessionId qui n\'est pas un UUID', () => {
    const result = UpdateSessionDetailsInputSchema.safeParse({
      sessionId: 'not-an-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('Test 5 — rejette endDate < startDate (refine cross-field)', () => {
    const result = UpdateSessionDetailsInputSchema.safeParse({
      sessionId: VALID_UUID,
      startDate: '2026-06-05',
      endDate: '2026-06-01',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      const messages = JSON.stringify(flat);
      expect(messages).toMatch(/Date de fin/i);
    }
  });

  it('Test 5bis — accepte endDate === startDate (formation 1 jour)', () => {
    const parsed = UpdateSessionDetailsInputSchema.parse({
      sessionId: VALID_UUID,
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });
    expect(parsed.endDate).toBe('2026-06-01');
  });

  it('Test 6 — rejette capacityMax < capacityMin (refine cross-field)', () => {
    const result = UpdateSessionDetailsInputSchema.safeParse({
      sessionId: VALID_UUID,
      capacityMin: 8,
      capacityMax: 4,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = JSON.stringify(result.error.flatten());
      expect(messages).toMatch(/Capacité max/i);
    }
  });

  it('Test 7 — rejette capacityMin < 1', () => {
    const result = UpdateSessionDetailsInputSchema.safeParse({
      sessionId: VALID_UUID,
      capacityMin: 0,
    });
    expect(result.success).toBe(false);
  });

  it('Test 8 — rejette pricePerLearner < 0', () => {
    const result = UpdateSessionDetailsInputSchema.safeParse({
      sessionId: VALID_UUID,
      pricePerLearner: -10,
    });
    expect(result.success).toBe(false);
  });

  it('Test 8bis — accepte pricePerLearner = 0 (formation gratuite)', () => {
    const parsed = UpdateSessionDetailsInputSchema.parse({
      sessionId: VALID_UUID,
      pricePerLearner: 0,
    });
    expect(parsed.pricePerLearner).toBe(0);
  });

  it('Test 9 — rejette modality hors enum', () => {
    const result = UpdateSessionDetailsInputSchema.safeParse({
      sessionId: VALID_UUID,
      modality: 'BLENDED' as never,
    });
    expect(result.success).toBe(false);
  });

  it('Test 10 — rejette language vide', () => {
    const result = UpdateSessionDetailsInputSchema.safeParse({
      sessionId: VALID_UUID,
      language: '',
    });
    expect(result.success).toBe(false);
  });

  it('Test 11 — rejette language > 8 chars', () => {
    const result = UpdateSessionDetailsInputSchema.safeParse({
      sessionId: VALID_UUID,
      language: 'fr-FR-XX-YY',
    });
    expect(result.success).toBe(false);
  });

  it('Test 12 — rejette name > 200 chars', () => {
    const result = UpdateSessionDetailsInputSchema.safeParse({
      sessionId: VALID_UUID,
      name: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('Test 13 — startDate doit être au format YYYY-MM-DD', () => {
    const result = UpdateSessionDetailsInputSchema.safeParse({
      sessionId: VALID_UUID,
      startDate: '01/06/2026',
    });
    expect(result.success).toBe(false);
  });

  it('Test 14 — refine endDate < startDate ignoré si startDate non fourni', () => {
    // refine ne tire pas si l'une des deux dates n'est pas dans le payload
    const parsed = UpdateSessionDetailsInputSchema.parse({
      sessionId: VALID_UUID,
      endDate: '2026-06-01',
    });
    expect(parsed.endDate).toBe('2026-06-01');
  });
});

describe('ModalityEnum', () => {
  it('expose les 4 valeurs PRESENTIEL/DISTANCIEL/MIXTE/ELEARNING', () => {
    expect(ModalityEnum.options).toEqual(['PRESENTIEL', 'DISTANCIEL', 'MIXTE', 'ELEARNING']);
  });
});

// ─── Per-field schemas (commit ui-e2) ────────────────────────────────────
// Source UNIQUE de validation : modale (UpdateSessionDetailsInputSchema)
// ET éditeurs inline (`EditableField`) consomment ces mêmes schemas.
// Garde-fou Laurent ui-e2 : "même action ET même schéma. Sinon la modale
// refuse un tarif négatif et l'inline le laisse passer."

describe('SessionNameSchema (per-field)', () => {
  it('accepte une chaîne valide', () => {
    expect(SessionNameSchema.parse('Formation IA')).toBe('Formation IA');
  });

  it('trim avant validation', () => {
    expect(SessionNameSchema.parse('   Formation IA   ')).toBe('Formation IA');
  });

  it('accepte null (champ vidé)', () => {
    expect(SessionNameSchema.parse(null)).toBeNull();
  });

  it('rejette > 200 chars', () => {
    expect(SessionNameSchema.safeParse('a'.repeat(201)).success).toBe(false);
  });

  it('équivalent au champ name du bulk schema (mêmes règles)', () => {
    // Tarif négatif rejeté côté inline ET côté bulk — anti-régression.
    const longName = 'a'.repeat(201);
    const inlineRejected = !SessionNameSchema.safeParse(longName).success;
    const bulkRejected = !UpdateSessionDetailsInputSchema.safeParse({
      sessionId: VALID_UUID,
      name: longName,
    }).success;
    expect(inlineRejected).toBe(bulkRejected);
  });
});

describe('SessionPricePerLearnerSchema (per-field)', () => {
  it('accepte un nombre positif', () => {
    expect(SessionPricePerLearnerSchema.parse(1500.5)).toBe(1500.5);
  });

  it('accepte 0 (formation gratuite)', () => {
    expect(SessionPricePerLearnerSchema.parse(0)).toBe(0);
  });

  it('accepte null (champ vidé)', () => {
    expect(SessionPricePerLearnerSchema.parse(null)).toBeNull();
  });

  it('rejette les nombres négatifs', () => {
    const r = SessionPricePerLearnerSchema.safeParse(-1);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toMatch(/Prix HT ≥ 0/);
    }
  });

  it('même règle que la modale (inline et bulk refusent tous les deux -10)', () => {
    const inlineOk = SessionPricePerLearnerSchema.safeParse(-10).success;
    const bulkOk = UpdateSessionDetailsInputSchema.safeParse({
      sessionId: VALID_UUID,
      pricePerLearner: -10,
    }).success;
    expect(inlineOk).toBe(false);
    expect(bulkOk).toBe(false);
  });
});

describe('SessionInternalNotesSchema (per-field)', () => {
  it('accepte une chaîne', () => {
    expect(SessionInternalNotesSchema.parse('Note libre')).toBe('Note libre');
  });

  it('accepte null', () => {
    expect(SessionInternalNotesSchema.parse(null)).toBeNull();
  });

  it('accepte une chaîne vide — la normalisation vit côté action, pas côté schema', () => {
    // Choix architectural ui-e2 : modale ET inline envoient leur raw au
    // serveur. La server action (updateSessionDetails) appelle
    // `normalizeNullableText` qui transforme '' / '   ' / null en null
    // canonique. Le schema accepte '' pour que les deux chemins
    // d'écriture compilent sans coercion par-wrapper.
    expect(SessionInternalNotesSchema.parse('')).toBe('');
  });
});
