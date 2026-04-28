/**
 * Importeur Airtable "BDD Start Academy Refonte" → QualiOF.
 *
 * Source : snapshots JSON figés dans packages/db/airtable-snapshot/ (pompés via MCP en avril 2026).
 *
 * Objectif : enrichir les données SmartOF déjà en base avec les rattachements multi-casquettes
 * (Statut professionnel, Enseigne, Structure_actuelle) qu'Airtable possède mais que SmartOF n'exporte
 * pas. Résout notamment le pattern « Agent commercial immobilier » (EI + Enseigne C21/Magrey/Orpi…).
 *
 * Stratégie :
 *   - Idempotent : ré-exécutable sans doublons (clés naturelles SIRET / email / ExternalIdentity airtable).
 *   - Réconciliation avec SmartOF : on matche sur SIRET puis email puis nom+prénom.
 *   - Mode --dry-run par défaut : affiche le diff sans rien écrire.
 *   - Mode --apply : applique en base.
 *
 * Lancement :
 *   pnpm --filter @qualiof/db import:airtable             # dry-run
 *   pnpm --filter @qualiof/db import:airtable -- --apply  # applique
 */

import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });

import { PrismaClient, LegalForm, LinkRole, Prisma } from '@prisma/client';
import {
  cleanSiret,
  isValidSiret,
  sirenFromSiret,
  normalizeName,
  normalizeEmail,
} from '@qualiof/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = path.resolve(__dirname, '..', 'airtable-snapshot');
const APPLY = process.argv.includes('--apply');
const TENANT_NAME = 'Start Academy';

const prisma = new PrismaClient();

interface AirtableRecord<T = Record<string, unknown>> {
  id: string;
  fields: T;
}

