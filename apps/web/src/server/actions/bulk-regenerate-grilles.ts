'use server';

/**
 * Régénère en masse les grilles d'observation existantes générées avec
 * l'ancien prompt Ollama (qui laissait niveau/observation à null). Détecte
 * automatiquement les grilles "vides" : source=ollama ET aucun niveau dans
 * les compétences.
 *
 * Skip celles qui ont déjà 7/7 niveaux remplis pour éviter de tourner inutile.
 * Itère séquentiellement (Ollama est mono-GPU, parallel ne gagne rien).
 */

import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { regenerateGrilleForParticipant } from './regenerate-grille';

export interface BulkRegenResult {
  ok: boolean;
  total: number;
  regenerated: number;
  skipped: number;
  errors: Array<{ participantId: string; error: string }>;
}

export async function bulkRegenerateEmptyGrilles(): Promise<BulkRegenResult> {
  const { user } = await validateRequest();
  if (!user) {
    return { ok: false, total: 0, regenerated: 0, skipped: 0, errors: [] };
  }

  // Find toutes les grilles vides (source=ollama ET tous niveau null)
  const candidates = await prisma.pedagogicalAsset.findMany({
    where: {
      tenantId: user.tenantId,
      kind: 'GRILLE_OBS',
    },
    select: { id: true, participantId: true, rawJson: true },
  });

  const toRegen: string[] = [];
  for (const c of candidates) {
    if (!c.participantId) continue;
    const raw = c.rawJson as Record<string, unknown> | null;
    if (!raw) {
      toRegen.push(c.participantId);
      continue;
    }
    const source = (raw.source as string | undefined) ?? null;
    const competences = (raw.competences as Array<{ niveau?: string | null }> | undefined) ?? [];
    const allEmpty = competences.length > 0 && competences.every((c) => !c.niveau);
    // Régénère si vide (ancien prompt Ollama) OU si jamais source=ollama mais
    // vide. On NE régénère PAS les stub déjà remplis (source=stub avec 7/7).
    if (source === 'ollama' && allEmpty) {
      toRegen.push(c.participantId);
    }
  }

  let regenerated = 0;
  let skipped = 0;
  const errors: BulkRegenResult['errors'] = [];

  for (const pid of toRegen) {
    try {
      const r = await regenerateGrilleForParticipant(pid);
      if (r.ok) {
        regenerated++;
      } else {
        errors.push({ participantId: pid, error: r.error ?? 'unknown' });
      }
    } catch (e: any) {
      errors.push({ participantId: pid, error: e?.message ?? String(e) });
    }
  }

  return {
    ok: true,
    total: candidates.length,
    regenerated,
    skipped: candidates.length - toRegen.length,
    errors,
  };
}
