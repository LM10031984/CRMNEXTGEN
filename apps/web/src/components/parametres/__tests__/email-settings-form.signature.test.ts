import { describe, it, expect, vi } from 'vitest';

/**
 * Le CÂBLAGE de la catégorie « signature » jusqu'à l'écran Paramètres — T1.3.
 *
 * CE QUE CE FICHIER GARDE. `resolveEmailPolicy` peut connaître la catégorie
 * `signature`, `EMAIL_CATEGORY_LABELS` peut porter son libellé, la colonne peut
 * exister en base : si la ligne n'est pas dans le tableau `CATEGORY_FIELDS` du
 * formulaire, **la case n'apparaît nulle part** et personne ne peut jamais la
 * cocher. La catégorie serait alors éternellement `false`, donc la chaîne de
 * signature éternellement muette — sans une seule erreur.
 *
 * ⚠ Le tableau doit rester ÉCRIT EN DUR dans le formulaire. Le dériver de
 * `EMAIL_CATEGORY_FIELD` rendrait ce test tautologique : il vérifierait que la
 * map est cohérente avec elle-même. C'est le mode de panne n°1.
 */

// La server action importe Prisma : on la coupe, on ne teste pas la persistance ici.
vi.mock('@/server/actions/email-settings', () => ({
  updateEmailSettings: vi.fn(),
}));

import { CATEGORY_FIELDS } from '../email-settings-form';

describe('EmailSettingsForm — la ligne « signature » existe dans le tableau rendu', () => {
  it('T1.3 — CATEGORY_FIELDS porte { category: signature, field: signatureEmailsEnabled }', () => {
    const ligne = CATEGORY_FIELDS.find((c) => c.category === 'signature');
    expect(ligne).toBeDefined();
    expect(ligne!.field).toBe('signatureEmailsEnabled');
  });

  it('le hint dit QUI est prévenu et ce qui reste possible sans email', () => {
    const ligne = CATEGORY_FIELDS.find((c) => c.category === 'signature');
    expect(ligne!.hint).toContain('signataire');
    // Un refus qui ne propose pas de sortie est un mur : décochée, le lien
    // reste copiable depuis la fiche session.
    expect(ligne!.hint).toContain('copiable');
  });

  it('PUISSANCE — chaque champ du tableau est unique et pointe une catégorie distincte', () => {
    const champs = CATEGORY_FIELDS.map((c) => c.field);
    const categories = CATEGORY_FIELDS.map((c) => c.category);
    expect(new Set(champs).size).toBe(champs.length);
    expect(new Set(categories).size).toBe(categories.length);
  });
});
