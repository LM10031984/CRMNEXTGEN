import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(__dirname, '..', 'page.tsx'), 'utf8');

describe('Dossiers OPCO — séparation portail entreprise / email AGEFICE', () => {
  it('branche les salariés vers le groupe session sans action mail', () => {
    expect(source).toContain('Portail OPCO');
    expect(source).toContain('#depot-${r.sponsorOrgId}');
    expect(source).toMatch(/company \? \([\s\S]*Pièces et dépôt du groupe[\s\S]*\) : \(/);
  });

  it('réserve la fin de formation et le badge conforme aux dossiers AGEFICE', () => {
    expect(source).toContain(
      'agefice && <ComposeOpcoButton participantId={r.id} stage="FIN_FORMATION"',
    );
    expect(source).toContain('Conforme et déposé');
    expect(source).toContain('find(isSuccessfulInitialSubmission)');
  });
});
