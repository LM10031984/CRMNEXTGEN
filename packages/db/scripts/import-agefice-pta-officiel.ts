/**
 * Import du référentiel des Points d'Accueil AGEFICE depuis la SOURCE OFFICIELLE.
 *
 * Pourquoi ce script remplace `import-agefice-pa.ts` (quick 260908-m1v) :
 * l'ancien lisait un `agefice_points_accueil.xlsx` figé, fourni une fois. Résultat
 * au 2026-09-08 : **1 seul numéro de PTA sur 151 points** en base, alors que ce
 * numéro est justement ce qui se reporte sur la fiche AGEFICE de l'apprenant.
 *
 * La page « Trouver un Point d'Accueil » d'agefice.fr interroge en réalité un
 * endpoint JSON public, département par département :
 *
 *     https://communication-agefice.fr/ajax/json.php?dept=<département|code postal>
 *
 * Chaque entrée porte `refCentreGestion` (= le n° de PTA), l'email, le téléphone,
 * l'adresse, ET la liste des départements couverts. C'est la source de vérité.
 *
 * Le script interroge les 101 départements, dédoublonne par n° de PTA, puis
 * upsert. Clé naturelle = `numberPta` : stable, contrairement au couple
 * (code postal, nom) qui bouge dès qu'un point déménage ou se renomme.
 *
 * Lancement :
 *   pnpm --filter @qualiof/db exec tsx scripts/import-agefice-pta-officiel.ts            # simulation
 *   pnpm --filter @qualiof/db exec tsx scripts/import-agefice-pta-officiel.ts --apply    # écrit
 *
 * ⚠ La migration `20260908150000_agefice_pta_departments_served` doit être
 * déployée AVANT l'exécution avec `--apply` : sans la colonne, l'écriture
 * échoue en P2022.
 */

import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const ENDPOINT = 'https://communication-agefice.fr/ajax/json.php';

/** Les 101 départements français, forme officielle de l'annuaire. */
const DEPARTMENTS: string[] = [
  ...Array.from({ length: 95 }, (_, i) => String(i + 1).padStart(2, '0')).filter((d) => d !== '20'),
  '2A',
  '2B',
  '971',
  '972',
  '973',
  '974',
  '976',
];

interface RawPta {
  nom?: string;
  adresse?: string;
  adresseDeuxiemeLigne?: string;
  codePostal?: string;
  ville?: string;
  email?: string;
  telephone?: string;
  siteWeb?: string;
  refCentreGestion?: number;
  departement?: string;
}

/** Nom normalisé pour le rapprochement : sans accent, casse ni ponctuation. */
function foldName(raw: string | null | undefined): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function departmentOfPostalCode(cp: string | null | undefined): string {
  const raw = (cp ?? '').replace(/\D/g, '').padStart(5, '0');
  return raw.startsWith('97') || raw.startsWith('98') ? raw.slice(0, 3) : raw.slice(0, 2);
}

/** Téléphone brut « 0491038440 » → « 04 91 03 84 40 ». */
function formatPhone(raw: string | null | undefined): string | null {
  const d = (raw ?? '').replace(/\D/g, '');
  if (d.length !== 10) return raw?.trim() || null;
  return d.match(/.{2}/g)!.join(' ');
}

async function fetchDept(dept: string): Promise<RawPta[]> {
  const res = await fetch(`${ENDPOINT}?dept=${dept}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} pour le département ${dept}`);
  return (await res.json()) as RawPta[];
}

