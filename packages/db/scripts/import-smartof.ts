/**
 * Importeur SmartOF → QualiOF (Postgres local).
 *
 * Source : 4 fichiers Excel exportés depuis SmartOF (dossier parent du repo).
 *   - Export des apprenants (237 personnes + 250 rattachements)
 *   - Export des entreprises (199 organisations dont 175 avec PA AGEFICE)
 *   - Export des formateurs (5)
 *   - Export des produits de formation (27)
 *
 * Stratégie :
 *   1. Idempotent : on peut relancer sans créer de doublons (clés naturelles SIRET / email).
 *   2. Trace via ExternalIdentity (source = "smartof", externalId = UID SmartOF).
 *   3. Détection cas EI : si l'organisation rattachée porte le nom de l'apprenant, on crée
 *      un LegalLink avec rôle EI_SELF. Sinon on tente DIRIGEANT/SALARIE.
 *   4. Marquage qualité : SIRET malformé / email manquant → requiresCleanup=true.
 *
 * Lancement :
 *   pnpm --filter @qualiof/db exec tsx scripts/import-smartof.ts
 */

import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { config as loadEnv } from 'dotenv';

// Charge .env depuis la racine du mono-repo (deux niveaux au-dessus de packages/db)
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });

import * as XLSX from 'xlsx';
import {
  PrismaClient,
  LegalForm,
  LinkRole,
  Modality,
  Prisma,
} from '@prisma/client';
import {
  cleanSiret,
  isValidSiret,
  sirenFromSiret,
  detectOpco,
  mapLegalForm,
  mapModality,
  buildAddress,
  organizationLooksLikePerson,
  normalizeName,
  normalizeEmail,
} from '@qualiof/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Le repo est dans `<workspace>/CRM Next gen/files/`. Les exports Excel sont dans `<workspace>/CRM Next gen/`.
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FILES = {
  apprenants: path.join(ROOT, 'Export des apprenants SmartOF - 27_04_2026.xlsx'),
  entreprises: path.join(ROOT, 'Export des entreprises SmartOF - 27_04_2026.xlsx'),
  formateurs: path.join(ROOT, 'Export des formateurs SmartOF - 27_04_2026.xlsx'),
  produits: path.join(ROOT, 'Export des produits de formation SmartOF - 27_04_2026.xlsx'),
};

const prisma = new PrismaClient();

// ---------- Utilities ----------

interface SmartRow {
  [key: string]: string | number | boolean | undefined | null;
}

function loadWorkbook(filePath: string): XLSX.WorkBook {
  // SheetJS via CDN restreint readFile : on passe par fs.readFileSync + XLSX.read.
  const buf = fs.readFileSync(filePath);
  return XLSX.read(buf, { type: 'buffer', cellDates: true });
}

function readSheet(filePath: string, sheetName?: string): SmartRow[] {
  const wb = loadWorkbook(filePath);
  const target = sheetName ?? wb.SheetNames[0]!;
  const sheet = wb.Sheets[target];
  if (!sheet) throw new Error(`Feuille introuvable : ${target} dans ${filePath}`);
  return XLSX.utils.sheet_to_json<SmartRow>(sheet, { defval: null, raw: false });
}

function readSheetByIndex(filePath: string, idx: number): SmartRow[] {
  const wb = loadWorkbook(filePath);
  const name = wb.SheetNames[idx];
  if (!name) throw new Error(`Feuille index ${idx} introuvable dans ${filePath}`);
  return XLSX.utils.sheet_to_json<SmartRow>(wb.Sheets[name]!, { defval: null, raw: false });
}

function s(v: SmartRow[string]): string | null {
  if (v === null || v === undefined) return null;
  const str = String(v).trim();
  return str.length > 0 ? str : null;
}

