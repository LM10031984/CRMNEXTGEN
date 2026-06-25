/**
 * Client Google Calendar authentifié — WORKER-SAFE.
 *
 * ⚠️ RÈGLE WORKER BullMQ : ce module ne DOIT importer que `node:fs`, `node:path`
 * et `googleapis`. INTERDIT d'importer quoi que ce soit d'auth-gated (server
 * actions, helpers RBAC/auth, gardes de session/rôle) ni le runtime React.
 * Sinon : crash au boot tsx du worker (export `cache` introuvable).
 *
 * Les secrets OAuth sont lus depuis `files/secrets/` (gitignored) :
 *   - oauth-client.json  (client_id / client_secret de l'app OAuth interne)
 *   - google-token.json  (refresh_token obtenu via le flow OAuth interne)
 * Le pattern d'auth reproduit exactement `apps/web/scripts/_google-test.ts`
 * (cwd = apps/web → secrets résolus en ../../secrets).
 */

import fs from 'node:fs';
import path from 'node:path';
import { google, type calendar_v3 } from 'googleapis';

/**
 * Agenda Google « Rappel Formations » de Start Academy.
 * Id figé (accès owner via OAuth interne — cf. mémoire google_calendar_oauth).
 */
export const CALENDAR_ID =
  'c_a18d08db6df83139c06c26e91e4cdb59ac244baeac93fe5c237d66c628a578a5@group.calendar.google.com';

const SECRETS_DIR = path.resolve(process.cwd(), '../../secrets');

let _client: calendar_v3.Calendar | null = null;

/**
 * Retourne un client Google Calendar v3 authentifié (refresh_token OAuth).
 * Mémoïsé : un seul client par process (worker ou requête).
 */
export function getCalendarClient(): calendar_v3.Calendar {
  if (_client) return _client;

  const clientRaw = JSON.parse(
    fs.readFileSync(path.join(SECRETS_DIR, 'oauth-client.json'), 'utf8'),
  );
  const { client_id, client_secret } = clientRaw.installed ?? clientRaw.web ?? clientRaw;

  const token = JSON.parse(
    fs.readFileSync(path.join(SECRETS_DIR, 'google-token.json'), 'utf8'),
  );

  const auth = new google.auth.OAuth2(client_id, client_secret);
  auth.setCredentials({ refresh_token: token.refresh_token });

  _client = google.calendar({ version: 'v3', auth });
  return _client;
}
