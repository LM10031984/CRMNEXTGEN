/**
 * Import one-shot du catalogue de modules du repo diag vers QualiOF (spec §5.3).
 *
 * Ce que fait ce script :
 *   M1 · lit l'instantané vendu des 79 modules (`data/diag-module-catalog.json`)
 *   M2 · le confronte au catalogue QualiOF existant (produits + modules)
 *   M3 · classe chaque module : APPARIÉ · AMBIGU · À CRÉER
 *   M4 · crée les manquants sous des produits d'accueil INACTIFS, un par famille
 *   M5 · marque `excludedFromClientOutputs` les modules qui parlent de pige
 *   M6 · aligne `fundingType` sur REGLEMENTAIRE pour TRACFIN / déontologie / non-discrimination
 *   M7 · importe le parcours « L'Agent Incomparable » (M0→M6) en INACTIF
 *   M8 · dépose un rapport d'import dans `.planning/` pour validation par Laurent
 *
 * Ce qu'il ne fait PAS, volontairement :
 *   • activer quoi que ce soit — Laurent active ce qu'il vend réellement ;
 *   • renuméroter ou renommer un produit existant ;
 *   • supprimer quoi que ce soit.
 *
 * Par défaut il ne touche à RIEN (dry-run) et n'imprime que le rapport.
 *
 *   pnpm --filter @qualiof/db import:diag-catalog              # simulation
 *   pnpm --filter @qualiof/db import:diag-catalog -- --apply   # écriture
 */

import { config as loadEnv } from 'dotenv';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
loadEnv({ path: path.resolve(REPO_ROOT, '.env') });

const { Modality, ProductFundingType } = await import('@prisma/client');
const { prisma } = await import('../src/index.js');
const { normalizeName } = await import('@qualiof/shared/helpers');

// ─────────────────────────────────────────────────────────────────────────────
// Options
// ─────────────────────────────────────────────────────────────────────────────

const APPLY = process.argv.includes('--apply');
const TENANT_NAME = process.env.TENANT_DEFAULT_NAME ?? 'Start Academy';

/**
 * Parcours « L'Agent Incomparable » — matière NXT coach (Annexe A de la spec).
 * Statut v0.9 : trous 🔴/🟠 non levés, manifeste explicite « NE PAS DIFFUSER ».
 * On l'importe pour qu'il soit visible et mappable, jamais actif.
 */
const AGENT_INCOMPARABLE_DIR =
  process.env.AGENT_INCOMPARABLE_DIR ??
  path.resolve(process.env.HOME ?? '', 'Documents/nxt-coach/Formation Faros/LIVRAISON_PARCOURS');

// ─────────────────────────────────────────────────────────────────────────────
// Types de l'instantané
// ─────────────────────────────────────────────────────────────────────────────

interface CatalogModule {
  id: string;
  name: string;
  family: string;
  targetProfile: string;
  durationHours: number | null;
  level: number | null;
  needIdentification: string | null;
  isFoundationModule: boolean;
  diagnosticSignals: string[];
}

