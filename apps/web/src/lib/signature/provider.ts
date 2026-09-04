/**
 * Sélection du provider de signature — fail-closed (spec 2026-09-04 §5 lot B).
 *
 * Règle non négociable du lot : « sans clé en prod → bouton désactivé avec
 * message, JAMAIS d'envoi silencieux ». Deux conséquences :
 *
 *  - En **production**, une configuration incomplète rend la fonction
 *    indisponible avec un motif lisible. Elle ne retombe pas en dry-run :
 *    l'admin croirait avoir envoyé une convention qui n'est jamais partie.
 *  - En **développement**, l'absence de clé bascule explicitement en dry-run,
 *    pour que la chaîne soit démontrable sans compte DocuSeal.
 *
 * L'env est relu à chaque appel (pas de singleton) : un provider mémorisé
 * survivrait à un changement de configuration et masquerait le problème.
 */

import { sharedEnv } from '@qualiof/shared/env';
import { createDocusealProvider } from './docuseal';
import { createDryRunProvider } from './dry-run';
import type { SignatureProvider } from './port';

export type SignatureProviderName = 'docuseal' | 'dry-run';

/** Levée quand aucun provider utilisable n'est configuré. Jamais un envoi muet. */
export class SignatureNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignatureNotConfiguredError';
  }
}

export interface SignatureProviderStatus {
  available: boolean;
  provider: SignatureProviderName;
  /** Motif affichable à l'admin quand `available` est faux, ou avertissement. */
  reason?: string;
}

interface Env {
  NODE_ENV?: string;
  SIGNATURE_PROVIDER?: string;
  DOCUSEAL_API_KEY?: string;
  DOCUSEAL_BASE_URL?: string;
  DOCUSEAL_WEBHOOK_SECRET?: string;
}

function readEnv(): Env {
  return sharedEnv as unknown as Env;
}

/**
 * Décrit l'état de la configuration SANS rien construire — c'est ce que l'UI
 * interroge pour griser (ou non) le bouton « Envoyer pour signature ».
 */
export function getSignatureProviderStatus(): SignatureProviderStatus {
  const env = readEnv();
  const isProd = env.NODE_ENV === 'production';
  const demande = (env.SIGNATURE_PROVIDER ?? 'dry-run').trim();
  const apiKey = (env.DOCUSEAL_API_KEY ?? '').trim();

  if (demande === 'dry-run') {
    return isProd
      ? {
          available: false,
          provider: 'dry-run',
          reason:
            'SIGNATURE_PROVIDER=dry-run en production : aucune signature ne partirait réellement. ' +
            'Basculer sur docuseal et renseigner DOCUSEAL_API_KEY.',
        }
      : { available: true, provider: 'dry-run' };
  }

  if (demande !== 'docuseal') {
    return {
      available: false,
      provider: 'docuseal',
      reason: `SIGNATURE_PROVIDER="${demande}" inconnu — valeurs acceptées : docuseal | dry-run.`,
    };
  }

  if (!apiKey) {
    const reason = 'DOCUSEAL_API_KEY absente — signature électronique indisponible.';
    return isProd
      ? { available: false, provider: 'docuseal', reason }
      : { available: true, provider: 'dry-run', reason: `${reason} Repli dry-run (développement).` };
  }

  return { available: true, provider: 'docuseal' };
}

/**
 * Rend le provider à utiliser, ou lève. Les appelants (lot C) rapportent le
 * message tel quel à l'admin : il est écrit pour être lu par un humain.
 */
export function getSignatureProvider(): SignatureProvider {
  const status = getSignatureProviderStatus();
  if (!status.available) throw new SignatureNotConfiguredError(status.reason ?? 'Signature non configurée');

  if (status.provider === 'dry-run') {
    if (status.reason) console.warn(`[signature] ${status.reason}`);
    return createDryRunProvider();
  }

  const env = readEnv();
  const webhookSecret = (env.DOCUSEAL_WEBHOOK_SECRET ?? '').trim();
  if (!webhookSecret) {
    // Non bloquant : l'envoi fonctionne, mais AUCUN webhook ne sera accepté
    // (verifyWebhook est fail-closed). Le filet du lot C — resynchronisation
    // par cron — prend alors le relais, en moins immédiat.
    console.warn(
      '[signature] DOCUSEAL_WEBHOOK_SECRET absente : les webhooks seront rejetés, ' +
        'le retour du signé dépendra du cron de resynchronisation.',
    );
  }

  return createDocusealProvider({
    apiKey: (env.DOCUSEAL_API_KEY ?? '').trim(),
    baseUrl: (env.DOCUSEAL_BASE_URL ?? '').trim() || 'https://api.docuseal.com',
    webhookSecret: webhookSecret || undefined,
  });
}
