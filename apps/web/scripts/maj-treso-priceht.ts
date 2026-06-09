/**
 * Étape 3 : MAJ du priceHT en BDD pour les MATCH_DIFF (Excel = source de vérité).
 *
 * MODE PAR DÉFAUT : DRY-RUN — affiche ce qui sera modifié SANS rien écrire en BDD.
 * MODE --commit : applique réellement les UPDATE en BDD (irréversible).
 *
 * Avant tout UPDATE : exporte un backup CSV des anciennes valeurs dans
 *   /tmp/treso-maj-backup-{timestamp}.csv
 * pour pouvoir restaurer en cas de problème.
 *
 * Périmètre :
 *  - 68 MATCH_DIFF où Excel diffère de BDD (priceHT uniquement, pas le sponsor)
 *  - Inclut Steve Noel SES-0093 (Excel 0€, BDD 336€) — validation Laurent 2026-05-22
 *  - 4 MULTI_MATCH où l'un des candidats a un montant identique à Excel
 *
 * Usage :
 *   dry-run : cd apps/web && npx dotenv -e ../../.env -- tsx scripts/maj-treso-priceht.ts
 *   commit  : cd apps/web && npx dotenv -e ../../.env -- tsx scripts/maj-treso-priceht.ts --commit
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { prisma } from '@qualiof/db';

interface TresoRow {
  year: number;
  dateDepot: string | null;
  dateFormation: string | null;
  nbStagiaires: number | null;
  nomStagiaire: string;
  opcoOrg: string | null;
  montantTotal: number | null;
  factureEnvoyee: string | null;
  validationOrg: string | null;
  remboursementOPCO: string | null;
  paiementClient: string | null;
  sourceFile: string;
}

function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^(m\.|mme|mr|monsieur|madame|mlle)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const COMMIT = process.argv.includes('--commit');

async function main() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  MAJ BDD priceHT — ${COMMIT ? '⚠️  MODE COMMIT (IRRÉVERSIBLE)' : '🧪 MODE DRY-RUN (lecture seule)'}`);
  console.log(`${'='.repeat(70)}\n`);

  // 1. Charger Excel
  const tresoRows = JSON.parse(readFileSync('/tmp/treso-agefice-extracted.json', 'utf8')) as TresoRow[];
  console.log(`📥 ${tresoRows.length} lignes Tréso Excel chargées`);

  // 2. Charger SP BDD avec OPCO
  const allSP = await prisma.sessionParticipant.findMany({
    where: { sponsorOrg: { opcoCode: { not: null } } },
    include: {
      person: { select: { firstName: true, lastName: true, id: true } },
      session: { select: { code: true, startDate: true } },
      sponsorOrg: { select: { opcoCode: true, legalName: true } },
    },
  });
  console.log(`📥 ${allSP.length} SP BDD avec sponsor OPCO`);

  // Index par nom normalisé
  const spByName = new Map<string, typeof allSP>();
  for (const sp of allSP) {
    if (!sp.person) continue;
    const fullName = `${sp.person.firstName ?? ''} ${sp.person.lastName ?? ''}`.trim();
    const key = normalizeName(fullName);
    if (!key) continue;
    if (!spByName.has(key)) spByName.set(key, []);
    spByName.get(key)!.push(sp);
  }

  // 3. Identifier les updates à faire
  interface UpdatePlan {
    spId: string;
    personName: string;
    sessionCode: string | null;
    sessionStart: string;
    sponsorCode: string | null;
    oldPriceHT: number | null;
    newPriceHT: number;
    excelNomStagiaire: string;
    excelMontant: number;
    excelOpco: string | null;
    excelYear: number;
    rationale: 'MATCH_DIFF' | 'MULTI_MATCH_EXACT';
  }

  const plan: UpdatePlan[] = [];
  const skippedMulti: { tresoNom: string; year: number; nbCandidates: number; excelMontant: number }[] = [];

  for (const treso of tresoRows) {
    const nomLower = treso.nomStagiaire.toLowerCase();
    if (nomLower.startsWith('groupe ')) continue;
    if (treso.montantTotal === null) continue;

    const key = normalizeName(treso.nomStagiaire);
    const candidates = spByName.get(key) ?? [];
    if (candidates.length === 0) continue;

    const yearCands = candidates.filter((sp) => {
      const yF = sp.financingRequestDate ? new Date(sp.financingRequestDate).getFullYear() : null;
      const yS = sp.session?.startDate ? new Date(sp.session.startDate).getFullYear() : null;
      return yF === treso.year || yS === treso.year;
    });
    const finalCands = yearCands.length > 0 ? yearCands : candidates;
    if (finalCands.length === 0) continue;

    if (finalCands.length === 1) {
      const sp = finalCands[0]!;
      const bdd = sp.priceHT === null ? 0 : Number(sp.priceHT);
      const xls = treso.montantTotal;
      if (Math.abs(bdd - xls) < 0.01) continue; // déjà aligné
      plan.push({
        spId: sp.id,
        personName: `${sp.person?.firstName ?? ''} ${sp.person?.lastName ?? ''}`.trim(),
        sessionCode: sp.session?.code ?? null,
        sessionStart: sp.session?.startDate ? new Date(sp.session.startDate).toISOString().slice(0, 10) : '',
        sponsorCode: sp.sponsorOrg?.opcoCode ?? null,
        oldPriceHT: sp.priceHT === null ? null : Number(sp.priceHT),
        newPriceHT: xls,
        excelNomStagiaire: treso.nomStagiaire,
        excelMontant: xls,
        excelOpco: treso.opcoOrg,
        excelYear: treso.year,
        rationale: 'MATCH_DIFF',
      });
    } else {
      // MULTI_MATCH : prendre le candidat dont priceHT === excel.montantTotal
      const exact = finalCands.find(
        (sp) => sp.priceHT !== null && Math.abs(Number(sp.priceHT) - treso.montantTotal!) < 0.01,
      );
      if (exact) continue; // déjà aligné, rien à faire
      skippedMulti.push({
        tresoNom: treso.nomStagiaire,
        year: treso.year,
        nbCandidates: finalCands.length,
        excelMontant: treso.montantTotal,
      });
    }
  }

  console.log(`\n🎯 ${plan.length} UPDATE à effectuer`);
  console.log(`⏭️  ${skippedMulti.length} MULTI_MATCH ambigus (skippés, arbitrage manuel requis)`);

  // 4. Backup CSV des anciennes valeurs (toujours, même en dry-run)
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = `/tmp/treso-maj-backup-${ts}.csv`;
  const csvLines: string[] = [];
  csvLines.push('spId;personName;sessionCode;sessionStart;sponsorCode;oldPriceHT;newPriceHT;excelMontant;excelYear;rationale');
  for (const p of plan) {
    csvLines.push(
      [
        p.spId,
        p.personName,
        p.sessionCode ?? '',
        p.sessionStart,
        p.sponsorCode ?? '',
        p.oldPriceHT ?? '',
        p.newPriceHT,
        p.excelMontant,
        p.excelYear,
        p.rationale,
      ]
        .map((v) => String(v))
        .join(';'),
    );
  }
  writeFileSync(backupPath, csvLines.join('\n'), 'utf8');
  console.log(`💾 Backup CSV : ${backupPath}`);

  // 5. Récap par session
  const bySession = new Map<string, UpdatePlan[]>();
  for (const p of plan) {
    const k = p.sessionCode ?? '(sans session)';
    if (!bySession.has(k)) bySession.set(k, []);
    bySession.get(k)!.push(p);
  }
  console.log(`\n📋 Récap par session :`);
  for (const [code, list] of Array.from(bySession.entries()).sort()) {
    const totalOld = list.reduce((s, p) => s + (p.oldPriceHT ?? 0), 0);
    const totalNew = list.reduce((s, p) => s + p.newPriceHT, 0);
    const delta = totalNew - totalOld;
    console.log(
      `   ${code.padEnd(12)} : ${list.length} stag · ancien ${totalOld.toFixed(2)}€ → nouveau ${totalNew.toFixed(2)}€ (delta ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}€)`,
    );
  }
  const grandTotalOld = plan.reduce((s, p) => s + (p.oldPriceHT ?? 0), 0);
  const grandTotalNew = plan.reduce((s, p) => s + p.newPriceHT, 0);
  console.log(`\n   ────────────────────────────────`);
  console.log(`   TOTAL : ${plan.length} stag · ancien ${grandTotalOld.toFixed(2)}€ → nouveau ${grandTotalNew.toFixed(2)}€ (delta ${(grandTotalNew - grandTotalOld >= 0 ? '+' : '')}${(grandTotalNew - grandTotalOld).toFixed(2)}€)`);

  // 6. MULTI_MATCH skippés
  if (skippedMulti.length > 0) {
    console.log(`\n⏭️  MULTI_MATCH non résolus (à arbitrer manuellement plus tard) :`);
    for (const s of skippedMulti) {
      console.log(`   ${s.tresoNom} (${s.year}) : ${s.nbCandidates} candidats BDD, montant Excel ${s.excelMontant}€`);
    }
  }

  // 7. Exécution si --commit
  if (!COMMIT) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  🧪 DRY-RUN terminé. Aucune écriture BDD effectuée.`);
    console.log(`  Pour appliquer : ajouter --commit en argument.`);
    console.log(`${'='.repeat(70)}\n`);
  } else {
    console.log(`\n⚠️  Exécution des UPDATE en BDD...`);
    let ok = 0;
    let fail = 0;
    for (const p of plan) {
      try {
        await prisma.sessionParticipant.update({
          where: { id: p.spId },
          data: { priceHT: p.newPriceHT },
        });
        ok++;
      } catch (err) {
        fail++;
        console.error(`  ❌ ${p.spId} (${p.personName}) :`, err instanceof Error ? err.message : err);
      }
    }
    console.log(`\n✅ ${ok} UPDATE réussis · ❌ ${fail} échecs`);
    console.log(`   Backup des anciennes valeurs : ${backupPath}`);
    console.log(`   En cas de rollback, ouvrir ce CSV et restaurer les oldPriceHT.`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ Erreur :', err);
  prisma.$disconnect().finally(() => process.exit(1));
});