interface CatalogSnapshot {
  moduleCatalog: CatalogModule[];
  diagnosticSignalMap: { signal: string; modules: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Règles de classement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La pige est interdite dans tout contenu remis au client depuis le 11/08/2026.
 * Le questionnaire interne peut l'aborder (c'est un outil commercial) ; l'audit
 * et la proposition, jamais. On marque à l'import plutôt que de filtrer à la
 * génération : un filtre oublié dans un template est invisible jusqu'au jour où
 * un client lit « module pige » dans son audit.
 */
const PIGE_PATTERN = /\bpige\b/i;

/**
 * Contenus au taux OPCO EP réglementaire (40 €/h au lieu de 30). Détection par
 * le TITRE, jamais par le code produit : `if (code === 'PROD-0062')` casse à la
 * première renumérotation, et il existe déjà deux produits Tracfin distincts.
 */
const REGLEMENTAIRE_PATTERN = /tracfin|non[- ]?discrimination|d[ée]ontologie/i;

function isPige(m: CatalogModule): boolean {
  return (
    PIGE_PATTERN.test(m.name) ||
    PIGE_PATTERN.test(m.needIdentification ?? '') ||
    m.diagnosticSignals.some((s) => PIGE_PATTERN.test(s))
  );
}

/** Clé de rapprochement : nom normalisé, sans accent ni casse ni espaces doubles. */
function matchKey(value: string): string {
  return normalizeName(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rapport
// ─────────────────────────────────────────────────────────────────────────────

interface ReportRow {
  module: CatalogModule;
  verdict: 'apparie' | 'ambigu' | 'a_creer';
  /** Titres QualiOF candidats — plusieurs = ambigu, tranché par Laurent. */
  candidates: string[];
}

const lines: string[] = [];
function say(line = '') {
  lines.push(line);
  console.log(line);
}

// ─────────────────────────────────────────────────────────────────────────────
// Numérotation des produits d'accueil
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prochain `PROD-NNNN` libre. Le catalogue existant mélange les conventions
 * (FRM-0001, PROD-055, PROD-0674, PROD-7a78c8b2) : on ne renumérote rien, on se
 * contente de continuer la série à 4 chiffres au-dessus du plus grand existant.
 */
function nextProductCode(existingCodes: string[], offset: number): string {
  let max = 0;
  for (const code of existingCodes) {
    const m = /^PROD-(\d{1,4})$/.exec(code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `PROD-${String(max + 1 + offset).padStart(4, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const snapshotPath = path.resolve(HERE, 'data/diag-module-catalog.json');
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as CatalogSnapshot;
  const catalog = snapshot.moduleCatalog;

  const tenant = await prisma.tenant.findFirst({ where: { name: TENANT_NAME } });
  if (!tenant) throw new Error(`Tenant « ${TENANT_NAME} » introuvable — lancer le seed d'abord.`);

  const products = await prisma.trainingProduct.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, code: true, title: true, isActive: true, fundingType: true },
    orderBy: { code: 'asc' },
  });
  const existingModules = await prisma.trainingModule.findMany({
    where: { product: { tenantId: tenant.id } },
    select: { id: true, title: true, productId: true },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  say(`# Rapport d'import du catalogue diagnostic — ${stamp}`);
  say();
  say(`> Mode : **${APPLY ? 'ÉCRITURE (--apply)' : 'SIMULATION (dry-run)'}**`);
  say(`> Tenant : ${TENANT_NAME}`);
  say(`> Source : \`packages/db/scripts/data/diag-module-catalog.json\` (instantané du repo diag)`);
  say();
  say(
    "**À valider par Laurent avant toute activation.** Rien n'est activé par ce script : " +
      'les produits créés sont inactifs, à toi de cocher ce que tu vends réellement.',
  );
  say();
  say(
    `État de départ : ${products.length} produits (${products.filter((p) => p.isActive).length} actifs), ` +
      `${existingModules.length} modules. Catalogue à importer : ${catalog.length} modules.`,
  );
  say();

  // ── M3 · Classement ────────────────────────────────────────────────────────
  const moduleByKey = new Map<string, { id: string; title: string }[]>();
  for (const m of existingModules) {
    const k = matchKey(m.title);
    moduleByKey.set(k, [...(moduleByKey.get(k) ?? []), m]);
  }
  const productByKey = new Map<string, { id: string; code: string; title: string }[]>();
  for (const p of products) {
    const k = matchKey(p.title);
    productByKey.set(k, [...(productByKey.get(k) ?? []), p]);
  }

  const rows: ReportRow[] = catalog.map((m) => {
    const k = matchKey(m.name);
    const modHits = moduleByKey.get(k) ?? [];
    const prodHits = productByKey.get(k) ?? [];
    const candidates = [
      ...modHits.map((x) => x.title),
      ...prodHits.map((x) => `${x.code} — ${x.title}`),
    ];
    if (candidates.length === 1) return { module: m, verdict: 'apparie', candidates };
    if (candidates.length > 1) return { module: m, verdict: 'ambigu', candidates };
    return { module: m, verdict: 'a_creer', candidates: [] };
  });

  const apparies = rows.filter((r) => r.verdict === 'apparie');
  const ambigus = rows.filter((r) => r.verdict === 'ambigu');
  const aCreer = rows.filter((r) => r.verdict === 'a_creer');

  say('## Synthèse');
  say();
  say('| Verdict | Modules |');
  say('|---|---|');
  say(`| Appariés à un module/produit existant | ${apparies.length} |`);
  say(`| Ambigus (plusieurs candidats — à trancher) | ${ambigus.length} |`);
  say(`| À créer (inactifs) | ${aCreer.length} |`);
  say();

  // ── M5 · Pige ──────────────────────────────────────────────────────────────
  const pigeModules = catalog.filter(isPige);
  say('## Modules exclus des sorties client (pige)');
  say();
  say(
    "Interdits dans l'audit remis, la proposition et toute page publique depuis le 11/08/2026. " +
      "Ils restent utilisables en interne — c'est le questionnaire commercial, pas le livrable.",
  );
  say();
  for (const m of pigeModules) say(`- ${m.family} · **${m.name}**`);
  if (pigeModules.length === 0) say('- _aucun_');
  say();

  // ── M6 · fundingType réglementaire ─────────────────────────────────────────
  const reglementaires = products.filter((p) => REGLEMENTAIRE_PATTERN.test(p.title));
  const aRequalifier = reglementaires.filter(
    (p) => p.fundingType !== ProductFundingType.REGLEMENTAIRE,
  );
  say('## Produits au taux OPCO EP réglementaire (40 €/h)');
  say();
  for (const p of reglementaires) {
    const flag = p.fundingType === ProductFundingType.REGLEMENTAIRE ? 'déjà marqué' : '→ à marquer';
    say(`- \`${p.code}\` ${p.title} — ${flag}`);
  }
  if (reglementaires.length === 0) say('- _aucun produit détecté_');
  say();

  // ── M4 · Produits d'accueil par famille ────────────────────────────────────
  const families = [...new Set(aCreer.map((r) => r.module.family))].sort();
  say("## Produits d'accueil à créer (inactifs)");
  say();
  say(
    'Un produit par famille du catalogue diag. Ce sont des conteneurs de rangement, ' +
      "pas des offres commerciales : c'est Laurent qui décide ensuite lesquels deviennent " +
      'de vrais produits vendus, et sous quel intitulé.',
  );
  say();
  say('| Code | Produit | Modules | Heures |');
  say('|---|---|---|---|');
  let codeOffset = 0;
  const familyPlan: FamilyPlan[] = families.map((family) => {
    const mods = aCreer.filter((r) => r.module.family === family).map((r) => r.module);
    const hours = mods.reduce((sum, m) => sum + (m.durationHours ?? 0), 0);
    const title = `Catalogue diagnostic — ${family}`;
    // Import rejouable : si le conteneur existe déjà, on le réutilise au lieu
    // d'en créer un jumeau. Un script d'import qui double le catalogue au
    // deuxième passage est un piège, pas un outil.
    const existing = products.find((p) => matchKey(p.title) === matchKey(title));
    return {
      family,
      title,
      modules: mods,
      hours,
      existingProductId: existing?.id ?? null,
      code:
        existing?.code ??
        nextProductCode(
          products.map((p) => p.code),
          codeOffset++,
        ),
    };
  });
  for (const f of familyPlan) {
    const note = f.existingProductId ? ' _(déjà présent, réutilisé)_' : '';
    say(`| \`${f.code}\` | ${f.title}${note} | ${f.modules.length} | ${f.hours} h |`);
  }
  say();

  // ── M7 · Agent Incomparable ────────────────────────────────────────────────
  const parcoursModules = readAgentIncomparableModules();
  say("## Parcours « L'Agent Incomparable » (M0 → M6)");
  say();
  if (parcoursModules.length === 0) {
    say(
      `- ⚠️ Matière introuvable dans \`${AGENT_INCOMPARABLE_DIR}\` — import sauté. ` +
        'Définir `AGENT_INCOMPARABLE_DIR` si le dossier a bougé.',
    );
  } else {
    say(
      'Importé **inactif**, et il doit le rester : le manifeste de livraison porte ' +
        '« v0.9 — pré-livraison, trous 🔴/🟠 NON levés, NE PAS DIFFUSER AUX APPRENANTS ». ' +
        'Le ranger au catalogue le rend mappable par le moteur de recommandation ; ' +
        "l'activer le rendrait vendable, ce qu'il n'est pas.",
    );
    say();
    for (const m of parcoursModules) say(`- **${m.title}** — ${m.assets} ressource(s)`);
  }
  say();

  // ── Détail par famille ─────────────────────────────────────────────────────
  say('## Détail par famille');
  say();
  for (const family of [...new Set(catalog.map((m) => m.family))].sort()) {
    const famRows = rows.filter((r) => r.module.family === family);
    say(`### ${family} (${famRows.length})`);
    say();
    say('| Module | Verdict | Socle | Pige | Heures | Candidats QualiOF |');
    say('|---|---|---|---|---|---|');
    for (const r of famRows) {
      const verdict =
        r.verdict === 'apparie' ? 'apparié' : r.verdict === 'ambigu' ? '⚠️ ambigu' : 'à créer';
      say(
        `| ${r.module.name} | ${verdict} | ${r.module.isFoundationModule ? '✅' : ''} | ` +
          `${isPige(r.module) ? '🚫' : ''} | ${r.module.durationHours ?? '—'} | ` +
          `${r.candidates.join(' · ') || '—'} |`,
      );
    }
    say();
  }

  // ── Écriture ───────────────────────────────────────────────────────────────
  if (!APPLY) {
    say('---');
    say();
    say('_Simulation : aucune écriture en base. Relancer avec `-- --apply` pour appliquer._');
  } else {
    const created = await applyImport(tenant.id, familyPlan, aRequalifier, parcoursModules);
    say('---');
    say();
    say('## Écritures effectuées');
    say();
    say(`- ${created.products} produit(s) créé(s), tous inactifs`);
    say(`- ${created.modules} module(s) créé(s)`);
    say(`- ${created.reglementaires} produit(s) repassé(s) en fundingType REGLEMENTAIRE`);
  }

  const reportPath = path.resolve(
    REPO_ROOT,
    `.planning/${stamp.replace(/-/g, '').slice(2)}-import-catalogue-diagnostic.md`,
  );
  writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(`\n📄 Rapport écrit : ${reportPath}`);
}

// ─────────────────────────────────────────────────────────────────────────────

interface ParcoursModule {
  title: string;
  assets: number;
  folder: string;
}

function readAgentIncomparableModules(): ParcoursModule[] {
  if (!existsSync(AGENT_INCOMPARABLE_DIR)) return [];
  return readdirSync(AGENT_INCOMPARABLE_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^M\d_/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => {
      const files = readdirSync(path.join(AGENT_INCOMPARABLE_DIR, e.name));
      return {
        folder: e.name,
        title: e.name.replace(/^(M\d)_/, '$1 — ').replace(/_/g, ' '),
        assets: files.filter((f) => f.endsWith('.html')).length,
      };
    });
}

interface FamilyPlan {
  family: string;
  code: string;
  title: string;
  modules: CatalogModule[];
  hours: number;
  /** Non-null quand le conteneur existe déjà : on le complète au lieu d'en créer un. */
  existingProductId: string | null;
}

async function applyImport(
  tenantId: string,
  familyPlan: FamilyPlan[],
  aRequalifier: { id: string; code: string }[],
  parcours: ParcoursModule[],
) {
  let createdProducts = 0;
  let createdModules = 0;

  for (const plan of familyPlan) {
    let productId = plan.existingProductId;
    if (!productId) {
      const product = await prisma.trainingProduct.create({
        data: {
          tenantId,
          code: plan.code,
          title: plan.title,
          durationHours: Math.round(plan.hours),
          modality: Modality.PRESENTIEL,
          objectives: [],
          programMd:
            `> Conteneur d'import du catalogue diagnostic (famille « ${plan.family} »).\n` +
            '> Produit INACTIF : à découper en offres réelles avant toute mise en vente.\n',
          isActive: false,
          ageficeEvaluations: [],
        },
      });
      productId = product.id;
      createdProducts += 1;
    }

    const already = new Set(
      (
        await prisma.trainingModule.findMany({
          where: { productId },
          select: { title: true },
        })
      ).map((m) => matchKey(m.title)),
    );

    for (const [order, m] of plan.modules.entries()) {
      if (already.has(matchKey(m.name))) continue;
      await prisma.trainingModule.create({
        data: {
          productId,
          order,
          title: m.name,
          contentMd: m.needIdentification ?? '',
          durationMin: Math.round((m.durationHours ?? 0) * 60),
          family: m.family,
          targetProfile: m.targetProfile,
          diagnosticSignals: m.diagnosticSignals,
          needIdentification: m.needIdentification,
          isFoundation: m.isFoundationModule,
          excludedFromClientOutputs: isPige(m),
        },
      });
      createdModules += 1;
    }
  }

  for (const p of aRequalifier) {
    await prisma.trainingProduct.update({
      where: { id: p.id },
      data: { fundingType: ProductFundingType.REGLEMENTAIRE },
    });
  }

  if (parcours.length > 0) {
    const existing = await prisma.trainingProduct.findFirst({
      where: { tenantId, title: { contains: 'Agent Incomparable' } },
      select: { id: true },
    });
    if (!existing) {
      const codes = (
        await prisma.trainingProduct.findMany({ where: { tenantId }, select: { code: true } })
      ).map((p) => p.code);
      const product = await prisma.trainingProduct.create({
        data: {
          tenantId,
          code: nextProductCode(codes, 0),
          title: "L'Agent Incomparable — parcours M0 → M6",
          durationHours: 0,
          modality: Modality.MIXTE,
          objectives: [],
          programMd:
            '> Parcours NXT coach, version 0.9 de pré-livraison.\n' +
            '> Le manifeste porte « trous 🔴/🟠 NON levés — NE PAS DIFFUSER AUX APPRENANTS ».\n' +
            "> Produit INACTIF tant que la relecture n'est pas faite.\n",
          isActive: false,
          ageficeEvaluations: [],
        },
      });
      createdProducts += 1;
      for (const [order, m] of parcours.entries()) {
        await prisma.trainingModule.create({
          data: {
            productId: product.id,
            order,
            title: m.title,
            contentMd: `Ressources : ${m.assets} livret(s) HTML dans \`${m.folder}\`.`,
            durationMin: 0,
            family: 'Agent Incomparable',
            targetProfile: 'conseiller',
            isFoundation: order === 0,
          },
        });
        createdModules += 1;
      }
    }
  }

  return {
    products: createdProducts,
    modules: createdModules,
    reglementaires: aRequalifier.length,
  };
}

main()
  .catch((err) => {
    console.error('❌ import du catalogue diagnostic échoué', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
