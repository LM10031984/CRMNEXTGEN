/**
 * Import de l'instantané Drive + Faros dans la BIBLIOTHÈQUE DE MODULES
 * (lot I-1, décision D-19).
 *
 *   pnpm --filter @qualiof/db import:drive-catalog:local            # simulation
 *   pnpm --filter @qualiof/db import:drive-catalog:local -- --apply # écriture
 *
 * Ce que fait ce script :
 *   ① lit `data/drive-programmes-catalog.json` (produit par
 *      `extract-drive-catalog.ts`, jamais le Drive directement) ;
 *   ② crée ou met à jour un RAYON par programme — un `TrainingProduct`
 *      **INACTIF**, identifié par son `sourceRef` ;
 *   ③ crée ou met à jour ses MODULES, identifiés par leur `sourceRef` ;
 *   ④ marque `excludedFromClientOutputs` ce qui parle de pige ;
 *   ⑤ aligne `fundingType` sur REGLEMENTAIRE pour Tracfin / déontologie /
 *      non-discrimination ;
 *   ⑥ dépose un rapport dans `.planning/` pour validation par Laurent.
 *
 * Ce qu'il ne fait PAS, et c'est le cœur du corollaire D-19 du 10/09/2026 :
 *
 *   • **il n'active RIEN.** Un rayon de bibliothèque n'est pas une offre. Ce
 *     qui devient vendable est le programme COMPOSÉ (lot I-2), et lui seul
 *     porte l'état vendable. Cocher un conteneur ferait réapparaître ce que
 *     D-19 vient d'abolir : des produits figés vendus tels quels ;
 *   • **il ne touche à aucun produit existant.** Les programmes du Drive qui
 *     correspondent à un produit déjà vendu (055, 053, 046, 074) ne sont pas
 *     fusionnés avec lui : rattacher des modules à un produit actif changerait
 *     sa page publique « Programme détaillé », donc l'information préalable
 *     remise au client. **D-19 bis (arbitrage Laurent du 10/09/2026) : la
 *     version VENDUE fait foi.** Le rayon en doublon est donc créé, puis
 *     `supersededByProductId` le pointe vers le produit vendu — il reste
 *     consultable, mais ses modules sortent du chemin de composition. Le lien
 *     est posé UNE fois et n'est jamais recalculé : si le dossier Drive est
 *     renommé, un prochain import ne peut pas réintroduire le doublon ;
 *   • **il ne recalcule aucune durée d'un produit portant des sessions ou des
 *     conventions signées** (ligne rouge D-20). Ce garde-fou ne devrait jamais
 *     se déclencher — les rayons naissent ici, vides de session — mais un
 *     garde-fou qui ne sert jamais coûte moins cher qu'une convention fausse ;
 *   • **il ne supprime rien.** Un module disparu de la source est signalé
 *     comme orphelin, pas effacé : c'est une décision de catalogue.
 *
 * Par défaut il ne touche à RIEN (dry-run) et n'imprime que le rapport.
 */

import { config as loadEnv } from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
loadEnv({ path: path.resolve(REPO_ROOT, '.env') });

const { Modality, ProductFundingType } = await import('@prisma/client');
const { prisma } = await import('../src/index.js');
const { normalizeName } = await import('@qualiof/shared/helpers');

const APPLY = process.argv.includes('--apply');
const TENANT_NAME = process.env.TENANT_DEFAULT_NAME ?? 'Start Academy';
const SNAPSHOT = path.resolve(HERE, 'data/drive-programmes-catalog.json');

// ─────────────────────────────────────────────────────────────────────────────
// Règles de catalogue — les mêmes que l'import diagnostic, à la lettre
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La pige est interdite dans tout contenu remis au client depuis le 11/08/2026.
 * On marque à l'import plutôt que de filtrer à la génération : un filtre oublié
 * dans un template reste invisible jusqu'au jour où un client lit « module
 * pige » dans son audit.
 */
const PIGE_PATTERN = /\bpige\b/i;