async function main() {
  console.log(`Interrogation de l'annuaire officiel (${DEPARTMENTS.length} départements)…`);

  const byPta = new Map<string, RawPta>();
  const coverage = new Map<string, Set<string>>();
  const failures: string[] = [];

  for (const dept of DEPARTMENTS) {
    try {
      for (const pta of await fetchDept(dept)) {
        if (pta.refCentreGestion === undefined || pta.refCentreGestion === null) continue;
        const key = String(pta.refCentreGestion);
        byPta.set(key, pta);
        if (!coverage.has(key)) coverage.set(key, new Set());
        coverage.get(key)!.add(dept);
      }
    } catch (e) {
      failures.push(`${dept}: ${(e as Error).message}`);
    }
    // L'annuaire est un site WordPress : on ne le martèle pas.
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`  → ${byPta.size} points d'accueil distincts`);
  if (failures.length) console.warn(`  ⚠ ${failures.length} départements en échec : ${failures.slice(0, 5).join(' | ')}`);
  if (byPta.size < 100) {
    throw new Error(
      `Seulement ${byPta.size} points récupérés — l'annuaire a probablement changé de forme. Import interrompu pour ne pas vider le référentiel.`,
    );
  }

  // Réconciliation avec l'existant. Une seule ligne en base portait un n° de PTA
  // (Nice/370) : chercher uniquement par ce numéro créerait 142 doublons de
  // points qui existent déjà sous une autre clé. On rapproche donc en trois
  // passes, de la clé la plus sûre à la plus tolérante.
  const existingRows = await prisma.ageficePointAccueil.findMany();
  const byNumber = new Map(existingRows.filter((r) => r.numberPta).map((r) => [r.numberPta!, r]));
  const byCpName = new Map(existingRows.map((r) => [`${r.postalCode}|${foldName(r.name)}`, r]));
  const byNameDept = new Map(existingRows.map((r) => [`${foldName(r.name)}|${r.department}`, r]));
  const matchedIds = new Set<string>();

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const [numberPta, raw] of byPta) {
    const postalCode = (raw.codePostal ?? '').padStart(5, '0');
    const data = {
      name: (raw.nom ?? '').trim(),
      address1: raw.adresse?.trim() || null,
      address2: raw.adresseDeuxiemeLigne?.trim() || null,
      postalCode,
      city: (raw.ville ?? '').trim(),
      department: departmentOfPostalCode(postalCode),
      departmentsServed: Array.from(coverage.get(numberPta) ?? []).sort(),
      phone: formatPhone(raw.telephone),
      email: raw.email?.trim() || null,
      website: raw.siteWeb?.trim() || null,
      numberPta,
      source: 'agefice.fr-ajax-2026-09',
    };

    const existing =
      byNumber.get(numberPta) ??
      byCpName.get(`${data.postalCode}|${foldName(data.name)}`) ??
      byNameDept.get(`${foldName(data.name)}|${data.department}`) ??
      null;
    if (existing) matchedIds.add(existing.id);

    if (!existing) {
      created++;
      if (APPLY) await prisma.ageficePointAccueil.create({ data });
      continue;
    }
    const changed =
      existing.name !== data.name ||
      existing.email !== data.email ||
      existing.phone !== data.phone ||
      existing.postalCode !== data.postalCode ||
      existing.city !== data.city ||
      JSON.stringify(existing.departmentsServed) !== JSON.stringify(data.departmentsServed);
    if (!changed) {
      unchanged++;
      continue;
    }
    updated++;
    if (APPLY) await prisma.ageficePointAccueil.update({ where: { id: existing.id }, data });
  }

  // Points présents en base mais absents de l'annuaire : signalés, JAMAIS
  // supprimés — ils peuvent être rattachés à des dossiers déjà déposés.
  const orphans = existingRows.filter((k) => !matchedIds.has(k.id));

  console.log(`\n${APPLY ? 'ÉCRIT' : 'SIMULATION'} : ${created} créés · ${updated} mis à jour · ${unchanged} inchangés`);
  console.log(`Points en base absents de l'annuaire officiel : ${orphans.length} (conservés)`);
  for (const o of orphans.slice(0, 12)) console.log(`   – ${o.name} (${o.city}) pta=${o.numberPta ?? '—'}`);
  if (!APPLY) console.log('\nRien n’a été écrit. Relancer avec --apply.');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
