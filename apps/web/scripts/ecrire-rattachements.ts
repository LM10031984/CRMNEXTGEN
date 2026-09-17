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
// `@prisma/client` n'est pas une dépendance directe d'apps/web ; `@qualiof/db`
// le ré-exporte (`export * from '@prisma/client'`).
import { createPrismaClientForUrl, type Prisma } from '@qualiof/db';
import {
  CibleInattendueError,
  transactionGardee,
  type MarqueursCible,
} from '@qualiof/db/garde-cible';

import {
  RATTACHEMENTS_IMPOSSIBLES,
  RATTACHEMENTS_VALIDES,
  type CibleRattachement,
  type RattachementValide,
} from '../src/lib/proposition/rattachements-valides';
import { normalize } from '../src/lib/proposition/programme-matcher';
import { accumulerSignaux } from '../src/lib/proposition/accumulation-signaux';
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

/**
 * La connexion DIRECTE (`:5432`), jamais la poolée (`:6543`) — une seule voie
 * d'écriture dans le dépôt, la même que `import-drive-catalog.ts`.
 *
 * pgbouncer en mode transaction ne garantit pas qu'une transaction interactive
 * reste sur la même connexion. Le lot est plus petit ici que pour l'import, mais
 * c'est la même classe de risque, et deux voies d'écriture, c'est deux
 * hypothèses à tenir d'accord.
 */
const CIBLE_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!CIBLE_URL)
  throw new Error('Ni DIRECT_URL ni DATABASE_URL — cible inconnue, on ne devine pas.');
const prisma = createPrismaClientForUrl(CIBLE_URL);

/** L'hôte de la cible, pour que le run dise sur quoi il a tourné (§4 terdecies). */
const HOTE = (() => {
  try {
    return new URL(CIBLE_URL).hostname;
  } catch {
    return '(illisible)';
  }
})();

const tenant = await prisma.tenant.findFirst({ select: { id: true, name: true } });
if (!tenant) throw new Error('Aucun tenant');

/**
 * Les marqueurs de CONTENU relevés en tête de run — ce que la garde de cible
 * exigera de la connexion qui écrit. Une base s'identifie par son contenu,
 * jamais par son nom (§4 sexies).
 */
const ATTENDU: MarqueursCible = {
  tenantId: tenant.id,
  tenantNom: tenant.name,
  produits: await prisma.trainingProduct.count({ where: { tenantId: tenant.id } }),
  modules: await prisma.trainingModule.count({ where: { product: { tenantId: tenant.id } } }),
};

/** Les mêmes compteurs, relus DANS la transaction — mêmes définitions, au mot près. */
async function relireMarqueurs(tx: Prisma.TransactionClient): Promise<MarqueursCible | null> {
  const t = await tx.tenant.findUnique({
    where: { id: ATTENDU.tenantId },
    select: { id: true, name: true },
  });
  if (!t) return null;
  return {
    tenantId: t.id,
    tenantNom: t.name,
    produits: await tx.trainingProduct.count({ where: { tenantId: t.id } }),
    modules: await tx.trainingModule.count({ where: { product: { tenantId: t.id } } }),
  };
}

console.log(
  `\n=== Rattachements douleur → module · tenant « ${tenant.name} » · ${
    APPLY ? 'ÉCRITURE (--apply)' : 'SIMULATION'
  } ===\n`,
);
console.log(`🎯 Cible : ${HOTE}`);
console.log(`   tenant : ${tenant.id} « ${tenant.name} »`);
console.log(`   avant  : ${ATTENDU.produits} produits · ${ATTENDU.modules} modules\n`);

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

/**
 * Une écriture retenue, appliquée plus tard dans UNE transaction.
 *
 * ## Ce qui a changé le 17/09/2026, et pourquoi
 *
 * Ce type portait `signalsAvant: string[]` — l'état du module lu PENDANT la
 * phase de décision, donc AVANT la transaction. L'écriture valait alors
 * `[...signalsAvant, signal]`.
 *
 * Trois modules sont visés par DEUX douleurs différentes (`drive:008#1`,
 * `drive:034#2`, `drive:034#3`). Leurs deux écritures partaient du même
 * `signalsAvant` et la seconde écrasait la première : un **lost update**. Un
 * passage ne posait que 9 signaux sur 12 ; il en fallait un second.
 *
 * C'est le bug `drive:020` sous un autre nom — une lecture prise hors de la
 * transaction, utilisée pour décider dedans. Il est resté invisible tant qu'un
 * run ne posait qu'un signal ; c'est le versement complet qui l'a allumé.
 *
 * `signalsAvant` a donc disparu : l'état est relu DANS la transaction, et les
 * signaux s'accumulent par MODULE.
 */
