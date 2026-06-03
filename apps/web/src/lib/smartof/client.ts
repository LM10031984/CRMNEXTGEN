/**
 * Client SmartOF (Mobileo) — source de vérité prix, inscriptions, encaissements.
 *
 * Auth : Firebase Identity Toolkit
 *   1. Exchange (email + password) → idToken JWT via Google Identity Platform
 *   2. Bearer idToken sur tous les calls à SMARTOF_BASE_URL
 *
 * Endpoints supportés (Swagger 11 tags, 38 endpoints) :
 *   - /api/session/list      (list-only, pas de filter par code → filter client-side)
 *   - /api/apprenant/list    /get
 *   - /api/factures/list     (pricing details)
 *   - /api/produit/list      /get
 *   - /api/entreprise/list   etc.
 *
 * Migration cloud v6 (branche cloud-migration, 2026-06-03).
 */

const FIREBASE_AUTH_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';

const BASE_URL = process.env.SMARTOF_BASE_URL ?? '';
const FIREBASE_API_KEY = process.env.SMARTOF_FIREBASE_API_KEY ?? '';
const EMAIL = process.env.SMARTOF_EMAIL ?? '';
const PASSWORD = process.env.SMARTOF_PASSWORD ?? '';

interface FirebaseAuthResponse {
  kind: string;
  localId: string;
  email: string;
  displayName?: string;
  idToken: string;
  registered: boolean;
  refreshToken: string;
  expiresIn: string; // secondes (typiquement "3600")
}

interface CachedToken {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;

async function authenticate(): Promise<CachedToken> {
  if (!FIREBASE_API_KEY || !EMAIL || !PASSWORD) {
    throw new Error(
      'SmartOF credentials manquants : vérifier SMARTOF_FIREBASE_API_KEY / SMARTOF_EMAIL / SMARTOF_PASSWORD dans .env',
    );
  }

  const res = await fetch(`${FIREBASE_AUTH_URL}?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      returnSecureToken: true,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SmartOF auth failed HTTP ${res.status} — ${txt.slice(0, 300)}`);
  }

  const json = (await res.json()) as FirebaseAuthResponse;
  const expiresInMs = (parseInt(json.expiresIn, 10) - 60) * 1000; // -60s safety margin
  cached = {
    idToken: json.idToken,
    refreshToken: json.refreshToken,
    expiresAt: Date.now() + expiresInMs,
  };
  return cached;
}

export async function getIdToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.idToken;
  }
  const fresh = await authenticate();
  return fresh.idToken;
}

export async function smartofFetch<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  if (!BASE_URL) {
    throw new Error('SMARTOF_BASE_URL manquant dans .env');
  }
  const token = await getIdToken();
  const url = BASE_URL.replace(/\/$/, '') + path;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SmartOF ${path} HTTP ${res.status} — ${txt.slice(0, 500)}`);
  }

  return (await res.json()) as T;
}

// ─── Endpoints typés (à étoffer au fur et à mesure) ────────────────

export interface SmartofSession {
  id?: string;
  code?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  totalPrice?: number;
  pricePerLearner?: number;
  durationHours?: number;
  // ...autres champs (à découvrir via probe)
  [key: string]: unknown;
}

export async function listSessions(): Promise<{ sessions?: SmartofSession[]; [key: string]: unknown }> {
  return smartofFetch('/api/session/list', {});
}

export interface SmartofLearner {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  [key: string]: unknown;
}

export async function listLearners(): Promise<{ learners?: SmartofLearner[]; [key: string]: unknown }> {
  return smartofFetch('/api/apprenant/list', {});
}

export async function listInvoices(): Promise<{ invoices?: unknown[]; [key: string]: unknown }> {
  return smartofFetch('/api/factures/list', {});
}

export async function listProducts(): Promise<{ products?: unknown[]; [key: string]: unknown }> {
  return smartofFetch('/api/produit/list', {});
}

// ─── Helpers diagnostic ────────────────────────────────────────────

export async function findSessionByCode(code: string): Promise<SmartofSession | null> {
  const raw = await listSessions();
  const sessions = (raw.sessions ?? raw.data ?? raw.items ?? []) as SmartofSession[];
  // SmartOF utilise `customId` (ex: "SES-0093") comme code visible, pas `code`.
  return sessions.find((s) => s.customId === code || s.code === code) ?? null;
}
