import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Lot B — sélection du provider, fail-closed (spec 2026-09-04 §5 lot B).
 *
 * Règle du lot, non négociable : « sans clé en prod → bouton désactivé avec
 * message, JAMAIS d'envoi silencieux ». Deux conséquences testées ici :
 *  - en production, une configuration incomplète ne doit pas retomber en
 *    dry-run (l'admin croirait avoir envoyé une convention qui n'est jamais
 *    partie) : elle doit rendre la fonction indisponible, avec un motif lisible ;
 *  - en développement, l'absence de clé bascule en dry-run explicite, pour que
 *    le lot C soit démontrable sans compte DocuSeal.
 *
 * HERMÉTIQUE : `@qualiof/shared/env` mocké via un objet mutable (leçon 17-02 —
 * ne jamais importer un module qui exécute `createEnv()` au chargement).
 */

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    NODE_ENV: 'development' as string,
    SIGNATURE_PROVIDER: 'dry-run' as string,
    DOCUSEAL_API_KEY: undefined as string | undefined,
    DOCUSEAL_BASE_URL: 'https://api.docuseal.com',
    DOCUSEAL_WEBHOOK_SECRET: undefined as string | undefined,
  },
}));

vi.mock('@qualiof/shared/env', () => ({
  get sharedEnv() {
    return mockEnv;
  },
}));

vi.stubGlobal('fetch', vi.fn());

import {
  getSignatureProvider,
  getSignatureProviderStatus,
  SignatureNotConfiguredError,
} from '@/lib/signature/provider';

describe('getSignatureProvider — configuration complète', () => {
  beforeEach(() => {
    mockEnv.NODE_ENV = 'production';
    mockEnv.SIGNATURE_PROVIDER = 'docuseal';
    mockEnv.DOCUSEAL_API_KEY = 'k-live';
    mockEnv.DOCUSEAL_WEBHOOK_SECRET = 'whsec_x';
  });

  it('rend l’adaptateur DocuSeal', () => {
    expect(getSignatureProvider().name).toBe('docuseal');
    expect(getSignatureProviderStatus()).toEqual({ available: true, provider: 'docuseal' });
  });
});

describe('fail-closed en production', () => {
  beforeEach(() => {
    mockEnv.NODE_ENV = 'production';
    mockEnv.SIGNATURE_PROVIDER = 'docuseal';
    mockEnv.DOCUSEAL_API_KEY = undefined;
    mockEnv.DOCUSEAL_WEBHOOK_SECRET = undefined;
  });

  it('sans clé API : indisponible, avec un motif affichable à l’admin', () => {
    const status = getSignatureProviderStatus();
    expect(status.available).toBe(false);
    expect(status.reason).toMatch(/DOCUSEAL_API_KEY/);
  });

  it('sans clé API : l’appel lève plutôt que de retomber en dry-run', () => {
    expect(() => getSignatureProvider()).toThrow(SignatureNotConfiguredError);
    expect(() => getSignatureProvider()).not.toThrow(/dry/i);
  });

  it('SIGNATURE_PROVIDER=dry-run en production est refusé', () => {
    mockEnv.SIGNATURE_PROVIDER = 'dry-run';
    mockEnv.DOCUSEAL_API_KEY = 'k-live';

    expect(getSignatureProviderStatus().available).toBe(false);
    expect(() => getSignatureProvider()).toThrow(SignatureNotConfiguredError);
  });

  it('un provider inconnu est refusé (pas de choix par défaut hasardeux)', () => {
    mockEnv.SIGNATURE_PROVIDER = 'yousign';
    expect(() => getSignatureProvider()).toThrow(SignatureNotConfiguredError);
  });

  it('sans base URL : refus plutôt qu’une région choisie à la place de l’OF', () => {
    // La région porte l'enjeu RGPD (UE vs global) : aucune valeur par défaut
    // ne doit être décidée dans le code, seulement dans DOCUSEAL_BASE_URL.
    mockEnv.DOCUSEAL_API_KEY = 'k-live';
    mockEnv.DOCUSEAL_BASE_URL = '';

    expect(getSignatureProviderStatus().available).toBe(false);
    expect(getSignatureProviderStatus().reason).toMatch(/DOCUSEAL_BASE_URL/);
    expect(() => getSignatureProvider()).toThrow(SignatureNotConfiguredError);
  });
});

describe('développement local', () => {
  beforeEach(() => {
    mockEnv.DOCUSEAL_BASE_URL = 'https://api.docuseal.eu';
    mockEnv.NODE_ENV = 'development';
    mockEnv.DOCUSEAL_API_KEY = undefined;
    mockEnv.DOCUSEAL_WEBHOOK_SECRET = undefined;
  });

  it('SIGNATURE_PROVIDER=dry-run → provider dry-run disponible', () => {
    mockEnv.SIGNATURE_PROVIDER = 'dry-run';
    expect(getSignatureProvider().name).toBe('dry-run');
    expect(getSignatureProviderStatus().available).toBe(true);
  });

  it('docuseal demandé sans clé → dry-run explicite plutôt qu’un appel réseau', () => {
    mockEnv.SIGNATURE_PROVIDER = 'docuseal';
    expect(getSignatureProvider().name).toBe('dry-run');
    expect(getSignatureProviderStatus().reason).toMatch(/DOCUSEAL_API_KEY/);
  });

  it('docuseal avec clé → vrai adaptateur, même en local (sandbox)', () => {
    mockEnv.SIGNATURE_PROVIDER = 'docuseal';
    mockEnv.DOCUSEAL_API_KEY = 'k-sandbox';
    expect(getSignatureProvider().name).toBe('docuseal');
  });
});
