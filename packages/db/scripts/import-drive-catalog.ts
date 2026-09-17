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
 *     version VENDUE fait foi** — et, entre deux RAYONS, l'arbitrage déclaré de
 *     Laurent (`RAYONS_TRANCHES`). Le rayon en doublon est donc créé, puis
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

// Modules PURS (aucun accès base, réseau ni fichier) : un import statique est
// sans risque ici, contrairement au client Prisma qui attend que l'env soit
// chargé.
import type { Prisma } from '@prisma/client';
import { doitProtegerLeContenu } from './lib/mentions-organisme.js';
import { sortDuRayon, MOTIF_FAROS } from './lib/barriere-faros.js';
import { CibleInattendueError, transactionGardee, type MarqueursCible } from './lib/garde-cible.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
loadEnv({ path: path.resolve(REPO_ROOT, '.env') });

const { Modality, ProductFundingType } = await import('@prisma/client');
const { createPrismaClientForUrl } = await import('../src/index.js');
const { catalogueTitleKey } = await import('@qualiof/shared/helpers');

/**
 * La connexion DIRECTE (`:5432`), jamais la poolée (`:6543`).
 *
 * Depuis que l'écriture tient en UNE transaction interactive (phases 1 et 2,
 * cf. plus bas), la poolée ne convient plus : pgbouncer en mode transaction ne
 * garantit pas qu'une transaction interactive de plusieurs centaines d'ordres
 * reste sur la même connexion. C'est le même choix que `run-readonly-sql.ts`,
 * et pour la même raison.
 *
 * En local, `DIRECT_URL` vaut `DATABASE_URL` : ce choix y est un no-op.
 */
const CIBLE_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!CIBLE_URL)
  throw new Error('Ni DIRECT_URL ni DATABASE_URL — cible inconnue, on ne devine pas.');
const prisma = createPrismaClientForUrl(CIBLE_URL);

/**
 * Les doublons RAYON ↔ RAYON tranchés par Laurent.
 *
 * D-19 bis sait trancher un rayon contre un produit VENDU — la version vendue
 * fait foi. Entre deux RAYONS, aucune règle ne peut choisir : ils ont le même
 * statut, il n'y a pas de convention ni de page publique qui départage. C'est
 * donc une décision de catalogue, et elle se déclare ici, datée et motivée,
 * plutôt que d'être passée une fois à la main sur une base.
 *
 * Le lien est posé dans `supersededByProductId`, exactement comme un doublon
 * D-19 bis : le rayon écarté **reste en base et reste consultable**, seuls ses
 * modules sortent du chemin de composition. Et comme tout lien déjà posé, il
 * n'est **jamais recalculé** — c'est ce qui garantit qu'un prochain import du
 * Drive ne réintroduira pas le doublon, même si le dossier est renommé.
 *
 * Clé : la source du rayon qui s'efface. Valeur : celle du rayon qui fait foi.
 */
const RAYONS_TRANCHES: Record<string, { garde: string; motif: string; date: string }> = {
  'drive:020': {
    garde: 'drive:008',
    motif:
      '008 est le numéro de ce programme dans la numérotation catalogue de Laurent (008 → 074) ; 020 est une copie rangée sous un autre numéro.',
    date: '11/09/2026',
  },
};

const APPLY = process.argv.includes('--apply');
const TENANT_NAME = process.env.TENANT_DEFAULT_NAME ?? 'Start Academy';
const SNAPSHOT = path.resolve(HERE, 'data/drive-programmes-catalog.json');

// ─────────────────────────────────────────────────────────────────────────────
// La cible — nommée par son CONTENU, jamais par son nom (§4 sexies)
// ─────────────────────────────────────────────────────────────────────────────
//
// Ce script écrit dans un catalogue. Un rapport qui ne dit pas SUR QUELLE BASE
// il a tourné n'est pas un relevé, c'est un tas de chiffres — et les deux
// variantes npm (`import:drive-catalog` et `…:local`) écrivaient jusqu'ici le
// MÊME nom de fichier. Un relevé de production pouvait donc se lire comme un
// relevé local, et réciproquement.
//
// L'identité repose sur DEUX choses qui doivent concorder, jamais sur une
// seule : les marqueurs d'infrastructure (hôte, project ref) et les marqueurs
// de CONTENU (tenant, nombre de produits et de modules), lus en base.

/** Le project ref Supabase de la PRODUCTION QualiOF. Constante déclarée, pas devinée. */
const PROJECT_REF_PROD = 'gntlqyscahbgjrmsbzil';
const HOTES_LOCAUX = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];

interface CibleInfra {
  /** Ce qui part dans le NOM du fichier de rapport. */
  slug: string;
  /** Ce qui s'imprime en toutes lettres. */
  libelle: string;
  hote: string;
  projectRef: string;
}

