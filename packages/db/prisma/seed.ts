/**
 * Seed minimal — palier 1.
 *
 * Le seed métier (apprenants, entreprises, formateurs, produits, sessions de démo,
 * cas Pascal BIANCO) est géré par le script `apps/web/scripts/import-smartof.ts`
 * qui lit les exports Excel SmartOF.
 *
 * Ce seed crée juste :
 *  - 1 tenant "Start Academy"
 *  - 1 admin (admin@startacademy.fr / admin)
 *  - le référentiel OPCO (AGEFICE, OPCO_EP, ATLAS, CPF…)
 *  - le référentiel des documents Qualiopi par indicateur
 */

import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });

import { PrismaClient, UserRole, OpcoStatus, DocType } from '@prisma/client';
import argon2 from 'argon2';
import { QUALIOPI_DOC_CATALOG, RETIRED_DOC_CATALOG_TYPES } from '../src/qualiopi-doc-catalog';

const prisma = new PrismaClient();

const TENANT_NAME = process.env.TENANT_DEFAULT_NAME ?? 'Start Academy';
const TENANT_SIRET = process.env.TENANT_DEFAULT_SIRET ?? null;
const TENANT_NUM_DA = process.env.TENANT_DEFAULT_NUM_DA ?? null;

async function seedTenantAndAdmin() {
  const existing = await prisma.tenant.findFirst({ where: { name: TENANT_NAME } });
  if (existing) {
    console.log(`✓ tenant "${TENANT_NAME}" déjà présent (id=${existing.id})`);
    return existing;
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: TENANT_NAME,
      siret: TENANT_SIRET,
      numDA: TENANT_NUM_DA,
    },
  });

  const hashedPwd = await argon2.hash('admin');
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: 'admin@startacademy.fr',
      hashedPwd,
      firstName: 'Admin',
      lastName: 'StartAcademy',
      role: UserRole.ADMIN,
    },
  });
  console.log(`✓ tenant "${TENANT_NAME}" créé + admin@startacademy.fr / admin`);
  return tenant;
}

async function seedOpcoCatalog() {
  const opcos = [
    {
      code: 'AGEFICE',
      name: 'AGEFICE',
      type: 'FAF',
      website: 'https://www.agefice.fr',
      averageDelayDays: 60,
      yearlyCapPerPerson: 3000,
      conditions: "Fonds d'assurance formation pour les chefs d'entreprise non-salariés (TNS).",
      requiredDocs: [
        'Formulaire de demande de prise en charge',
        'Convention de formation signée',
        'Programme de formation détaillé',
        'Attestation de présence ou certificat de réalisation',
        'Facture acquittée ou attestation sur l\'honneur',
      ],
      status: OpcoStatus.ACTIVE,
    },
    {
      code: 'OPCO_EP',
      name: 'OPCO EP',
      type: 'OPCO',
      website: 'https://www.opcoep.fr',
      averageDelayDays: 45,
      conditions: "Opérateur de compétences des entreprises de proximité. Couvre l'immobilier, agences et professions libérales.",
      requiredDocs: [
        'Dossier de prise en charge',
        'Convention de formation signée',
        'Programme de formation',
        'Émargements',
        'Évaluations',
        'Attestation de fin de formation',
        'Facture acquittée',
      ],
      status: OpcoStatus.ACTIVE,
    },
    {
      code: 'ATLAS',
      name: 'ATLAS OPCO',
      type: 'OPCO',
      website: 'https://www.opco-atlas.fr',
      averageDelayDays: 30,
      conditions: 'OPCO des services financiers et conseil. Couvre les agences immobilières franchisées.',
      status: OpcoStatus.ACTIVE,
    },
    {
      code: 'CPF',
      name: 'CPF',
      type: 'Autre',
      website: 'https://www.moncompteformation.gouv.fr',
      averageDelayDays: 30,
      conditions: 'Compte Personnel de Formation — financement direct par le bénéficiaire via son compte CPF.',
      requiredDocs: [
        'Inscription via plateforme Mon Compte Formation',
        'Convocation',
        'Émargements',
        'Attestation de fin de formation',
        'Certificat de réalisation (obligatoire)',
      ],
      status: OpcoStatus.ACTIVE,
    },
    {
      code: 'FI-FPL',
      name: 'FI-FPL (Fonds Interprofessionnel de Formation des Professionnels Libéraux)',
      type: 'FAF',
      website: 'https://www.fifpl.fr',
      averageDelayDays: 45,
      yearlyCapPerPerson: 1200,
      conditions: 'Fonds d\'assurance formation pour les professions libérales non-réglementées (architectes, géomètres-experts, conseils en immobilier libéraux non-affiliés AGEFICE…).',
      requiredDocs: [
        'Demande de prise en charge en ligne sur fifpl.fr',
        'Convention/Programme de formation',
        'Attestation de paiement à l\'URSSAF (CFP)',
        'Certificat de réalisation',
      ],
      status: OpcoStatus.ACTIVE,
    },
    {
      code: 'OPCOMMERCE',
      name: 'OPCO Commerce',
      type: 'OPCO',
      website: 'https://www.lopcommerce.com',
      averageDelayDays: 45,
      conditions: 'OPCO des entreprises du commerce — couvre certaines agences immobilières et leurs salariés.',
      status: OpcoStatus.ACTIVE,
    },
  ];

  for (const opco of opcos) {
    await prisma.opcoCatalog.upsert({
      where: { code: opco.code },
      create: opco,
      update: opco,
    });
  }
  console.log(`✓ ${opcos.length} OPCO seedés`);
}

async function seedQualiopiDocCatalog() {
  // Référentiel extrait dans src/qualiopi-doc-catalog.ts (plan 09.3-02) :
  // source unique seed + test de mapping. Les types retirés (jalons OPCO,
  // SATISFACTION fusionné chaud/froid) sont purgés des installs existantes.
  for (const doc of QUALIOPI_DOC_CATALOG) {
    const data = { ...doc, type: doc.type as DocType };
    await prisma.qualiopiDocCatalog.upsert({
      where: { type: data.type },
      create: data,
      update: data,
    });
  }
  const purged = await prisma.qualiopiDocCatalog.deleteMany({
    where: { type: { in: [...RETIRED_DOC_CATALOG_TYPES] as DocType[] } },
  });
  console.log(
    `\u2713 ${QUALIOPI_DOC_CATALOG.length} types de documents Qualiopi seed\u00e9s (${purged.count} type(s) retir\u00e9(s) purg\u00e9(s))`,
  );
}

async function main() {
  await seedTenantAndAdmin();
  await seedOpcoCatalog();
  await seedQualiopiDocCatalog();
}

main()
  .catch((err) => {
    console.error('❌ seed failed', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
