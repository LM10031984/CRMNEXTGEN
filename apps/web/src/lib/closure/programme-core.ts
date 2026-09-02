/**
 * Cœur SANS auth de la génération du programme PRODUIT.
 *
 * Extrait de `src/server/actions/programme-generator.ts` (quick 260618-gux,
 * correctif démarrage pipeline) : ce fichier N'IMPORTE PAS `@/lib/auth`, ni
 * directement ni transitivement, pour qu'un script tsx puisse l'importer sans
 * tirer `validateRequest` → `react cache`.
 *
 * Le wrapper server action `generateProgrammeForProduct` lit `validateRequest()`,
 * délègue ici, puis fait `revalidatePath`.
 */

import { createHash } from 'node:crypto';
import { prisma } from '@qualiof/db';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { renderHtmlToPdfWeasy } from '@/lib/pdf-render';
import { renderProgrammeHtml, type ProgrammeData } from '@/lib/programme-template';
import { loadOfConfig } from '@/lib/of-config';
import { formatLieuFormation } from '@/lib/locations/format-lieu';
import { resoudrePrixProgramme } from './tarif-programme';
import { releveDeLaConvention } from '@/lib/sessions/payer-rule';

/**
 * Cœur SANS auth du programme PRODUIT (réutilisable par scripts pipeline).
 * Prend `tenantId` en paramètre. NE FAIT PAS de revalidatePath (laissé au
 * wrapper). `opts.programmeMdOverride` permet d'injecter un programme normalisé
 * (source unique programme+convention) au lieu de `product.programMd`.
 */
