/**
 * Script de remédiation : re-lie les TrainingSession actuellement rattachées
 * au produit PROD-IMPORT-FALLBACK vers leur véritable TrainingProduct.
 *
 * Stratégie pour chaque groupe de sessions partageant le même `name` :
 *   1. Parse le name pour extraire titre + durée (ex: "Immobilier ... - 8h00" → 8h)
 *   2. Cherche un produit existant par titre normalisé (case+accents-insensitive),
 *      avec tolérance préfixe (titre Excel = sous-chaîne du titre du produit, ex:
 *      "Vendez mieux avec l'IA" matche PROD-0044 "Vendez mieux avec l'IA : suivi…")
 *   3. Si trouvé → re-link les sessions
 *   4. Sinon → crée un nouveau TrainingProduct PROD-NNNN (programMd vide à
 *      compléter ensuite via /app/produits/[id]) et re-link
 *
 * Usage :
 *   pnpm --filter @qualiof/db exec dotenv -e ../../.env -- tsx scripts/relink-fallback-sessions.ts
 *   pnpm --filter @qualiof/db exec dotenv -e ../../.env -- tsx scripts/relink-fallback-sessions.ts --apply
 *
 * Dry-run par défaut. `--apply` pour committer en DB.
 */

import { PrismaClient, Modality, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[''`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Extrait le titre canonique + la durée du nom de session importé.
 * Patterns observés :
 *   "Immobilier : gagnez 2h par jour grâce à l'IA - 8h00" → ("Immobilier ...", 8)
 *   "Anglais professionnel boosté par l'IA – 21h00"      → ("Anglais ...", 21)
 *   "Tracfin 4h"                                          → ("Tracfin", 4)
 *   "IA générative 105h"                                  → ("IA générative", 105)
 *   "Cadastre Niveau 1 - Présentiel Collectif"           → (name tel quel, 0)
 *
 * On exige au moins 3 caractères pour le titre extrait afin de ne pas
 * dégrader un nom court comme "Tracfin" en chaîne vide.
 */
function parseTitleAndDuration(rawName: string): { title: string; duration: number } {
  const match = rawName.match(/^(.*?)\s*[-–]?\s*(\d{1,3})\s*h(?:00)?\s*$/i);
  if (match && match[2]) {
    const d = parseInt(match[2], 10);
    const title = (match[1] ?? '').trim();
    if (title.length >= 3) return { title, duration: d };
  }
  return { title: rawName.trim(), duration: 0 };
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`Mode : ${apply ? '🟢 APPLY (écriture DB)' : '🟡 DRY RUN (lecture seule)'}\n`);

  const fallback = await prisma.trainingProduct.findFirst({
    where: { code: 'PROD-IMPORT-FALLBACK' },
    select: { id: true, tenantId: true },
  });
  if (!fallback) {
    console.log('Aucun produit PROD-IMPORT-FALLBACK trouvé — rien à faire.');
    return;
  }

  const sessions = await prisma.trainingSession.findMany({
    where: { productId: fallback.id, tenantId: fallback.tenantId },
    select: { id: true, code: true, name: true, status: true },
    orderBy: { code: 'asc' },
  });
  if (sessions.length === 0) {
    console.log('Aucune session liée au fallback — rien à faire.');
    return;
  }
  console.log(`${sessions.length} sessions liées au fallback.\n`);

  // Groupe par name normalisé
  const groups = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const key = normalize(s.name ?? '(sans nom)');
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  // Index des produits existants par titre normalisé pour matching
  const allProducts = await prisma.trainingProduct.findMany({
    where: { tenantId: fallback.tenantId, code: { not: 'PROD-IMPORT-FALLBACK' } },
    select: { id: true, code: true, title: true },
  });
  const productByNormTitle = new Map<string, { id: string; code: string; title: string }>();
  for (const p of allProducts) {
    productByNormTitle.set(normalize(p.title), p);
  }

  // Numéro de produit suivant à utiliser pour les créations
  const maxNumeric = allProducts
    .map((p) => p.code.match(/^PROD-(\d{1,5})$/)?.[1])
    .filter((x): x is string => Boolean(x))
    .map((n) => parseInt(n, 10))
    .reduce((max, n) => Math.max(max, n), 0);
  let nextNum = maxNumeric + 1;

  /** Cherche un produit existant. Match exact, puis tolérance "préfixe". */
  function findExistingProduct(parsedTitle: string) {
    const norm = normalize(parsedTitle);
    const direct = productByNormTitle.get(norm);
    if (direct) return direct;
    for (const [k, p] of productByNormTitle) {
      if (k.startsWith(norm + ' ') || norm.startsWith(k + ' ')) return p;
    }
    return null;
  }

  // Phase 1 : plan
  console.log('Plan de remédiation :\n');
  type Action =
    | { kind: 'relink'; product: { code: string; title: string; id: string }; sessions: typeof sessions; parsedTitle: string }
    | { kind: 'create'; newCode: string; parsedTitle: string; duration: number; sessions: typeof sessions };
  const actions: Action[] = [];

  for (const group of groups.values()) {
    const firstName = group[0]!.name ?? '(sans nom)';
    const parsed = parseTitleAndDuration(firstName);
    const existing = findExistingProduct(parsed.title);

    if (existing) {
      actions.push({ kind: 'relink', product: existing, sessions: group, parsedTitle: parsed.title });
      console.log(`  📎 [${group.length} sess.] "${firstName}"`);
      console.log(`     → re-link vers ${existing.code} (${existing.title})`);
    } else {
      const newCode = `PROD-${String(nextNum).padStart(4, '0')}`;
      nextNum += 1;
      actions.push({ kind: 'create', newCode, parsedTitle: parsed.title, duration: parsed.duration, sessions: group });
      console.log(`  ✨ [${group.length} sess.] "${firstName}"`);
      console.log(`     → CRÉER ${newCode} "${parsed.title}" (${parsed.duration}h, PRESENTIEL, programMd vide)`);
    }
  }

  const creates = actions.filter((a) => a.kind === 'create').length;
  const relinks = actions.filter((a) => a.kind === 'relink').length;
  const totalSessions = actions.reduce((s, a) => s + a.sessions.length, 0);
  console.log(`\nRésumé : ${creates} produit(s) à créer, ${relinks} groupe(s) à re-linker, ${totalSessions} sessions affectées.`);

  if (!apply) {
    console.log('\n(dry run) — relance avec --apply pour committer.');
    return;
  }

  // Phase 2 : apply
  console.log('\n--- APPLY ---\n');
  let createdCount = 0;
  let relinkedCount = 0;

  for (const action of actions) {
    let targetProductId: string;

    if (action.kind === 'relink') {
      targetProductId = action.product.id;
    } else {
      // S'assurer que le code généré n'est pas déjà pris (race rare mais
      // possible si un produit a été créé pendant la planif). On incrémente
      // jusqu'à trouver un slot libre.
      let codeToUse = action.newCode;
      // L'index local productByNormTitle ne suit pas les codes — on tape DB.
      let conflict = await prisma.trainingProduct.findFirst({
        where: { tenantId: fallback.tenantId, code: codeToUse },
        select: { id: true },
      });
      while (conflict) {
        codeToUse = `PROD-${String(nextNum).padStart(4, '0')}`;
        nextNum += 1;
        conflict = await prisma.trainingProduct.findFirst({
          where: { tenantId: fallback.tenantId, code: codeToUse },
          select: { id: true },
        });
      }
      const created = await prisma.trainingProduct.create({
        data: {
          tenantId: fallback.tenantId,
          code: codeToUse,
          title: action.parsedTitle,
          durationHours: action.duration,
          modality: Modality.PRESENTIEL,
          objectives: [] as Prisma.InputJsonValue,
          programMd: '',
          isActive: true,
        },
      });
      targetProductId = created.id;
      createdCount += 1;
      console.log(`  ✓ créé ${codeToUse} "${action.parsedTitle}"`);
    }

    const r = await prisma.trainingSession.updateMany({
      where: { id: { in: action.sessions.map((s) => s.id) } },
      data: { productId: targetProductId },
    });
    relinkedCount += r.count;
  }

  console.log(`\n✅ Terminé : ${createdCount} produits créés, ${relinkedCount} sessions re-linkées.`);
  console.log(`\nProchaine étape : remplir programMd (et autres champs Qualiopi) pour les nouveaux produits via /app/produits/[id].`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
