// Backfill du code APE/NAF manquant sur les EI (auto-entreprises) qui ONT un
// SIRET, via l'API gouv gratuite recherche-entreprises.api.gouv.fr.
// DRY par défaut ; WRITE=1 pour écrire.
import { prisma } from '@qualiof/db';

const WRITE = process.env.WRITE === '1';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const normApe = (s: string | null | undefined) => (s ? s.replace(/[^0-9A-Za-z]/g, '').toUpperCase() : null);

const eis = await prisma.organization.findMany({
  where: { legalLinks: { some: { role: 'EI_SELF' } }, siret: { not: null }, naf: null },
  select: { id: true, legalName: true, siret: true },
});

console.log(`◆ ${WRITE ? 'WRITE' : 'DRY-RUN'} — ${eis.length} EI avec SIRET et sans APE\n`);
let ok = 0, skip = 0, miss = 0;
for (const o of eis) {
  const siret = (o.siret ?? '').replace(/\s/g, '');
  if (!/^\d{14}$/.test(siret)) { console.log(`  ⤬ ${o.legalName}\tSIRET invalide "${o.siret}" → à faire manuellement`); skip++; continue; }
  const siren = siret.slice(0, 9);
  try {
    const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${siren}&per_page=1`);
    const j: any = await res.json();
    const r = j?.results?.[0];
    const ape = normApe(r?.siege?.activite_principale ?? r?.activite_principale);
    if (r?.siren === siren && ape) {
      console.log(`  ✓ ${o.legalName}\tSIRET ${siret}\t→ APE ${ape}\t(${r?.nom_complet ?? ''})`);
      if (WRITE) await prisma.organization.update({ where: { id: o.id }, data: { naf: ape } });
      ok++;
    } else {
      console.log(`  ? ${o.legalName}\tSIRET ${siret}\t→ APE non trouvé (SIREN ${siren}) → manuel`);
      miss++;
    }
  } catch (e: any) { console.log(`  ! ${o.legalName}\terreur API: ${e?.message}`); miss++; }
  await sleep(180);
}
console.log(`\n${WRITE ? 'Écrits' : 'À écrire'} : ${ok} · SIRET invalide : ${skip} · non trouvés : ${miss}`);
process.exit(0);
