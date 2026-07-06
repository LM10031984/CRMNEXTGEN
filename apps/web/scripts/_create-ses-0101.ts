/**
 * _create-ses-0101.ts — Création idempotente de la session SES-0101 + ses 11
 * participants (INTRA Ashley & Parker), sans génération de docs/pack ni email.
 *
 * Réutilise les conventions canoniques du repo :
 *   - createSessionFull (apps/web/src/server/actions/sessions-create.ts) : forme
 *     TrainingSession (name = "{titre} - {date}"), SessionTrainer LEAD+isPrimary,
 *     SessionParticipant { sponsorOrgId, priceHT, enrollmentStatus }.
 *   - import-smartof.ts : Person (lastName UPPER), LegalLink SALARIE, buildAddress.
 *
 * Idempotent : ré-exécutable sans doublon (upsert par code/email/clés uniques).
 *
 * Run :
 *   cd apps/web && node --import tsx --env-file=../../.env scripts/_create-ses-0101.ts
 *
 * ⚠ NE génère AUCUN document / pack / email / convocation. Création BDD pure.
 */
import { prisma, LinkRole, Modality, Prisma } from '@qualiof/db';
import { buildAddress } from '@qualiof/shared';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';
const PRODUCT_CODE = 'PROD-0058';
const SESSION_CODE = 'SES-0101';
const ORG_ID = 'a506c05c-bee9-4335-ad53-1e5346a2fb27'; // ASHLEY PARKER (SARL) — payeur / enseigne
const TRAINER_ID = 'c93b7e87-f0ff-45b8-b44c-ceca7ad22e9a'; // Jean-Guy Ourmières
const PRICE_HT = 336;

// Dates : journée unique 8h, 27/07/2026. Convention émargement 9h-13h / 14h-18h
// (pas de SessionSlot : norme constatée = 0/20 sessions 1 jour ont des slots).
const START = new Date('2026-07-27T00:00:00.000Z');
const END = new Date('2026-07-27T00:00:00.000Z');

interface P {
  firstName: string;
  lastName: string; // stocké en MAJUSCULES (convention import-smartof)
  email: string | null;
  phone: string;
}

const PARTICIPANTS: P[] = [
  { firstName: 'Gavina', lastName: 'FORLANI', email: 'g.forlani@ashley-parker.fr', phone: '0679499789' },
  { firstName: 'Sophie', lastName: 'LASSELIN', email: 's.lasselin@ashley-parker.fr', phone: '0616299341' },
  { firstName: 'Nicolas', lastName: 'TOURNIAIRE', email: 'n.tourniaire@ashley-parker.fr', phone: '0617144856' },
  { firstName: 'Taylor', lastName: 'BRIVAL', email: 'taylor972m@gmail.com', phone: '0650781396' },
  { firstName: 'Caroline', lastName: 'LECRUBIER', email: 'c.lecrubier@ashley-parker.fr', phone: '0666045645' },
  { firstName: 'Julien', lastName: 'LAUGIER', email: 'julien.laugier4@gmail.com', phone: '0650205339' },
  { firstName: 'Corentin', lastName: 'PASTORINO', email: null, phone: '0699633717' },
  { firstName: 'Don', lastName: 'DUMLAO', email: 'd.dumlaro@ashley-parker.fr', phone: '0621624300' },
  { firstName: 'Stéphane', lastName: 'FERRARI', email: 's.ferrari@ashley-parker.fr', phone: '0659032187' },
  { firstName: 'Vincent', lastName: 'BROSSARD', email: 'v.brossard@ashley-parker.fr', phone: '0676937342' },
  { firstName: 'Jihane', lastName: 'BENSOURI', email: 'j.bensouri@ashley-parker.fr', phone: '0769169736' },
];

