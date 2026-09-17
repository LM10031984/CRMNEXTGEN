import { analyserCible } from './assert-db-target';

/** Aucun contournement SEED_ALLOW_PROD : un test ne vise jamais la production. */
export function assertTestTarget(input: { databaseUrl?: string; baseUrl?: string }): void {
  const target = analyserCible(input.databaseUrl);
  if (!target.autorisee || !/_test$/.test(target.base)) {
    throw new Error(`REFUS test : base locale dédiée *_test obligatoire (${target.motif ?? 'nom non dédié'}).`);
  }
  const url = new URL(input.databaseUrl!);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('REFUS test : protocole PostgreSQL requis.');
  if (input.baseUrl !== undefined) {
    let web: URL;
    try { web = new URL(input.baseUrl); } catch { throw new Error('REFUS test : URL navigateur invalide.'); }
    if (!['http:', 'https:'].includes(web.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(web.hostname)) {
      throw new Error('REFUS test : navigateur réservé à une instance locale dédiée, jamais au déploiement de production.');
    }
  }
}

/** Le nom de base ne prouve rien : reconnaître aussi la population avant les fixtures. */
export async function assertTestDatabaseContent(
  db: { tenant: { findMany: (args: { select: { id: true; name: true } }) => Promise<{ id: string; name: string }[]> } },
  url: string | undefined,
): Promise<void> {
  assertTestTarget({ databaseUrl: url });
  const tenants = await db.tenant.findMany({ select: { id: true, name: true } });
  if (tenants.some((t) => t.id === 'db191440-a144-48d1-93c1-767e6f647f2c' || /start\s+academy/i.test(t.name))) {
    throw new Error('REFUS test : contenu de production Start Academy détecté. Aucune fixture écrite.');
  }
  if (tenants.some((t) => !/^(TEST|E2E)[-_ ]/i.test(t.name))) {
    throw new Error('REFUS test : tenant non reconnu comme fixture TEST- / E2E-. Utiliser une base jetable vide.');
  }
}
