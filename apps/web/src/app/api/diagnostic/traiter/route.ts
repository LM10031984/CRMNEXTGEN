/**
 * Déclenchement de l'envoi du programme, PAR LE NAVIGATEUR DU PROSPECT.
 *
 * C'est le mécanisme PRINCIPAL, et il est volontairement indépendant de toute
 * configuration d'infrastructure. Le constat de terrain qui l'impose (V1 du
 * document de conversion) : la soumission est mise en file `PENDING` et l'envoi
 * était délégué à un cron que personne ne déclenchait — ni `vercel.json` (pas de
 * clé `crons`), ni Railway (worker resté au 12/08). En l'état, le soir du salon,
 * aucun prospect n'aurait reçu son programme.
 *
 * Ici, le téléphone du prospect déclenche son propre email. L'appel part depuis
 * l'écran de remerciement, DÉJÀ affiché : le prospect n'attend rien, et l'échec
 * de la requête ne casse rien à l'écran. Le cron et le bouton du CRM restent des
 * filets de rattrapage, jamais le mécanisme.
 *
 * Pas d'authentification (le prospect n'a pas de compte), donc :
 *  - même plafond IP que l'action publique (`lib/diagnostic/quota.ts`) ;
 *  - traitement d'UNE soumission désignée par son id, et rien d'autre — cette
 *    route ne peut pas être détournée pour faire tourner la file entière ;
 *  - idempotente : une soumission déjà `SENT` ne repart pas.
 *
 * `after()` de Next n'était pas une option : le projet est en Next 14.2, `after()`
 * arrive en 15.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { processDiagnosticSubmission } from '@/lib/diagnostic/worker';
import { quotaDiagnosticOk, ipDepuisHeaders } from '@/lib/diagnostic/quota';

export const dynamic = 'force-dynamic';
/**
 * Vercel Pro. La génération sur mesure a été mesurée à 28,3 s (OpenRouter, tier
 * quality) ; 300 s laissent une marge large pour un modèle lent un soir de
 * salon, sans jamais faire attendre le prospect (l'appel est non bloquant).
 */
export const maxDuration = 300;

const CorpsSchema = z.object({
  submissionId: z.string().trim().uuid(),
});

export async function POST(req: Request) {
  const ip = ipDepuisHeaders(req.headers);
  if (!quotaDiagnosticOk('traitement', ip)) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  let brut: unknown = null;
  try {
    brut = await req.json();
  } catch {
    // Corps illisible : on tolère aussi `?id=` — un `sendBeacon` ou un retry
    // navigateur peut arriver sans corps JSON exploitable.
    const id = new URL(req.url).searchParams.get('id');
    brut = id ? { submissionId: id } : null;
  }

  const corps = CorpsSchema.safeParse(brut);
  if (!corps.success) {
    return NextResponse.json({ ok: false, error: 'submissionId invalide' }, { status: 400 });
  }

  const r = await processDiagnosticSubmission(corps.data.submissionId);

  if (r.statut === 'INTROUVABLE') {
    return NextResponse.json({ ok: false, statut: r.statut }, { status: 404 });
  }
  // Un échec de génération/envoi n'est PAS une erreur du client : la soumission
  // reste en file et le rattrapage la reprendra. On répond 202, pas 500.
  return NextResponse.json({ ok: r.ok, statut: r.statut }, { status: r.ok ? 200 : 202 });
}