function parseDateFr(v: SmartRow[string]): Date | null {
  const str = s(v);
  if (!str) return null;
  // Format SmartOF : DD/MM/YYYY
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`);
  // Format ISO ou autre
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// ---------- Tenant ----------

async function getTenantId(): Promise<string> {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    throw new Error("Aucun tenant trouvé. Lance d'abord `pnpm db:seed`.");
  }
  return tenant.id;
}

// ---------- Import entreprises ----------

interface OrgImportResult {
  orgsByUid: Map<string, string>; // UID SmartOF → id Prisma
  orgsBySiret: Map<string, string>; // SIRET clean → id Prisma
}

async function importOrganizations(tenantId: string): Promise<OrgImportResult> {
  const rows = readSheet(FILES.entreprises);
  console.log(`\n📦 Entreprises : ${rows.length} lignes à importer`);

  const orgsByUid = new Map<string, string>();
  const orgsBySiret = new Map<string, string>();
  let created = 0;
  let updated = 0;
  let cleanupCount = 0;

  // Récupère les OPCO pré-seedés
  const opcoCatalog = await prisma.opcoCatalog.findMany();
  const opcoByCode = new Map(opcoCatalog.map((o) => [o.code, o.id] as const));

  for (const row of rows) {
    const uid = s(row['UID']);
    if (!uid) continue;
    if (s(row['Archivé']) === 'Oui') continue;

    const legalName = s(row['Nom']);
    if (!legalName) continue;

    const rawSiret = s(row['SIRET']);
    const cleanedSiret = cleanSiret(rawSiret ?? '');
    const siretValid = isValidSiret(cleanedSiret);
    const requiresCleanup = !!rawSiret && !siretValid;
    if (requiresCleanup) cleanupCount++;

    const legalFormStr = s(row['Forme juridique']);
    const legalForm: LegalForm = mapLegalForm(legalFormStr);
    const opcoCode = detectOpco(s(row['PA AGEFICE']) || s(row['Provenance des produits BPF par défaut']));
    const opcoCatalogId = opcoCode ? opcoByCode.get(opcoCode) ?? null : null;

    const address = buildAddress({
      street: s(row['Rue']) ?? undefined,
      street2: s(row["Complément d'adresse"]) ?? undefined,
      postalCode: s(row['Code postal']) ?? undefined,
      city: s(row['Ville']) ?? undefined,
    });

    const data = {
      tenantId,
      legalName,
      legalForm,
      siret: siretValid ? cleanedSiret : null,
      siren: siretValid ? sirenFromSiret(cleanedSiret) : null,
      naf: s(row['Code APE (NAF)']),
      address: address as Prisma.InputJsonValue,
      phone: s(row['Numéro de téléphone']),
      email: s(row['E-mail']),
      emailBilling: s(row['Adresse facturation - Raison sociale']) ? null : null,
      opcoCode,
      opcoCatalogId,
      brandName: s(row['Custom ID']),
      representative: s(row['Nom du représentant']),
      activityDescription: s(row['Activité principale exercée']),
      rcs: s(row['RCS (ville)']),
      type: s(row['Type']),
      requiresCleanup,
      cleanupNotes: requiresCleanup ? `SIRET non valide à l'import : "${rawSiret}"` : null,
    };

    // Idempotence par ExternalIdentity (source=smartof)
    const existing = await prisma.externalIdentity.findUnique({
      where: { source_externalId: { source: 'smartof', externalId: uid } },
    });

    let orgId: string;
    if (existing) {
      const updatedOrg = await prisma.organization.update({
        where: { id: existing.entityId },
        data,
      });
      orgId = updatedOrg.id;
      updated++;
    } else {
      const newOrg = await prisma.organization.create({ data });
      orgId = newOrg.id;
      await prisma.externalIdentity.create({
        data: { tenantId, entityType: 'Organization', entityId: orgId, source: 'smartof', externalId: uid },
      });
      created++;
    }

    orgsByUid.set(uid, orgId);
    if (siretValid) orgsBySiret.set(cleanedSiret, orgId);

    // AGEFICE Profile (si PA AGEFICE rempli)
    const paName = s(row['PA AGEFICE']);
    if (paName) {
      const paFields = {
        // Champs du PDF AGEFICE qu'on peut déjà pré-remplir depuis l'Excel
        "Nom du PTA": paName,
        "Interlocuteur PTA": s(row["[PA AGEFICE] Nom de l'interlocuteur PA"]) ?? '',
        "N° de PTA": s(row['[PA AGEFICE] Numéro du PA']) ?? '',
        "Nom / Raison Sociale de L'entreprise (Entreprise)": legalName,
        "Code APE - NAF (Entreprise)": s(row['Code APE (NAF)']) ?? '',
        "N° SIRET (Entreprise)": cleanedSiret,
        "Activité Professionnelle (Entreprise)": s(row['Activité principale exercée']) ?? '',
        "Adresse Entreprise": s(row['Rue']) ?? '',
        "Code Postal (Entreprise)": s(row['Code postal']) ?? '',
        "Ville (Entreprise)": s(row['Ville']) ?? '',
      };
      await prisma.ageficeProfile.upsert({
        where: { organizationId: orgId },
        create: {
          organizationId: orgId,
          paName,
          paNumber: s(row['[PA AGEFICE] Numéro du PA']),
          paContact: s(row["[PA AGEFICE] Nom de l'interlocuteur PA"]),
          paFields: paFields as Prisma.InputJsonValue,
        },
        update: {
          paName,
          paNumber: s(row['[PA AGEFICE] Numéro du PA']),
          paContact: s(row["[PA AGEFICE] Nom de l'interlocuteur PA"]),
          paFields: paFields as Prisma.InputJsonValue,
        },
      });
    }
  }
  console.log(`   ✓ ${created} créées, ${updated} mises à jour, ${cleanupCount} avec SIRET malformé (requiresCleanup=true)`);
  return { orgsByUid, orgsBySiret };
}

