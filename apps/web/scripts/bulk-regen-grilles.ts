/**
 * Script CLI : régénère en masse toutes les grilles d'observation existantes
 * vides (source=ollama avec niveaux à null). Utilise le nouveau prompt
 * Ollama + nouveau template (nom formateur en bas).
 *
 * Usage : pnpm exec dotenv -e ../../.env -- tsx scripts/bulk-regen-grilles.ts
 */

import { prisma } from '@qualiof/db';
import { regenerateGrilleCore } from '../src/lib/closure/regenerate-grille-core';

async function main() {
  const candidates = await prisma.pedagogicalAsset.findMany({
    where: { kind: 'GRILLE_OBS' },
    select: { id: true, participantId: true, rawJson: true, tenantId: true },
  });

  const toRegen: { participantId: string; tenantId: string }[] = [];
  for (const c of candidates) {
    if (!c.participantId) continue;
    const raw = c.rawJson as Record<string, unknown> | null;
    if (!raw) {
      toRegen.push({ participantId: c.participantId, tenantId: c.tenantId });
      continue;
    }
    const source = (raw.source as string | undefined) ?? null;
    const competences = (raw.competences as Array<{ niveau?: string | null }> | undefined) ?? [];
    const allEmpty = competences.length > 0 && competences.every((c) => !c.niveau);
    if (source === 'ollama' && allEmpty) {
      toRegen.push({ participantId: c.participantId, tenantId: c.tenantId });
    }
  }

  console.log(`[bulk-regen] ${toRegen.length} grille(s) à régénérer sur ${candidates.length} total`);

  let done = 0;
  let errors = 0;
  const start = Date.now();
  for (const { participantId, tenantId } of toRegen) {
    const t0 = Date.now();
    try {
      const r = await regenerateGrilleCore(participantId, tenantId);
      const dt = Math.round((Date.now() - t0) / 1000);
      if (r.ok) {
        done++;
        console.log(`[${done}/${toRegen.length}] ✓ ${participantId.slice(0, 8)} (${r.source}, ${dt}s)`);
      } else {
        errors++;
        console.warn(`[${done + errors}/${toRegen.length}] ✗ ${participantId.slice(0, 8)} : ${r.error}`);
      }
    } catch (e: any) {
      errors++;
      console.error(`[${done + errors}/${toRegen.length}] ✗ ${participantId.slice(0, 8)} : ${e?.message ?? e}`);
    }
  }

  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`\n[bulk-regen] DONE — ${done} ok, ${errors} erreurs, ${elapsed}s total`);
  await prisma.$disconnect();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('[bulk-regen] FATAL:', e);
  process.exit(2);
});