function cibleInfra(url: string): CibleInfra {
  let hote = '(illisible)';
  let user = '';
  try {
    const u = new URL(url);
    hote = u.hostname;
    user = decodeURIComponent(u.username);
  } catch {
    return { slug: 'illisible', libelle: 'CIBLE ILLISIBLE', hote, projectRef: '(illisible)' };
  }
  // Sur le pooler Supabase, le project ref est le suffixe de l'utilisateur
  // (`postgres.<ref>`) — jamais le mot de passe, qui ne sort pas d'ici.
  const projectRef = user.startsWith('postgres.') ? user.slice('postgres.'.length) : '(sans objet)';
  if (HOTES_LOCAUX.includes(hote)) return { slug: 'local', libelle: 'LOCALE', hote, projectRef };
  if (projectRef === PROJECT_REF_PROD)
    return { slug: 'prod', libelle: 'PRODUCTION', hote, projectRef };
  // Ni locale ni la prod connue : une base d'aperçu, une restauration, autre
  // chose. On ne lui invente pas de nom — le slug porte l'hôte, et celui qui
  // lira le rapport verra tout de suite qu'il n'est ni local ni prod.
  return {
    slug: `autre-${hote.split('.')[0]}`,
    libelle: `AUTRE (${hote})`,
    hote,
    projectRef,
  };
}

const CIBLE = cibleInfra(CIBLE_URL);

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
  return p.origin === 'drive' ? `BIB-D${p.reference}` : `BIB-F${p.reference.replace(/^SA-/, '')}`;
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
  const declared = p.declaredDuration
    ? /(\d+(?:[.,]\d+)?)\s*(?:h|heure)/i.exec(p.declaredDuration)
    : null;
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

// Les marqueurs de CONTENU, lus avant toute décision — ce sont eux qui
// prouvent la base, pas son nom ni son hôte (§4 sexies). L'état AVANT est aussi
// le témoin auquel on comparera l'état APRÈS.
const AVANT = {
  produits: await prisma.trainingProduct.count({ where: { tenantId: tenant.id } }),
  produitsActifs: await prisma.trainingProduct.count({
    where: { tenantId: tenant.id, isActive: true },
  }),
  modules: await prisma.trainingModule.count({ where: { product: { tenantId: tenant.id } } }),
};

/**
 * Ce que la garde de cible exigera de la connexion d'écriture.
 *
 * C'est l'état dont ce run REND COMPTE : le rapport porte ces chiffres, et la
 * transaction refusera de s'ouvrir sur une base qui n'est pas celle-là.
 */
const ATTENDU: MarqueursCible = {
  tenantId: tenant.id,
  tenantNom: tenant.name,
  produits: AVANT.produits,
  modules: AVANT.modules,
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

/** Le bloc d'identité, rendu une fois pour la console et une fois pour le rapport. */
const identite = [
  `**Cible : ${CIBLE.libelle}** — hôte \`${CIBLE.hote}\`, project ref \`${CIBLE.projectRef}\`.`,
  `Tenant \`${tenant.id}\` « ${tenant.name} » · **${AVANT.produits} produits** (dont ${AVANT.produitsActifs} actifs) · **${AVANT.modules} modules** avant ce run.`,
];

console.log(`\n🎯 Cible : ${CIBLE.libelle}`);
console.log(`   hôte        : ${CIBLE.hote}`);
console.log(`   project ref : ${CIBLE.projectRef}`);
console.log(`   tenant      : ${tenant.id} « ${tenant.name} »`);
console.log(
  `   avant       : ${AVANT.produits} produits (${AVANT.produitsActifs} actifs) · ${AVANT.modules} modules`,
);

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
    .map((p) => [catalogueTitleKey(p.title), p]),
);

/**
 * Les rayons DÉJÀ en base, par titre — pour voir les doublons rayon ↔ rayon.
 *
 * D-19 bis ne comparait un rayon qu'aux produits VENDUS. Deux dossiers Drive
 * portant le même programme passaient donc tous les deux, et la liste de
 * rattachement du 11/09 proposait deux fois le même module : `drive:008`
 * « Face à face acheteurs » et `drive:020` « Face a face acheteurs ».
 *
 * On les SIGNALE, on ne les écarte pas : lequel des deux fait foi n'est pas
 * une question d'import, c'est une décision de catalogue — et entre deux
 * rayons il n'y a pas de « version vendue » pour trancher toute seule.
 */
const rayonsByTitle = new Map<string, { code: string; sourceRef: string; title: string }[]>();
for (const p of existingProducts) {
  if (p.sourceRef === null) continue;
  const k = catalogueTitleKey(p.title);
  rayonsByTitle.set(k, [
    ...(rayonsByTitle.get(k) ?? []),
    { code: p.code, sourceRef: p.sourceRef, title: p.title },
  ]);
}