function loadSnap<T = Record<string, unknown>>(name: string): AirtableRecord<T>[] {
  const file = path.join(SNAP_DIR, `${name}.json`);
  if (!fs.existsSync(file)) {
    console.warn(`⚠️  Snapshot manquant : ${file}`);
    return [];
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return data.records ?? [];
}

// ===== Types Airtable (schéma lu depuis describe_table) =====

type ApprenantRow = AirtableRecord<{
  Nom?: string;
  Prénom?: string;
  Civilite?: string;
  Email?: string;
  Téléphone?: string;
  'Date de naissance'?: string;
  'N° Sécurité sociale'?: number;
  Adresse?: string;
  Code_postal?: string;
  Ville?: string;
  SIRET?: string;
  'Code NAF'?: string;
  RCS?: string;
  Activite_principale?: string;
  Nom_commercial?: string;
  Nom_entreprise?: string;
  Forme_juridique?: string[];
  'Statut professionnel'?: 'Agent commercial' | 'Salarié' | 'Dirigeant';
  Autoentrepreneur?: boolean;
  Niveau_diplome?: string;
  Diplômes?: string;
  'Expérience professionnelle'?: string;
  Dirigeant_depuis?: string;
  Opco_personnel?: string[];
  'Nom OPCO (from Opco_personnel)'?: string[];
  Structure_actuelle?: string[];
  Enseigne?: string[];
  Inscriptions_sessions?: string[];
  'Adresse complète'?: string;
}>;

type StructureRow = AirtableRecord<{
  'Nom de la structure'?: string;
  "Secteur d'activité"?: string;
  Type_structure?: string[];
  'Adresse siège'?: string;
  'Code postal'?: string;
  Ville?: string;
  SIRET?: string;
  Téléphone?: string;
  Email?: string;
  OPCO_Structure?: string[];
  'Nom OPCO (from OPCO_Structure)'?: string[];
  Réseau?: string;
  Apprenants?: string[];
}>;

type OpcoRow = AirtableRecord<{ 'Nom OPCO'?: string }>;

// ===== Helpers de mapping =====

const FORME_JURIDIQUE_MAP: Record<string, LegalForm> = {
  'ENTREPRISE INDIVIDUELLE': 'EI',
  'MICRO-ENTREPRISE / AUTO-ENTREPRISE': 'AUTO_ENTREPRENEUR',
  SARL: 'SARL',
  EIRL: 'EIRL',
  SA: 'SA',
  SAS: 'SAS',
  SASU: 'SASU',
  AUTRE: 'AUTRE',
};

function mapLegalForm(formes: string[] | undefined, isAutoEntrepreneur: boolean): LegalForm {
  if (formes && formes.length > 0) {
    for (const f of formes) {
      const mapped = FORME_JURIDIQUE_MAP[f];
      if (mapped) return mapped;
    }
  }
  return isAutoEntrepreneur ? 'AUTO_ENTREPRENEUR' : 'EI';
}

const OPCO_NAME_TO_CODE: Record<string, string> = {
  AGEFICE: 'AGEFICE',
  'OPCO EP': 'OPCO_EP',
  'ATLAS OPCO': 'ATLAS',
  CPF: 'CPF',
  'FI-FPL': 'FI-FPL',
  'OPCO Commerce': 'OPCOMMERCE',
  OPCOMMERCE: 'OPCOMMERCE',
};

function mapOpcoCode(label: string | undefined): string | null {
  if (!label) return null;
  const trimmed = label.trim();
  return OPCO_NAME_TO_CODE[trimmed] ?? null;
}

// ===== Stats =====

interface Stats {
  structures: { created: number; existing: number };
  persons: { matched: number; created: number; enriched: number };
  organizationsEI: { created: number; existing: number };
  legalLinks: { created: number; existing: number };
  externalIdentities: { created: number };
  warnings: string[];
}

const stats: Stats = {
  structures: { created: 0, existing: 0 },
  persons: { matched: 0, created: 0, enriched: 0 },
  organizationsEI: { created: 0, existing: 0 },
  legalLinks: { created: 0, existing: 0 },
  externalIdentities: { created: 0 },
  warnings: [],
};

// ===== Phase 1 : Structures (enseignes/réseaux) =====

interface StructureMapping {
  airtableId: string;
  organizationId: string | null; // null si non créée en mode dry-run
  legalName: string;
}

async function importStructures(
  structures: StructureRow[],
  tenantId: string,
): Promise<Map<string, StructureMapping>> {
  console.log(`\n🏢 Phase 1 — Import des Structures (${structures.length} enseignes Airtable)`);

  const mapping = new Map<string, StructureMapping>();

  for (const s of structures) {
    const name = (s.fields['Nom de la structure'] ?? '').trim().replace(/\n+$/, '');
    if (!name) continue;

    // Cherche une Organization existante par nom normalisé
    const existing = await prisma.organization.findFirst({
      where: {
        tenantId,
        legalName: { equals: name, mode: 'insensitive' },
      },
    });

    let organizationId: string | null = existing?.id ?? null;
    const opcoCode = mapOpcoCode(s.fields['Nom OPCO (from OPCO_Structure)']?.[0]);

    if (existing) {
      stats.structures.existing++;
      // Enrichit l'OPCO si manquant
      if (APPLY && opcoCode && !existing.opcoCode) {
        const opco = await prisma.opcoCatalog.findUnique({ where: { code: opcoCode } });
        if (opco) {
          await prisma.organization.update({
            where: { id: existing.id },
            data: { opcoCode, opcoCatalogId: opco.id },
          });
        }
      }
    } else if (APPLY) {
      const opco = opcoCode ? await prisma.opcoCatalog.findUnique({ where: { code: opcoCode } }) : null;
      const created = await prisma.organization.create({
        data: {
          tenantId,
          legalName: name,
          legalForm: 'AUTRE',
          siret: s.fields.SIRET?.replace(/\D/g, '').slice(0, 14) || null,
          address: s.fields['Adresse siège']
            ? {
                street: s.fields['Adresse siège'],
                postalCode: s.fields['Code postal'] ?? null,
                city: s.fields.Ville ?? null,
                country: 'France',
              }
            : Prisma.JsonNull,
          email: s.fields.Email?.trim() || null,
          phone: s.fields.Téléphone?.trim() || null,
          opcoCode: opcoCode ?? null,
          opcoCatalogId: opco?.id ?? null,
          network: s.fields.Réseau?.trim() || name,
          type: 'Enseigne',
          requiresCleanup: false,
        },
      });
      organizationId = created.id;
      stats.structures.created++;
      // ExternalIdentity
      await prisma.externalIdentity.create({
        data: { tenantId, entityType: 'Organization', entityId: created.id, source: 'airtable', externalId: s.id },
      });
      stats.externalIdentities.created++;
    } else {
      stats.structures.created++;
    }

    mapping.set(s.id, { airtableId: s.id, organizationId, legalName: name });
  }

  console.log(`   • ${stats.structures.existing} déjà en base (réutilisées)`);
  console.log(`   • ${stats.structures.created} ${APPLY ? 'créées' : 'à créer'}`);
  return mapping;
}

// ===== Phase 2 : Apprenants (Persons + leurs Org EI perso + LegalLinks) =====

interface PersonMatch {
  airtableId: string;
  personId: string | null;
  source: 'matched-siret' | 'matched-email' | 'matched-name' | 'created' | 'dry-run-create';
}

async function importApprenants(
  apprenants: ApprenantRow[],
  structuresMap: Map<string, StructureMapping>,
  tenantId: string,
): Promise<Map<string, PersonMatch>> {
  console.log(`\n👤 Phase 2 — Import des Apprenants (${apprenants.length} records Airtable)`);

  const personMap = new Map<string, PersonMatch>();

  for (const a of apprenants) {
    const f = a.fields;
    const lastName = (f.Nom ?? '').trim();
    const firstName = (f.Prénom ?? '').trim();
    if (!firstName || !lastName) {
      stats.warnings.push(`Apprenant ${a.id} sans nom/prénom — ignoré`);
      continue;
    }

    const email = normalizeEmail(f.Email ?? '') || null;
    const sirenSiret = cleanSiret(f.SIRET ?? '');
    const isAutoEntrepreneur = !!f.Autoentrepreneur;
    const statut = f['Statut professionnel'];

    // ---- Match Person existant (importé via SmartOF) ----
    let person: { id: string; firstName: string; lastName: string; email: string | null } | null = null;

    // 1) Par email
    if (email) {
      person = await prisma.person.findFirst({
        where: { tenantId, email, archived: false },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      if (person) {
        personMap.set(a.id, { airtableId: a.id, personId: person.id, source: 'matched-email' });
        stats.persons.matched++;
      }
    }

    // 2) Par nom+prénom (case-insensitive)
    if (!person) {
      person = await prisma.person.findFirst({
        where: {
          tenantId,
          firstName: { equals: firstName, mode: 'insensitive' },
          lastName: { equals: lastName, mode: 'insensitive' },
          archived: false,
        },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      if (person) {
        personMap.set(a.id, { airtableId: a.id, personId: person.id, source: 'matched-name' });
        stats.persons.matched++;
      }
    }

    // 3) Création si pas trouvé
    if (!person) {
      if (APPLY) {
        const created = await prisma.person.create({
          data: {
            tenantId,
            firstName,
            lastName,
            email,
            phone: f.Téléphone?.trim() || null,
            civility: f.Civilite ?? null,
            birthDate: f['Date de naissance'] ? new Date(f['Date de naissance']) : null,
            personalAddress: f['Adresse complète']
              ? { full: f['Adresse complète'], city: f.Ville ?? null, postalCode: f.Code_postal ?? null, country: 'France' }
              : Prisma.JsonNull,
          },
        });
        person = { id: created.id, firstName, lastName, email };
        personMap.set(a.id, { airtableId: a.id, personId: created.id, source: 'created' });
        stats.persons.created++;
      } else {
        personMap.set(a.id, { airtableId: a.id, personId: null, source: 'dry-run-create' });
        stats.persons.created++;
        continue; // pas de FK Prisma à manipuler en dry-run pur
      }
    }

    if (!person) continue;

    // ---- ExternalIdentity airtable ----
    if (APPLY) {
      const ei = await prisma.externalIdentity.findUnique({
        where: { source_externalId: { source: 'airtable', externalId: a.id } },
      });
      if (!ei) {
        await prisma.externalIdentity.create({
          data: { tenantId, entityType: 'Person', entityId: person.id, source: 'airtable', externalId: a.id },
        });
        stats.externalIdentities.created++;
      }
    }

    // ---- Org perso EI (si SIRET ou Autoentrepreneur ou Statut Agent commercial) ----
    let orgEIId: string | null = null;
    const isProbablyEI =
      isAutoEntrepreneur || statut === 'Agent commercial' || statut === 'Dirigeant' || !!sirenSiret;

    if (isProbablyEI) {
      const orgPersoName = `${firstName} ${lastName.toUpperCase()}`.trim();
      const legalForm = mapLegalForm(f.Forme_juridique, isAutoEntrepreneur);
      const validSiret = sirenSiret && isValidSiret(sirenSiret) ? sirenSiret : null;

      // Cherche l'org par SIRET valide d'abord
      let org = validSiret
        ? await prisma.organization.findFirst({
            where: { tenantId, siret: validSiret, archived: false },
            select: { id: true, legalName: true },
          })
        : null;

      // Sinon par nom
      if (!org) {
        org = await prisma.organization.findFirst({
          where: { tenantId, legalName: { equals: orgPersoName, mode: 'insensitive' }, archived: false },
          select: { id: true, legalName: true },
        });
      }

      if (org) {
        orgEIId = org.id;
        stats.organizationsEI.existing++;
      } else if (APPLY) {
        const opcoCode = mapOpcoCode(f['Nom OPCO (from Opco_personnel)']?.[0]);
        const opco = opcoCode ? await prisma.opcoCatalog.findUnique({ where: { code: opcoCode } }) : null;
        const created = await prisma.organization.create({
          data: {
            tenantId,
            legalName: orgPersoName,
            legalForm,
            siret: validSiret,
            siren: validSiret ? sirenFromSiret(validSiret) : null,
            naf: f['Code NAF']?.trim() || null,
            rcs: f.RCS ?? null,
            activityDescription: f.Activite_principale ?? null,
            brandName: f.Nom_commercial ?? null,
            opcoCode: opcoCode ?? null,
            opcoCatalogId: opco?.id ?? null,
            type: 'EI personnelle',
            requiresCleanup: !validSiret && !!sirenSiret, // SIRET fourni mais invalide → flag
          },
        });
        orgEIId = created.id;
        stats.organizationsEI.created++;
      } else {
        stats.organizationsEI.created++;
      }
    }

    // ---- LegalLinks ----
    if (APPLY && orgEIId) {
      // EI_SELF
      const existingEI = await prisma.legalLink.findFirst({
        where: { personId: person.id, organizationId: orgEIId, role: 'EI_SELF' },
      });
      if (!existingEI) {
        await prisma.legalLink.create({
          data: {
            personId: person.id,
            organizationId: orgEIId,
            role: 'EI_SELF',
            isPrimary: true,
            function: f.Nom_commercial ?? null,
          },
        });
        stats.legalLinks.created++;
      } else {
        stats.legalLinks.existing++;
      }
    }

    // Enseigne uniquement (PAS Structure_actuelle qui est souvent l'EI perso elle-même)
    // Structure_actuelle est utilisé pour le sponsorOrgId au moment de l'inscription.
    const enseigneRecIds = new Set(f.Enseigne ?? []);

    // Pour les SALARIÉS : Structure_actuelle est l'employeur, donc on l'ajoute aussi
    if (statut === 'Salarié') {
      for (const r of f.Structure_actuelle ?? []) enseigneRecIds.add(r);
    }

    for (const recId of enseigneRecIds) {
      const struct = structuresMap.get(recId);
      if (!struct) {
        // rec_id absent du snapshot Structures = c'est probablement une "EI perso" filtrée
        // (Aurélie-Bergé-EI, etc.) → silencieux, déjà géré via Phase 2 Org EI
        continue;
      }
      if (!struct.organizationId) continue; // dry-run sans création

      // Évite de doubler avec l'org EI elle-même
      if (struct.organizationId === orgEIId) continue;

      const role: LinkRole =
        statut === 'Salarié' ? 'SALARIE' : 'AGENT_COMMERCIAL';

      if (APPLY) {
        const existing = await prisma.legalLink.findFirst({
          where: { personId: person.id, organizationId: struct.organizationId, role },
        });
        if (!existing) {
          await prisma.legalLink.create({
            data: {
              personId: person.id,
              organizationId: struct.organizationId,
              role,
              isPrimary: !orgEIId, // si pas d'org EI (rare), l'enseigne devient principal
              function: f.Nom_commercial ?? statut ?? null,
            },
          });
          stats.legalLinks.created++;
        } else {
          stats.legalLinks.existing++;
        }
      } else {
        stats.legalLinks.created++;
      }
    }

    // Enrichissement de la fiche Person (Persons matchées via SmartOF) — uniquement les champs vraiment manquants
    if (APPLY && person && (statut || f.Téléphone || f['Adresse complète'])) {
      const updates: Prisma.PersonUpdateInput = {};
      if (f.Téléphone && !person.email) {
        // Pas de logique sur téléphone car pas de visibilité
      }
      // Persistance du Statut pro côté Person : pas de champ direct ; on le déduira via legalLinks.
      // (le champ participantType sur SessionParticipant absorbera l'info au moment de l'inscription)
      if (Object.keys(updates).length > 0) {
        await prisma.person.update({ where: { id: person.id }, data: updates });
        stats.persons.enriched++;
      }
    }
  }

  console.log(`   • ${stats.persons.matched} apprenants déjà en base (matché par email/nom)`);
  console.log(`   • ${stats.persons.created} ${APPLY ? 'créés' : 'à créer'}`);
  console.log(`   • ${stats.organizationsEI.existing} orgs EI perso déjà en base`);
  console.log(`   • ${stats.organizationsEI.created} orgs EI perso ${APPLY ? 'créées' : 'à créer'}`);
  console.log(`   • ${stats.legalLinks.existing} LegalLinks déjà en base`);
  console.log(`   • ${stats.legalLinks.created} LegalLinks ${APPLY ? 'créés' : 'à créer'}`);

  return personMap;
}

async function main() {
  console.log(`\n📦 Import Airtable BDD Refonte → QualiOF`);
  console.log(`    Mode : ${APPLY ? '🔥 APPLY (écrit en base)' : '👁️  DRY-RUN (lecture seule)'}`);
  console.log(`    Snapshot : ${SNAP_DIR}`);

  const tenant = await prisma.tenant.findFirst({ where: { name: TENANT_NAME } });
  if (!tenant) {
    console.error(`❌ Tenant "${TENANT_NAME}" introuvable. Lance d'abord pnpm db:seed.`);
    process.exit(1);
  }

  // Charge les snapshots
  const opcos = loadSnap<{ 'Nom OPCO'?: string }>('opco');
  const formateurs = loadSnap('formateurs');
  const structures = loadSnap('structures') as StructureRow[];
  const apprenants = loadSnap('apprenants') as ApprenantRow[];

  console.log(`\n📊 Volumes snapshot : ${opcos.length} OPCO · ${formateurs.length} formateurs · ${structures.length} structures · ${apprenants.length} apprenants`);

  // Phase 1 : Structures
  const structuresMap = await importStructures(structures, tenant.id);

  // Phase 2 : Apprenants + Org EI + LegalLinks
  await importApprenants(apprenants, structuresMap, tenant.id);

  // Bilan
  console.log(`\n📊 Bilan global :`);
  console.log(`   Structures : ${stats.structures.existing} existantes, ${stats.structures.created} ${APPLY ? 'créées' : 'à créer'}`);
  console.log(`   Persons    : ${stats.persons.matched} matchées, ${stats.persons.created} ${APPLY ? 'créées' : 'à créer'}`);
  console.log(`   Orgs EI    : ${stats.organizationsEI.existing} existantes, ${stats.organizationsEI.created} ${APPLY ? 'créées' : 'à créer'}`);
  console.log(`   LegalLinks : ${stats.legalLinks.existing} existantes, ${stats.legalLinks.created} ${APPLY ? 'créés' : 'à créer'}`);
  console.log(`   ExternalIDs: ${stats.externalIdentities.created} ${APPLY ? 'créées' : ''}`);
  if (stats.warnings.length > 0) {
    console.log(`\n⚠️  ${stats.warnings.length} avertissement(s) :`);
    for (const w of stats.warnings.slice(0, 10)) console.log(`   • ${w}`);
    if (stats.warnings.length > 10) console.log(`   … et ${stats.warnings.length - 10} autre(s)`);
  }

  if (!APPLY) {
    console.log(`\n💡 Mode dry-run. Pour appliquer : pnpm --filter @qualiof/db import:airtable -- --apply`);
  }

  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Erreur :', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
