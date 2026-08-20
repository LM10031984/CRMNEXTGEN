/**
 * Script jetable (quick 260817-mm0) — rend un PDF TÉMOIN de la convention
 * entreprise avec les vraies données d'une session, pour relire le rendu à
 * l'œil (annexe à N stagiaires, montant global, date de signature).
 *
 * ⚠ LECTURE SEULE : aucun Document créé, aucune convention individuelle
 * supprimée, aucun upload. Le PDF est écrit en local uniquement.
 *
 *   ORG_ID=<uuid> pnpm exec dotenv -e ../../.env -- tsx scripts/_preview-convention-entreprise.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@qualiof/db';
import { renderConventionHtml, type ConventionData, type ConventionStagiaire } from '../src/lib/convention-template';
import { renderHtmlToPdfWeasy } from '../src/lib/pdf-render';
import { loadOfConfig } from '../src/lib/of-config';
import { subtractBusinessDaysISO } from '../src/lib/business-days';

const ORG_ID = process.env.ORG_ID ?? '';
if (!ORG_ID) {
  console.error('ORG_ID requis');
  process.exit(2);
}

const org = await prisma.organization.findFirst({ where: { id: ORG_ID } });
if (!org) throw new Error('Organisation introuvable');

const participants = await prisma.sessionParticipant.findMany({
  where: { sponsorOrgId: ORG_ID },
  include: {
    person: true,
    session: { include: { product: true, location: true } },
  },
  orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
});
if (participants.length === 0) throw new Error('Aucun participant');

const session = participants[0]!.session;
const productPrice = Number(session.product!.priceHT);
const prixGlobalHT = participants.reduce((s, p) => {
  const pp = Number(p.priceHT);
  return s + (pp > 0 ? pp : productPrice);
}, 0);

const stagiaires: ConventionStagiaire[] = participants.map((p) => ({
  prenom: p.person.firstName,
  nom: p.person.lastName,
  email: p.person.email,
}));

const of = await loadOfConfig(org.tenantId);
const startIso = session.startDate.toISOString().slice(0, 10);
const conventionDate = new Date(subtractBusinessDaysISO(startIso, 15) + 'T00:00:00Z');
const orgAddr = (org.address as Record<string, string> | null) ?? null;

const data: ConventionData = {
  beneficiaireRaisonSociale: org.legalName,
  beneficiaireSiret: org.siret,
  beneficiaireRcsVille: orgAddr?.city ?? null,
  beneficiaireRepresentantNom: org.representative?.trim() || '',
  stagiaires,
  sessionStartDate: session.startDate,
  sessionEndDate: session.endDate,
  conventionDate,
  sessionLieu: session.location?.name ?? of.addressFull,
  produitTitre: session.name ?? session.product!.title,
  produitDureeHeures: session.product!.durationHours,
  produitObjectifs: (session.product!.objectives as string[] | null) ?? [],
  produitProgrammeMd: typeof session.product!.programMd === 'string' ? session.product!.programMd : '',
  produitTrainerProfile: session.product!.trainerProfile,
  produitPriceHTPerStagiaire: productPrice,
  prixGlobalHT,
  tenantId: org.tenantId,
};

const pdf = await renderHtmlToPdfWeasy(renderConventionHtml(data, of));
const outDir = path.resolve(process.cwd(), '../../.preview-facture');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `convention-${org.legalName.replace(/\W+/g, '-').toLowerCase()}.pdf`);
fs.writeFileSync(out, pdf);

console.log(`✓ ${out} (${Math.round(pdf.length / 1024)} Ko)`);
console.log(`  ${stagiaires.length} stagiaires · total ${prixGlobalHT.toFixed(2)} € HT · signature ${conventionDate.toISOString().slice(0, 10)}`);
await prisma.$disconnect();