interface Line {
  ref: string;
  action: 'créé' | 'mis à jour' | 'ignoré' | 'écarté';
  code: string;
  title: string;
  modules: number;
  pattern: string;
  hoursSource: string;
  notes: string[];
}

const report: Line[] = [];
/** Les déroulés écrits en base qu'un Drive muet aurait effacés. */
const contenusProteges: string[] = [];
/**
 * Les modules dont la base ne portait QUE du boilerplate de gabarit : la garde
 * ne s'applique pas, l'écriture passe — mais jamais en silence.
 */
const boilerplateVide: string[] = [];
const orphans: string[] = [];
const collisions: string[] = [];
const guarded: string[] = [];
/** Les rayons refusés par la barrière Faros — nommés, jamais silencieux. */
const farosEcartes: string[] = [];

/**
 * Un lien `supersededBy` VOULU — déclaré en phase 1, résolu en phase 2.
 *
 * Le gardien se désigne de deux façons, et la distinction compte :
 *   • `gardeId` — un produit VENDU, déjà en base avant ce run : son identité est
 *     connue tout de suite et ne dépend d'aucune écriture ;
 *   • `gardeSourceRef` — un autre RAYON, qui peut n'exister qu'après la phase 1.
 *     C'est exactement le cas qui échouait en silence sur une cible vierge.
 */
interface LienVoulu {
  /** Le `sourceRef` du rayon qui s'efface. */
  source: string;
  titreSource: string;
  gardeId?: string;
  gardeCodeConnu?: string;
  gardeSourceRef?: string;
  /** La ligne de rapport, écrite une fois le CODE du gardien connu. */
  recit: (codeGarde: string) => string;
}
const liensVoulus: LienVoulu[] = [];
/** Les rayons déjà écartés AVANT ce run — leur paire n'attend plus de décision. */
const dejaEcartes = new Set<string>();

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 — écrire les produits et leurs modules
// ─────────────────────────────────────────────────────────────────────────────
//
// Extraite de la boucle le 17/09/2026. Elle écrivait auparavant dans UNE
// transaction par produit ; elle est désormais appelée par la transaction
// unique qui porte aussi la phase 2, pour qu'un lien impossible à résoudre
// ramène la base à son état d'avant plutôt que de laisser 72 rayons posés et
// un doublon entier.

/**
 * Une écriture de rayon, préparée mais pas encore faite.
 *
 * On stocke une FERMETURE et non des données : `productData` et `modulesData`
 * ont des formes inférées par TypeScript depuis l'instantané, et les retaper
 * dans une interface créerait une seconde vérité à tenir d'accord avec la
 * première — le défaut même qu'on vient de retirer d'ailleurs.
 */
type EcritureRayon = (tx: Prisma.TransactionClient) => Promise<void>;
const plan: EcritureRayon[] = [];

