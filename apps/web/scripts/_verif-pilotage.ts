/** Vérification des nouveaux blocs de pilotage contre la base réelle. */
import { getPilotageData } from '../src/lib/pilotage-stats';
import { objectifADate, partAnnuelleEcoulee, pctObjectifADate, projectionAuRythme, repartitionUtilisee } from '../src/lib/pilotage/objectif-rythme';
import { assembleFlux, getFactureMensuel, getEncaisseMensuel, getDelaiParFinanceur } from '../src/lib/pilotage/flux-financiers';
import { getAxesPilotage } from '../src/lib/pilotage/axes';
import { getAnomaliesPilotage } from '../src/lib/pilotage/anomalies';
const { prisma } = await import('@qualiof/db');
const eur = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const t = (await prisma.tenant.findFirst({ select: { id: true } }))!.id;
const Y = 2026;

const data = await getPilotageData(t, Y);
const now = new Date();
const rep = repartitionUtilisee(data.objectifMensuel, data.objectifAnnuel);
const objDu = objectifADate(rep.mensuel, now);
const part = partAnnuelleEcoulee(rep.mensuel, now);
console.log('══ Objectif au rythme');
console.log(`  objectif annuel     ${eur(data.objectifAnnuel)}`);
console.log(`  objectif à date     ${eur(objDu)}  (${part !== null ? Math.round(part * 100) : '—'} % de l'année, saisonnalité comprise)`);
console.log(`  réalisé YTD         ${eur(data.kpis.caRealiseYTD)}`);
console.log(`  au rythme           ${pctObjectifADate(data.kpis.caRealiseYTD, objDu)} %`);
console.log(`  projection rythme   ${eur(projectionAuRythme(data.kpis.caRealiseYTD, part) ?? 0)}`);
console.log(`  atterrissage carnet ${eur(data.kpis.atterrissageEstime)}`);
console.log(`  répartition utilisée : ${rep.source} → ${rep.mensuel.map((v) => Math.round(v / 1000) + 'k').join(' ')}`);
console.log(`  (saisonnalité brute  : ${data.objectifMensuel.map((v) => Math.round(v / 1000) + 'k').join(' ')})`);

const [fact, enc, delais] = await Promise.all([getFactureMensuel(t, Y), getEncaisseMensuel(t, Y), getDelaiParFinanceur(t, Y)]);
const flux = assembleFlux({ vendu: data.realiseMonthly.map((v, i) => v + (data.previsionnelMonthly[i] ?? 0)), facture: fact, encaisse: enc });
console.log('\n══ Vendu / Facturé / Encaissé');
console.log(`  vendu ${eur(flux.totalVendu)} · facturé ${eur(flux.totalFacture)} · encaissé ${eur(flux.totalEncaisse)}`);
console.log(`  reste à facturer ${eur(flux.resteAFacturer)} · reste à encaisser ${eur(flux.resteAEncaisser)}`);
console.log(`  délais : ${delais.map((d) => `${d.financeur} ${d.delaiMoyen} j (${d.paiements})`).join(' · ') || '—'}`);

const axes = await getAxesPilotage(t, Y);
console.log('\n══ Axes');
console.log(`  produits   : ${axes.parProduit.slice(0, 3).map((l) => `${l.libelle.slice(0, 28)} ${eur(l.ca)} (${l.part}%)`).join(' | ')}`);
console.log(`  financeurs : ${axes.parFinanceur.map((l) => `${l.libelle} ${eur(l.ca)} (${l.part}%)`).join(' | ')}`);
console.log(`  formateurs : ${axes.parFormateur.map((l) => `${l.libelle} ${eur(l.ca)}`).join(' | ')}`);
console.log(`  top 3 clients = ${axes.partTop3Clients} % · remplissage moyen ${axes.remplissageMoyen} % · panier moyen ${eur(axes.panierMoyenParInscrit ?? 0)}`);
console.log(`  entonnoir : pré-inscrits ${axes.entonnoir.preInscrits.n}/${eur(axes.entonnoir.preInscrits.ca)} · confirmés ${axes.entonnoir.confirmes.n}/${eur(axes.entonnoir.confirmes.ca)} · présents ${axes.entonnoir.presents.n}/${eur(axes.entonnoir.presents.ca)}`);
console.log(`  ⚠ pré-inscrits sur sessions terminées : ${axes.entonnoir.preInscritsSurSessionsTerminees.n} · ${eur(axes.entonnoir.preInscritsSurSessionsTerminees.ca)}`);

const anos = await getAnomaliesPilotage(t, Y);
console.log('\n══ À corriger');
for (const f of anos) {
  console.log(`  ${f.titre} — ${eur(f.montant)} (${f.lignes.length} sessions)`);
  for (const l of f.lignes.slice(0, 3)) console.log(`      ${l.code} · ${l.detail} · ${eur(l.montant)}`);
}
// Cohérence : le vendu doit valoir l'atterrissage du carnet
console.log(`\nContrôle : vendu (${eur(flux.totalVendu)}) == atterrissage (${eur(data.kpis.atterrissageEstime)}) → ${flux.totalVendu === data.kpis.atterrissageEstime ? '✅' : '❌'}`);
await prisma.$disconnect();
