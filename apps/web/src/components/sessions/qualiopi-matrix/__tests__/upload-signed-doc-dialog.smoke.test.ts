import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test source-regex `UploadSignedDocDialog` (Phase 9.1 Plan 02 Task 3).
 *
 * Pattern Phase 9 D-Phase9-N (lead-distribution-pie.test.tsx).
 *
 * Couverture (6 grep-tests) :
 *  1. exporte UploadSignedDocDialog + utilise Radix Dialog (modale centrée)
 *  2. Dialog.Title "Téléverser le PDF signé" (FR copy exact UI-SPEC)
 *  3. input accept="application/pdf" + label htmlFor (a11y)
 *  4. validation client : MAX_BYTES 10Mo + erreurs FR "Fichier trop volumineux" / "Format non supporté"
 *  5. pending state Loader2 + "Téléversement…"
 *  6. wires server action uploadSignedDoc avec FormData
 */

const componentSrc = readFileSync(
  path.join(__dirname, '..', 'upload-signed-doc-dialog.tsx'),
  'utf-8',
);

describe('UploadSignedDocDialog smoke (Phase 9.1 Plan 02)', () => {
  it('exports UploadSignedDocDialog and uses Radix Dialog (modale centrée)', () => {
    expect(componentSrc).toMatch(/export\s+function\s+UploadSignedDocDialog/);
    expect(componentSrc).toMatch(/from\s+['"]@radix-ui\/react-dialog['"]/);
    expect(componentSrc).toMatch(/Dialog\.Root/);
    expect(componentSrc).toMatch(/Dialog\.Title/);
  });

  it('Dialog title uses exact French copywriting "Téléverser le PDF signé"', () => {
    expect(componentSrc).toContain('Téléverser le PDF signé');
  });

  it('file input accepts application/pdf + label htmlFor for a11y', () => {
    expect(componentSrc).toMatch(/accept=['"]application\/pdf['"]/);
    expect(componentSrc).toMatch(/htmlFor=/);
  });

  it('validates 10MB max + emits FR error messages (Format non supporté / Fichier trop volumineux)', () => {
    expect(componentSrc).toMatch(/10\s*\*\s*1024\s*\*\s*1024/);
    expect(componentSrc).toContain('Format non supporté');
    expect(componentSrc).toContain('Fichier trop volumineux');
    expect(componentSrc).toMatch(/role=['"]alert['"]/);
  });

  it('pending state shows Loader2 + "Téléversement…" copy', () => {
    expect(componentSrc).toMatch(/Loader2/);
    expect(componentSrc).toMatch(/animate-spin/);
    expect(componentSrc).toContain('Téléversement');
  });

  it('wires uploadSignedDoc server action with FormData', () => {
    expect(componentSrc).toMatch(/uploadSignedDoc/);
    expect(componentSrc).toMatch(/FormData/);
    expect(componentSrc).toMatch(/['"]@\/server\/actions\/qualiopi-matrix['"]/);
  });
});