/** Trouve un Person existant par email (prioritaire) puis par prénom+NOM. */
async function findExistingPerson(p: P): Promise<{ id: string } | null> {
  if (p.email) {
    const byEmail = await prisma.person.findFirst({
      where: { tenantId: TENANT_ID, email: { equals: p.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (byEmail) return byEmail;
  }
  const byName = await prisma.person.findFirst({
    where: {
      tenantId: TENANT_ID,
      firstName: { equals: p.firstName, mode: 'insensitive' },
      lastName: { equals: p.lastName, mode: 'insensitive' },
    },
    select: { id: true },
  });
  return byName;
}

async function main() {
  console.log('=== Création SES-0101 (idempotent) ===\n');

  const product = await prisma.trainingProduct.findFirst({
    where: { tenantId: TENANT_ID, code: PRODUCT_CODE },
    select: { id: true, title: true, capacityMax: true, priceHT: true },
  });
  if (!product) throw new Error(`Produit ${PRODUCT_CODE} introuvable`);

  const org = await prisma.organization.findUnique({ where: { id: ORG_ID }, select: { id: true, legalName: true } });
  if (!org) throw new Error('Organization ASHLEY PARKER introuvable');

  const trainer = await prisma.person.findUnique({ where: { id: TRAINER_ID }, select: { id: true } });
  if (!trainer) throw new Error('Formateur Jean-Guy Ourmières introuvable');

  // ---- Location (réutilise par nom, sinon crée) ----
  const LOC_NAME = 'Ashley & Parker – Agence Le Port';
  let location = await prisma.location.findFirst({
    where: { tenantId: TENANT_ID, name: { equals: LOC_NAME, mode: 'insensitive' } },
    select: { id: true },
  });
  if (!location) {
    location = await prisma.location.create({
      data: {
        tenantId: TENANT_ID,
        name: LOC_NAME,
        legalName: 'ASHLEY PARKER',
        address: buildAddress({ street: '3 Rue Barla', postalCode: '06300', city: 'NICE' }) as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    console.log(`Location créée : ${LOC_NAME}`);
  } else {
    console.log(`Location réutilisée : ${LOC_NAME}`);
  }

  // ---- Session (upsert par code, code @unique) ----
  const sessionName = `${product.title} - ${START.toLocaleDateString('fr-FR')}`;
  const sessionData = {
    tenantId: TENANT_ID,
    productId: product.id,
    name: sessionName,
    status: 'PLANNED' as const, // "planifiée / en projet"
    startDate: START,
    endDate: END,
    modality: Modality.PRESENTIEL,
    locationId: location.id,
    capacityMax: Math.max(product.capacityMax, PARTICIPANTS.length),
    pricePerLearner: new Prisma.Decimal(PRICE_HT),
  };
  const session = await prisma.trainingSession.upsert({
    where: { code: SESSION_CODE },
    create: { code: SESSION_CODE, ...sessionData },
    update: sessionData,
    select: { id: true },
  });
  console.log(`Session ${SESSION_CODE} : ${session.id}`);

  // ---- Formateur (SessionTrainer LEAD + isPrimary) ----
  await prisma.sessionTrainer.upsert({
    where: { sessionId_personId: { sessionId: session.id, personId: TRAINER_ID } },
    create: { sessionId: session.id, personId: TRAINER_ID, role: 'LEAD', isPrimary: true },
    update: { role: 'LEAD', isPrimary: true },
  });
  console.log('Formateur lié (LEAD/isPrimary) : Jean-Guy Ourmières\n');

  // ---- Participants + LegalLink SALARIE + SessionParticipant ----
  let created = 0;
  let reused = 0;
  for (const p of PARTICIPANTS) {
    const existing = await findExistingPerson(p);
    let personId: string;
    if (existing) {
      personId = existing.id;
      reused++;
      console.log(`  ↺ réutilisé : ${p.firstName} ${p.lastName}`);
    } else {
      const person = await prisma.person.create({
        data: {
          tenantId: TENANT_ID,
          firstName: p.firstName,
          lastName: p.lastName, // déjà en MAJUSCULES
          email: p.email,
          phone: p.phone,
          professionalStatus: 'Salarié',
        },
        select: { id: true },
      });
      personId = person.id;
      created++;
      console.log(`  ✓ créé     : ${p.firstName} ${p.lastName}`);
    }

    // LegalLink salarié → Ashley & Parker (clé unique personId+org+role)
    await prisma.legalLink.upsert({
      where: { personId_organizationId_role: { personId, organizationId: ORG_ID, role: LinkRole.SALARIE } },
      create: { personId, organizationId: ORG_ID, role: LinkRole.SALARIE, function: 'Salarié' },
      update: {},
    });

    // Inscription : chercher un SessionParticipant existant (pas de clé unique
    // sessionId+personId sur le modèle) → find-or-create pour l'idempotence.
    const enrollment = await prisma.sessionParticipant.findFirst({
      where: { sessionId: session.id, personId },
      select: { id: true },
    });
    if (enrollment) {
      await prisma.sessionParticipant.update({
        where: { id: enrollment.id },
        data: {
          sponsorOrgId: ORG_ID,
          priceHT: new Prisma.Decimal(PRICE_HT),
          participantType: 'Salarié',
          financingMode: 'ENTREPRISE', // INTRA : l'entreprise paye directement
        },
      });
    } else {
      await prisma.sessionParticipant.create({
        data: {
          sessionId: session.id,
          personId,
          sponsorOrgId: ORG_ID,
          priceHT: new Prisma.Decimal(PRICE_HT),
          enrollmentStatus: 'PRE_ENROLLED',
          participantType: 'Salarié',
          financingMode: 'ENTREPRISE',
        },
      });
    }
  }

  console.log(`\nParticipants : ${created} créés, ${reused} réutilisés (total ${PARTICIPANTS.length}).`);
  console.log('Aucun document / pack / email généré. ✅');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
