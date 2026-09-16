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
  type CibleRattachement,
  type RattachementValide,
} from '../src/lib/proposition/rattachements-valides';
import { normalize } from '../src/lib/proposition/programme-matcher';
import { DIAGNOSTIC_CHAPTERS } from '@qualiof/shared/diagnostic';
import { listDiagnosticPainPoints } from '../src/lib/diagnostic-r1/scoring';

/** `ruleId` → « 9 — Base de données & e-réputation ». Le barème fait foi. */
const TITRE_CHAPITRE = new Map(DIAGNOSTIC_CHAPTERS.map((c) => [c.chapter, c.title]));
const CHAPITRE = new Map(
  listDiagnosticPainPoints().map((d) => [
    d.ruleId,
    `${d.chapter} — ${TITRE_CHAPITRE.get(d.chapter as never) ?? '?'}`,
  ]),
);

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
  ruleId: string;
  programme: string;
  /** Le titre au moment de la décision — ce que Laurent a relu. */
  module: string;
  /** Le titre que le module porte AUJOURD'HUI. Peut différer : §5.4. */
  titreActuel?: string;
  sourceRef: string;
  verdict: 'posé' | 'déjà posé' | 'introuvable' | 'ambigu';
  detail?: string;
}

/** Une écriture retenue, appliquée plus tard dans UNE transaction. */
interface AEcrire {
  moduleId: string;
  sourceRef: string;
  titreActuel: string;
  douleur: string;
  signalsAvant: string[];
  signal: string;
}

const resultats: Resultat[] = [];
const aEcrire: AEcrire[] = [];

for (const r of RATTACHEMENTS_VALIDES) {
  for (const cible of r.cibles) {
    const produit = await prisma.trainingProduct.findFirst({
      where: { tenantId: tenant.id, code: cible.programme },
      select: {
        id: true,
        code: true,
        excludedFromClientOutputs: true,
        supersededByProductId: true,
        modules: {
          select: {
            id: true,
            sourceRef: true,
            title: true,
            diagnosticSignals: true,
            contentMd: true,
          },
        },
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

    // On apparie sur l'IDENTITÉ, jamais sur le titre. Un titre s'améliore — et
    // quand il l'a été, le 14/09, quatre décisions ont cessé de s'appliquer en
    // silence. Un `sourceRef` est unique : la branche « ambigu » disparaît avec
    // l'appariement par libellé qui la rendait possible.
    const trouves = produit.modules.filter((m) => m.sourceRef === cible.sourceRef);

    if (trouves.length === 0) {
      resultats.push({
        ...ligne(r, cible),
        verdict: 'introuvable',
        detail: `aucun module ${cible.sourceRef} dans ce programme`,
      });
      continue;
    }

    const module = trouves[0]!;
    const actuels = Array.isArray(module.diagnosticSignals)
      ? (module.diagnosticSignals as unknown[]).map(String)
      : [];
    const deja = actuels.some((s) => normalize(s).trim() === normalize(r.signal).trim());

    if (deja) {
      resultats.push({ ...ligne(r, cible), titreActuel: module.title, verdict: 'déjà posé' });
      continue;
    }

    // On ne touche à rien ici : les écritures sont appliquées ensemble, plus
    // bas, dans UNE transaction. Un rattachement à moitié posé laisserait des
    // douleurs couvertes et d'autres non, sans qu'on sache lesquelles.
    aEcrire.push({
      moduleId: module.id,
      sourceRef: cible.sourceRef,
      titreActuel: module.title,
      douleur: r.douleur,
      signalsAvant: actuels,
      signal: r.signal,
    });
    resultats.push({
      ...ligne(r, cible),
      titreActuel: module.title,
      verdict: 'posé',
      detail: `${actuels.length} signal(aux) déjà là, +1`,
    });
  }
}

if (APPLY && aEcrire.length > 0) {
  // UNE transaction : les 8 rattachements entrent ensemble ou pas du tout.
  // L'AuditLog est écrit DANS la même transaction que la donnée — un journal
  // qui survit à un échec d'écriture raconterait une écriture qui n'a pas eu
  // lieu.
  await prisma.$transaction(async (tx) => {
    for (const e of aEcrire) {
      await tx.trainingModule.update({
        where: { id: e.moduleId },
        data: { diagnosticSignals: [...e.signalsAvant, e.signal] },
      });
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: null,
          entity: 'TrainingModule',
          entityId: e.moduleId,
          action: 'diagnostic.rattachement.pose',
          diff: {
            sourceRef: e.sourceRef,
            titre: e.titreActuel,
            douleur: e.douleur,
            before: { diagnosticSignals: e.signalsAvant },
            after: { diagnosticSignals: [...e.signalsAvant, e.signal] },
            source: 'scripts/ecrire-rattachements.ts',
          },
        },
      });
    }
  });
}

function ligne(r: RattachementValide, c: CibleRattachement) {
  return {
    douleur: r.douleur,
    ruleId: r.ruleId,
    programme: c.programme,
    module: c.titreAuMomentDeLaDecision,
    sourceRef: c.sourceRef,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

for (const r of RATTACHEMENTS_VALIDES) {
  console.log(`● ${r.douleur}`);
  console.log(`    chapitre : ${CHAPITRE.get(r.ruleId) ?? '?'}`);
  console.log(`    signal   : « ${r.signal} »`);
  if (r.reserve) console.log(`    réserve  : ${r.reserve}`);
  for (const res of resultats.filter((x) => x.douleur === r.douleur)) {
    const marque = res.verdict === 'posé' ? '✅' : res.verdict === 'déjà posé' ? '·' : '❌';
    // Le TITRE, pas seulement le code : un code n'est pas une adresse (§5.4).
    // Et le titre ACTUEL quand il a bougé depuis la décision — c'est ce que
    // Laurent lira dans le catalogue, pas ce qu'il a relu le 11/09.
    const titre = res.titreActuel ?? res.module;
    console.log(`    ${marque} ${titre}`);
    console.log(
      `       ${res.sourceRef.padEnd(14)} ${res.programme}${
        res.titreActuel && res.titreActuel !== res.module
          ? `  ⟵ relu sous « ${res.module.slice(0, 44)} »`
          : ''
      }${res.detail ? `  (${res.detail})` : ''}`,
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
  `  ${RATTACHEMENTS_VALIDES.length} douleurs écrivables · ${resultats.length} cible(s) de module`,
);
console.log(
  `  ${RATTACHEMENTS_IMPOSSIBLES.length} douleur(s) NON écrivables — produit vendu sans aucun module,` +
    ` un signal se pose sur un module : il n'y a rien où le poser`,
);
if (rates.length > 0) {
  console.log('\n  ❌ Lignes en échec — RIEN n’a été écrit pour elles :');
  for (const r of rates) console.log(`     ${r.programme} « ${r.module.slice(0, 50)} » — ${r.detail}`);
}
if (!APPLY) console.log('\n  Simulation : aucune écriture. Relancer avec `-- --apply`.');
console.log('');

await prisma.$disconnect();
process.exit(rates.length > 0 ? 1 : 0);
