/**
 * Assigne le formateur principal (SessionTrainer.isPrimary=true) à chaque session
 * en se basant sur le Tableau récap (Drive) avec overrides de matching.
 *
 * Étapes :
 *   1. Lit le Tableau récap (10 feuilles, 103 lignes)
 *   2. Crée Person "Jean-Guy Ourmières" en BDD si absent (mode --commit)
 *   3. Résout chaque formateur tableau → Person BDD via overrides
 *   4. Matche chaque ligne tableau ↔ session BDD par (nom apprenant ∈ participants)
 *      + tolérance de date (formation tableau dans range startDate-endDate session)
 *   5. Pour chaque session matchée : crée/MAJ SessionTrainer avec isPrimary=true
 *
 * Dry-run par défaut. --commit pour appliquer.
 */

import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { prisma } from '@qualiof/db';

const TABLEAU_PATH =
  '/Users/laurentmarx/Library/CloudStorage/GoogleDrive-laurent@start-academy.fr/Mon Drive/Test Qualiopi/Tableau_recapitulatif_informations agent (2).xlsx';

const COMMIT = process.argv.includes('--commit');

// Override matching : nom tableau → identification BDD
const FORMATEUR_OVERRIDES: Record<string, { firstName: string; lastName: string }> = {
  LM: { firstName: 'Laurent', lastName: 'Marx' },
  'Laurent Marx': { firstName: 'Laurent', lastName: 'Marx' },
  JGO: { firstName: 'Jean-Guy', lastName: 'Ourmières' },
  JG: { firstName: 'Jean-Guy', lastName: 'Ourmières' },
  'Julien Lafitte': { firstName: 'Julien', lastName: 'Lafitte' },
};

function parseStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
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

interface TableauRow {
  feuille: string;
  nomAgent: string;
  dateFormation: string | null;
  formateur: string;
}

