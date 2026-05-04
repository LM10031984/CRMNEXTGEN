'use server';

/**
 * Server actions CRUD pour éditer les données métier en UI sans passer par
 * Prisma Studio / SQL : Person, Organization, TrainingProduct, et création
 * d'un formateur (Person + ExternalIdentity Person.Trainer).
 *
 * Tous les champs sont optionnels : on n'écrit que les valeurs explicitement
 * fournies (les autres restent inchangées).
 */

import { Prisma, prisma } from '@qualiof/db';
import { revalidatePath } from 'next/cache';
import { validateRequest } from '@/lib/auth';

// ── Person ────────────────────────────────────────────────────────────────
export async function updatePerson(input: {
  personId: string;
  civility?: string | null;
  firstName?: string;
  lastName?: string;
  birthName?: string | null;
  birthDate?: string | null; // ISO yyyy-mm-dd
  email?: string | null;
  phone?: string | null;
  educationLevel?: string | null;
  diplomas?: string | null;
  professionalExperience?: string | null;
  professionalStatus?: string | null;
  bpfDefaultStatus?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  const person = await prisma.person.findFirst({
    where: { id: input.personId, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!person) return { ok: false, error: 'Apprenant introuvable.' };

  const data: Prisma.PersonUpdateInput = {};
  if (input.civility !== undefined) data.civility = input.civility;
  if (input.firstName !== undefined && input.firstName.trim()) data.firstName = input.firstName.trim();
  if (input.lastName !== undefined && input.lastName.trim()) data.lastName = input.lastName.trim();
  if (input.birthName !== undefined) data.birthName = input.birthName?.trim() || null;
  if (input.birthDate !== undefined) {
    data.birthDate = input.birthDate ? new Date(input.birthDate) : null;
  }
  if (input.email !== undefined) data.email = input.email?.trim() || null;
  if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
  if (input.educationLevel !== undefined) data.educationLevel = input.educationLevel?.trim() || null;
  if (input.diplomas !== undefined) data.diplomas = input.diplomas?.trim() || null;
  if (input.professionalExperience !== undefined)
    data.professionalExperience = input.professionalExperience?.trim() || null;
  if (input.professionalStatus !== undefined)
    data.professionalStatus = input.professionalStatus?.trim() || null;
  if (input.bpfDefaultStatus !== undefined) data.bpfDefaultStatus = input.bpfDefaultStatus?.trim() || null;

  if (Object.keys(data).length === 0) return { ok: true };

  await prisma.person.update({ where: { id: input.personId }, data });
  revalidatePath(`/app/apprenants/${input.personId}`);
  revalidatePath('/app/apprenants');
  return { ok: true };
}

// ── Organization ──────────────────────────────────────────────────────────
export async function updateOrganization(input: {
  organizationId: string;
  legalName?: string;
  legalForm?: string;
  siren?: string | null;
  siret?: string | null;
  naf?: string | null;
  vatNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  opcoCode?: string | null;
  network?: string | null;
  activityDescription?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  const org = await prisma.organization.findFirst({
    where: { id: input.organizationId, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!org) return { ok: false, error: 'Organisation introuvable.' };

  const data: Prisma.OrganizationUpdateInput = {};
  if (input.legalName !== undefined && input.legalName.trim()) data.legalName = input.legalName.trim();
  if (input.legalForm !== undefined) data.legalForm = input.legalForm as any;
  if (input.siren !== undefined) data.siren = input.siren?.trim() || null;
  if (input.siret !== undefined) data.siret = input.siret?.trim() || null;
  if (input.naf !== undefined) data.naf = input.naf?.trim() || null;
  if (input.vatNumber !== undefined) data.vatNumber = input.vatNumber?.trim() || null;
  if (input.email !== undefined) data.email = input.email?.trim() || null;
  if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
  if (input.opcoCode !== undefined) data.opcoCode = input.opcoCode?.trim() || null;
  if (input.network !== undefined) data.network = input.network?.trim() || null;
  if (input.activityDescription !== undefined)
    data.activityDescription = input.activityDescription?.trim() || null;

  if (Object.keys(data).length === 0) return { ok: true };

  await prisma.organization.update({ where: { id: input.organizationId }, data });
  revalidatePath(`/app/organisations/${input.organizationId}`);
  revalidatePath('/app/organisations');
  return { ok: true };
}

// ── TrainingProduct ───────────────────────────────────────────────────────
export async function updateTrainingProduct(input: {
  productId: string;
  title?: string;
  theme?: string | null;
  durationHours?: number;
  priceHT?: number;
  prerequisites?: string | null;
  targetAudience?: string | null;
  pedagogicalMethods?: string | null;
  pedagogicalSupport?: string | null;
  evaluationMethods?: string | null;
  trainerProfile?: string | null;
  accessibility?: string | null;
  accessConditions?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  const product = await prisma.trainingProduct.findFirst({
    where: { id: input.productId, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!product) return { ok: false, error: 'Produit introuvable.' };

  const data: Prisma.TrainingProductUpdateInput = {};
  if (input.title !== undefined && input.title.trim()) data.title = input.title.trim();
  if (input.theme !== undefined) data.theme = input.theme?.trim() || null;
  if (input.durationHours !== undefined && input.durationHours > 0) data.durationHours = input.durationHours;
  if (input.priceHT !== undefined && input.priceHT >= 0)
    data.priceHT = new Prisma.Decimal(input.priceHT);
  if (input.prerequisites !== undefined) data.prerequisites = input.prerequisites?.trim() || null;
  if (input.targetAudience !== undefined) data.targetAudience = input.targetAudience?.trim() || null;
  if (input.pedagogicalMethods !== undefined)
    data.pedagogicalMethods = input.pedagogicalMethods?.trim() || null;
  if (input.pedagogicalSupport !== undefined)
    data.pedagogicalSupport = input.pedagogicalSupport?.trim() || null;
  if (input.evaluationMethods !== undefined)
    data.evaluationMethods = input.evaluationMethods?.trim() || null;
  if (input.trainerProfile !== undefined) data.trainerProfile = input.trainerProfile?.trim() || null;
  if (input.accessibility !== undefined) data.accessibility = input.accessibility?.trim() || null;
  if (input.accessConditions !== undefined) data.accessConditions = input.accessConditions?.trim() || null;

  if (Object.keys(data).length === 0) return { ok: true };

  await prisma.trainingProduct.update({ where: { id: input.productId }, data });
  revalidatePath(`/app/produits/${input.productId}`);
  revalidatePath('/app/produits');
  return { ok: true };
}

// ── Création produit de formation ────────────────────────────────────────
/**
 * Création d'un produit de formation. Tous les champs Qualiopi (objectifs,
 * public, prérequis, méthodes, supports, évaluation, formateur, accessibilité,
 * conditions d'accès, programme détaillé) sont supportés pour permettre la
 * création complète depuis le wizard, optionnellement pré-remplie par IA.
 */
export async function createTrainingProduct(input: {
  title: string;
  durationHours: number;
  priceHT?: number;
  modality?: 'PRESENTIEL' | 'DISTANCIEL' | 'MIXTE' | 'ELEARNING';
  theme?: string | null;
  capacityMax?: number;
  // Champs Qualiopi optionnels (alignés avec updateTrainingProduct)
  objectives?: string[];
  programMd?: string;
  prerequisites?: string | null;
  targetAudience?: string | null;
  pedagogicalMethods?: string | null;
  pedagogicalSupport?: string | null;
  evaluationMethods?: string | null;
  trainerProfile?: string | null;
  accessibility?: string | null;
  accessConditions?: string | null;
}): Promise<{ ok: boolean; productId?: string; code?: string; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };
  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Intitulé obligatoire.' };
  if (!input.durationHours || input.durationHours <= 0) {
    return { ok: false, error: 'Durée en heures obligatoire (entier > 0).' };
  }

  // Génère un code FRM-NNNN incrémental
  const last = await prisma.trainingProduct.findFirst({
    where: { tenantId: user.tenantId, code: { startsWith: 'FRM-' } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  const lastSeq = last?.code.match(/FRM-(\d+)/)?.[1];
  const nextSeq = lastSeq ? parseInt(lastSeq, 10) + 1 : 1;
  const code = `FRM-${String(nextSeq).padStart(4, '0')}`;

  const product = await prisma.trainingProduct.create({
    data: {
      tenantId: user.tenantId,
      code,
      title,
      durationHours: input.durationHours,
      modality: input.modality ?? 'PRESENTIEL',
      priceHT: new Prisma.Decimal(input.priceHT ?? 0),
      capacityMax: input.capacityMax ?? 12,
      capacityMin: 1,
      theme: input.theme ?? null,
      objectives: (input.objectives ?? []) as Prisma.InputJsonValue,
      programMd: input.programMd ?? '',
      prerequisites: input.prerequisites ?? null,
      targetAudience: input.targetAudience ?? null,
      pedagogicalMethods: input.pedagogicalMethods ?? null,
      pedagogicalSupport: input.pedagogicalSupport ?? null,
      evaluationMethods: input.evaluationMethods ?? null,
      trainerProfile: input.trainerProfile ?? null,
      accessibility: input.accessibility ?? null,
      accessConditions: input.accessConditions ?? null,
      vatRate: new Prisma.Decimal(0),
      version: 1,
      isActive: true,
    },
  });

  revalidatePath('/app/produits');
  return { ok: true, productId: product.id, code: product.code };
}

// ── Création formateur ───────────────────────────────────────────────────
export async function createTrainer(input: {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
}): Promise<{ ok: boolean; personId?: string; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };
  if (!input.firstName.trim() || !input.lastName.trim()) {
    return { ok: false, error: 'Nom et prénom requis.' };
  }

  const person = await prisma.person.create({
    data: {
      tenantId: user.tenantId,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
    },
  });

  // Marque comme formateur via ExternalIdentity (cohérent avec page /app/formateurs)
  await prisma.externalIdentity.create({
    data: {
      tenantId: user.tenantId,
      entityType: 'Person.Trainer',
      entityId: person.id,
      source: 'manual',
      externalId: `manual-${person.id}`,
    },
  });

  revalidatePath('/app/formateurs');
  revalidatePath('/app/sessions/nouvelle');
  return { ok: true, personId: person.id };
}

// ── Création apprenant ───────────────────────────────────────────────────
export async function createPerson(input: {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  professionalStatus?: string | null;
  // Champs étendus alimentés par le wizard auto-fill (extraction CFP/CNI/RIB).
  civility?: string | null;
  birthName?: string | null;
  birthDate?: string | null; // ISO YYYY-MM-DD
  addressStreet?: string | null;
  addressPostalCode?: string | null;
  addressCity?: string | null;
}): Promise<{ ok: boolean; personId?: string; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };
  if (!input.firstName.trim() || !input.lastName.trim()) {
    return { ok: false, error: 'Nom et prénom requis.' };
  }
  const personalAddress =
    input.addressStreet || input.addressPostalCode || input.addressCity
      ? {
          street: input.addressStreet?.trim() || null,
          postalCode: input.addressPostalCode?.trim() || null,
          city: input.addressCity?.trim() || null,
        }
      : null;
  const person = await prisma.person.create({
    data: {
      tenantId: user.tenantId,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      professionalStatus: input.professionalStatus?.trim() || null,
      civility: input.civility?.trim() || null,
      birthName: input.birthName?.trim() || null,
      birthDate: input.birthDate ? new Date(input.birthDate) : null,
      personalAddress: personalAddress ? (personalAddress as object) : undefined,
    },
  });
  revalidatePath('/app/apprenants');
  return { ok: true, personId: person.id };
}

// ── Création organisation ────────────────────────────────────────────────
const VALID_LEGAL_FORMS = ['EI', 'EIRL', 'AUTO_ENTREPRENEUR', 'SAS', 'SARL', 'SASU', 'EURL', 'SA', 'ASSOCIATION', 'PARTICULIER', 'AUTRE'] as const;
type LegalForm = (typeof VALID_LEGAL_FORMS)[number];

export async function createOrganization(input: {
  legalName: string;
  legalForm: LegalForm;
  siret?: string | null;
  opcoCode?: string | null;
}): Promise<{ ok: boolean; orgId?: string; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };
  if (!input.legalName.trim()) return { ok: false, error: 'Raison sociale requise.' };
  if (!VALID_LEGAL_FORMS.includes(input.legalForm)) return { ok: false, error: 'Forme juridique invalide.' };
  const siret = input.siret?.replace(/\s+/g, '') || null;
  if (siret && !/^\d{14}$/.test(siret)) return { ok: false, error: 'SIRET invalide (14 chiffres).' };

  const org = await prisma.organization.create({
    data: {
      tenantId: user.tenantId,
      legalName: input.legalName.trim(),
      legalForm: input.legalForm,
      siret,
      opcoCode: input.opcoCode?.trim() || null,
    },
  });
  revalidatePath('/app/organisations');
  return { ok: true, orgId: org.id };
}

// ── Création produit de formation ────────────────────────────────────────
const VALID_MODALITIES = ['PRESENTIEL', 'DISTANCIEL', 'MIXTE', 'ELEARNING'] as const;
type ProductModality = (typeof VALID_MODALITIES)[number];

export async function createProduct(input: {
  title: string;
  durationHours: number;
  modality: ProductModality;
  priceHT?: number | null;
  theme?: string | null;
  capacityMin?: number | null;
  capacityMax?: number | null;
  autoFillWithAI?: boolean;
}): Promise<{ ok: boolean; productId?: string; code?: string; aiFilled?: boolean; aiError?: string; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };
  if (!input.title.trim()) return { ok: false, error: 'Titre requis.' };
  if (!input.durationHours || input.durationHours <= 0) return { ok: false, error: 'Durée invalide.' };
  if (!VALID_MODALITIES.includes(input.modality)) return { ok: false, error: 'Modalité invalide.' };

  // Le tri SQL `ORDER BY code DESC` echoue ici parce que des codes legacy
  // type "PROD-IMPORT-FALLBACK" ressortent en tete (alphabetiquement I > 0).
  // On filtre cote SQL sur le format strict PROD-DDDD puis on prend le max
  // numerique cote JS — robuste au format mixte des imports SmartOF.
  const candidates = await prisma.trainingProduct.findMany({
    where: { tenantId: user.tenantId, code: { startsWith: 'PROD-' } },
    select: { code: true },
  });
  const maxSeq = candidates.reduce((m, p) => {
    const match = p.code.match(/^PROD-0*(\d+)$/);
    if (!match || !match[1]) return m;
    return Math.max(m, parseInt(match[1], 10));
  }, 0);
  // Boucle de garde au cas ou un code PROD-NNNN aurait ete cree entretemps
  // (improbable mais le cout est negligeable). Max 50 essais.
  let code = '';
  for (let attempt = 1; attempt <= 50; attempt++) {
    code = `PROD-${String(maxSeq + attempt).padStart(4, '0')}`;
    const exists = await prisma.trainingProduct.findFirst({
      where: { tenantId: user.tenantId, code },
      select: { id: true },
    });
    if (!exists) break;
    code = '';
  }
  if (!code) return { ok: false, error: 'Impossible de générer un code unique (50 collisions). Réessaie.' };

  const product = await prisma.trainingProduct.create({
    data: {
      tenantId: user.tenantId,
      code,
      title: input.title.trim(),
      durationHours: input.durationHours,
      modality: input.modality,
      priceHT: input.priceHT ? new Prisma.Decimal(input.priceHT) : new Prisma.Decimal(0),
      theme: input.theme?.trim() || null,
      capacityMin: input.capacityMin ?? 1,
      capacityMax: input.capacityMax ?? 12,
      isActive: true,
      objectives: [],
      programMd: '',
    },
  });

  // Auto-fill IA : objectifs / public / prerequis / programme detaille via
  // Ollama. Lent (~10-30s sur Mac M5) mais rempli toute la fiche en un coup.
  // Si Ollama plante, on garde le produit basique cree au-dessus + on remonte
  // l'erreur a l'UI pour que Laurent puisse retenter "Editer > Auto-remplir IA"
  // depuis la fiche produit.
  if (input.autoFillWithAI !== false) {
    try {
      const { aiPreFillProduct } = await import('./ai-fill-product');
      const r = await aiPreFillProduct({
        title: input.title,
        theme: input.theme,
        durationHours: input.durationHours,
        modality: input.modality,
        priceHT: input.priceHT ?? undefined,
      });
      if (r.ok && r.draft) {
        await prisma.trainingProduct.update({
          where: { id: product.id },
          data: {
            objectives: r.draft.objectives,
            targetAudience: r.draft.targetAudience || null,
            prerequisites: r.draft.prerequisites || null,
            pedagogicalMethods: r.draft.pedagogicalMethods || null,
            pedagogicalSupport: r.draft.pedagogicalSupport || null,
            evaluationMethods: r.draft.evaluationMethods || null,
            trainerProfile: r.draft.trainerProfile || null,
            accessibility: r.draft.accessibility || null,
            accessConditions: r.draft.accessConditions || null,
            programMd: r.draft.programMd,
          },
        });
        revalidatePath('/app/produits');
        revalidatePath(`/app/produits/${product.id}`);
        return { ok: true, productId: product.id, code, aiFilled: true };
      }
      revalidatePath('/app/produits');
      return { ok: true, productId: product.id, code, aiFilled: false, aiError: r.error };
    } catch (e: any) {
      revalidatePath('/app/produits');
      return { ok: true, productId: product.id, code, aiFilled: false, aiError: e?.message ?? String(e) };
    }
  }

  revalidatePath('/app/produits');
  return { ok: true, productId: product.id, code };
}

// ── Suppression formateur ────────────────────────────────────────────────
export async function deleteTrainer(personId: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  const person = await prisma.person.findFirst({
    where: { id: personId, tenantId: user.tenantId },
    select: { id: true, _count: { select: { trainerSessions: true, participations: true } } },
  });
  if (!person) return { ok: false, error: 'Formateur introuvable.' };
  if (person._count.trainerSessions > 0) {
    return { ok: false, error: `Impossible : ${person._count.trainerSessions} session(s) ont ce formateur affecté.` };
  }
  if (person._count.participations > 0) {
    return { ok: false, error: 'Cette personne est aussi inscrite comme apprenante. Suppression bloquée.' };
  }

  await prisma.externalIdentity.deleteMany({
    where: { tenantId: user.tenantId, entityType: 'Person.Trainer', entityId: personId },
  });
  await prisma.person.delete({ where: { id: personId } });
  revalidatePath('/app/formateurs');
  return { ok: true };
}

// ── Suppression produit de formation ────────────────────────────────────
export async function deleteProduct(productId: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  const product = await prisma.trainingProduct.findFirst({
    where: { id: productId, tenantId: user.tenantId },
    select: { id: true, _count: { select: { trainingSessions: true } } },
  });
  if (!product) return { ok: false, error: 'Produit introuvable.' };
  if (product._count.trainingSessions > 0) {
    return { ok: false, error: `Impossible : ${product._count.trainingSessions} session(s) utilisent ce produit. Désactive-le plutôt.` };
  }

  await prisma.trainingProduct.delete({ where: { id: productId } });
  revalidatePath('/app/produits');
  return { ok: true };
}
