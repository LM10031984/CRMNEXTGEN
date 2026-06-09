/**
 * Étape 2 : rapprochement entre les 274 lignes Tréso Agefice (Excel) et la BDD QualiOF.
 *
 * Pour chaque ligne Excel, on cherche le ou les SessionParticipant correspondants par :
 *  - Nom apprenant normalisé (sans accents, sans "M./Mme", trim, lowercase)
 *  - Année (financingRequestDate ou session.startDate fallback)
 *
 * Catégorisation :
 *  - MATCH_OK       : 1 SP trouvé, montant identique
 *  - MATCH_DIFF     : 1 SP trouvé, montant différent
 *  - MULTI_MATCH    : >1 SP candidats (homonymes ou plusieurs sessions)
 *  - NOT_FOUND      : 0 SP trouvé
 *
 * Output : /tmp/treso-rapprochement.csv (à ouvrir dans Excel)
 *
 * NE MODIFIE RIEN EN BDD. Lecture seule.
 *
 * Usage : pnpm --filter @qualiof/web exec tsx scripts/rapprochement-treso-bdd.ts
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

interface MatchResult {
  treso: TresoRow;
  status: 'MATCH_OK' | 'MATCH_DIFF' | 'MULTI_MATCH' | 'NOT_FOUND';
  candidates: Array<{
    spId: string;
    personName: string;
    sessionCode: string | null;
    sessionStart: string;
    priceHT: number | null;
    amountCollected: number | null;
    invoiceSent: boolean;
    paymentReceived: boolean;
    opcoApproved: boolean;
    sponsorCode: string | null;
  }>;
  notes: string;
}

// Normalise un nom pour matching : enlève accents, prefixe Mr/Mme, espaces multiples
function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents
    .toLowerCase()
    .replace(/^(m\.|mme|mr|monsieur|madame|mlle)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Variante : extraire juste "prenom nom" sans civilité
function nameParts(s: string): { firstName: string; lastName: string } {
  const norm = normalizeName(s);
  const parts = norm.split(' ').filter((p) => p.length > 0);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: '', lastName: parts[0]! };
  // Heuristique : si tout en majuscules d'origine, on suppose "PRENOM NOM" sinon "Prénom Nom"
  // Simple : 1er = firstName, reste = lastName
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') };
}

async function main() {
  console.log('📥 Chargement des données Tréso Agefice extraites...');
  const tresoRows = JSON.parse(readFileSync('/tmp/treso-agefice-extracted.json', 'utf8')) as TresoRow[];
  console.log(`   ${tresoRows.length} lignes à rapprocher`);

  console.log('\n📥 Chargement des SessionParticipant en BDD (avec sponsor OPCO)...');
  const allSP = await prisma.sessionParticipant.findMany({
    where: {
      sponsorOrg: {
        opcoCode: { not: null },
      },
    },
    include: {
      person: { select: { firstName: true, lastName: true, id: true } },
      session: { select: { code: true, startDate: true } },
      sponsorOrg: { select: { opcoCode: true, legalName: true } },
    },
  });
  console.log(`   ${allSP.length} SessionParticipant avec sponsor OPCO en BDD`);

  // Index par nom normalisé pour matching rapide
  const spByName = new Map<string, typeof allSP>();
  for (const sp of allSP) {
    if (!sp.person) continue;
    const fullName = `${sp.person.firstName ?? ''} ${sp.person.lastName ?? ''}`.trim();
    const key = normalizeName(fullName);
    if (!key) continue;
    if (!spByName.has(key)) spByName.set(key, []);
    spByName.get(key)!.push(sp);
  }
  console.log(`   ${spByName.size} apprenants distincts indexés`);

  // Pour chaque ligne Treso, rapprocher
  const results: MatchResult[] = [];
  let nMatchOk = 0;
  let nMatchDiff = 0;
  let nMulti = 0;
  let nNotFound = 0;

  for (const treso of tresoRows) {
    // Skip lignes "Groupe XYZ" (ce ne sont pas des apprenants individuels)
    const nomLower = treso.nomStagiaire.toLowerCase();
    if (nomLower.startsWith('groupe ')) {
      results.push({
        treso,
        status: 'NOT_FOUND',
        candidates: [],
        notes: 'Ligne "Groupe ..." — pas un apprenant individuel, à traiter manuellement',
      });
      nNotFound++;
      continue;
    }

    const key = normalizeName(treso.nomStagiaire);
    const candidates = spByName.get(key) ?? [];

    // Filtrer candidats par année (financingRequestDate ou session.startDate)
    const yearCandidates = candidates.filter((sp) => {
      const yearFin = sp.financingRequestDate ? new Date(sp.financingRequestDate).getFullYear() : null;
      const yearSes = sp.session?.startDate ? new Date(sp.session.startDate).getFullYear() : null;
      return yearFin === treso.year || yearSes === treso.year;
    });

    const finalCandidates = yearCandidates.length > 0 ? yearCandidates : candidates;

    if (finalCandidates.length === 0) {
      results.push({
        treso,
        status: 'NOT_FOUND',
        candidates: [],
        notes: candidates.length > 0
          ? `Apprenant trouvé en BDD mais pas dans l'année ${treso.year}`
          : 'Apprenant inconnu en BDD',
      });
      nNotFound++;
      continue;
    }

    const candList = finalCandidates.map((sp) => ({
      spId: sp.id,
      personName: `${sp.person?.firstName ?? ''} ${sp.person?.lastName ?? ''}`.trim(),
      sessionCode: sp.session?.code ?? null,
      sessionStart: sp.session?.startDate ? new Date(sp.session.startDate).toISOString().slice(0, 10) : '',
      priceHT: sp.priceHT,
      amountCollected: sp.amountCollected,
      invoiceSent: sp.invoiceSent,
      paymentReceived: sp.paymentReceived,
      opcoApproved: sp.opcoApproved,
      sponsorCode: sp.sponsorOrg?.opcoCode ?? null,
    }));

    if (finalCandidates.length > 1) {
      // Plusieurs candidats : vérifier si l'un correspond exactement au montant
      const exactMatch = finalCandidates.find(
        (sp) => sp.priceHT !== null && Math.abs(sp.priceHT - (treso.montantTotal ?? 0)) < 0.01,
      );
      if (exactMatch) {
        results.push({
          treso,
          status: 'MATCH_OK',
          candidates: candList,
          notes: `Plusieurs sessions (${finalCandidates.length}), 1 montant identique trouvé`,
        });
        nMatchOk++;
      } else {
        results.push({
          treso,
          status: 'MULTI_MATCH',
          candidates: candList,
          notes: `${finalCandidates.length} candidats — homonymes ou plusieurs sessions, aucun avec montant identique`,
        });
        nMulti++;
      }
      continue;
    }

    // 1 seul candidat : comparer montant
    const sp = finalCandidates[0]!;
    const bdd = sp.priceHT ?? 0;
    const xls = treso.montantTotal ?? 0;
    if (Math.abs(bdd - xls) < 0.01) {
      results.push({
        treso,
        status: 'MATCH_OK',
        candidates: candList,
        notes: '',
      });
      nMatchOk++;
    } else {
      results.push({
        treso,
        status: 'MATCH_DIFF',
        candidates: candList,
        notes: `Excel ${xls}€ vs BDD ${bdd}€ — écart ${(xls - bdd).toFixed(2)}€`,
      });
      nMatchDiff++;
    }
  }

  // SP en BDD jamais matchés (= existent en BDD mais pas dans Tréso Excel)
  const matchedSpIds = new Set<string>();
  for (const r of results) {
    for (const c of r.candidates) matchedSpIds.add(c.spId);
  }
  const bddOrphans = allSP.filter((sp) => !matchedSpIds.has(sp.id));

  // === Synthèse ===
  console.log('\n\n📊 SYNTHÈSE DU RAPPROCHEMENT');
  console.log('='.repeat(70));
  console.log(`  MATCH_OK      : ${nMatchOk.toString().padStart(4)} lignes ✅`);
  console.log(`  MATCH_DIFF    : ${nMatchDiff.toString().padStart(4)} lignes ⚠️  (montants à ajuster)`);
  console.log(`  MULTI_MATCH   : ${nMulti.toString().padStart(4)} lignes 🔀 (homonymes à arbitrer)`);
  console.log(`  NOT_FOUND     : ${nNotFound.toString().padStart(4)} lignes ❌ (absents BDD ou groupes)`);
  console.log(`  ────────────────────`);
  console.log(`  Total Excel   : ${tresoRows.length.toString().padStart(4)} lignes`);
  console.log(`  Orphelins BDD : ${bddOrphans.length.toString().padStart(4)} SessionParticipant avec OPCO mais absents Excel`);

  // === Export CSV ===
  const csvLines: string[] = [];
  csvLines.push('Status;Année;DateDépôt;NomExcel;OPCO_Excel;Montant_Excel;FactureExcel;ValidationExcel;PaiementExcel;BDD_NomComplet;BDD_SessionCode;BDD_SessionStart;BDD_PriceHT;BDD_Encaissé;BDD_FactureSent;BDD_PaiementReçu;BDD_OpcoApproved;BDD_Sponsor;Notes');

  function csvEscape(v: unknown): string {
    const s = v === null || v === undefined ? '' : String(v);
    if (s.includes(';') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  for (const r of results) {
    if (r.candidates.length === 0) {
      csvLines.push(
        [
          r.status,
          r.treso.year,
          r.treso.dateDepot ?? '',
          r.treso.nomStagiaire,
          r.treso.opcoOrg ?? '',
          r.treso.montantTotal ?? '',
          r.treso.factureEnvoyee ?? '',
          r.treso.validationOrg ?? '',
          r.treso.paiementClient ?? '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          r.notes,
        ]
          .map(csvEscape)
          .join(';'),
      );
    } else {
      for (const c of r.candidates) {
        csvLines.push(
          [
            r.status,
            r.treso.year,
            r.treso.dateDepot ?? '',
            r.treso.nomStagiaire,
            r.treso.opcoOrg ?? '',
            r.treso.montantTotal ?? '',
            r.treso.factureEnvoyee ?? '',
            r.treso.validationOrg ?? '',
            r.treso.paiementClient ?? '',
            c.personName,
            c.sessionCode ?? '',
            c.sessionStart,
            c.priceHT ?? '',
            c.amountCollected ?? '',
            c.invoiceSent ? 'OUI' : 'NON',
            c.paymentReceived ? 'OUI' : 'NON',
            c.opcoApproved ? 'OUI' : 'NON',
            c.sponsorCode ?? '',
            r.notes,
          ]
            .map(csvEscape)
            .join(';'),
        );
      }
    }
  }

  // Section "Orphelins BDD"
  csvLines.push('');
  csvLines.push('ORPHELINS BDD (en QualiOF mais absents du tableau Excel)');
  csvLines.push('SP_id;NomComplet;SessionCode;SessionStart;PriceHT;Encaissé;Sponsor;OpcoCode');
  for (const sp of bddOrphans) {
    csvLines.push(
      [
        sp.id,
        `${sp.person?.firstName ?? ''} ${sp.person?.lastName ?? ''}`.trim(),
        sp.session?.code ?? '',
        sp.session?.startDate ? new Date(sp.session.startDate).toISOString().slice(0, 10) : '',
        sp.priceHT ?? '',
        sp.amountCollected ?? '',
        sp.sponsorOrg?.legalName ?? '',
        sp.sponsorOrg?.opcoCode ?? '',
      ]
        .map(csvEscape)
        .join(';'),
    );
  }

  const outPath = '/tmp/treso-rapprochement.csv';
  writeFileSync(outPath, csvLines.join('\n'), 'utf8');
  console.log(`\n💾 Rapport CSV : ${outPath}`);
  console.log(`   Ouvre-le dans Excel ou Numbers pour voir le détail ligne par ligne.`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ Erreur :', err);
  prisma.$disconnect().finally(() => process.exit(1));
});