/**
 * Contenus au taux OPCO EP réglementaire (40 €/h au lieu de 30). Détection par
 * le TITRE, jamais par le code produit.
 */
const REGLEMENTAIRE_PATTERN = /tracfin|non[- ]?discrimination|d[ée]ontologie|blanchiment/i;

/**
 * La durée d'un module quand la source n'en déclare aucune.
 *
 * D-20 a retiré tout enjeu financier à cette valeur : le total d'un programme
 * composé est un multiple du bloc de 8 h, il ne se déduit plus de la somme des
 * modules. Cette durée ne sert donc qu'à savoir ce qui TIENT dans un bloc.
 * 60 minutes reste le choix conservateur retenu en D-17 — sous-estimer n'est
 * qu'un catalogue à affiner, surestimer finissait sur une convention.
 */
const DEFAULT_MODULE_MINUTES = 60;

interface SnapshotModule {
  sourceRef: string;
  order: number;
  title: string;
  contentMd: string;
  durationMin: number | null;
  durationSource: 'horaire' | 'declaree' | 'inconnue';
}

interface SnapshotProgramme {
  sourceRef: string;
  origin: 'drive' | 'faros';
  reference: string;
  title: string;
  documentTitle: string;
  folder: string;
  file: string;
  objectives: string[];
  targetAudience: string | null;
  prerequisites: string | null;
  declaredDuration: string | null;
  parsePattern: string;
  modules: SnapshotModule[];
  warnings: string[];
}

interface Snapshot {
  extractedAt: string;
  sources: { drive: string; faros: string };
  programmes: SnapshotProgramme[];
}

/** Le code du rayon — préfixe distinct pour qu'on ne le confonde jamais avec un produit vendu. */
function shelfCode(p: SnapshotProgramme): string {
  return p.origin === 'drive'
    ? `BIB-D${p.reference}`
    : `BIB-F${p.reference.replace(/^SA-/, '')}`;
}

/**
 * Les heures du rayon.
 *
 * Ordre : ce que le programme DÉCLARE d'abord (« 12 heures (3 demi-journées) »),
 * la somme de ses modules ensuite. Jamais zéro — une durée nulle se propage en
 * session, en convention et en dossier financeur (leçon D-17). La valeur n'a
 * de toute façon aucun effet commercial ici : le rayon n'est pas vendable, et
 * c'est le bloc de 8 h qui chiffre le programme composé (D-20).
 */
function shelfHours(p: SnapshotProgramme): { hours: number; source: string } {
  const declared = p.declaredDuration ? /(\d+(?:[.,]\d+)?)\s*(?:h|heure)/i.exec(p.declaredDuration) : null;
  if (declared) {
    const h = Math.round(parseFloat(declared[1]!.replace(',', '.')));
    if (h > 0) return { hours: h, source: `déclarée (« ${p.declaredDuration!.slice(0, 40)} »)` };
  }
  const minutes = p.modules.reduce((s, m) => s + (m.durationMin ?? DEFAULT_MODULE_MINUTES), 0);
  const h = Math.max(1, Math.round(minutes / 60));
  return { hours: h, source: 'somme des modules' };
}

function programMdOf(p: SnapshotProgramme): string {
  const lines = [`# ${p.title}`, ''];
  if (p.objectives.length > 0) {
    lines.push('## Objectifs pédagogiques', ...p.objectives.map((o) => `- ${o}`), '');
  }
  lines.push('## Déroulé');
  for (const m of p.modules) {
    lines.push(`### ${m.order}. ${m.title}`);
    if (m.contentMd) lines.push(m.contentMd);
    lines.push('');
  }
  lines.push(
    '',
    `_Rayon de bibliothèque importé depuis ${p.origin === 'drive' ? `le Drive « Formations et programmes » (${p.folder})` : `la formation Faros (${p.reference})`}. Non vendable en l'état : le programme vendu est composé à partir de ces modules (D-19)._`,
  );
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────

if (!existsSync(SNAPSHOT)) {
  throw new Error(
    `Instantané introuvable : ${SNAPSHOT}\nLancer d'abord : pnpm --filter @qualiof/db extract:drive-catalog`,
  );
}
const snapshot: Snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));

