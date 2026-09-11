/**
 * Écrit en base les rattachements DOULEUR → MODULE validés par Laurent.
 *
 *   pnpm --filter @qualiof/web ecrire:rattachements:local              # simulation
 *   pnpm --filter @qualiof/web ecrire:rattachements:local -- --apply   # écriture
 *
 * Simulation par défaut, comme les imports du catalogue : ce script touche le
 * catalogue, et un catalogue ne se modifie pas par surprise.
 *
 * ## Ce qu'il écrit, et rien d'autre
 *
 * Un seul champ : `TrainingModule.diagnosticSignals`, et en AJOUT. Ni le titre,
 * ni le contenu, ni la durée, ni l'activation du conteneur. Un module qui porte
 * déjà des signaux les garde tous — le catalogue diagnostic en a posé 43, et
 * les écraser reviendrait à défaire l'import du lot A pour installer le nôtre.
 *
 * ## Idempotent, et vérifiable
 *
 * Le signal est comparé normalisé : un deuxième passage n'ajoute rien et le
 * dit. C'est ce qui permet de rejouer le script après une correction de la
 * table sans se demander ce qui a déjà été posé.
 *
 * ## Ce qu'il REFUSE de faire
 *
 * Si un module visé est introuvable, ou si son titre correspond à plusieurs
 * modules du même programme, **rien n'est écrit pour cette ligne** et le script
 * le signale. Poser un signal sur le mauvais module est pire que ne pas le
 * poser : la douleur paraîtrait couverte, et c'est un module sans rapport qui
 * partirait dans une proposition client.
 */
import { prisma } from '@qualiof/db';

import {
  RATTACHEMENTS_IMPOSSIBLES,
  RATTACHEMENTS_VALIDES,
  type RattachementValide,
} from '../src/lib/proposition/rattachements-valides';
import { normalize } from '../src/lib/proposition/programme-matcher';

const APPLY = process.argv.includes('--apply');

const tenant = await prisma.tenant.findFirst({ select: { id: true, name: true } });
if (!tenant) throw new Error('Aucun tenant');

console.log(
  `\n=== Rattachements douleur → module · tenant « ${tenant.name} » · ${
    APPLY ? 'ÉCRITURE (--apply)' : 'SIMULATION'
  } ===\n`,
);

interface Resultat {
  douleur: string;
  programme: string;
  module: string;
  verdict: 'posé' | 'déjà posé' | 'introuvable' | 'ambigu';
  detail?: string;
}

const resultats: Resultat[] = [];

for (const r of RATTACHEMENTS_VALIDES) {
  for (const cible of r.cibles) {
    const produit = await prisma.trainingProduct.findFirst({
      where: { tenantId: tenant.id, code: cible.programme },
      select: {
        id: true,
        code: true,
        excludedFromClientOutputs: true,
        supersededByProductId: true,
        modules: { select: { id: true, title: true, diagnosticSignals: true, contentMd: true } },
      },
    });

    if (!produit) {
      resultats.push({ ...ligne(r, cible), verdict: 'introuvable', detail: 'programme absent' });
      continue;
    }

    // Garde-fou : ne jamais rattacher une douleur à un programme qui ne peut
    // pas sortir chez un client. Le rattachement le rendrait recommandable, et
    // le moteur l'écarterait ensuite — la douleur paraîtrait couverte sans
    // l'être, ce qui est exactement ce qu'on vient de corriger.
    if (produit.excludedFromClientOutputs) {
      resultats.push({
        ...ligne(r, cible),
        verdict: 'introuvable',
        detail: 'programme NON DIFFUSABLE (D-19 ter)',
      });
      continue;
    }
    if (produit.supersededByProductId) {
      resultats.push({
        ...ligne(r, cible),
        verdict: 'introuvable',
        detail: 'rayon écarté en doublon (D-19 bis)',
      });
      continue;
    }

    const cle = normalize(cible.module).trim();
    const trouves = produit.modules.filter((m) => normalize(m.title).trim() === cle);

    if (trouves.length === 0) {
      resultats.push({ ...ligne(r, cible), verdict: 'introuvable', detail: 'module absent' });
      continue;
    }
    if (trouves.length > 1) {
      resultats.push({
        ...ligne(r, cible),
        verdict: 'ambigu',
        detail: `${trouves.length} modules portent ce titre`,
      });
      continue;
    }

    const module = trouves[0]!;
    const actuels = Array.isArray(module.diagnosticSignals)
      ? (module.diagnosticSignals as unknown[]).map(String)
      : [];
    const deja = actuels.some((s) => normalize(s).trim() === normalize(r.signal).trim());

    if (deja) {
      resultats.push({ ...ligne(r, cible), verdict: 'déjà posé' });
      continue;
    }

    if (APPLY) {
      await prisma.trainingModule.update({
        where: { id: module.id },
        data: { diagnosticSignals: [...actuels, r.signal] },
      });
    }
    resultats.push({
      ...ligne(r, cible),
      verdict: 'posé',
      detail: `${actuels.length} signal(aux) déjà là, +1`,
    });
  }
}

function ligne(r: RattachementValide, c: { programme: string; module: string }) {
  return { douleur: r.douleur, programme: c.programme, module: c.module };
}

// ─────────────────────────────────────────────────────────────────────────────

for (const r of RATTACHEMENTS_VALIDES) {
  console.log(`● ${r.douleur}`);
  console.log(`    signal : « ${r.signal} »`);
  if (r.reserve) console.log(`    réserve: ${r.reserve}`);
  for (const res of resultats.filter((x) => x.douleur === r.douleur)) {
    const marque =
      res.verdict === 'posé' ? '✅' : res.verdict === 'déjà posé' ? '·' : '❌';
    console.log(
      `    ${marque} ${res.programme.padEnd(10)} ${res.module.slice(0, 62)}${
        res.detail ? `  (${res.detail})` : ''
      }`,
    );
  }
  console.log('');
}

if (RATTACHEMENTS_IMPOSSIBLES.length > 0) {
  console.log('── Non écrits, et c’est une décision de catalogue ──\n');
  for (const i of RATTACHEMENTS_IMPOSSIBLES) {
    console.log(`● ${i.douleur}`);
    for (const x of i.retenu) console.log(`    ↳ ${x}`);
    console.log(`    obstacle : ${i.obstacle}\n`);
  }
}

const poses = resultats.filter((r) => r.verdict === 'posé').length;
const dejaPoses = resultats.filter((r) => r.verdict === 'déjà posé').length;
const rates = resultats.filter((r) => r.verdict === 'introuvable' || r.verdict === 'ambigu');

console.log('═══════════════════════════════════════════════════════');
console.log(
  `  ${poses} signal(aux) ${APPLY ? 'posé(s)' : 'à poser'} · ${dejaPoses} déjà en place · ${rates.length} en échec`,
);
console.log(
  `  ${RATTACHEMENTS_VALIDES.length} douleurs écrites · ${RATTACHEMENTS_IMPOSSIBLES.length} impossibles (produits vendus sans modules)`,
);
if (rates.length > 0) {
  console.log('\n  ❌ Lignes en échec — RIEN n’a été écrit pour elles :');
  for (const r of rates) console.log(`     ${r.programme} « ${r.module.slice(0, 50)} » — ${r.detail}`);
}
if (!APPLY) console.log('\n  Simulation : aucune écriture. Relancer avec `-- --apply`.');
console.log('');

await prisma.$disconnect();
process.exit(rates.length > 0 ? 1 : 0);
