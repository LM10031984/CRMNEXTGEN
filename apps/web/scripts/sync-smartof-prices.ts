/**
 * Sync SmartOF API → QualiOF Postgres : backfill prix HT par stagiaire.
 *
 * Source de vérité : `produit.presetTarification.tarifs[*].budget[*].prixUnitaireHT`
 * (cf. mémoire reference_smartof_formule_prix_2026_06_03.md).
 *
 * Stratégie :
 *   1. Pull `/api/session/list` (86 sessions)
 *   2. Pull `/api/produit/get` pour chaque produitFormationViseeUid unique
 *   3. Match QualiOF.TrainingSession via `code === SmartOF.customId`
 *   4. Compute écarts pour 3 niveaux : Product, Session, SessionParticipant
 *   5. Affiche tableau d'écarts (mode --dry par défaut)
 *   6. --apply : écrit en BDD avec règles d'override conservatives
 *
 * Règles d'écrasement (anti-destruction) :
 *   - TrainingProduct.priceHT       : écrase si != prixUnitaireHT SmartOF
 *   - TrainingSession.pricePerLearner : écrase SEULEMENT si 0 ou si égal à
 *     l'ancien product.priceHT (= valeur dérivée, pas négociée)
 *   - SessionParticipant.priceHT    : écrase SEULEMENT si 0 (préserve les
 *     overrides manuels — tarif négocié par stagiaire)
 *
 * Lancement :
 *   pnpm --filter @qualiof/web exec tsx scripts/sync-smartof-prices.ts          # dry-run
 *   pnpm --filter @qualiof/web exec tsx scripts/sync-smartof-prices.ts --apply  # écriture
 *   pnpm --filter @qualiof/web exec tsx scripts/sync-smartof-prices.ts SES-0093 # filtre 1 session
 */

import { prisma } from '@qualiof/db';
import { listSessions, smartofFetch, type SmartofSession } from '../src/lib/smartof/client';

const APPLY = process.argv.includes('--apply');
const FILTER_CODE = process.argv.find((a) => /^SES-/.test(a)) ?? null;

interface ProductPriceInfo {
  produitFormationUid: string;
  customId: string;
  name: string;
  prixUnitaireHT: number | null;
}