const tenant = await prisma.tenant.findFirst({ where: { name: TENANT_NAME } });
if (!tenant) throw new Error(`Tenant « ${TENANT_NAME} » introuvable`);

const existingProducts = await prisma.trainingProduct.findMany({
  where: { tenantId: tenant.id },
  select: {
    id: true,
    code: true,
    title: true,
    sourceRef: true,
    isActive: true,
    durationHours: true,
    supersededByProductId: true,
    _count: { select: { trainingSessions: true } },
    modules: { select: { id: true, sourceRef: true, title: true } },
  },
});
const bySourceRef = new Map(
  existingProducts.filter((p) => p.sourceRef).map((p) => [p.sourceRef!, p]),
);
/**
 * Les produits RÉELLEMENT VENDUS — ceux du catalogue commercial.
 *
 * On exclut les rayons (`sourceRef` non nul : ils viennent d'un import, ils ne
 * se vendent pas) ET les produits inactifs (un programme qu'on ne vend plus ne
 * peut pas « faire foi » contre un rayon de bibliothèque : l'écarter au profit
 * d'un produit mort retirerait le contenu de la reco sans rien mettre à la
 * place).
 */
const soldByTitle = new Map(
  existingProducts
    .filter((p) => p.sourceRef === null && p.isActive)
    .map((p) => [normalizeName(p.title), p]),
);

interface Line {
  ref: string;
  action: 'créé' | 'mis à jour' | 'ignoré';
  code: string;
  title: string;
  modules: number;
  pattern: string;
  hoursSource: string;
  notes: string[];
}

const report: Line[] = [];
const orphans: string[] = [];
const collisions: string[] = [];
const guarded: string[] = [];

