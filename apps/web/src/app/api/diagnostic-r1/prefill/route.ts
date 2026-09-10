/**
 * Déclenchement du pré-remplissage depuis un transcript (lot C, §6.4).
 *
 * Pourquoi une route et pas un appel direct de la server action depuis
 * l'écran : l'extraction dure des dizaines de secondes, et c'est le segment de
 * route qui porte `maxDuration`. Même raison que `/api/diagnostic/traiter` pour
 * l'express du stand — la leçon avait été payée une fois.
 *
 * La logique entière est dans la server action ; cette route ne fait que
 * l'exposer avec le bon budget de temps. `validateRequest` en défense en
 * profondeur : l'action revérifie le rôle et le tenant derrière.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { validateRequest } from '@/lib/auth';
import { lancerPreRemplissage } from '@/server/actions/diagnostic-transcript';

export const dynamic = 'force-dynamic';
/**
 * Vercel Pro. Une extraction sur un transcript de rendez-vous a été
 * dimensionnée sur le même ordre de grandeur que la génération de programme
 * (~30 s, tier quality) ; 300 s laissent la marge d'un compte rendu long.
 */
export const maxDuration = 300;

const CorpsSchema = z.object({ diagnosticId: z.string().uuid() });

export async function POST(req: Request) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let brut: unknown = null;
  try {
    brut = await req.json();
  } catch {
    brut = null;
  }

  const corps = CorpsSchema.safeParse(brut);
  if (!corps.success) {
    return NextResponse.json({ ok: false, error: 'Diagnostic introuvable' }, { status: 400 });
  }

  const r = await lancerPreRemplissage(corps.data.diagnosticId);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
