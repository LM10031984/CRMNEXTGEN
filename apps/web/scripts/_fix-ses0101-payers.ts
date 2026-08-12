/**
 * _fix-ses0101-payers.ts — SES-0101 : payeur = l'EI de chacun (quick 2026-08-12, Volet 1).
 *
 * Décision Laurent (brief 12/08) : « chacun payeur de lui-même (EI individuelles) ».
 * État base AVANT : sponsorOrgId = ASHLEY PARKER ×11 (vestige du create initial) ;
 * chaque personne possède déjà son EI (LegalLink EI_SELF — fix ei-agent-commercial,
 * 7 enrichies par la sync SmartOF 12/08, 4 créées vides).
 *
 * Pour chaque participant :
 *  1. sponsorOrgId → Organization du LegalLink EI_SELF (payeur = sa propre EI).
 *  2. EI sans adresse → copie de Person.personalAddress (l'EI d'un agent
 *     commercial est domiciliée chez lui). Cas FORLANI : ville/CP décalés dans
 *     la source (“city: 06300”) → normalisé 70 Bd Carnot, 06300 NICE.
 *  3. EI sans email → copie de Person.email (Rule 2 : payeur sans email =
 *     relances facture mortes, leçon FAC-000007/Imagimmo).
 *  NB : financingMode (ENTREPRISE) volontairement NON touché — hors brief,
 *  signalé au rapport pour arbitrage Laurent (AUTOFINANCEMENT/AGEFICE).
 *
 * Run : DRY  : cd apps/web && node --import tsx --env-file=../../.env scripts/_fix-ses0101-payers.ts
 *       WRITE: ... WRITE=1 node --import tsx ... scripts/_fix-ses0101-payers.ts
 */
import { prisma, Prisma } from '@qualiof/db';

const WRITE = process.env.WRITE === '1';

const ADDRESS_FIXES: Record<string, { street: string; postalCode: string; city: string; country: string }> = {
  // personalAddress FORLANI : {"city":"06300","street":"70 BD CARNOT"} — CP dans city, ville absente.
  FORLANI: { street: '70 Bd Carnot', postalCode: '06300', city: 'NICE', country: 'France' },
};

async function main() {
  console.log(`=== SES-0101 payeurs → EI perso — mode ${WRITE ? 'WRITE' : 'DRY'} ===\n`);
  const session = await prisma.trainingSession.findFirst({
    where: { code: 'SES-0101' },
    include: {
      participants: {
        include: {
          person: { include: { legalLinks: { include: { organization: true } } } },
          sponsorOrg: { select: { id: true, legalName: true } },
        },
        orderBy: { person: { lastName: 'asc' } },
      },
    },
  });
  if (!session) throw new Error('SES-0101 introuvable');
  if (session.participants.length !== 11) throw new Error('Effectif ≠ 11');

  for (const p of session.participants) {
    const person = p.person;
    const ei = person.legalLinks.find((l) => l.role === 'EI_SELF')?.organization;
    if (!ei) throw new Error(`${person.firstName} ${person.lastName} : aucune EI_SELF`);

    const needsAddr = !ei.address;
    const needsEmail = !ei.email && !!person.email;
    const addrSource =
      ADDRESS_FIXES[person.lastName.toUpperCase()] ??
      (person.personalAddress as Record<string, string> | null);
    if (needsAddr && !addrSource) throw new Error(`${person.lastName} : EI sans adresse et personalAddress vide`);

    console.log(
      `${(person.firstName + ' ' + person.lastName).padEnd(24)} | ${p.sponsorOrg.legalName.padEnd(14)} → ${ei.legalName.padEnd(22)} | siret=${(ei.siret ?? 'VIDE').padEnd(14)} | ${needsAddr ? `+addr(${addrSource!.street})` : 'addr ok'} | ${needsEmail ? `+email(${person.email})` : ei.email ? 'email ok' : 'email ∅'}`,
    );

    if (!WRITE) continue;
    await prisma.sessionParticipant.update({
      where: { id: p.id },
      data: { sponsorOrgId: ei.id },
    });
    const orgData: Prisma.OrganizationUpdateInput = {};
    if (needsAddr) orgData.address = addrSource as Prisma.InputJsonValue;
    if (needsEmail) orgData.email = person.email;
    if (Object.keys(orgData).length > 0) {
      await prisma.organization.update({ where: { id: ei.id }, data: orgData });
    }
  }

  if (WRITE) {
    const check = await prisma.sessionParticipant.findMany({
      where: { sessionId: session.id },
      include: { sponsorOrg: { select: { legalName: true, address: true } }, person: true },
    });
    const bad = check.filter(
      (p) =>
        p.sponsorOrg.legalName.toUpperCase().includes('ASHLEY') ||
        !p.sponsorOrg.address ||
        !p.sponsorOrg.legalName.toUpperCase().includes(p.person.lastName.toUpperCase().split('-')[0]!.slice(0, 4)),
    );
    console.log(`\nContrôle : ${check.length} participants, payeur=EI perso avec adresse : ${check.length - bad.length}/11`);
    if (bad.length > 0) throw new Error(`Contrôle KO : ${bad.map((b) => b.person.lastName).join(', ')}`);
    console.log('✅ Bascule payeurs OK');
  } else {
    console.log('\nDRY terminé — WRITE=1 pour appliquer. Aucune écriture. ✅');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
