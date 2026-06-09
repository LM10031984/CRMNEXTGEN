/**
 * Sprint 1 — Migration data : chiffrer les SensitiveData.socialSecurityNb
 * existants in-place.
 *
 * À lancer UNE FOIS après la migration `20260609140000_enable_pgcrypto` :
 *
 *   pnpm --filter @qualiof/db exec tsx scripts/encrypt-existing-sensitive-data.ts
 *
 * Le script est **idempotent** : si une valeur est déjà chiffrée (header PGP
 * détecté), elle est sautée. Tu peux donc le relancer sans risque.
 *
 * Pré-requis :
 *   - Migration pgcrypto appliquée (CREATE EXTENSION pgcrypto)
 *   - Variable DATA_ENCRYPTION_KEY définie dans .env
 *   - Connexion BDD valide (DATABASE_URL)
 *
 * Sécurité : aucune valeur n'est loggée, même en cas d'erreur.
 */

import { prisma, encryptSensitive, isEncrypted } from '../src/index';

async function main(): Promise<void> {
  console.log('[encrypt-sensitive] Démarrage migration…');

  // Pré-check : extension pgcrypto présente ?
  const hasExt = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
    ) AS exists
  `;
  if (!hasExt[0]?.exists) {
    console.error('[encrypt-sensitive] FATAL : extension pgcrypto absente. Lance d\'abord les migrations Prisma.');
    process.exit(1);
  }

  // Pré-check : DATA_ENCRYPTION_KEY définie ?
  if (!process.env.DATA_ENCRYPTION_KEY || process.env.DATA_ENCRYPTION_KEY.length < 32) {
    console.error('[encrypt-sensitive] FATAL : DATA_ENCRYPTION_KEY manquante ou trop courte (< 32 chars).');
    process.exit(1);
  }

  const rows = await prisma.sensitiveData.findMany({
    where: { socialSecurityNb: { not: null } },
    select: { id: true, socialSecurityNb: true },
  });

  let encrypted = 0;
  let skipped = 0;
  let errored = 0;

  for (const row of rows) {
    if (!row.socialSecurityNb) continue;
    if (isEncrypted(row.socialSecurityNb)) {
      skipped++;
      continue;
    }
    try {
      const ciphertext = await encryptSensitive(row.socialSecurityNb);
      await prisma.sensitiveData.update({
        where: { id: row.id },
        data: { socialSecurityNb: ciphertext },
      });
      encrypted++;
    } catch (err) {
      // Ne JAMAIS logger la valeur en clair, même dans une erreur.
      errored++;
      console.error(`[encrypt-sensitive] Erreur sur SensitiveData.id=${row.id}`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[encrypt-sensitive] Terminé. Chiffrés=${encrypted}, déjà chiffrés=${skipped}, erreurs=${errored}.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[encrypt-sensitive] FATAL :', err);
  process.exit(1);
});