// ---------- Import apprenants ----------

interface PersonImportResult {
  personsByUid: Map<string, string>;
  emailMissingCount: number;
}

async function importPersons(tenantId: string): Promise<PersonImportResult> {
  const rows = readSheetByIndex(FILES.apprenants, 0); // "Tous les apprenants"
  console.log(`\n👤 Apprenants : ${rows.length} lignes à importer`);

  const personsByUid = new Map<string, string>();
  let created = 0;
  let updated = 0;
  let emailMissingCount = 0;
  let cleanupCount = 0;

  for (const row of rows) {
    const uid = s(row['UID']);
    if (!uid) continue;
    if (s(row['Archivé']) === 'Oui') continue;

    const firstName = s(row['Prénom']);
    const lastName = s(row['Nom']);
    if (!firstName || !lastName) continue;

    const email = normalizeEmail(s(row['E-mail']) ?? '') || null;
    if (!email) emailMissingCount++;

    const requiresCleanup = !email;
    if (requiresCleanup) cleanupCount++;

    const address = buildAddress({
      street: s(row['Rue']) ?? undefined,
      postalCode: s(row['Code postal']) ?? undefined,
      city: s(row['Ville']) ?? undefined,
    });

    const data = {
      tenantId,
      civility: s(row['Civilité']),
      firstName,
      lastName,
      birthName: s(row['Nom de naissance']),
      birthDate: parseDateFr(row['Date de naissance']),
      email,
      phone: s(row['Numéro de téléphone']),
      personalAddress: address as Prisma.InputJsonValue,
      educationLevel: s(row['Niveau d\'étude']),
      bpfDefaultStatus: s(row['Statut BPF par défaut']),
      professionalExperience: s(row["Dirigeant d'entreprise depuis"]),
      professionalStatus: s(row['Fonction']),
      requiresCleanup,
      cleanupNotes: requiresCleanup ? 'Email manquant — à compléter avant convocation.' : null,
    };

    const existing = await prisma.externalIdentity.findUnique({
      where: { source_externalId: { source: 'smartof', externalId: uid } },
    });

    let personId: string;
    if (existing) {
      const updatedPerson = await prisma.person.update({ where: { id: existing.entityId }, data });
      personId = updatedPerson.id;
      updated++;
    } else {
      const created2 = await prisma.person.create({ data });
      personId = created2.id;
      await prisma.externalIdentity.create({
        data: { tenantId, entityType: 'Person', entityId: personId, source: 'smartof', externalId: uid },
      });
      created++;
    }

    // Données sensibles (n° SS) — séparées (RGPD)
    const ssNumber = s(row['N° de sécurité sociale']);
    if (ssNumber) {
      await prisma.sensitiveData.upsert({
        where: { personId },
        create: { personId, socialSecurityNb: ssNumber },
        update: { socialSecurityNb: ssNumber },
      });
    }

    personsByUid.set(uid, personId);
  }

  console.log(`   ✓ ${created} créés, ${updated} mis à jour, ${emailMissingCount} sans email (requiresCleanup=true)`);
  return { personsByUid, emailMissingCount };
}

