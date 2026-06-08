/**
 * Smoke test des 3 wrappers d'édition inline (commit ui-e2) — verrouille
 * les garde-fous Laurent :
 *   1. Même action que la modale (updateSessionDetails)
 *   2. Même schéma de validation (per-field exporté de @qualiof/shared)
 *   3. router.refresh() UNIQUEMENT sur tarif (champ dérivant CA prévu),
 *      pas sur titre/notes (qui ne touchent pas sessionStage)
 *
 * Test source-only (pas de rendu DOM, pas de jsdom requis).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(rel: string): string {
  return readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

/** Strippe les commentaires JSDoc/JS pour éviter les faux positifs sur des
 *  garde-fous documentés dans des commentaires (ex: "pas de router.refresh"). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const titleSrc = stripComments(read('session-title-inline.tsx'));
const priceSrc = stripComments(read('session-price-inline.tsx'));
const notesSrc = stripComments(read('session-notes-inline.tsx'));
const editableSrc = stripComments(read('editable-field.tsx'));
const modalSrc = stripComments(read('edit-session-details-dialog.tsx'));
const actionSrc = stripComments(
  readFileSync(
    path.join(__dirname, '..', '..', '..', 'server', 'actions', 'sessions.ts'),
    'utf8',
  ),
);

describe('inline editors — même action que la modale', () => {
  it('SessionTitleInline appelle updateSessionDetails', () => {
    expect(titleSrc).toMatch(/from\s+['"]@\/server\/actions\/sessions['"]/);
    expect(titleSrc).toMatch(/updateSessionDetails\(/);
  });

  it('SessionPriceInline appelle updateSessionDetails', () => {
    expect(priceSrc).toMatch(/updateSessionDetails\(/);
  });

  it('SessionNotesInline appelle updateSessionDetails', () => {
    expect(notesSrc).toMatch(/updateSessionDetails\(/);
  });

  it('la modale utilise toujours le bulk schema', () => {
    expect(modalSrc).toMatch(/UpdateSessionDetailsInputSchema/);
  });
});

describe('inline editors — même schéma que la modale (source UNIQUE)', () => {
  it('SessionTitleInline importe SessionNameSchema de @qualiof/shared', () => {
    expect(titleSrc).toMatch(/SessionNameSchema/);
    expect(titleSrc).toMatch(/@qualiof\/shared/);
  });

  it('SessionPriceInline importe SessionPricePerLearnerSchema de @qualiof/shared', () => {
    expect(priceSrc).toMatch(/SessionPricePerLearnerSchema/);
    expect(priceSrc).toMatch(/@qualiof\/shared/);
  });

  it('SessionNotesInline importe SessionInternalNotesSchema de @qualiof/shared', () => {
    expect(notesSrc).toMatch(/SessionInternalNotesSchema/);
    expect(notesSrc).toMatch(/@qualiof\/shared/);
  });

  it("EditableField applique safeParse côté client AVANT l'appel server", () => {
    // Discipline : ne PAS attendre le round-trip serveur pour rejeter un
    // tarif négatif. Le schema par-champ tourne côté client.
    expect(editableSrc).toMatch(/schema\.safeParse\(/);
  });
});

describe('normalisation "champ vidé" — source UNIQUE côté action (ui-e2 garde-fou #1)', () => {
  it('updateSessionDetails importe normalizeNullableText', () => {
    expect(actionSrc).toMatch(/normalizeNullableText/);
    expect(actionSrc).toMatch(/from\s+['"]@\/lib\/sessions\/normalize-nullable-text['"]/);
  });

  it('aucun wrapper inline ne fait sa propre coercion "" → null', () => {
    // Anti-régression : si quelqu'un remet `raw === '' ? null : raw` côté
    // wrapper, la modale et l'inline divergent à nouveau sur le vide.
    expect(titleSrc).not.toMatch(/raw\.trim\(\)\s*===\s*['"]{2}/);
    expect(titleSrc).not.toMatch(/raw\s*===\s*['"]{2}\s*\?\s*null/);
    expect(notesSrc).not.toMatch(/raw\s*===\s*['"]{2}\s*\?\s*null/);
  });
});

describe('inline editors — refresh ciblé (commit ui-e2 garde-fou #2)', () => {
  it('SessionPriceInline appelle router.refresh() après save (CA prévu dérive)', () => {
    expect(priceSrc).toMatch(/useRouter\(\)/);
    expect(priceSrc).toMatch(/router\.refresh\(\)/);
    expect(priceSrc).toMatch(/onSaved=/);
  });

  it('SessionTitleInline n\'appelle PAS router.refresh (champ non-dérivant)', () => {
    // Le titre n'impacte ni sessionStage ni le caTotalHT — pas de
    // refresh lourd pour ce champ.
    expect(titleSrc).not.toMatch(/router\.refresh/);
    expect(titleSrc).not.toMatch(/useRouter/);
  });

  it('SessionNotesInline n\'appelle PAS router.refresh (champ non-dérivant)', () => {
    expect(notesSrc).not.toMatch(/router\.refresh/);
    expect(notesSrc).not.toMatch(/useRouter/);
  });
});

describe('EditableField — UX garde-fous (commit ui-e2 #3)', () => {
  it('focus auto à l\'entrée en édition', () => {
    // useEffect dépendant de `editing` qui appelle .focus()
    expect(editableSrc).toMatch(/el\.focus\(\)/);
  });

  it('Entrée = sauve / Échap = annule', () => {
    expect(editableSrc).toMatch(/e\.key === ['"]Enter['"]/);
    expect(editableSrc).toMatch(/e\.key === ['"]Escape['"]/);
  });

  it('toast.error sur échec de la server action', () => {
    expect(editableSrc).toMatch(/toast\.error\(/);
  });

  it('rollback de la valeur optimiste si action échoue', () => {
    // Anti-régression : un échec NE DOIT PAS laisser la valeur affichée
    // diverger de l'état serveur.
    expect(editableSrc).toMatch(/setOptimistic\(null\)/);
  });
});