async function getProductPrice(uid: string): Promise<ProductPriceInfo> {
  const p = (await smartofFetch('/api/produit/get', { produitFormationUid: uid })) as {
    customId?: string;
    meta?: { nom?: string };
    presetTarification?: { tarifs?: Array<{ budget?: Array<{ prixUnitaireHT?: number }> }> };
  };
  const prix = p.presetTarification?.tarifs?.[0]?.budget?.[0]?.prixUnitaireHT ?? null;
  return {
    produitFormationUid: uid,
    customId: p.customId ?? '?',
    name: p.meta?.nom ?? '?',
    prixUnitaireHT: typeof prix === 'number' ? prix : null,
  };
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Math.round(Number(n))} €`;
}

function row(cells: string[], widths: number[]): string {
  return cells.map((c, i) => c.padEnd(widths[i] ?? 20)).join(' │ ');
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' SYNC SmartOF → QualiOF — Backfill prix HT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Mode : ${APPLY ? '✏️  APPLY (écrit en BDD)' : '🔍 DRY-RUN (lecture seule)'}`);
  if (FILTER_CODE) console.log(`Filtre : ${FILTER_CODE} uniquement`);
  console.log('');

  // 1. Pull sessions SmartOF
  const sessRaw = (await listSessions()) as { sessions?: SmartofSession[] };
  let sessions = sessRaw.sessions ?? [];
  if (FILTER_CODE) sessions = sessions.filter((s) => s.customId === FILTER_CODE);
  console.log(`◆ ${sessions.length} session(s) SmartOF récupérée(s)`);

  // 2. Pull produits (dedup)
  const uniqueProductUids = Array.from(
    new Set(sessions.map((s) => s.produitFormationViseeUid as string).filter(Boolean)),
  );
  console.log(`◆ ${uniqueProductUids.length} produit(s) unique(s) à fetcher`);
  const productCache = new Map<string, ProductPriceInfo>();
  for (const uid of uniqueProductUids) {
    try {
      const info = await getProductPrice(uid);
      productCache.set(uid, info);
    } catch (e: any) {
      console.log(`  ✗ ${uid.slice(0, 8)}… : ${e.message.slice(0, 80)}`);
    }
  }
  console.log(`◆ ${productCache.size} produit(s) avec prix trouvé`);
  console.log('');

  // 3. Diff QualiOF vs SmartOF
  console.log('━━━ ÉCARTS PRIX PAR SESSION ━━━');
  console.log(
    row(
      ['Code', 'Produit', 'QualiOF prod', 'QualiOF session', 'QualiOF parts', 'SmartOF HT', 'Action'],
      [10, 50, 13, 16, 20, 12, 30],
    ),
  );
  console.log('─'.repeat(160));

  const productUpdates = new Map<string, { id: string; oldPrice: number; newPrice: number }>();
  const sessionUpdates: Array<{ id: string; code: string; oldPrice: number; newPrice: number }> = [];
  const participantUpdates: Array<{ id: string; person: string; oldPrice: number; newPrice: number; code: string }> = [];

  for (const ss of sessions) {
    const code = ss.customId as string | undefined;
    const produitUid = ss.produitFormationViseeUid as string | undefined;
    const productInfo = produitUid ? productCache.get(produitUid) : null;
    const smartofPrice = productInfo?.prixUnitaireHT ?? null;

    if (!code || !smartofPrice) continue;

    const qualiSession = await prisma.trainingSession.findFirst({
      where: { code },
      include: {
        product: { select: { id: true, priceHT: true, title: true } },
        participants: {
          select: {
            id: true,
            priceHT: true,
            person: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!qualiSession) {
      console.log(row([code, '(absent QualiOF)', '—', '—', '—', fmt(smartofPrice), 'SKIP'], [10, 50, 13, 16, 20, 12, 30]));
      continue;
    }

    const qProdPrice = Number(qualiSession.product?.priceHT ?? 0);
    const qSessPrice = Number(qualiSession.pricePerLearner ?? 0);
    const partCount = qualiSession.participants.length;
    const partsZero = qualiSession.participants.filter((p) => Number(p.priceHT) === 0).length;

    const actions: string[] = [];

    // Product price update
    if (qualiSession.product && qProdPrice !== smartofPrice) {
      const pid = qualiSession.product.id;
      if (!productUpdates.has(pid)) {
        productUpdates.set(pid, { id: pid, oldPrice: qProdPrice, newPrice: smartofPrice });
      }
      actions.push(`Prod ${fmt(qProdPrice)}→${fmt(smartofPrice)}`);
    }

    // Session price update (only if 0 or = oldProdPrice = derived value)
    if (qSessPrice === 0 || qSessPrice === qProdPrice) {
      if (qSessPrice !== smartofPrice) {
        sessionUpdates.push({ id: qualiSession.id, code, oldPrice: qSessPrice, newPrice: smartofPrice });
        actions.push(`Sess ${fmt(qSessPrice)}→${fmt(smartofPrice)}`);
      }
    } else {
      actions.push(`Sess override gardé (${fmt(qSessPrice)})`);
    }

    // Participants : write only the zeros (preserve manual overrides)
    for (const p of qualiSession.participants) {
      if (Number(p.priceHT) === 0) {
        participantUpdates.push({
          id: p.id,
          person: `${p.person.firstName} ${p.person.lastName}`,
          oldPrice: 0,
          newPrice: smartofPrice,
          code,
        });
      }
    }
    if (partsZero > 0) actions.push(`${partsZero}/${partCount} parts ${fmt(0)}→${fmt(smartofPrice)}`);

    console.log(
      row(
        [
          code,
          (qualiSession.product?.title ?? '?').slice(0, 50),
          fmt(qProdPrice),
          fmt(qSessPrice),
          `${partsZero}/${partCount} à 0`,
          fmt(smartofPrice),
          actions.join('; ').slice(0, 30),
        ],
        [10, 50, 13, 16, 20, 12, 30],
      ),
    );
  }

  // 4. Summary
  console.log('');
  console.log('━━━ RÉSUMÉ ━━━');
  console.log(`  Produits à mettre à jour     : ${productUpdates.size}`);
  console.log(`  Sessions à mettre à jour     : ${sessionUpdates.length}`);
  console.log(`  Participants à mettre à jour : ${participantUpdates.length}`);

  if (!APPLY) {
    console.log('');
    console.log('🔍 Mode dry-run — aucune modification. Relance avec --apply pour écrire.');
    return;
  }

  // 5. Apply
  console.log('');
  console.log('✏️  APPLY — écriture en BDD…');

  for (const u of productUpdates.values()) {
    await prisma.trainingProduct.update({
      where: { id: u.id },
      data: { priceHT: u.newPrice },
    });
  }
  console.log(`  ✓ ${productUpdates.size} produit(s) mis à jour`);

  for (const u of sessionUpdates) {
    await prisma.trainingSession.update({
      where: { id: u.id },
      data: { pricePerLearner: u.newPrice },
    });
  }
  console.log(`  ✓ ${sessionUpdates.length} session(s) mises à jour`);

  for (const u of participantUpdates) {
    await prisma.sessionParticipant.update({
      where: { id: u.id },
      data: { priceHT: u.newPrice },
    });
  }
  console.log(`  ✓ ${participantUpdates.length} participant(s) mis à jour`);

  console.log('');
  console.log('✅ Sync terminé. Vérifie SES-0093 (Kristin / Marc) côté fiche session.');
}

main()
  .catch((e) => {
    console.error('✗ Erreur :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