// ---------- Import liens apprenant × entreprise ----------

async function importLegalLinks(
  tenantId: string,
  personsByUid: Map<string, string>,
  orgsByUid: Map<string, string>,
): Promise<void> {
  // Feuille 2 du fichier apprenants : "Rattachement des apprenants aux"
  const rows = readSheetByIndex(FILES.apprenants, 1);
  console.log(`\n🔗 Rattachements apprenants × entreprises : ${rows.length} lignes`);

  let created = 0;
  let skipped = 0;
  let eiSelf = 0;

  for (const row of rows) {
    const personUid = s(row['Apprenant UID']);
    const orgUid = s(row['Entreprise UID']);
    if (!personUid || !orgUid) {
      skipped++;
      continue;
    }

    const personId = personsByUid.get(personUid);
    const organizationId = orgsByUid.get(orgUid);
    if (!personId || !organizationId) {
      skipped++;
      continue;
    }

    const firstName = s(row['Prénom']) ?? '';
    const lastName = s(row['Nom']) ?? '';
    const orgName = s(row["Nom de l'entreprise"]) ?? '';

    // Heuristique : organisation à son propre nom = EI_SELF, sinon DIRIGEANT par défaut
    const isEiSelf = organizationLooksLikePerson(orgName, firstName, lastName);
    const role: LinkRole = isEiSelf ? LinkRole.EI_SELF : LinkRole.DIRIGEANT;
    if (isEiSelf) eiSelf++;

    try {
      await prisma.legalLink.upsert({
        where: { personId_organizationId_role: { personId, organizationId, role } },
        create: {
          personId,
          organizationId,
          role,
          isPrimary: true,
        },
        update: {},
      });
      created++;
    } catch (err) {
      // Conflit possible si deux rôles différents sur la même paire — on log et on continue
      console.warn(`   ⚠️  legalLink skip (${firstName} ${lastName} × ${orgName}) : ${(err as Error).message}`);
      skipped++;
    }
  }
  console.log(`   ✓ ${created} liens créés/mis à jour (dont ${eiSelf} EI_SELF), ${skipped} ignorés`);
}

// ---------- Import produits de formation ----------

