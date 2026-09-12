/**
 * Webhook du prestataire de signature — `POST /api/webhooks/docuseal` (lot C.3).
 *
 * LA SEULE PORTE D'ENTRÉE des documents signés. Elle est mince par construction :
 * elle authentifie, elle traduit, elle passe la main. Toute la décision vit dans
 * `server/signature-retour.ts`, et les règles pures dans `lib/signature/retour.ts`.
 *
 * ⚠ LES OCTETS EXACTS. La signature HMAC porte sur le corps TEL QU'ENVOYÉ : lire
 * `await req.json()` puis re-sérialiser changerait un espace, un ordre de clés,
 * un encodage — et toute vérification échouerait, y compris les vraies. On lit
 * donc `req.text()`, une seule fois, et on parse ensuite.
 *
 * ⚠ FAIL-CLOSED, DEUX FOIS. Sans prestataire configuré, on ne « tente » pas :
 * 503. Sans signature valide, 401 — `verifyWebhook` refuse aussi quand le secret
 * n'est pas posé, donc une instance mal configurée n'accepte rien plutôt que
 * d'accepter tout. C'est un endpoint PUBLIC : il n'a pas d'autre garde.
 *
 * ⚠ LES CODES DE RETOUR PILOTENT LE PRESTATAIRE. Un 5xx le fait rejouer. On rend
 * donc 200 pour tout ce qui est définitif — y compris « demande inconnue » et
 * « déjà traité » —, et 503 pour les seuls échecs temporaires, ceux où un rejeu
 * sert à quelque chose (`estRejouable`). Rendre 500 sur une demande inconnue
 * ferait boucler le prestataire indéfiniment sur un envoi qui ne nous concerne
 * pas.
 */

import { NextResponse } from 'next/server';
import { getSignatureProvider, SignatureNotConfiguredError } from '@/lib/signature/provider';
import { estRejouable, traiterEvenementSignature } from '@/server/signature-retour';

export const dynamic = 'force-dynamic';

/**
 * Le type d'événement TEL QUE LE PRESTATAIRE L'ÉCRIT.
 *
 * C'est lui qui sert de clé d'idempotence, pas notre type de domaine :
 * `form.completed` et `form.declined` se traduisent tous deux en événements de
 * signataire, et les confondre dans la clé ferait perdre le second.
 */
function typeBrutDe(rawBody: string): string {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (typeof parsed === 'object' && parsed !== null) {
      const t = (parsed as { event_type?: unknown }).event_type;
      if (typeof t === 'string' && t.length > 0) return t;
    }
  } catch {
    // Illisible : `parseEvent` le dira mieux que nous.
  }
  return 'inconnu';
}

export async function POST(req: Request): Promise<NextResponse> {
  let provider;
  try {
    provider = getSignatureProvider();
  } catch (e) {
    if (e instanceof SignatureNotConfiguredError) {
      return NextResponse.json({ ok: false, error: 'signature-non-configuree' }, { status: 503 });
    }
    throw e;
  }

  const rawBody = await req.text();
  const headers: Record<string, string | undefined> = {};
  req.headers.forEach((valeur, cle) => {
    headers[cle.toLowerCase()] = valeur;
  });

  if (!provider.verifyWebhook(rawBody, headers)) {
    // Volontairement muet sur la RAISON : un endpoint public ne dit pas à un
    // appelant non authentifié si c'est le secret, l'horodatage ou la signature
    // qui cloche.
    return NextResponse.json({ ok: false, error: 'signature-invalide' }, { status: 401 });
  }

  let event;
  try {
    event = provider.parseEvent(rawBody);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'payload-illisible' },
      { status: 400 },
    );
  }

  const typeBrut = typeBrutDe(rawBody);
  const resultat = await traiterEvenementSignature({ event, typeBrut, provider });

  return NextResponse.json(
    { ok: true, traite: resultat.traite, motif: resultat.motif },
    { status: estRejouable(resultat.motif) ? 503 : 200 },
  );
}