for (const p of snapshot.programmes) {
  const notes: string[] = [...p.warnings];
  const code = shelfCode(p);
  const { hours, source: hoursSource } = shelfHours(p);

  // Le sort du rayon se décide dans un module PUR, appelé aussi par
  // `faros-non-importable.test.ts` : la barrière et le chemin réel lisent la
  // même fonction, il n'y a plus deux vérités à tenir d'accord (§4 ter).
  const sort = sortDuRayon(p);
  if (!sort.importable) {
    if (sort.motif === MOTIF_FAROS) {
      farosEcartes.push(
        `\`${p.sourceRef}\` « ${p.title.slice(0, 60)} » — ${p.modules.length} module(s) NON versé(s).`,
      );
    }
    report.push({
      ref: p.sourceRef,
      action: 'écarté',
      code,
      title: p.title,
      modules: 0,
      pattern: p.parsePattern,
      hoursSource: '—',
      notes: [...notes, sort.motif],
    });
    continue;
  }

  const existing = bySourceRef.get(p.sourceRef);

  // D-19 bis — la version VENDUE fait foi.
  //
  // Un lien DÉJÀ posé ne se recalcule jamais : c'est lui qui garantit qu'un
  // dossier Drive renommé ne fera pas réapparaître le doublon au prochain
  // import. Sinon seulement, on cherche un produit vendu du même nom.
  //
  // ── Ce qui a changé le 17/09/2026, et pourquoi ──────────────────────────
  //
  // Ce bloc RÉSOLVAIT le lien ici même, contre `existingProducts` — une liste
  // lue UNE fois, avant la boucle. Sur une base où le gardien n'existait pas
  // encore (une cible vierge : la production), l'arbitrage `drive:020` →
  // `drive:008` ne trouvait rien et le rapport écrivait « aucun lien posé, le
  // doublon reste entier » au milieu de 959 lignes. Un défaut rendu par une
  // phrase de prose dans un fichier que personne ne relit.
  //
  // Désormais le lien est seulement DÉCLARÉ ici ; il est résolu en phase 2,
  // contre l'état réel d'après les créations — et s'il ne se résout pas, le
  // script échoue en nommant la paire au lieu de la raconter.
  const lienDejaPose = existing?.supersededByProductId ?? null;
  if (lienDejaPose !== null) {
    // Déjà écarté d'un run précédent : la paire est TRANCHÉE, même si ce run-ci
    // ne pose rien. Sans cette ligne, le rapport du second passage rouvrait la
    // question (« rien n'a été écarté, le choix t'appartient ») sur un
    // arbitrage rendu — mesuré le 17/09 au run d'idempotence.
    dejaEcartes.add(p.sourceRef);
    const gardien = existingProducts.find((x) => x.id === lienDejaPose);
    collisions.push(
      `\`${p.sourceRef}\` reste écarté au profit de \`${gardien?.code ?? '?'}\` (lien déjà posé, non recalculé).`,
    );
  } else if (RAYONS_TRANCHES[p.sourceRef]) {
    // Un doublon rayon ↔ rayon que Laurent a tranché. On cherche le rayon
    // gardé par sa SOURCE et non par son titre : c'est justement le titre qui
    // diffère entre deux exemplaires du même programme.
    const arbitrage = RAYONS_TRANCHES[p.sourceRef]!;
    liensVoulus.push({
      source: p.sourceRef,
      titreSource: p.title,
      gardeSourceRef: arbitrage.garde,
      recit: (codeGarde) =>
        `\`${p.sourceRef}\` « ${p.title.slice(0, 50)} » est écarté au profit de \`${codeGarde}\` (\`${arbitrage.garde}\`) — **arbitrage de Laurent du ${arbitrage.date}** : ${arbitrage.motif} Le rayon reste en base et reste consultable ; seuls ses modules sortent de la composition.`,
    });
    notes.push(
      `Écarté de la reco : doublon de \`${arbitrage.garde}\` (arbitrage du ${arbitrage.date}).`,
    );
  } else {
    const twin = soldByTitle.get(catalogueTitleKey(p.title));
    if (twin) {
      liensVoulus.push({
        source: p.sourceRef,
        titreSource: p.title,
        gardeId: twin.id,
        gardeCodeConnu: twin.code,
        recit: (codeGarde) =>
          `\`${p.sourceRef}\` « ${p.title.slice(0, 50)} » fait doublon avec le produit vendu \`${codeGarde}\` : **c'est la version vendue qui fait foi**, les modules du rayon sortent de la reco. Le produit vendu n'est pas touché.`,
      });
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
    // `supersededByProductId` n'est PAS écrit ici : il est posé en phase 2,
    // contre l'état réel d'après les créations. L'omettre laisse la colonne
    // intacte sur un `update`, ce qui est exactement ce qu'on veut d'un lien
    // qui ne se recalcule jamais.
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

  plan.push(async (tx) => {
    const product = existing
      ? await tx.trainingProduct.update({ where: { id: existing.id }, data: productData })
      : await tx.trainingProduct.create({
          data: { ...productData, tenantId: tenant.id, code },
        });

    // La trace ne se pose qu'à la CRÉATION : une réexécution de l'import sur
    // un rayon déjà en base est un `update`, et un AuditLog par rejeu
    // noierait la naissance du produit sous le bruit. Elle est DANS la
    // transaction — hors d'elle, un échec plus bas laisserait une trace de
    // création pour un produit qui n'existe pas.
    if (!existing) {
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: null,
          entity: 'TrainingProduct',
          entityId: product.id,
          action: 'trainingProduct.create',
          diff: {
            source: 'import-drive-catalog.ts',
            code,
            title: productData.title,
            sourceRef: productData.sourceRef ?? null,
            provenanceCode: 'rayon de bibliothèque (BIB-*)',
          },
        },
      });
    }

    for (const m of modulesData) {
      const current = await tx.trainingModule.findFirst({
        where: { productId: product.id, sourceRef: m.sourceRef },
        select: { id: true, contentMd: true },
      });
      if (current) {
        // ── Un import ne VIDE jamais un contenu écrit ────────────────────
        //
        // La règle exacte n'est pas « ne jamais écraser » : ce serait faire
        // du Drive une source morte, et une vraie mise à jour ne passerait
        // plus. C'est : **ne jamais remplacer un contenu non vide par un
        // contenu vide.**
        //
        // Le motif tient en une phrase : un import qui VIDE un contenu ne
        // peut pas avoir raison ; un import qui le REMPLACE par autre chose,
        // si. Le Drive extrait mal certains programmes (17 restent en bloc
        // unique) et un déroulé écrit à la main en base vaut mieux qu'un
        // trou — pendant que le document source, lui, n'a pas bougé.
        //
        // Posée le 11/09/2026 après l'écriture des trois modules rédigés par
        // Laurent : un seul d'entre eux portait encore son `sourceRef`, donc
        // un seul était exposé — mais la règle vaut pour tout contenu saisi
        // en base, aujourd'hui et demain.
        //
        // ── La nuance du lot 1 (11/09/2026) ─────────────────────────────
        //
        // Cette protection protège la PÉDAGOGIE, pas le BOILERPLATE.
        //
        // L'extraction retire désormais les mentions d'organisme du gabarit
        // (« QCM évaluation des acquis », « Questionnaire de satisfaction et
        // clôture de la formation »). Quatre modules n'avaient QUE ces deux
        // lignes : leur déroulé entrant est donc vide. Avec l'ancien calcul,
        // la garde aurait conservé en base le pied de page qu'on vient tout
        // juste de retirer de la source — du garbage protégeant du garbage.
        //
        // `doitProtegerLeContenu` passe donc le contenu EN BASE par le même
        // filtre : s'il n'en reste rien, il n'y a rien à protéger et
        // l'écriture passe. L'import ne normalise rien en base et ne réécrit
        // rien à la main — il DÉCIDE si la garde s'applique, c'est tout.
        const proteger = doitProtegerLeContenu(current.contentMd, m.contentMd);
        if (proteger) {
          const { contentMd: _ignore, ...sansContenu } = m;
          await tx.trainingModule.update({ where: { id: current.id }, data: sansContenu });
          contenusProteges.push(
            `\`${m.sourceRef}\` « ${m.title.slice(0, 50)} » — le Drive n'a pas de déroulé, la base en a un : **contenu conservé**. Le reste du module est mis à jour normalement.`,
          );
        } else {
          // Là où l'ancien code protégeait, il faut désormais rendre compte :
          // une écriture qui VIDE un contenu se nomme, même quand elle a
          // raison de le faire.
          if (
            (current.contentMd ?? '').trim().length > 0 &&
            (m.contentMd ?? '').trim().length === 0
          ) {
            boilerplateVide.push(
              `\`${m.sourceRef}\` « ${m.title.slice(0, 50)} » — la base ne portait QUE des mentions d'organisme du gabarit : **déroulé vidé**, rien de pédagogique n'a été perdu.`,
            );
          }
          await tx.trainingModule.update({ where: { id: current.id }, data: m });
        }
      } else {
        await tx.trainingModule.create({ data: { ...m, productId: product.id } });
      }
    }
  });

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
// PHASE 2 — résoudre les liens de doublon, contre l'état RÉEL
// ─────────────────────────────────────────────────────────────────────────────
//
// Posée le 17/09/2026. Le défaut qu'elle corrige : une référence croisée entre
// deux RAYONS (`drive:020` → `drive:008`) était résolue contre `existingProducts`,
// lu une fois AVANT la boucle. Sur une cible vierge le gardien n'existait pas
// encore, le lien n'était pas posé, et le rapport le racontait en prose au
// milieu de 959 lignes. Personne ne relit 959 lignes.
//
// Deux changements, et le second est le vrai :
//   ① le lien se résout après les créations, donc il tombe ;
//   ② s'il ne tombe pas, **le script échoue en nommant la paire**. Un défaut
//      qui ne bloque pas est un défaut qui passe.