interface AEcrire {
  moduleId: string;
  sourceRef: string;
  titreActuel: string;
  douleur: string;
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

/**
 * Ce que l'écriture a RÉELLEMENT fait — mesuré dans la transaction, pas déduit
 * de la phase de lecture.
 *
 * Les deux peuvent diverger, et c'est voulu : la phase de lecture dit ce qu'on
 * VEUT poser, la transaction dit ce qui a été posé. Faire annoncer la première
 * à la place de la seconde, c'est exactement ce qui a caché le lost update — le
 * script disait « 12 posés » quand il en avait posé 9.
 */
let bilan: { posesReels: number; dejaAuMomentDEcrire: number } | null = null;

if (APPLY && aEcrire.length > 0) {
  // UNE transaction : les 8 rattachements entrent ensemble ou pas du tout.
  // L'AuditLog est écrit DANS la même transaction que la donnée — un journal
  // qui survit à un échec d'écriture raconterait une écriture qui n'a pas eu
  // lieu.
  // La garde de cible est le PREMIER ordre de la transaction — `transactionGardee`
  // ne nous appelle pas autrement. Même enveloppe que l'import, pas une copie :
  // deux exemplaires d'une garde finissent par diverger, et c'est le jour où
  // l'un des deux a déjà cessé de garder qu'on s'en aperçoit.
  // Regroupé par MODULE, et c'est tout l'objet de la correction : l'unité
  // d'écriture n'est plus la décision. Trois modules portent deux douleurs ;
  // les traiter séparément faisait écraser la première écriture par la seconde.
  const parModule = new Map<string, { sourceRef: string; titre: string; entrees: AEcrire[] }>();
  for (const e of aEcrire) {
    const v = parModule.get(e.moduleId) ?? {
      sourceRef: e.sourceRef,
      titre: e.titreActuel,
      entrees: [],
    };
    v.entrees.push(e);
    parModule.set(e.moduleId, v);
  }

  bilan = await transactionGardee(prisma, ATTENDU, relireMarqueurs, async (tx) => {
    let posesReels = 0;
    let dejaAuMomentDEcrire = 0;

    for (const [moduleId, v] of parModule) {
      // L'état est relu DANS la transaction. C'est la correction : décider
      // d'une écriture à partir d'une lecture prise avant elle, c'est écraser
      // ce qu'un autre ordre a écrit entre-temps — ici, notre propre ordre
      // précédent.
      const frais = await tx.trainingModule.findUnique({
        where: { id: moduleId },
        select: { diagnosticSignals: true },
      });
      if (!frais) {
        throw new Error(
          `Le module \`${v.sourceRef}\` a disparu entre la lecture et l'écriture. Rien n'est écrit.`,
        );
      }
      const actuels = Array.isArray(frais.diagnosticSignals)
        ? (frais.diagnosticSignals as unknown[]).map(String)
        : [];

      const { aAjouter, dejaPresents } = accumulerSignaux(
        actuels,
        v.entrees.map((e) => e.signal),
        (x) => normalize(x).trim(),
      );
      dejaAuMomentDEcrire += dejaPresents;
      if (aAjouter.length === 0) continue;

      const apres = [...actuels, ...aAjouter];
      await tx.trainingModule.update({
        where: { id: moduleId },
        data: { diagnosticSignals: apres },
      });
      // Une entrée par MODULE, avec toutes les douleurs qu'elle sert : un
      // journal par décision raconterait deux écritures là où il n'y en a
      // qu'une, et c'est la fiction qu'on vient de retirer du code.
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: null,
          entity: 'TrainingModule',
          entityId: moduleId,
          action: 'diagnostic.rattachement.pose',
          diff: {
            sourceRef: v.sourceRef,
            titre: v.titre,
            douleurs: v.entrees.map((e) => e.douleur),
            before: { diagnosticSignals: actuels },
            after: { diagnosticSignals: apres },
            source: 'scripts/ecrire-rattachements.ts',
          },
        },
      });
      posesReels += aAjouter.length;
    }
    return { posesReels, dejaAuMomentDEcrire };
  }).catch((e: unknown) => {
    if (e instanceof CibleInattendueError) {
      console.error("\n⛔ ÉCHEC — la base d'écriture n'est PAS celle du relevé.\n");
      for (const ecart of e.ecarts) console.error(`   ${ecart}`);
      console.error(
        `\n   Connexion d'écriture : ${HOTE}.\n` +
          '   Un signal posé sur le mauvais module ferait paraître une douleur\n' +
          '   couverte, et un module sans rapport partirait dans une proposition\n' +
          '   client. Le poser dans la mauvaise BASE est la même faute en plus large.\n\n' +
          "   ROLLBACK. Rien n'a été écrit.\n",
      );
      process.exitCode = 1;
      return null;
    }
    throw e;
  });
  if (process.exitCode === 1) {
    await prisma.$disconnect();
    process.exit(1);
  }
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
  APPLY && bilan
    ? `  ${bilan.posesReels} signal(aux) posé(s) · ${dejaPoses + bilan.dejaAuMomentDEcrire} déjà en place · ${rates.length} en échec` +
        `\n  (compté DANS la transaction, pas déduit de la lecture)`
    : `  ${poses} signal(aux) à poser · ${dejaPoses} déjà en place · ${rates.length} en échec`,
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
  for (const r of rates)
    console.log(`     ${r.programme} « ${r.module.slice(0, 50)} » — ${r.detail}`);
}
if (!APPLY) console.log('\n  Simulation : aucune écriture. Relancer avec `-- --apply`.');
console.log('');

await prisma.$disconnect();
process.exit(rates.length > 0 ? 1 : 0);
