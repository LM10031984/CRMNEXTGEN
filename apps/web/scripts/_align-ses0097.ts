/**
 * Aligne QualiOF sur SmartOF pour SES-0097 (auto-entrepreneurs Century 21 Mandelieu).
 *  - crée 2 personnes (+ n° SS en SensitiveData) + leurs 2 auto-entreprises (sponsor, AGEFICE)
 *    + l'enseigne Century 21 Mandelieu + LegalLinks (EI_SELF + AGENT_COMMERCIAL)
 *  - fixe le lieu (495 av. de Cannes, Mandelieu) sur la session
 *  - ajoute 2 SessionParticipant (auto-payeurs, 3024€, PRE_ENROLLED, financement AGEFICE/OPCO)
 *  - retire la participation de Sophie Lasselin (vieux brouillon)
 * Idempotent (find-or-create par email / legalName). DRY par défaut, WRITE=1 pour persister.
 */
const { prisma } = await import('@qualiof/db');

const TENANT = 'db191440-a144-48d1-93c1-767e6f647f2c';
const SESSION_ID = '12e35d67-ca6a-409a-ada4-b0cd33088fae';
const PRICE = 3024;
const REQ_DATE = new Date('2026-06-24');
const SOPHIE_PART_ID = '8360e368-5b7b-40f6-9a13-9225d83a1914';
const WRITE = process.env.WRITE === '1';

const LEARNERS = [
  {
    civility: 'Monsieur', firstName: 'Jérémy', lastName: 'TOUATI',
    birthDate: new Date('1990-11-12'), email: 'jeremy.touati@century21.fr', phone: '0647588898',
    personalAddress: { street: '16 rue du sanglier', postalCode: '06590', city: 'Théoule-sur-Mer' },
    educationLevel: 'Bac+2 : BTS-DUT-DEUG', professionalExperience: 'Entre 4 et 10 ans',
    ss: '1901106029078',
  },
  {
    civility: 'Madame', firstName: 'Karine', lastName: 'COMMISSAIRE',
    birthDate: new Date('1969-10-04'), email: 'karine.commissaire@century21.fr', phone: '0622991303',
    personalAddress: { street: '549 boulevard de la tavernière', postalCode: '06210', city: 'Mandelieu' },
    educationLevel: 'Bac+2 : BTS-DUT-DEUG', professionalExperience: 'Plus de 10 ans',
    ss: '2691069387022',
  },
];

const ENSEIGNE_ADDR = { street: '495 avenue de Cannes', postalCode: '06210', city: 'Mandelieu-la-Napoule' };

async function findOrCreatePerson(l: typeof LEARNERS[number]) {
  const existing = await prisma.person.findFirst({ where: { email: l.email } });
  if (existing) return { id: existing.id, created: false };
  if (!WRITE) return { id: '(dry)', created: true };
  const p = await prisma.person.create({
    data: {
      tenantId: TENANT, civility: l.civility, firstName: l.firstName, lastName: l.lastName,
      birthDate: l.birthDate, email: l.email, phone: l.phone, personalAddress: l.personalAddress,
      educationLevel: l.educationLevel, professionalExperience: l.professionalExperience,
      professionalStatus: 'Agent commercial',
      requiresCleanup: true,
      cleanupNotes: 'Statut BPF à confirmer : SmartOF=F.1.a (salarié) mais Laurent=auto-entrepreneur. SIREN EI à compléter.',
      sensitiveData: { create: { socialSecurityNb: l.ss } },
    },
  });
  return { id: p.id, created: true };
}

async function findOrCreateOrg(legalName: string, data: any) {
  const existing = await prisma.organization.findFirst({ where: { tenantId: TENANT, legalName } });
  if (existing) return { id: existing.id, created: false };
  if (!WRITE) return { id: '(dry)', created: true };
  const o = await prisma.organization.create({ data: { tenantId: TENANT, legalName, ...data } });
  return { id: o.id, created: true };
}

async function ensureLink(personId: string, organizationId: string, role: string, fn: string, isPrimary: boolean) {
  if (!WRITE || personId === '(dry)' || organizationId === '(dry)') return;
  const ex = await prisma.legalLink.findFirst({ where: { personId, organizationId, role: role as never } });
  if (ex) return;
  await prisma.legalLink.create({ data: { personId, organizationId, role: role as never, function: fn, isPrimary, startDate: new Date() } });
}

// Enseigne Century 21 Mandelieu
const enseigne = await findOrCreateOrg('CENTURY 21 MANDELIEU', {
  legalForm: 'AUTRE', brandName: 'Century 21', network: 'Century 21', type: 'Partenaire',
  address: ENSEIGNE_ADDR, requiresCleanup: true, cleanupNotes: 'SIREN + forme juridique à compléter (franchise Century 21).',
});
console.log(`Enseigne Century 21 Mandelieu : ${enseigne.created ? 'CRÉÉE' : 'existante'} (${enseigne.id})`);

// Lieu
let locationId: string;
const existingLoc = await prisma.location.findFirst({ where: { tenantId: TENANT, name: 'Century 21 Mandelieu — 495 av. de Cannes' } });
if (existingLoc) locationId = existingLoc.id;
else if (WRITE) locationId = (await prisma.location.create({ data: { tenantId: TENANT, name: 'Century 21 Mandelieu — 495 av. de Cannes', address: ENSEIGNE_ADDR } })).id;
else locationId = '(dry)';
console.log(`Lieu Mandelieu : ${existingLoc ? 'existant' : 'CRÉÉ'} (${locationId})`);

for (const l of LEARNERS) {
  const person = await findOrCreatePerson(l);
  const ei = await findOrCreateOrg(`${l.firstName} ${l.lastName}`, {
    legalForm: 'AUTO_ENTREPRENEUR', opcoCode: 'AGEFICE', type: 'Client', address: l.personalAddress,
  });
  await ensureLink(person.id, ei.id, 'EI_SELF', 'Auto-entrepreneur', true);
  await ensureLink(person.id, enseigne.id, 'AGENT_COMMERCIAL', 'Agent commercial', false);

  // Participant (sponsor = sa propre EI → auto-payeur ; financement AGEFICE/OPCO)
  if (WRITE) {
    const already = await prisma.sessionParticipant.findFirst({ where: { sessionId: SESSION_ID, personId: person.id } });
    if (!already) {
      await prisma.sessionParticipant.create({
        data: {
          sessionId: SESSION_ID, personId: person.id, sponsorOrgId: ei.id,
          priceHT: PRICE, enrollmentStatus: 'PRE_ENROLLED', participantType: 'EI',
          financingMode: 'OPCO', financingStatus: 'REQUESTED', financingRequestDate: REQ_DATE,
        },
      });
    }
  }
  console.log(`  ${l.firstName} ${l.lastName} : person=${person.created?'CRÉÉE':'existante'} | EI=${ei.created?'CRÉÉE':'existante'} | inscrit ${WRITE?'OK':'(dry)'}`);
}

// Lieu sur la session
if (WRITE && locationId !== '(dry)') {
  await prisma.trainingSession.update({ where: { id: SESSION_ID }, data: { locationId } });
}

// Retrait Sophie Lasselin
if (WRITE) {
  const del = await prisma.sessionParticipant.deleteMany({ where: { id: SOPHIE_PART_ID, sessionId: SESSION_ID } });
  console.log(`Sophie Lasselin : participation retirée (${del.count})`);
} else {
  console.log('Sophie Lasselin : participation à retirer (dry)');
}

console.log(WRITE ? '\n✓ Alignement persisté.' : '\n(DRY — ajoute WRITE=1)');
await prisma.$disconnect();