/** L'état des rayons ATTENDU après la phase 1 — pour trancher avant d'écrire. */
const apresPhase1 = new Map<string, string>();
for (const q of existingProducts) if (q.sourceRef) apresPhase1.set(q.sourceRef, q.code);
for (const l of report) if (l.action === 'créé') apresPhase1.set(l.ref, l.code);

const liensManquants = liensVoulus.filter(
  (l) => l.gardeId === undefined && !apresPhase1.has(l.gardeSourceRef ?? ''),
);

if (liensManquants.length > 0) {
  console.error('\n⛔ ÉCHEC — un doublon de rayon ne trouve pas son gardien.\n');
  for (const l of liensManquants) {
    console.error(`   ${l.source} → ${l.gardeSourceRef} : GARDIEN INTROUVABLE`);
    console.error(`   « ${l.titreSource} »`);
  }
  console.error(
    "\n   Écarter un rayon au profit d'un gardien qui n'existe pas retirerait du\n" +
      '   contenu de la recommandation sans rien mettre à la place. Et ne PAS\n' +
      "   l'écarter laisse le même programme deux fois dans la composition.\n" +
      "   Aucune des deux issues ne se décide toute seule : rien n'est écrit.\n",
  );
  await prisma.$disconnect();
  process.exit(1);
}