async function importTrainingProducts(tenantId: string): Promise<void> {
  const rows = readSheet(FILES.produits);
  console.log(`\n📚 Produits de formation : ${rows.length} lignes à importer`);

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const uid = s(row['UID']);
    if (!uid) continue;
    if (s(row['Statut']) === 'Inactif') continue;

    const code = s(row['Custom ID']) ?? `PROD-${uid.substring(0, 8)}`;
    const title = s(row['Intitulé de la formation']) ?? s(row['Nom du produit']) ?? '(sans titre)';
    const durationHours = parseInt(s(row['Durée de formation (en heures)']) ?? '0', 10) || 0;
    const modality: Modality = mapModality(s(row["Mode d'organisation"]));

    const objectivesText = s(row['Objectifs pédagogiques']) ?? s(row['Objectifs de la formation']) ?? '';
    const objectives = objectivesText
      .split(/\n|•|- /)
      .map((o) => o.trim())
      .filter(Boolean);

    const data = {
      tenantId,
      code,
      title,
      durationHours,
      modality,
      prerequisites: s(row['Prérequis']),
      targetAudience: s(row['Public visé']),
      objectives: (objectives.length ? objectives : [objectivesText]) as Prisma.InputJsonValue,
      programMd: s(row['Contenu de la formation']) ?? '',
      pedagogicalMethods: s(row['Modalités pédagogiques']),
      pedagogicalSupport: s(row['Moyens et supports pédagogiques']),
      evaluationMethods: s(row['Modalités d\'évaluation']),
      accessibility: null,
      accessConditions: s(row['Modalités d\'accès']),
      trainerProfile: s(row['Profil des formateurs']),
      capacityMin: parseInt(s(row['Effectif minimum']) ?? '1', 10) || 1,
      capacityMax: parseInt(s(row['Effectif maximum']) ?? '12', 10) || 12,
      excludedFromBpf: s(row['Produit Hors BPF']) === 'Oui',
      bpfSpecialty: s(row['BPF - Spécialité']),
      bpfCategory: s(row['BPF - Catégorie de formation professionnelle']),
      bpfLevel: s(row['BPF - Niveau']),
      isActive: s(row['Statut']) !== 'Inactif',
    };

    const existing = await prisma.externalIdentity.findUnique({
      where: { source_externalId: { source: 'smartof', externalId: uid } },
    });

    if (existing) {
      await prisma.trainingProduct.update({ where: { id: existing.entityId }, data });
      updated++;
    } else {
      try {
        const newProduct = await prisma.trainingProduct.create({ data });
        await prisma.externalIdentity.create({
          data: {
            tenantId,
            entityType: 'TrainingProduct',
            entityId: newProduct.id,
            source: 'smartof',
            externalId: uid,
          },
        });
        created++;
      } catch (err) {
        if ((err as Prisma.PrismaClientKnownRequestError).code === 'P2002') {
          // Conflit sur (tenantId, code) — on update par code
          const existingByCode = await prisma.trainingProduct.findUnique({
            where: { tenantId_code: { tenantId, code } },
          });
          if (existingByCode) {
            await prisma.trainingProduct.update({ where: { id: existingByCode.id }, data });
            await prisma.externalIdentity.upsert({
              where: { source_externalId: { source: 'smartof', externalId: uid } },
              create: {
                tenantId,
                entityType: 'TrainingProduct',
                entityId: existingByCode.id,
                source: 'smartof',
                externalId: uid,
              },
              update: { entityId: existingByCode.id },
            });
            updated++;
          }
        } else throw err;
      }
    }
  }
  console.log(`   ✓ ${created} créés, ${updated} mis à jour`);
}

// ---------- Import formateurs ----------

