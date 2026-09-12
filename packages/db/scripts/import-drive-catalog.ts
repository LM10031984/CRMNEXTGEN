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

// Module PUR (aucun accès base, réseau ni fichier) : un import statique est sans
// risque ici, contrairement au client Prisma qui attend que l'env soit chargé.
import { doitProtegerLeContenu } from './lib/mentions-organisme.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
loadEnv({ path: path.resolve(REPO_ROOT, '.env') });

const { Modality, ProductFundingType } = await import('@prisma/client');
const { prisma } = await import('../src/index.js');
const { catalogueTitleKey } = await import('@qualiof/shared/helpers');

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
  action: 'créé' | 'mis à jour' | 'ignoré';
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
  } else if (RAYONS_TRANCHES[p.sourceRef]) {
    // Un doublon rayon ↔ rayon que Laurent a tranché. On cherche le rayon
    // gardé par sa SOURCE et non par son titre : c'est justement le titre qui
    // diffère entre deux exemplaires du même programme.
    const arbitrage = RAYONS_TRANCHES[p.sourceRef]!;
    const garde = existingProducts.find((x) => x.sourceRef === arbitrage.garde);
    if (garde) {
      supersededByProductId = garde.id;
      collisions.push(
        `\`${p.sourceRef}\` « ${p.title.slice(0, 50)} » est écarté au profit de \`${garde.code}\` (\`${arbitrage.garde}\`) — **arbitrage de Laurent du ${arbitrage.date}** : ${arbitrage.motif} Le rayon reste en base et reste consultable ; seuls ses modules sortent de la composition.`,
      );
      notes.push(`Écarté de la reco : doublon de \`${garde.code}\` (arbitrage du ${arbitrage.date}).`);
    } else {
      // Ne jamais écarter un rayon au profit d'un gardien introuvable : on
      // retirerait du contenu de la reco sans rien mettre à la place.
      collisions.push(
        `⚠️ \`${p.sourceRef}\` devait être écarté au profit de \`${arbitrage.garde}\`, **introuvable en base** : aucun lien posé, le doublon reste entier.`,
      );
    }
  } else {
    const twin = soldByTitle.get(catalogueTitleKey(p.title));
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
    rayonsByTitle.set(k, [
      ...deja,
      { code: shelfCode(p), sourceRef: p.sourceRef, title: p.title },
    ]);
  }
}

const jumeauxDeRayon = [...rayonsByTitle.values()].filter((g) => g.length > 1);

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
  `- **${report.filter((l) => l.notes.some((n) => n.includes('D-19 bis'))).length}** rayon(s) écarté(s) de la reco pour doublon d'un produit vendu (D-19 bis)`,
  ...(jumeauxDeRayon.length > 0
    ? [
        `- ⚠️ **${jumeauxDeRayon.length}** programme(s) importé(s) DEUX FOIS depuis deux dossiers source — signalés plus bas, **rien n'a été écarté** : entre deux rayons, c'est une décision de catalogue`,
      ]
    : []),
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

if (contenusProteges.length > 0) {
  lines.push(
    '## Contenus conservés — un import ne vide jamais ce qui est écrit',
    '',
    "Pour ces modules, le document Drive ne porte aucun déroulé alors que la base en a un. **Le contenu en base a été conservé** ; tout le reste du module (titre, durée, ordre) a été mis à jour normalement.",
    '',
    "Motif : un import qui VIDE un contenu ne peut pas avoir raison ; un import qui le REMPLACE par autre chose, si. Le jour où le document Drive portera le déroulé, il reprendra la main sans rien de plus à faire.",
    '',
  );
  for (const c of contenusProteges) lines.push(`- ${c}`);
  lines.push('');
}

if (boilerplateVide.length > 0) {
  lines.push(
    "## Déroulés vidés — la base ne portait que du boilerplate de gabarit",
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
    const membres = g
      .map((r) => `\`${r.code}\` (\`${r.sourceRef}\`) « ${r.title} »`)
      .join('<br>');
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