/** Les liens à poser, avec le code du gardien — connu, jamais supposé. */
const liensResolus = liensVoulus.map((l) => ({
  ...l,
  codeGarde: l.gardeCodeConnu ?? apresPhase1.get(l.gardeSourceRef ?? '')!,
  enPhase2: l.gardeId === undefined,
}));
for (const l of liensResolus) collisions.push(l.recit(l.codeGarde));

// ─────────────────────────────────────────────────────────────────────────────
// Doublons RAYON ↔ RAYON — signalés, jamais tranchés d'office
// ─────────────────────────────────────────────────────────────────────────────
//
// D-19 bis ne compare un rayon qu'aux produits VENDUS : entre deux rayons, il
// n'y a pas de « version vendue » pour trancher. Deux dossiers Drive portant le
// même programme passaient donc tous les deux — et la reco proposait deux fois
// le même module, ce qu'a montré la liste de rattachement du 11/09/2026.
//
// Le choix appartient à Laurent : garder le dossier le mieux découpé, pas le
// premier arrivé. On lui donne la paire et de quoi choisir.

for (const p of snapshot.programmes) {
  if (p.modules.length === 0) continue;
  const k = catalogueTitleKey(p.title);
  const deja = rayonsByTitle.get(k) ?? [];
  if (!deja.some((r) => r.sourceRef === p.sourceRef)) {
    rayonsByTitle.set(k, [...deja, { code: shelfCode(p), sourceRef: p.sourceRef, title: p.title }]);
  }
}

// Une paire dont un membre est DÉJÀ écarté n'attend plus de décision : la dire
// « à trancher » enverrait relire un arbitrage qui est pris (celui de Laurent
// du 11/09 pour `drive:020`). Le récit de l'écartement est dans la section
// D-19 bis, avec le code du gardien.
const sourcesArbitrees = new Set([...dejaEcartes, ...liensResolus.map((l) => l.source)]);
const jumeauxDeRayon = [...rayonsByTitle.values()].filter(
  (g) => g.length > 1 && !g.some((r) => sourcesArbitrees.has(r.sourceRef)),
);

