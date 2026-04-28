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
  const docs: Array<{
    type: DocType;
    name: string;
    phase: string;
    qualiopiIndicator: string | null;
    isMandatory: boolean;
    description: string | null;
    recommendedDelay: string | null;
    responsible: string | null;
  }> = [
    { type: DocType.CONVENTION, name: 'Convention de formation', phase: 'Pré-formation', qualiopiIndicator: 'Indicateur 7', isMandatory: true, description: "Convention signée entre l'organisme, l'apprenant et l'OPCO", recommendedDelay: 'Avant le début de la formation', responsible: 'OF' },
    { type: DocType.PRE_ACCORD_OPCO, name: 'Pré-accord OPCO', phase: 'Pré-formation', qualiopiIndicator: 'Indicateur 7', isMandatory: false, description: 'Accord préalable de financement de l\'OPCO', recommendedDelay: 'Avant le début de la formation', responsible: 'OPCO' },
    { type: DocType.PROGRAMME, name: 'Programme de formation', phase: 'Pré-formation', qualiopiIndicator: 'Indicateur 9', isMandatory: true, description: "Programme détaillé remis à l'apprenant avant la formation", recommendedDelay: 'Avant le début de la formation', responsible: 'OF' },
    { type: DocType.CONVOCATION, name: 'Convocation', phase: 'Pré-formation', qualiopiIndicator: null, isMandatory: false, description: 'Convocation à la formation envoyée à l\'apprenant', recommendedDelay: 'J-15 minimum', responsible: 'OF' },
    { type: DocType.EMARGEMENT, name: "Feuille d'émargement", phase: 'Formation', qualiopiIndicator: 'Indicateur 12', isMandatory: true, description: "Feuille signée par l'apprenant pour chaque demi-journée de formation", recommendedDelay: 'À chaque demi-journée de formation', responsible: 'Formateur' },
    { type: DocType.SUPPORT_PEDAGOGIQUE, name: 'Supports pédagogiques', phase: 'Formation', qualiopiIndicator: 'Indicateur 9', isMandatory: true, description: 'Supports de formation remis pendant ou après la formation', recommendedDelay: 'Pendant ou à la fin de la formation', responsible: 'Formateur' },
    { type: DocType.CERTIFICAT_REALISATION, name: 'Certificat de réalisation', phase: 'Formation', qualiopiIndicator: 'Légal Art. L6353-1', isMandatory: true, description: "Certificat obligatoire remis à l'apprenant à la fin de la formation (Art. L6353-1)", recommendedDelay: 'À la fin de la formation', responsible: 'OF' },
    { type: DocType.ASSIDUITE, name: "Feuille d'assiduité", phase: 'Post-formation', qualiopiIndicator: 'Indicateur 12', isMandatory: true, description: "Récapitulatif de présence de l'apprenant", recommendedDelay: 'À la fin de la formation', responsible: 'OF' },
    { type: DocType.EVALUATION_ACQUIS, name: 'Évaluation des acquis', phase: 'Post-formation', qualiopiIndicator: 'Indicateur 11', isMandatory: true, description: "Évaluation des compétences acquises par l'apprenant", recommendedDelay: 'À la fin de la formation', responsible: 'Formateur' },
    { type: DocType.ATTESTATION_FIN, name: 'Attestation de fin de formation', phase: 'Post-formation', qualiopiIndicator: 'Indicateur 11', isMandatory: false, description: 'Attestation complémentaire au certificat de réalisation', recommendedDelay: 'À la fin de la formation', responsible: 'OF' },
    { type: DocType.SATISFACTION, name: 'Questionnaire de satisfaction', phase: 'Post-formation', qualiopiIndicator: 'Indicateur 30', isMandatory: true, description: "Évaluation de la satisfaction de l'apprenant", recommendedDelay: "À la fin de la formation (dans les 15 jours)", responsible: 'OF' },
    { type: DocType.VALIDATION_OPCO, name: 'Validation OPCO', phase: 'Administratif', qualiopiIndicator: null, isMandatory: false, description: 'Document de validation du dossier par l\'OPCO', recommendedDelay: 'Après envoi du dossier complet', responsible: 'OPCO' },
    { type: DocType.FACTURE, name: 'Facture formation', phase: 'Administratif', qualiopiIndicator: 'Légal', isMandatory: true, description: "Facture de formation envoyée à l'apprenant ou l'OPCO", recommendedDelay: 'À la fin de la formation', responsible: 'OF' },
    { type: DocType.AGEFICE, name: 'Demande de prise en charge AGEFICE', phase: 'Pré-formation', qualiopiIndicator: 'Indicateur 7', isMandatory: false, description: 'Formulaire AGEFICE pré-rempli pour les apprenants en EI/auto-entreprise éligibles', recommendedDelay: 'Avant le début de la formation', responsible: 'OF' },
  ];

  for (const doc of docs) {
    await prisma.qualiopiDocCatalog.upsert({
      where: { type: doc.type },
      create: doc,
      update: doc,
    });
  }
  console.log(`✓ ${docs.length} types de documents Qualiopi seedés`);
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