async function main() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ASSIGN TRAINERS — ${COMMIT ? '⚠️  COMMIT' : '🧪 DRY-RUN'}`);
  console.log(`${'='.repeat(70)}\n`);

  // Tenant
  const tenant = await prisma.tenant.findFirst({ select: { id: true, name: true } });
  if (!tenant) throw new Error('Tenant introuvable');

  // 1. Extraire tableau
  console.log('📥 Lecture Tableau récap...');
  const buf = readFileSync(TABLEAU_PATH);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const tableau: TableauRow[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const all = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];
    if (all.length < 2) continue;
    const header = (all[0] ?? []).map((c) =>
      c === null || c === undefined ? '' : String(c).trim().toLowerCase(),
    );
    const col = (...patterns: string[]): number => {
      for (let i = 0; i < header.length; i++) {
        const h = header[i] ?? '';
        for (const p of patterns) {
          if (h === p || h.includes(p)) return i;
        }
      }
      return -1;
    };
    const iNom = col('nom');
    const iDate = col('date formation', 'date de la formation');
    const iFormateur = col('formateur');
    if (iNom < 0 || iFormateur < 0) continue;
    for (let r = 1; r < all.length; r++) {
      const row = all[r];
      if (!row) continue;
      const nom = parseStr(row[iNom]);
      const formateur = parseStr(row[iFormateur]);
      if (!nom || !formateur) continue;
      tableau.push({
        feuille: sheetName,
        nomAgent: nom,
        dateFormation: iDate >= 0 ? parseStr(row[iDate]) : null,
        formateur,
      });
    }
  }
  console.log(`   ${tableau.length} lignes extraites`);

  // 2. Résoudre formateurs → Person ID
  const formateursUniques = new Set(tableau.map((t) => t.formateur));
  console.log(`\n🔗 Résolution formateurs (${formateursUniques.size}) :`);
  const formateurToPersonId = new Map<string, string>();

  for (const f of formateursUniques) {
    const override = FORMATEUR_OVERRIDES[f];
    if (!override) {
      console.log(`   ⚠️  "${f}" : aucun override défini, skip`);
      continue;
    }
    let person = await prisma.person.findFirst({
      where: {
        tenantId: tenant.id,
        firstName: override.firstName,
        lastName: override.lastName,
      },
      select: { id: true },
    });
    if (!person) {
      if (COMMIT) {
        person = await prisma.person.create({
          data: {
            tenantId: tenant.id,
            firstName: override.firstName,
            lastName: override.lastName,
          },
          select: { id: true },
        });
        console.log(`   ✅ "${f}" → ${override.firstName} ${override.lastName} (créé : ${person.id})`);
      } else {
        console.log(`   🆕 "${f}" → ${override.firstName} ${override.lastName} (À CRÉER en commit)`);
      }
    } else {
      console.log(`   ✓  "${f}" → ${override.firstName} ${override.lastName} (existant : ${person.id})`);
      formateurToPersonId.set(f, person.id);
    }
    if (person) formateurToPersonId.set(f, person.id);
  }

  // 3. Charger sessions avec participants
  console.log(`\n📥 Chargement sessions BDD (avec participants)...`);
  const sessions = await prisma.trainingSession.findMany({
    where: { tenantId: tenant.id },
    include: {
      participants: {
        include: { person: { select: { firstName: true, lastName: true } } },
      },
      trainers: { select: { id: true, personId: true, isPrimary: true } },
    },
  });
  console.log(`   ${sessions.length} sessions chargées`);

  // 4. Matcher chaque ligne tableau ↔ session
  interface Plan {
    sessionId: string;
    sessionCode: string;
    sessionName: string;
    formateurTableau: string;
    personIdToAssign: string;
    personNameToAssign: string;
    agentTableau: string;
    existingPrimary: { personId: string; sessionTrainerId: string } | null;
    actionNeeded: 'CREATE' | 'UPDATE_TO_PRIMARY' | 'PROMOTE_OTHER_PRIMARY' | 'NO_OP';
  }

  const plans: Plan[] = [];
  const unmatched: TableauRow[] = [];

  for (const row of tableau) {
    const personId = formateurToPersonId.get(row.formateur);
    if (!personId) continue; // formateur pas résolu (et pas créé en dry-run)

    // Trouver les sessions où nomAgent ∈ participants
    const normAgent = normalizeName(row.nomAgent);
    const matchingSessions = sessions.filter((s) =>
      s.participants.some((p) => {
        const full = normalizeName(`${p.person.firstName} ${p.person.lastName}`);
        return full === normAgent || full.includes(normAgent) || normAgent.includes(full);
      }),
    );

    if (matchingSessions.length === 0) {
      unmatched.push(row);
      continue;
    }

    // Si plusieurs sessions matchent : prendre celle dont la date de formation contient la dateFormation tableau (parsing approximatif)
    let session = matchingSessions[0]!;
    if (matchingSessions.length > 1 && row.dateFormation) {
      // Tente de parser "9 au 17/01/2025" ou similaire
      const dateMatch = row.dateFormation.match(/(\d{1,2})[/-](\d{1,2})[/-]?(\d{2,4})?/);
      if (dateMatch) {
        const dayPart = dateMatch[1];
        const monthPart = dateMatch[2];
        if (dayPart && monthPart) {
          const day = parseInt(dayPart, 10);
          const month = parseInt(monthPart, 10);
          const yearPart = dateMatch[3];
          const year = yearPart ? parseInt(yearPart, 10) + (yearPart.length === 2 ? 2000 : 0) : null;
          const better = matchingSessions.find((s) => {
            const sd = new Date(s.startDate);
            return (
              sd.getMonth() + 1 === month &&
              (year === null || sd.getFullYear() === year) &&
              Math.abs(sd.getDate() - day) <= 7
            );
          });
          if (better) session = better;
        }
      }
    }

    // Déterminer action sur SessionTrainer
    const existingPrimary = session.trainers.find((t) => t.isPrimary);
    const existingForThisPerson = session.trainers.find((t) => t.personId === personId);
    let actionNeeded: Plan['actionNeeded'];
    if (existingPrimary && existingPrimary.personId === personId) actionNeeded = 'NO_OP';
    else if (existingForThisPerson) actionNeeded = 'UPDATE_TO_PRIMARY'; // déjà lié mais pas primaire
    else if (existingPrimary) actionNeeded = 'PROMOTE_OTHER_PRIMARY'; // qqun d'autre est primaire
    else actionNeeded = 'CREATE';

    plans.push({
      sessionId: session.id,
      sessionCode: session.code,
      sessionName: session.name,
      formateurTableau: row.formateur,
      personIdToAssign: personId,
      personNameToAssign: `${FORMATEUR_OVERRIDES[row.formateur]?.firstName} ${FORMATEUR_OVERRIDES[row.formateur]?.lastName}`,
      agentTableau: row.nomAgent,
      existingPrimary: existingPrimary
        ? { personId: existingPrimary.personId, sessionTrainerId: existingPrimary.id }
        : null,
      actionNeeded,
    });
  }

  // Déduplication par sessionId : 1 décision par session (premier match)
  const planBySession = new Map<string, Plan>();
  for (const p of plans) {
    if (!planBySession.has(p.sessionId)) planBySession.set(p.sessionId, p);
  }
  const uniquePlans = [...planBySession.values()];

  // 5. Synthèse
  console.log(`\n📊 SYNTHÈSE`);
  console.log(`   Lignes tableau           : ${tableau.length}`);
  console.log(`   Lignes non matchées      : ${unmatched.length}`);
  console.log(`   Sessions impactées       : ${uniquePlans.length}`);
  const byAction = new Map<string, number>();
  for (const p of uniquePlans) byAction.set(p.actionNeeded, (byAction.get(p.actionNeeded) ?? 0) + 1);
  for (const [k, n] of byAction) console.log(`     ${k.padEnd(25)} ${n}`);

  // Détail par formateur assigné
  console.log(`\n🎯 Sessions par formateur assigné :`);
  const byTrainer = new Map<string, number>();
  for (const p of uniquePlans) byTrainer.set(p.personNameToAssign, (byTrainer.get(p.personNameToAssign) ?? 0) + 1);
  for (const [k, n] of byTrainer) console.log(`   ${n.toString().padStart(3)}× ${k}`);

  // 10 exemples
  console.log(`\n🔍 10 exemples :`);
  for (const p of uniquePlans.slice(0, 10)) {
    console.log(`   ${p.sessionCode.padEnd(10)} · ${p.actionNeeded.padEnd(22)} · → ${p.personNameToAssign} (depuis "${p.formateurTableau}" via ${p.agentTableau})`);
  }

  if (unmatched.length > 0) {
    console.log(`\n⚠️  ${unmatched.length} lignes non matchées (10 exemples) :`);
    for (const u of unmatched.slice(0, 10)) {
      console.log(`   ${u.feuille} · "${u.nomAgent}" (${u.dateFormation ?? 'sans date'}) · formateur ${u.formateur}`);
    }
  }

  // 6. Commit
  if (!COMMIT) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  🧪 DRY-RUN terminé. Aucune écriture BDD.`);
    console.log(`  Pour appliquer : --commit`);
    console.log(`${'='.repeat(70)}\n`);
  } else {
    console.log(`\n⚠️  Application des changements...`);
    let nCreate = 0,
      nUpdate = 0,
      nPromote = 0;
    for (const p of uniquePlans) {
      try {
        if (p.actionNeeded === 'NO_OP') continue;
        if (p.actionNeeded === 'CREATE') {
          await prisma.sessionTrainer.create({
            data: { sessionId: p.sessionId, personId: p.personIdToAssign, isPrimary: true },
          });
          nCreate++;
        } else if (p.actionNeeded === 'UPDATE_TO_PRIMARY') {
          // Dégrade l'éventuel autre primary
          await prisma.sessionTrainer.updateMany({
            where: { sessionId: p.sessionId, isPrimary: true },
            data: { isPrimary: false },
          });
          await prisma.sessionTrainer.updateMany({
            where: { sessionId: p.sessionId, personId: p.personIdToAssign },
            data: { isPrimary: true },
          });
          nUpdate++;
        } else if (p.actionNeeded === 'PROMOTE_OTHER_PRIMARY') {
          await prisma.sessionTrainer.updateMany({
            where: { sessionId: p.sessionId, isPrimary: true },
            data: { isPrimary: false },
          });
          await prisma.sessionTrainer.create({
            data: { sessionId: p.sessionId, personId: p.personIdToAssign, isPrimary: true },
          });
          nPromote++;
        }
      } catch (e) {
        console.error(`   ❌ ${p.sessionCode} :`, e instanceof Error ? e.message : e);
      }
    }
    console.log(`\n✅ ${nCreate} créés · ${nUpdate} updates · ${nPromote} promotes (other→nonprimary + create)`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Erreur :', e);
  prisma.$disconnect().finally(() => process.exit(1));
});