// ─────────────────────────────────────────────────────────────────────────────
// L'ÉCRITURE — une seule transaction, les deux phases dedans
// ─────────────────────────────────────────────────────────────────────────────
//
// Avant le 17/09/2026, c'était UNE transaction par produit. Chacune était
// cohérente, mais l'ensemble ne l'était pas : un échec au 40e rayon laissait
// 39 rayons posés, sans leurs liens, et rien ne disait où le versement s'était
// arrêté. Les deux phases tiennent désormais dans la même transaction — soit
// le catalogue est versé entier avec ses liens, soit la base n'a pas bougé.
//
// `timeout` : ~72 produits et ~400 modules sur une connexion distante dépassent
// largement les 5 s par défaut de Prisma. La valeur est généreuse parce qu'une
// transaction qui expire à mi-chemin est exactement ce qu'on vient d'exclure.
if (APPLY) {
  const ouverture = new Date();
  console.log(`\n⏱  Transaction ouverte à ${ouverture.toISOString()}`);
  await transactionGardee(
    prisma,
    ATTENDU,
    relireMarqueurs,
    async (tx) => {
      // ── PHASE 1 ────────────────────────────────────────────────────────────
      // La garde de cible a déjà tourné : `transactionGardee` ne nous appelle
      // pas autrement. C'est pour ça qu'elle prend le corps en paramètre plutôt
      // que d'être un ordre à ne pas oublier de placer en premier.
      for (const ecrire of plan) await ecrire(tx);

      // ── PHASE 2 ────────────────────────────────────────────────────────────
      // L'état RÉEL, relu DANS la transaction : c'est tout l'objet du découpage.
      const reels = await tx.trainingProduct.findMany({
        where: { tenantId: tenant.id, sourceRef: { not: null } },
        select: { id: true, code: true, sourceRef: true },
      });
      const parRef = new Map(reels.map((r) => [r.sourceRef as string, r]));

      for (const l of liensResolus) {
        const rayon = parRef.get(l.source);
        if (!rayon) {
          throw new Error(
            `PHASE 2 — le rayon \`${l.source}\` est introuvable après la phase 1. Rien n'est écrit.`,
          );
        }
        const gardeId = l.gardeId ?? parRef.get(l.gardeSourceRef ?? '')?.id;
        if (!gardeId) {
          throw new Error(
            `PHASE 2 — doublon \`${l.source}\` → \`${l.gardeSourceRef}\` : GARDIEN INTROUVABLE ` +
              `après la phase 1. Rien n'est écrit.`,
          );
        }
        await tx.trainingProduct.update({
          where: { id: rayon.id },
          data: { supersededByProductId: gardeId },
        });
        // La trace du lien est DANS la transaction, comme celle de la création :
        // un journal qui survit à un échec d'écriture raconterait un lien qui
        // n'a pas été posé.
        await tx.auditLog.create({
          data: {
            tenantId: tenant.id,
            userId: null,
            entity: 'TrainingProduct',
            entityId: rayon.id,
            action: 'trainingProduct.supersededBy',
            diff: {
              source: 'import-drive-catalog.ts (phase 2)',
              rayon: l.source,
              gardien: l.gardeSourceRef ?? l.gardeCodeConnu ?? null,
              gardienProductId: gardeId,
            },
          },
        });
      }
    },
    { maxWait: 30_000, timeout: 600_000 },
  ).catch((e: unknown) => {
    if (e instanceof CibleInattendueError) {
      console.error("\n⛔ ÉCHEC — la base d'écriture n'est PAS celle du relevé.\n");
      for (const ecart of e.ecarts) console.error(`   ${ecart}`);
      console.error(
        `\n   Connexion d'écriture : ${CIBLE.hote} (project ref ${CIBLE.projectRef}).\n` +
          "   L'inventaire de tête de run et l'écriture passent par deux chaînes de\n" +
          '   connexion différentes ; rien ne garantissait que ce soit la même base.\n' +
          "   Un schéma voisin — une base d'aperçu restaurée — ne lève aucune erreur :\n" +
          '   il rend des chiffres faux en silence.\n\n' +
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
  console.log(`⏱  Transaction fermée à ${new Date().toISOString()}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rapport
// ─────────────────────────────────────────────────────────────────────────────

const stamp = new Date().toISOString().slice(0, 10);
const total = report.reduce((s, l) => s + l.modules, 0);
const lines: string[] = [
  `# Import de la bibliothèque de modules — Drive (lot I-1)`,
  '',
  `_${APPLY ? '**APPLIQUÉ**' : 'Simulation (dry-run)'} le ${stamp} · instantané du ${snapshot.extractedAt.slice(0, 10)}._`,
  '',
  // La cible en TÊTE, avant le premier chiffre. Un relevé qui ne dit pas sur
  // quelle base il a tourné n'est pas un relevé (§4 sexies, §4 terdecies) — et
  // les deux variantes npm écrivaient le même nom de fichier jusqu'au 17/09.
  ...identite.map((l) => `> ${l}`),
  '',
  '## En un coup d’œil',
  '',
  `- **${report.filter((l) => l.action === 'créé').length}** rayons créés, **${report.filter((l) => l.action === 'mis à jour').length}** mis à jour, **${report.filter((l) => l.action === 'écarté').length}** écartés`,
  `- **${total} modules** entrent dans la bibliothèque`,
  `- **aucun rayon activé** — corollaire D-19 du 10/09/2026 : ce qui devient vendable est le programme COMPOSÉ (lot I-2), jamais le conteneur importé`,
  `- **aucun produit existant modifié** — les doublons écartent le RAYON, jamais le produit vendu (D-19 bis)`,
  `- **${report.filter((l) => l.notes.some((n) => n.includes('D-19 bis'))).length}** rayon(s) écarté(s) de la reco pour doublon d'un produit vendu (D-19 bis)`,
  ...(jumeauxDeRayon.length > 0
    ? [
        `- ⚠️ **${jumeauxDeRayon.length}** programme(s) importé(s) DEUX FOIS depuis deux dossiers source — signalés plus bas, **rien n'a été écarté** : entre deux rayons, c'est une décision de catalogue`,
      ]
    : []),
  '',
];

if (farosEcartes.length > 0) {
  lines.push(
    '## ⛔ Barrière Faros — écartés du versement',
    '',
    MOTIF_FAROS,
    '',
    "**La raison n'est pas la qualité du contenu.** `SA-ACQ-M003` et `SA-ADM-M001` déclarent « G3 prêt à produire » en v1.0 — ce sont les deux seuls du corpus dans ce cas. Ils sont écartés parce que ce sont des capsules **asynchrones** et que l'import ne sait poser qu'une modalité, `PRESENTIEL`, en dur. Les verser écrirait une **fausse modalité sur une pièce Qualiopi, en production**.",
    '',
    "⚠️ **Divergence assumée entre les bases** : la base LOCALE porte déjà ces entrées `faros:` (import du 11/09), la PRODUCTION ne les aura pas. Ce n'est pas un écart à rattraper par un import — cf. `.planning/quick/260916-faros-barriere/deferred-items.md`.",
    '',
  );
  for (const f of farosEcartes) lines.push(`- ${f}`);
  lines.push('');
}

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

if (contenusProteges.length > 0) {
  lines.push(
    '## Contenus conservés — un import ne vide jamais ce qui est écrit',
    '',
    'Pour ces modules, le document Drive ne porte aucun déroulé alors que la base en a un. **Le contenu en base a été conservé** ; tout le reste du module (titre, durée, ordre) a été mis à jour normalement.',
    '',
    'Motif : un import qui VIDE un contenu ne peut pas avoir raison ; un import qui le REMPLACE par autre chose, si. Le jour où le document Drive portera le déroulé, il reprendra la main sans rien de plus à faire.',
    '',
  );
  for (const c of contenusProteges) lines.push(`- ${c}`);
  lines.push('');
}

if (boilerplateVide.length > 0) {
  lines.push(
    '## Déroulés vidés — la base ne portait que du boilerplate de gabarit',
    '',
    "Pour ces modules, la base portait un déroulé, mais **uniquement des mentions d'organisme** du gabarit Qualiopi (« QCM évaluation des acquis », « Questionnaire de satisfaction et clôture de la formation »). L'extraction les retire depuis le lot 1 du 11/09/2026 ; la garde « un import ne vide jamais un contenu écrit » **ne s'applique donc pas** : elle protège la pédagogie, pas le boilerplate.",
    '',
    "**Rien de pédagogique n'a été perdu.** Ces modules sont des fantômes nés du pied de page — leur titre est en réalité le dernier objectif de la liste précédente, et leur découpage est un chantier à part (lot 3). Le composeur les écarte déjà des sorties client, faute de déroulé.",
    '',
  );
  for (const c of boilerplateVide) lines.push(`- ${c}`);
  lines.push('');
}

if (jumeauxDeRayon.length > 0) {
  lines.push(
    '## ⚠️ À trancher — le même programme importé deux fois',
    '',
    'Ces programmes sont présents **deux fois dans la bibliothèque**, sous deux dossiers source différents. D-19 bis ne sait pas les départager : il compare un rayon aux produits VENDUS, et entre deux rayons il n’y a pas de version vendue qui fasse foi.',
    '',
    '**Rien n’a été écarté.** Le choix t’appartient — garde le dossier le mieux découpé, pas le premier arrivé. Tant que les deux sont là, la recommandation propose deux fois le même module et mange deux places sur trois.',
    '',
    '| Programme | Rayons en double |',
    '|---|---|',
  );
  for (const g of jumeauxDeRayon) {
    const membres = g.map((r) => `\`${r.code}\` (\`${r.sourceRef}\`) « ${r.title} »`).join('<br>');
    lines.push(`| ${g[0]!.title.slice(0, 60)} | ${membres} |`);
  }
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

lines.push(
  '## Détail par rayon',
  '',
  '| Source | Action | Code | Modules | Découpage | Heures | Programme |',
  '|---|---|---|---|---|---|---|',
);
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

// Le nom du fichier porte la CIBLE. Jusqu'au 17/09/2026, `import:drive-catalog`
// et `…:local` écrivaient le même nom : un relevé de production se lisait comme
// un relevé local, et réciproquement.
const reportPath = path.resolve(
  REPO_ROOT,
  `.planning/${stamp.replace(/-/g, '').slice(2)}-import-bibliotheque-drive-${CIBLE.slug}${APPLY ? '-applique' : ''}.md`,
);
writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');

console.log(
  `\n${APPLY ? '✅ APPLIQUÉ' : '🔍 SIMULATION (ajouter --apply pour écrire)'} — cible ${CIBLE.libelle}`,
);
console.log(
  `   ${report.filter((l) => l.action === 'créé').length} créés · ${report.filter((l) => l.action === 'mis à jour').length} mis à jour · ${report.filter((l) => l.action === 'écarté').length} écartés`,
);
console.log(`   ${total} modules · 0 rayon activé (D-19)`);
if (farosEcartes.length > 0) {
  console.log(
    `   ⛔ ${farosEcartes.length} rayon(s) Faros écarté(s) — barrière du 16/09 (modalité)`,
  );
}
for (const l of liensResolus.filter((x) => x.enPhase2)) {
  console.log(
    `   🔗 ${APPLY ? 'lien posé' : 'lien résolu'} en phase 2 : ${l.source} → ${l.gardeSourceRef} (\`${l.codeGarde}\`)`,
  );
}
if (guarded.length > 0)
  console.log(`   ⚠️  ${guarded.length} produit(s) protégé(s) par la ligne rouge D-20`);
console.log(`   Rapport : ${path.relative(REPO_ROOT, reportPath)}\n`);

await prisma.$disconnect();
