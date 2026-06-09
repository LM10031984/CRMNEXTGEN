/**
 * Middleware Next.js (Sprint 2 — Observabilité).
 *
 * Génère un identifiant unique par requête (UUID v4) et le propage via
 * deux mécaniques :
 *   1. Header `X-Request-Id` ajouté à la requête entrante (lisible dans
 *      les Server Components / Server Actions via `headers().get(...)`)
 *   2. Header `X-Request-Id` ajouté à la réponse (utile pour corréler
 *      côté client / debugging — visible dans DevTools Network).
 *
 * Si la requête arrive déjà avec un `X-Request-Id` (provenance reverse
 * proxy / load balancer), on le respecte pour préserver la chaîne de
 * traçabilité bout-en-bout.
 *
 * Le middleware tourne dans l'Edge Runtime de Next.js — pas de
 * `pino.transport()` (qui nécessite Node workers) ni d'AsyncLocalStorage
 * (limité côté Edge). Le contexte AsyncLocalStorage est démarré dans les
 * Server Actions / Route Handlers Node via `withLogContext`.
 *
 * Pourquoi pas démarrer AsyncLocalStorage ici ? Parce que l'Edge Runtime
 * ne supporte pas `async_hooks`. Le middleware se limite donc à propager
 * le request-id via les headers — c'est la couche Node en aval qui
 * fait `runWithContext`.
 */

import { NextRequest, NextResponse } from 'next/server';

const REQUEST_ID_HEADER = 'x-request-id';

function generateRequestId(): string {
  // crypto.randomUUID() est dispo en Edge Runtime (Web Crypto API).
  return crypto.randomUUID();
}

export function middleware(req: NextRequest): NextResponse {
  const incoming = req.headers.get(REQUEST_ID_HEADER);
  const requestId = incoming ?? generateRequestId();

  // On clone les headers de la requête pour y injecter le request-id —
  // les Server Components / Server Actions / Route Handlers downstream
  // pourront le lire via `headers().get('x-request-id')`.
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set(REQUEST_ID_HEADER, requestId);

  const res = NextResponse.next({
    request: { headers: reqHeaders },
  });

  // Et on l'expose côté response pour le debugging client (DevTools Network).
  res.headers.set(REQUEST_ID_HEADER, requestId);

  return res;
}

/**
 * Skip le middleware sur les assets statiques et les routes Next.js
 * internes pour ne pas générer un request-id pour chaque .js / .css.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|gif|webp|svg|css|js|map)$).*)',
  ],
};
