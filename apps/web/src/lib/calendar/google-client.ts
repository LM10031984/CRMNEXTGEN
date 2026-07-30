/**
 * Client Google Calendar authentifié — WORKER-SAFE.
 *
 * ⚠️ RÈGLE WORKER : ce module ne DOIT importer que `node:fs`, `node:path`,
 * `googleapis` et `@qualiof/shared/env` (sharedEnv est déjà importé au boot du
 * worker — worker-safe). INTERDIT d'importer quoi que ce soit d'auth-gated
 * (server actions, helpers RBAC/auth, gardes de session/rôle) ni le runtime
 * React. Sinon : crash au boot tsx du worker (export `cache` introuvable).
 *
 * Credentials OAuth (Phase 22 D-07 — portage cloud, env-first) :
 *   1. Si les 3 vars GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET /
 *      GOOGLE_OAUTH_REFRESH_TOKEN sont posées (Vercel, sensitive) → env.
 *   2. Sinon (dev local) fallback historique `files/secrets/` (gitignored) :
 *      - oauth-client.json  (client_id / client_secret de l'app OAuth interne)
 *      - google-token.json  (refresh_token obtenu via le flow OAuth interne)
 *      All-or-nothing : env partiel = fallback fichiers complet, jamais de
 *      mélange env/fichier. (cwd = apps/web → secrets résolus en ../../secrets)
 */

import fs from 'node:fs';
import path from 'node:path';
import { google, type calendar_v3 } from 'googleapis';
import { sharedEnv } from '@qualiof/shared/env';

/**
 * Agenda Google « Rappel Formations » de Start Academy.
 * Id figé (accès owner via OAuth interne — cf. mémoire google_calendar_oauth).
 */
export const CALENDAR_ID =
  'c_a18d08db6df83139c06c26e91e4cdb59ac244baeac93fe5c237d66c628a578a5@group.calendar.google.com';

const SECRETS_DIR = path.resolve(process.cwd(), '../../secrets');

let _client: calendar_v3.Calendar | null = null;

/**
 * Résout les credentials OAuth Google — env-first (Phase 22 D-07).
 *
 * Les 3 vars d'env GOOGLE_OAUTH_* posées → source env (prod cloud Vercel).
 * Sinon (all-or-nothing, y compris env partiel) → fallback dev local
 * `files/secrets/` : oauth-client.json + google-token.json (comportement
 * historique inchangé, cascade `installed ?? web ?? racine` préservée).
 */
export function loadOAuthConfig(): {
  client_id: string;
  client_secret: string;
  refresh_token: string;
} {
  const { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN } =
    sharedEnv;
  if (GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET && GOOGLE_OAUTH_REFRESH_TOKEN) {
    return {
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: GOOGLE_OAUTH_REFRESH_TOKEN,
    };
  }
  // Fallback dev local : files/secrets/ (comportement historique inchangé)
  const clientRaw = JSON.parse(
    fs.readFileSync(path.join(SECRETS_DIR, 'oauth-client.json'), 'utf8'),
  );
  const { client_id, client_secret } = clientRaw.installed ?? clientRaw.web ?? clientRaw;
  const token = JSON.parse(fs.readFileSync(path.join(SECRETS_DIR, 'google-token.json'), 'utf8'));
  return { client_id, client_secret, refresh_token: token.refresh_token };
}

/**
 * Retourne un client Google Calendar v3 authentifié (refresh_token OAuth).
 * Mémoïsé : un seul client par process (worker ou requête).
 */
export function getCalendarClient(): calendar_v3.Calendar {
  if (_client) return _client;

  const { client_id, client_secret, refresh_token } = loadOAuthConfig();

  const auth = new google.auth.OAuth2(client_id, client_secret);
  auth.setCredentials({ refresh_token });

  _client = google.calendar({ version: 'v3', auth });
  return _client;
}
