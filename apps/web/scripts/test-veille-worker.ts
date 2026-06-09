/**
 * Phase 13 Plan 13-05 — Script de test / dry-run du worker veille.
 *
 * Exécution unique de `ingestRssOnceForTenant` SANS passer par BullMQ
 * (donc sans besoin de Redis), pour valider en local :
 *  - les flux RSS sont accessibles
 *  - Ollama répond et classe correctement (mistral-small:24b)
 *  - les INSERT RegulatoryWatch / AuditLog se font effectivement
 *
 * Usage :
 *   pnpm --filter @qualiof/web test:veille
 *
 * /!\ ATTENTION : ce script ÉCRIT en BDD (pas un vrai dry-run).
 * Les rows créées seront en `status='DRAFT' suggestedBy='AUTO'` (D-08)
 * et passeront par l'inbox du Plan 03 — aucune pollution finale.
 */

import { prisma } from '@qualiof/db';
import { ingestRssOnceForTenant } from '../src/lib/veille/core';

async function main() {
  const tenant = await prisma.tenant.findFirst({ select: { id: true, name: true } });
  if (!tenant) {
    console.error('[test-veille] Aucun tenant trouvé. Seed avant ?');
    process.exit(1);
  }
  console.log(
    `[test-veille] dry-run RSS+Ollama pour tenant ${tenant.name} (${tenant.id})`,
  );
  const start = Date.now();
  const r = await ingestRssOnceForTenant(tenant.id);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[test-veille] terminé en ${elapsed}s`);
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error('[test-veille] crash :', e);
  process.exit(1);
});