export async function generateProgrammeForProductCore(
  tenantId: string,
  productId: string,
  opts: { force?: boolean; programmeMdOverride?: string } = {},
): Promise<{ ok: boolean; documentId?: string; pdfUrl?: string; error?: string }> {
  const product = await prisma.trainingProduct.findFirst({
    where: { id: productId, tenantId },
  });
  if (!product) return { ok: false, error: 'Produit introuvable' };

  if (Number(product.priceHT) <= 0) {
    return {
      ok: false,
      error:
        'Prix HT manquant sur le produit. Renseignez-le sur la fiche produit avant de générer le programme.',
    };
  }

  // Mode find-or-create par défaut : si un programme existe déjà pour ce
  // produit (peu importe le hash), on le réutilise. Le bouton "Régénérer"
  // sur la fiche produit passe `force: true` pour forcer une nouvelle
  // génération (ex: après modification du programmeMd).
  if (!opts.force) {
    const existing = await prisma.document.findFirst({
      where: {
        tenantId,
        type: 'PROGRAMME',
        entityType: 'product',
        entityId: productId,
      },
      select: { id: true, pdfUrl: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    // Invalidation cache : si le produit a été modifié APRÈS la dernière
    // génération (ex : priceHT renseigné après coup), on régénère.
    if (existing && product.updatedAt <= existing.createdAt) {
      return { ok: true, documentId: existing.id, pdfUrl: existing.pdfUrl };
    }
  }

  const objectives = (product.objectives as string[] | null) ?? [];

  // Phase 7 — pre-resolve OF config (BDD fallback ENV via D-01 hybrid)
  const of = await loadOfConfig(tenantId);

  // Source unique programme+convention : si un programme normalisé est fourni
  // (généré par generateNormalizedProgramme côté script), on l'utilise au lieu
  // du programMd brut du produit.
  const programmeMd =
    typeof opts.programmeMdOverride === 'string' && opts.programmeMdOverride.trim().length > 0
      ? opts.programmeMdOverride
      : typeof product.programMd === 'string'
        ? product.programMd
        : '';

  const data: ProgrammeData = {
    // Pas d'apprenant ni de session — programme generique
    produitTitre: product.title,
    produitCode: product.code,
    produitDureeHeures: product.durationHours,
    produitPriceHT: Number(product.priceHT),
    produitObjectifs: objectives,
    produitProgrammeMd: programmeMd,
    produitPrerequisites: product.prerequisites,
    produitTargetAudience: product.targetAudience,
    produitPedagogicalMethods: product.pedagogicalMethods,
    produitEvaluationMethods: product.evaluationMethods,
    produitAccessibility: product.accessibility,
    produitAccessConditions: product.accessConditions,
    produitTrainerProfile: product.trainerProfile,
    produitPedagogicalSupport: product.pedagogicalSupport,
    ofName: of.name,
    ofSiret: of.siret,
    ofAddress: of.addressFull,
    ofRnq: of.rnq,
    ofPhone: of.phone,
    ofEmail: of.email,
    // Phase 7 (Plan 07-03) — résolution logo uploadé via Paramètres
    tenantId,
  };

  let pdfBuffer: Buffer;
  try {
    const html = renderProgrammeHtml(data, of);
    pdfBuffer = await renderHtmlToPdfWeasy(html);
  } catch (e: any) {
    return { ok: false, error: `Erreur generation PDF programme : ${e?.message ?? e}` };
  }

  const hash = createHash('sha256').update(pdfBuffer).digest('hex');

  // Reutilise un Document existant pour ce produit avec le meme hash
  const existing = await prisma.document.findFirst({
    where: {
      tenantId,
      type: 'PROGRAMME',
      entityType: 'product',
      entityId: productId,
      hashSha256: hash,
    },
  });
  if (existing) {
    return { ok: true, documentId: existing.id, pdfUrl: existing.pdfUrl };
  }

  const safeSlug = product.code.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const objectKey = `programmes/produits/${safeSlug}-${hash.slice(0, 8)}.pdf`;
  try {
    await uploadFile(DOCS_BUCKET, objectKey, pdfBuffer, 'application/pdf');
  } catch (e: any) {
    return { ok: false, error: `Erreur upload MinIO : ${e?.message ?? e}` };
  }

  const doc = await prisma.document.create({
    data: {
      tenantId,
      type: 'PROGRAMME',
      entityType: 'product',
      entityId: productId,
      pdfUrl: objectKey,
      hashSha256: hash,
    },
  });

  return { ok: true, documentId: doc.id, pdfUrl: objectKey };
}

/**
 * Programme de SESSION — même contenu pédagogique, TARIF de la session.
 *
 * Pourquoi il existe (constat du 02/09 sur SES-0109) : le programme produit est
 * un document de CATALOGUE, un seul PDF partagé par toutes les sessions, et son
 * prix est celui du produit. Quand un tarif est négocié pour une entreprise —
 * 1 100 € au lieu de 2 500 ici, parce qu'elle a moins de droits — le programme
 * continuait d'annoncer 2 500 € par stagiaire pendant que la convention du même
 * dossier disait 2 200 € pour deux. Deux pièces contradictoires dans la même
 * enveloppe OPCO.
 *
 * Ce que ce générateur NE change PAS : le contenu. Le programme, les objectifs
 * et le déroulé restent FIGÉS AU PRODUIT (règle du 18/06) — on ne réécrit pas
 * la pédagogie par session, seul le montant suit le tarif réellement consenti.
 *
 * Effet de bord voulu : le Document porte enfin un `sessionId`. Le dossier OPCO
 * (`opco-submission.ts`) cherche `{ sessionId, type: 'PROGRAMME' }` — un
 * programme produit, qui n'a pas de `sessionId`, ne lui répondait jamais. Les
 * dossiers partaient donc sans programme, sauf quand un script en avait posé un.
 */
export async function generateProgrammeForSessionCore(
  tenantId: string,
  sessionId: string,
  opts: { force?: boolean; programmeMdOverride?: string } = {},
): Promise<{ ok: boolean; documentId?: string; pdfUrl?: string; error?: string }> {
  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId },
    include: {
      product: true,
      location: true,
      trainers: { include: { person: true } },
      participants: {
        select: {
          priceHT: true,
          sponsorOrgId: true,
          sponsorOrg: { select: { legalForm: true } },
          person: { select: { legalLinks: { select: { organizationId: true, role: true } } } },
        },
      },
    },
  });
  if (!session) return { ok: false, error: 'Session introuvable' };
  const product = session.product;
  if (!product) return { ok: false, error: 'Produit lié à la session manquant' };

  // Une convention d'entreprise engage sur un montant GLOBAL : le programme doit
  // annoncer ce total, pas un prix par tête (correction du 02/09).
  const prix = resoudrePrixProgramme({
    inscrits: session.participants.map((p) => ({
      priceHT: Number(p.priceHT),
      sponsorOrgId: p.sponsorOrgId,
      couvertParConvention: releveDeLaConvention({
        sponsorLegalForm: p.sponsorOrg?.legalForm,
        roleChezSponsor:
          p.person?.legalLinks?.find((l) => l.organizationId === p.sponsorOrgId)?.role ?? null,
      }),
    })),
    tarifSession: session.pricePerLearner,
    prixProduit: product.priceHT,
  });
  const prixHT = prix.montantHT;
  if (!(prixHT > 0)) {
    return {
      ok: false,
      error:
        'Aucun tarif : ni sur la session, ni sur le produit. Renseignez le tarif de la session avant de générer son programme.',
    };
  }

  const of = await loadOfConfig(tenantId);
  const objectives = (product.objectives as string[] | null) ?? [];
  const programmeMd =
    typeof opts.programmeMdOverride === 'string' && opts.programmeMdOverride.trim().length > 0
      ? opts.programmeMdOverride
      : typeof product.programMd === 'string'
        ? product.programMd
        : '';

  const data: ProgrammeData = {
    // Contexte de session — le gabarit sait déjà les rendre.
    sessionCode: session.code,
    ...(session.name ? { sessionName: session.name } : {}),
    sessionStartDate: session.startDate,
    sessionEndDate: session.endDate,
    sessionLieu: formatLieuFormation(session.location, of.addressFull),
    sessionModalite: session.modality,
    sessionFormateurs: session.trainers
      .map((t) => `${t.person.firstName} ${t.person.lastName}`.trim())
      .filter((n) => n.length > 0),

    produitTitre: product.title,
    produitCode: product.code,
    produitDureeHeures: product.durationHours,
    produitPriceHT: prixHT,
    prixMode: prix.mode,
    produitObjectifs: objectives,
    produitProgrammeMd: programmeMd,
    produitPrerequisites: product.prerequisites,
    produitTargetAudience: product.targetAudience,
    produitPedagogicalMethods: product.pedagogicalMethods,
    produitEvaluationMethods: product.evaluationMethods,
    produitAccessibility: product.accessibility,
    produitAccessConditions: product.accessConditions,
    produitTrainerProfile: product.trainerProfile,
    produitPedagogicalSupport: product.pedagogicalSupport,
    ofName: of.name,
    ofSiret: of.siret,
    ofAddress: of.addressFull,
    ofRnq: of.rnq,
    ofPhone: of.phone,
    ofEmail: of.email,
    tenantId,
  };

  let pdfBuffer: Buffer;
  try {
    const html = renderProgrammeHtml(data, of);
    pdfBuffer = await renderHtmlToPdfWeasy(html);
  } catch (e: any) {
    return { ok: false, error: `Erreur génération PDF programme de session : ${e?.message ?? e}` };
  }

  const hash = createHash('sha256').update(pdfBuffer).digest('hex');

  // Idempotence par le CONTENU : changer le tarif change le hash, donc produit
  // un nouveau document ; recliquer sans rien changer n'en crée aucun.
  const existing = await prisma.document.findFirst({
    where: { tenantId, type: 'PROGRAMME', entityType: 'session', entityId: sessionId, hashSha256: hash },
    select: { id: true, pdfUrl: true },
  });
  if (existing && !opts.force) {
    return { ok: true, documentId: existing.id, pdfUrl: existing.pdfUrl };
  }

  const safeSlug = session.code.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const objectKey = `programmes/sessions/${safeSlug}-${hash.slice(0, 8)}.pdf`;
  try {
    await uploadFile(DOCS_BUCKET, objectKey, pdfBuffer, 'application/pdf');
  } catch (e: any) {
    return { ok: false, error: `Erreur upload storage : ${e?.message ?? e}` };
  }

  // Le tarif d'une session change (négociation, droits OPCO revus) : on ne
  // laisse pas deux programmes de la même session annoncer deux montants.
  // L'ancien est retiré, le dossier OPCO n'a jamais le choix entre les deux.
  await prisma.document.deleteMany({
    where: { tenantId, type: 'PROGRAMME', entityType: 'session', entityId: sessionId },
  });

  const doc = await prisma.document.create({
    data: {
      tenantId,
      type: 'PROGRAMME',
      entityType: 'session',
      entityId: sessionId,
      sessionId,
      pdfUrl: objectKey,
      hashSha256: hash,
    },
  });

  return { ok: true, documentId: doc.id, pdfUrl: objectKey };
}
