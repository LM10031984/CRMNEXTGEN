/**
 * Audit `Session.pricePerLearner` overrides : prix unitaire vs CA total.
 *
 * Le champ `pricePerLearner` est sémantiquement le **prix HT par stagiaire**
 * (cf. sessions-create.ts:167 qui le clone depuis product.priceHT, et
 * sessions-create.ts:207 qui le propage à SessionParticipant.priceHT).
 *
 * MAIS : l'import historique SmartOF/Excel a parfois stocké le **CA total**
 * (= prixUnitaireHT × nbParticipants) à la place du prix unitaire. Bug
 * masqué jusqu'ici par l'affichage UI ligne 513 qui dit "X € total session".
 *
 * Ce script classe les sessions en 3 catégories :
 *   - OK         : pricePerLearner ≈ prixUnitaireHT (déjà correct)
 *   - CA_TOTAL   : pricePerLearner ≈ prixUnitaireHT × nbParts → à diviser
 *   - NEGO       : pricePerLearner != ni l'un ni l'autre → tarif négocié,
 *                  garder mais flag pour review manuel
 *
 * Mode :
 *   --dry  (défaut) : affiche le tableau de classification, écrit rien
 *   --apply         : convertit les CA_TOTAL (divise par nbParts)
 *                     + propage à participants qui sont à 0 ou égal au
 *                       CA total ancien (correction de cascade)
 */

import { prisma } from '@qualiof/db';
import { listSessions, smartofFetch, type SmartofSession } from '../src/lib/smartof/client';

const APPLY = process.argv.includes('--apply');

interface ProductPrice {
  prixUnitaireHT: number | null;
}

async function getProductPrice(uid: string): Promise<ProductPrice> {
  try {
    const p = (await smartofFetch('/api/produit/get', { produitFormationUid: uid })) as {
      presetTarification?: { tarifs?: Array<{ budget?: Array<{ prixUnitaireHT?: number }> }> };
    };
    const prix = p.presetTarification?.tarifs?.[0]?.budget?.[0]?.prixUnitaireHT ?? null;
    return { prixUnitaireHT: typeof prix === 'number' ? prix : null };
  } catch {
    return { prixUnitaireHT: null };
  }
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
  console.log(' AUDIT Session.pricePerLearner — Prix unitaire vs CA total');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Mode : ${APPLY ? '✏️  APPLY' : '🔍 DRY-RUN'}`);
  console.log('');

  // 1. Pull SmartOF sessions + products
  const sessRaw = (await listSessions()) as { sessions?: SmartofSession[] };
  const sessions = sessRaw.sessions ?? [];
  const productUids = Array.from(
    new Set(sessions.map((s) => s.produitFormationViseeUid as string).filter(Boolean)),
  );
  const productPrices = new Map<string, number>();
  for (const uid of productUids) {
    const p = await getProductPrice(uid);
    if (p.prixUnitaireHT) productPrices.set(uid, p.prixUnitaireHT);
  }
  console.log(`◆ ${sessions.length} sessions SmartOF, ${productPrices.size} produits avec prix`);
  console.log('');

  // 2. Audit chaque session QualiOF
  const headers = ['Code', 'NbP', 'PPL actuel', 'SmartOF unit', 'CA attendu', 'Verdict', 'Action'];
  const widths = [10, 4, 12, 12, 12, 12, 30];
  console.log(row(headers, widths));
  console.log('─'.repeat(110));

  const stats = { OK: 0, CA_TOTAL: 0, NEGO: 0, ABSENT: 0 };
  const toConvert: Array<{
    id: string;
    code: string;
    oldPpl: number;
    newPpl: number;
    nbParts: number;
    participantsToFix: Array<{ id: string; oldPrice: number }>;
  }> = [];

  for (const ss of sessions) {
    const code = ss.customId as string;
    const produitUid = ss.produitFormationViseeUid as string | undefined;
    const smartofUnit = produitUid ? productPrices.get(produitUid) : null;
    if (!smartofUnit) continue;

    const qSess = await prisma.trainingSession.findFirst({
      where: { code },
      include: {
        participants: { select: { id: true, priceHT: true } },
      },
    });
    if (!qSess) { stats.ABSENT++; continue; }

    const ppl = Number(qSess.pricePerLearner ?? 0);
    const nbP = qSess.participants.length;
    const caExpected = smartofUnit * nbP;

    let verdict: 'OK' | 'CA_TOTAL' | 'NEGO';
    let action = '';

    // Tolerance ±2% pour matcher
    const within = (a: number, b: number, pct = 0.02) => b !== 0 && Math.abs(a - b) / b <= pct;

    if (ppl === 0 || within(ppl, smartofUnit)) {
      verdict = 'OK';
      // (déjà aligné par sync précédent)
    } else if (nbP > 0 && within(ppl, caExpected)) {
      verdict = 'CA_TOTAL';
      action = `÷${nbP} → ${fmt(smartofUnit)}`;
      // Liste les participants à fixer : ceux à 0 OU == ppl ancien (bug cascade)
      const partsToFix = qSess.participants.filter((p) => {
        const v = Number(p.priceHT);
        return v === 0 || within(v, ppl);
      });
      toConvert.push({
        id: qSess.id,
        code,
        oldPpl: ppl,
        newPpl: smartofUnit,
        nbParts: nbP,
        participantsToFix: partsToFix.map((p) => ({ id: p.id, oldPrice: Number(p.priceHT) })),
      });
    } else {
      verdict = 'NEGO';
      const ratio = nbP > 0 ? (ppl / smartofUnit).toFixed(2) : '—';
      action = `vrai override (×${ratio} unit)`;
    }
    stats[verdict]++;

    console.log(
      row(
        [code, String(nbP), fmt(ppl), fmt(smartofUnit), fmt(caExpected), verdict, action],
        widths,
      ),
    );
  }

  console.log('');
  console.log('━━━ RÉSUMÉ ━━━');
  console.log(`  OK (déjà prix unitaire)   : ${stats.OK}`);
  console.log(`  CA_TOTAL (à convertir)    : ${stats.CA_TOTAL}  ← ${toConvert.reduce((acc, c) => acc + 1 + c.participantsToFix.length, 0)} updates si --apply`);
  console.log(`  NEGO (override vrai)      : ${stats.NEGO}`);
  console.log(`  ABSENT (pas en QualiOF)   : ${stats.ABSENT}`);

  if (!APPLY) {
    console.log('');
    console.log('🔍 Mode dry-run — relance avec --apply pour convertir les CA_TOTAL.');
    return;
  }

  console.log('');
  console.log('✏️  APPLY — conversion CA_TOTAL → prix unitaire…');
  let sessUpdated = 0;
  let partsUpdated = 0;
  for (const c of toConvert) {
    await prisma.trainingSession.update({
      where: { id: c.id },
      data: { pricePerLearner: c.newPpl },
    });
    sessUpdated++;
    for (const p of c.participantsToFix) {
      await prisma.sessionParticipant.update({
        where: { id: p.id },
        data: { priceHT: c.newPpl },
      });
      partsUpdated++;
    }
  }
  console.log(`  ✓ ${sessUpdated} sessions converties`);
  console.log(`  ✓ ${partsUpdated} participants alignés sur le nouveau prix unitaire`);
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