for (const p of snapshot.programmes) {
  const notes: string[] = [...p.warnings];
  const code = shelfCode(p);
  const { hours, source: hoursSource } = shelfHours(p);

  if (p.modules.length === 0) {
    report.push({
      ref: p.sourceRef,
      action: 'ignoré',
      code,
      title: p.title,
      modules: 0,
      pattern: p.parsePattern,
      hoursSource: '—',
      notes: [...notes, 'Aucun module extrait — rien à importer.'],
    });
    continue;
  }

  const existing = bySourceRef.get(p.sourceRef);

  // D-19 bis — la version VENDUE fait foi.
  //
  // Un lien DÉJÀ posé ne se recalcule jamais : c'est lui qui garantit qu'un
  // dossier Drive renommé ne fera pas réapparaître le doublon au prochain
  // import. Sinon seulement, on cherche un produit vendu du même nom.
  let supersededByProductId: string | null = existing?.supersededByProductId ?? null;
  if (supersededByProductId !== null) {
    const gardien = existingProducts.find((x) => x.id === supersededByProductId);
    collisions.push(
      `\`${p.sourceRef}\` reste écarté au profit de \`${gardien?.code ?? '?'}\` (lien déjà posé, non recalculé).`,
    );
  } else {
    const twin = soldByTitle.get(normalizeName(p.title));
    if (twin) {
      supersededByProductId = twin.id;
      collisions.push(
        `\`${p.sourceRef}\` « ${p.title.slice(0, 50)} » fait doublon avec le produit vendu \`${twin.code}\` : **c'est la version vendue qui fait foi**, les modules du rayon sortent de la reco. Le produit vendu n'est pas touché.`,
      );
      notes.push(`Écarté de la reco : doublon de \`${twin.code}\` (D-19 bis).`);
    }
  }

  // Ligne rouge D-20 : on ne retouche jamais la durée d'un produit qui porte
  // des sessions. Un rayon n'en porte pas — mais on vérifie plutôt que de le
  // supposer.
  const carriesSessions = (existing?._count.trainingSessions ?? 0) > 0;
  if (carriesSessions) {
    guarded.push(
      `\`${existing!.code}\` porte ${existing!._count.trainingSessions} session(s) : sa durée n'a **pas** été recalculée (ligne rouge D-20), et ses modules n'ont pas été touchés.`,
    );
    report.push({
      ref: p.sourceRef,
      action: 'ignoré',
      code: existing!.code,
      title: p.title,
      modules: 0,
      pattern: p.parsePattern,
      hoursSource: '— (protégé)',
      notes: [...notes, 'Produit porteur de sessions : intouchable.'],
    });
    continue;
  }

  const reglementaire = REGLEMENTAIRE_PATTERN.test(p.title);
  const productData = {
    title: p.title,
    durationHours: hours,
    modality: Modality.PRESENTIEL,
    objectives: p.objectives,
    programMd: programMdOf(p),
    prerequisites: p.prerequisites,
    targetAudience: p.targetAudience,
    theme: p.origin === 'faros' ? 'Faros' : 'Bibliothèque',
    // JAMAIS actif — corollaire D-19. C'est le programme composé qui vend.
    isActive: false,
    fundingType: reglementaire ? ProductFundingType.REGLEMENTAIRE : ProductFundingType.COEUR_METIER,
    sourceRef: p.sourceRef,
    supersededByProductId,
  };
  if (reglementaire) notes.push('Classé REGLEMENTAIRE (taux OPCO EP 40 €/h).');

  const modulesData = p.modules.map((m) => {
    const excluded = PIGE_PATTERN.test(m.title) || PIGE_PATTERN.test(m.contentMd);
    if (excluded) notes.push(`Module « ${m.title.slice(0, 40)} » exclu des sorties client (pige).`);
    return {
      sourceRef: m.sourceRef,
      order: m.order,
      title: m.title,
      contentMd: m.contentMd,
      durationMin: m.durationMin ?? DEFAULT_MODULE_MINUTES,
      // `family` reste vide pour le Drive : la remplir avec le titre du
      // programme ferait classer « Prospecter autrement » en IA dès qu'il est
      // rangé dans un rayon d'IA — exactement ce que D-19 corrige. Le rayon
      // sert déjà d'héritage de dernier recours dans le moteur.
      family: p.origin === 'faros' ? p.targetAudience : null,
      excludedFromClientOutputs: excluded,
    };
  });

  const sansDuree = p.modules.filter((m) => m.durationMin === null).length;
  if (sansDuree > 0) {
    notes.push(`${sansDuree} module(s) à ${DEFAULT_MODULE_MINUTES} min par défaut (D-17/D-20).`);
  }

  if (existing) {
    const known = new Set(modulesData.map((m) => m.sourceRef));
    for (const m of existing.modules) {
      if (m.sourceRef && !known.has(m.sourceRef)) {
        orphans.push(`\`${m.sourceRef}\` « ${m.title.slice(0, 50)} » (rayon ${existing.code})`);
      }
    }
  }

  if (APPLY) {
    await prisma.$transaction(async (tx) => {
      const product = existing
        ? await tx.trainingProduct.update({ where: { id: existing.id }, data: productData })
        : await tx.trainingProduct.create({
            data: { ...productData, tenantId: tenant.id, code },
          });

      for (const m of modulesData) {
        const current = await tx.trainingModule.findFirst({
          where: { productId: product.id, sourceRef: m.sourceRef },
          select: { id: true },
        });
        if (current) await tx.trainingModule.update({ where: { id: current.id }, data: m });
        else await tx.trainingModule.create({ data: { ...m, productId: product.id } });
      }
    });
  }

  report.push({
    ref: p.sourceRef,
    action: existing ? 'mis à jour' : 'créé',
    code: existing?.code ?? code,
    title: p.title,
    modules: modulesData.length,
    pattern: p.parsePattern,
    hoursSource,
    notes,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Rapport
// ─────────────────────────────────────────────────────────────────────────────

const stamp = new Date().toISOString().slice(0, 10);
const total = report.reduce((s, l) => s + l.modules, 0);
const lines: string[] = [
  `# Import de la bibliothèque de modules — Drive + Faros (lot I-1)`,
  '',
  `_${APPLY ? '**APPLIQUÉ**' : 'Simulation (dry-run)'} le ${stamp} · instantané du ${snapshot.extractedAt.slice(0, 10)} · tenant « ${TENANT_NAME} »._`,
  '',
  '## En un coup d’œil',
  '',
  `- **${report.filter((l) => l.action === 'créé').length}** rayons créés, **${report.filter((l) => l.action === 'mis à jour').length}** mis à jour, **${report.filter((l) => l.action === 'ignoré').length}** ignorés`,
  `- **${total} modules** entrent dans la bibliothèque`,
  `- **aucun rayon activé** — corollaire D-19 du 10/09/2026 : ce qui devient vendable est le programme COMPOSÉ (lot I-2), jamais le conteneur importé`,
  `- **aucun produit existant modifié** — les doublons écartent le RAYON, jamais le produit vendu (D-19 bis)`,
  `- **${report.filter((l) => l.notes.some((n) => n.includes('D-19 bis'))).length}** rayon(s) écarté(s) de la reco pour doublon`,
  '',
];

if (guarded.length > 0) {
  lines.push('## ⚠️ Ligne rouge D-20 — produits protégés', '');
  for (const g of guarded) lines.push(`- ${g}`);
  lines.push('');
}

if (collisions.length > 0) {
  lines.push(
    '## Doublons du catalogue vendu — la version vendue fait foi (D-19 bis)',
    '',
    'Ces programmes existent déjà comme produits QualiOF **actifs**. Le produit vendu n’est pas touché — ni sa durée, ni sa page publique « Programme détaillé », qui est l’information préalable remise au client. C’est le RAYON qui s’efface : il reste consultable en base, mais **ses modules sortent du chemin de composition**.',
    '',
    'Le lien est posé une fois et n’est jamais recalculé : un dossier Drive renommé ne peut pas réintroduire le doublon. Le délier est une décision de catalogue.',
    '',
  );
  for (const c of collisions) lines.push(`- ${c}`);
  lines.push('');
}

if (orphans.length > 0) {
  lines.push(
    '## Modules orphelins',
    '',
    'Présents en base, absents de la source. **Rien n’a été supprimé** — retirer un module est une décision de catalogue.',
    '',
  );
  for (const o of orphans) lines.push(`- ${o}`);
  lines.push('');
}

lines.push('## Détail par rayon', '', '| Source | Action | Code | Modules | Découpage | Heures | Programme |', '|---|---|---|---|---|---|---|');
for (const l of report) {
  lines.push(
    `| \`${l.ref}\` | ${l.action} | \`${l.code}\` | ${l.modules} | ${l.pattern} | ${l.hoursSource} | ${l.title.slice(0, 60)} |`,
  );
}
lines.push('');

const withNotes = report.filter((l) => l.notes.length > 0);
if (withNotes.length > 0) {
  lines.push('## Ce qui demande un œil', '');
  for (const l of withNotes) {
    lines.push(`### \`${l.ref}\` — ${l.title.slice(0, 60)}`, '');
    for (const n of l.notes) lines.push(`- ${n}`);
    lines.push('');
  }
}

const reportPath = path.resolve(
  REPO_ROOT,
  `.planning/${stamp.replace(/-/g, '').slice(2)}-import-bibliotheque-drive${APPLY ? '-applique' : ''}.md`,
);
writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');

console.log(`\n${APPLY ? '✅ APPLIQUÉ' : '🔍 SIMULATION (ajouter --apply pour écrire)'}`);
console.log(`   ${report.filter((l) => l.action === 'créé').length} créés · ${report.filter((l) => l.action === 'mis à jour').length} mis à jour · ${report.filter((l) => l.action === 'ignoré').length} ignorés`);
console.log(`   ${total} modules · 0 rayon activé (D-19)`);
if (guarded.length > 0) console.log(`   ⚠️  ${guarded.length} produit(s) protégé(s) par la ligne rouge D-20`);
console.log(`   Rapport : ${path.relative(REPO_ROOT, reportPath)}\n`);

await prisma.$disconnect();
