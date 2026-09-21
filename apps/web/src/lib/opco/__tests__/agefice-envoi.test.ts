import { describe, it, expect } from 'vitest';
import { controlePiecesAgefice, messageAgefice, validerNir } from '../agefice-envoi';

describe('envois AGEFICE', () => {
  it('reprend le message initial et la signature fixe', () => {
    expect(messageAgefice('PRISE_EN_CHARGE', 'Jean', 'Dupont', '185057800608491').text).toBe(
      'Bonjour,\n\nJe vous prie de trouver ci-joint une nouvelle demande de prise en charge pour Jean DUPONT\nSon numéro de sécurité sociale : 185057800608491\n\nMerci\n\nBien à vous,\n\nBéatrice Blanc',
    );
  });
  it('prépare la fin sans NIR avec une seule signature et échappe le HTML', () => {
    const mail = messageAgefice('FIN_FORMATION', '<Jean>', 'Dupont');
    expect(mail.subject).toBe('FIN DE FORMATION pour <Jean> DUPONT');
    expect(mail.html).toContain('&lt;Jean&gt;');
    expect(mail.text.match(/Béatrice Blanc/g)).toHaveLength(1);
    expect(mail.text).not.toContain('sécurité sociale');
  });
  it('valide NIR 13/15 chiffres et clé (sans stocker/loguer les valeurs)', () => {
    expect(validerNir('1 85 05 78 006 084 91')).toBe('185057800608491');
    expect(validerNir('1850578006084')).toBe('1850578006084');
    expect(validerNir('185057800608436')).toBeNull();
    expect(validerNir('')).toBeNull();
  });
  const initial = [
    'CNI',
    'RIB',
    'CFP_ATTESTATION',
    'CONVENTION',
    'AGEFICE_PA_FORM',
    'PROGRAMME',
  ].map((kind) => ({ kind, key: kind, included: true, signe: true }));
  it.each(initial.filter((p) => p.kind !== 'RIB').map((p) => p.kind))(
    'bloque la pièce absente ou décochée %s',
    (kind) => {
      expect(
        controlePiecesAgefice(
          initial.filter((p) => p.kind !== kind),
          'PRISE_EN_CHARGE',
        ),
      ).not.toBeNull();
      expect(
        controlePiecesAgefice(
          initial.map((p) => ({ ...p, included: p.kind !== kind })),
          'PRISE_EN_CHARGE',
        ),
      ).not.toBeNull();
    },
  );
  it('bloque signatures inconnues, mais ne demande aucune signature au RIB', () => {
    expect(controlePiecesAgefice(initial, 'PRISE_EN_CHARGE')).toBeNull();
    expect(
      controlePiecesAgefice(
        initial.map((p) => ({ ...p, signe: p.kind === 'RIB' ? false : true })),
        'PRISE_EN_CHARGE',
      ),
    ).toBeNull();
    expect(
      controlePiecesAgefice(
        initial.map((p) => ({ ...p, signe: undefined })),
        'PRISE_EN_CHARGE',
      ),
    ).toContain('sign');
  });
  it('exige les trois pièces de fin et leurs signatures', () => {
    const end = ['RIB', 'EMARGEMENT', 'ASSIDUITE', 'FACTURE_ACQUITTEE'].map((kind) => ({
      kind,
      key: kind,
      included: true,
      signe: true,
    }));
    expect(controlePiecesAgefice(end, 'FIN_FORMATION')).toBeNull();
    expect(
      controlePiecesAgefice(
        end.filter((p) => p.kind !== 'RIB'),
        'FIN_FORMATION',
      ),
    ).toBeNull();
    expect(
      controlePiecesAgefice(
        end.map((p) => ({ ...p, signe: false })),
        'FIN_FORMATION',
      ),
    ).toContain('sign');
  });
});
