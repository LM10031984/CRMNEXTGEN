import { describe, it, expect } from 'vitest';
import { parseFrom, labelForFrom, withFrom } from '../from-link';

describe('parseFrom', () => {
  it('accepte un chemin interne de l’app', () => {
    expect(parseFrom('/app/sessions/abc-123')).toBe('/app/sessions/abc-123');
  });

  it('rejette une absence de valeur', () => {
    expect(parseFrom(undefined)).toBeNull();
    expect(parseFrom(null)).toBeNull();
    expect(parseFrom('')).toBeNull();
  });

  // Anti open-redirect : la valeur vient de l'URL, donc de n'importe qui.
  it('rejette les destinations externes', () => {
    expect(parseFrom('https://evil.test/app/sessions/x')).toBeNull();
    expect(parseFrom('//evil.test')).toBeNull();
    expect(parseFrom('/app/\\evil.test')).toBeNull();
    expect(parseFrom('javascript:alert(1)')).toBeNull();
  });

  it('rejette un chemin interne hors de /app/', () => {
    expect(parseFrom('/login')).toBeNull();
    expect(parseFrom('/p/token-public')).toBeNull();
  });

  it('rejette les caractères de contrôle', () => {
    expect(parseFrom('/app/sessions/a\nb')).toBeNull();
  });
});

describe('labelForFrom', () => {
  it('donne un libellé métier selon l’origine', () => {
    expect(labelForFrom('/app/sessions/x', 'Retour')).toBe('Retour à la session');
    expect(labelForFrom('/app/organisations/x', 'Retour')).toBe("Retour à l'organisation");
    expect(labelForFrom('/app/budget-agefice', 'Retour')).toBe('Retour au budget AGEFICE');
  });

  it('retombe sur le libellé par défaut pour une origine inconnue', () => {
    expect(labelForFrom('/app/veille', 'Retour à la liste')).toBe('Retour à la liste');
  });
});

describe('withFrom', () => {
  it('ajoute le paramètre', () => {
    expect(withFrom('/app/apprenants/42', '/app/sessions/7')).toBe(
      '/app/apprenants/42?from=%2Fapp%2Fsessions%2F7',
    );
  });

  it('préserve les query params existants', () => {
    expect(withFrom('/app/apprenants/42?tab=activity', '/app/sessions/7')).toBe(
      '/app/apprenants/42?tab=activity&from=%2Fapp%2Fsessions%2F7',
    );
  });

  it('préserve le fragment', () => {
    expect(withFrom('/app/apprenants/42?tab=activity#inscriptions-list', '/app/sessions/7')).toBe(
      '/app/apprenants/42?tab=activity&from=%2Fapp%2Fsessions%2F7#inscriptions-list',
    );
  });

  it('laisse le lien intact si l’origine est absente ou invalide', () => {
    expect(withFrom('/app/apprenants/42', undefined)).toBe('/app/apprenants/42');
    expect(withFrom('/app/apprenants/42', 'https://evil.test')).toBe('/app/apprenants/42');
  });
});