async function importTrainers(tenantId: string): Promise<void> {
  const rows = readSheet(FILES.formateurs);
  console.log(`\n🎓 Formateurs : ${rows.length} lignes à importer`);

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const uid = s(row['UID']);
    if (!uid) continue;
    if (s(row['Archivé']) === 'Oui') continue;

    const firstName = s(row['Prénom']);
    const lastName = s(row['Nom']);
    if (!firstName || !lastName) continue;

    const data = {
      tenantId,
      civility: s(row['Civilité']),
      firstName,
      lastName,
      email: normalizeEmail(s(row['E-mail']) ?? '') || null,
      phone: s(row['Numéro de téléphone']),
      personalAddress: buildAddress({
        street: s(row['Rue']) ?? undefined,
        postalCode: s(row['Code postal']) ?? undefined,
        city: s(row['Ville']) ?? undefined,
      }) as Prisma.InputJsonValue,
      bpfDefaultStatus: s(row['Statut BPF par défaut']),
    };

    const existing = await prisma.externalIdentity.findUnique({
      where: { source_externalId: { source: 'smartof', externalId: uid } },
    });

    let personId: string;
    if (existing) {
      const updatedPerson = await prisma.person.update({ where: { id: existing.entityId }, data });
      personId = updatedPerson.id;
      updated++;
    } else {
      const newPerson = await prisma.person.create({ data });
      personId = newPerson.id;
      await prisma.externalIdentity.create({
        data: { tenantId, entityType: 'Person.Trainer', entityId: personId, source: 'smartof', externalId: uid },
      });
      created++;
    }

    // Si le formateur a un SIRET (= il est aussi sa propre EI), créer l'org + lien EI_SELF
    const trainerSiret = cleanSiret(s(row['SIRET']) ?? '');
    if (isValidSiret(trainerSiret)) {
      const orgName = s(row['NDA de l\'organisme de sous-traitant']) ?? `${lastName.toUpperCase()} ${firstName}`;
      const trainerOrg = await prisma.organization.upsert({
        where: { id: '__never__' }, // force le findFirst-like via SIRET ci-dessous
        create: {
          tenantId,
          legalName: orgName,
          legalForm: LegalForm.AUTO_ENTREPRENEUR,
          siret: trainerSiret,
          siren: sirenFromSiret(trainerSiret),
          type: 'Sous-traitant',
        },
        update: {},
      }).catch(async () => {
        // Cherche par SIRET
        const existingOrg = await prisma.organization.findFirst({ where: { tenantId, siret: trainerSiret } });
        if (existingOrg) return existingOrg;
        return prisma.organization.create({
          data: {
            tenantId,
            legalName: orgName,
            legalForm: LegalForm.AUTO_ENTREPRENEUR,
            siret: trainerSiret,
            siren: sirenFromSiret(trainerSiret),
            type: 'Sous-traitant',
          },
        });
      });
      await prisma.legalLink.upsert({
        where: { personId_organizationId_role: { personId, organizationId: trainerOrg.id, role: LinkRole.FORMATEUR } },
        create: { personId, organizationId: trainerOrg.id, role: LinkRole.FORMATEUR, isPrimary: true },
        update: {},
      });
    }
  }
  console.log(`   ✓ ${created} formateurs créés, ${updated} mis à jour`);
}

// ---------- Main ----------

async function main() {
  console.time('import');
  const tenantId = await getTenantId();
  console.log(`Tenant : ${tenantId}`);

  const { orgsByUid } = await importOrganizations(tenantId);
  const { personsByUid } = await importPersons(tenantId);
  await importLegalLinks(tenantId, personsByUid, orgsByUid);
  await importTrainingProducts(tenantId);
  await importTrainers(tenantId);

  // Résumé final
  const counts = await Promise.all([
    prisma.person.count({ where: { tenantId } }),
    prisma.organization.count({ where: { tenantId } }),
    prisma.legalLink.count({ where: { person: { tenantId } } }),
    prisma.trainingProduct.count({ where: { tenantId } }),
    prisma.ageficeProfile.count(),
    prisma.person.count({ where: { tenantId, requiresCleanup: true } }),
    prisma.organization.count({ where: { tenantId, requiresCleanup: true } }),
  ]);
  console.log(`
🎯 Récapitulatif final :
   - ${counts[0]} apprenants/personnes (${counts[5]} à nettoyer)
   - ${counts[1]} organisations (${counts[6]} à nettoyer)
   - ${counts[2]} liens juridiques (LegalLink)
   - ${counts[3]} produits de formation
   - ${counts[4]} profils AGEFICE pré-remplis
`);
  console.timeEnd('import');
}

main()
  .catch((err) => {
    console.error('❌ import failed', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
