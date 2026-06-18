'use server';

/**
 * Génère la CHECK-LIST FORMATION (C4.i17 Qualiopi) pour une session.
 * 1 doc par session — coches pré-remplies selon modalité + lieu + hébergement
 * formateur + accessibilité PSH (champs saisis sur la session).
 *
 * Référent handicap : Laurent (config .env OF_HANDICAP_REFERENT).
 * Stockage : Document type=CHECKLIST_FORMATION, sessionId, entityType='session'.
 */

import { revalidatePath } from 'next/cache';
import { validateRequest } from '@/lib/auth';
import { generateChecklistCore } from '@/lib/closure/checklist-core';

// quick 260618-gux : le cœur SANS auth `generateChecklistCore` (+ ses helpers
// makeSeededRandom / buildZones) vit désormais dans `@/lib/closure/checklist-core`
// (ne tire pas `@/lib/auth`), pour que les scripts tsx pipeline puissent
// l'importer sans `react cache`. Ce fichier reste un wrapper
// (validateRequest → core → revalidatePath).

export async function generateChecklistForSession(
  sessionId: string,
  opts: { force?: boolean } = {},
): Promise<{ ok: boolean; documentId?: string; pdfUrl?: string; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const r = await generateChecklistCore(user.tenantId, sessionId, opts);
  revalidatePath(`/app/sessions/${sessionId}`);
  return r;
}
