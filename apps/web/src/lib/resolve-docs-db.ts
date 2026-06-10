/**
 * Phase 9.3 (plan 09.3-01) — wrappers Prisma du résolveur `resolveDocs`.
 *
 * Règle PII (D-09.3) : l'entité racine est TOUJOURS résolue via
 * `findFirst({ where: { id, tenantId } })` — jamais de findMany
 * cross-tenant. Si la racine n'appartient pas au tenant → `null`,
 * aucune autre requête n'est émise.
 */

import { prisma } from '@qualiof/db';
import { resolveDocs, type UnifiedDoc } from './resolve-docs';

const DOCUMENT_SELECT = {
  id: true,
  type: true,
  entityType: true,
  entityId: true,
  sessionId: true,
  participantId: true,
  createdAt: true,
} as const;

const ASSET_SELECT = {
  id: true,
  kind: true,
  sessionId: true,
  participantId: true,
  pdfUrl: true,
  rawJson: true,
  generatedAt: true,
} as const;

/**
 * UNION documentaire d'un apprenant : Documents + PedagogicalAssets de ses
 * participations, pièces d'identité (CNI/RIB) et attestations CFP de ses
 * organisations (multi-casquette via LegalLink).
 */
export async function resolveDocsForLearner(
  tenantId: string,
  personId: string,
): Promise<UnifiedDoc[] | null> {
  const person = await prisma.person.findFirst({
    where: { id: personId, tenantId },
    select: {
      id: true,
      ribKey: true,
      sensitiveData: { select: { idDocumentUrl: true, idDocumentType: true } },
      legalLinks: {
        select: {
          organization: {
            select: {
              id: true,
              ageficeProfile: { select: { cfpAttestationKey: true } },
            },
          },
        },
      },
      participations: { select: { id: true } },
    },
  });
  if (!person) return null;

  const participantIds = person.participations.map((p) => p.id);

  const [documents, pedagogicalAssets] = await Promise.all([
    participantIds.length
      ? prisma.document.findMany({
          where: {
            tenantId,
            OR: [
              { participantId: { in: participantIds } },
              { entityType: 'participant', entityId: { in: participantIds } },
            ],
          },
          select: DOCUMENT_SELECT,
        })
      : Promise.resolve([]),
    participantIds.length
      ? prisma.pedagogicalAsset.findMany({
          where: { tenantId, participantId: { in: participantIds } },
          select: ASSET_SELECT,
        })
      : Promise.resolve([]),
  ]);

  const cfpAttestations = person.legalLinks
    .map((link) => link.organization)
    .filter((org) => org.ageficeProfile?.cfpAttestationKey)
    .map((org) => ({
      organizationId: org.id,
      personId: person.id,
      cfpAttestationKey: org.ageficeProfile!.cfpAttestationKey,
    }));

  return resolveDocs({
    documents,
    pedagogicalAssets,
    identity: {
      personId: person.id,
      ribKey: person.ribKey,
      idDocumentUrl: person.sensitiveData?.idDocumentUrl ?? null,
      idDocumentType: person.sensitiveData?.idDocumentType ?? null,
    },
    cfpAttestations,
  });
}

/** UNION documentaire d'un produit : Documents entityType='product' (PROGRAMME, déroulé…). */
export async function resolveDocsForProduct(
  tenantId: string,
  productId: string,
): Promise<UnifiedDoc[] | null> {
  const product = await prisma.trainingProduct.findFirst({
    where: { id: productId, tenantId },
    select: { id: true },
  });
  if (!product) return null;

  const documents = await prisma.document.findMany({
    where: { tenantId, entityType: 'product', entityId: productId },
    select: DOCUMENT_SELECT,
  });

  return resolveDocs({ documents, pedagogicalAssets: [] });
}

/** UNION documentaire tenant : docs légaux markdown (CGV/RI) + leurs PDFs générés. */
export async function resolveDocsForTenant(tenantId: string): Promise<UnifiedDoc[]> {
  const [tenant, documents] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { cgvMarkdown: true, reglementInterieurMarkdown: true },
    }),
    prisma.document.findMany({
      where: { tenantId, entityType: 'tenant' },
      select: DOCUMENT_SELECT,
    }),
  ]);

  return resolveDocs({
    documents,
    pedagogicalAssets: [],
    tenantLegal: tenant
      ? {
          cgvMarkdown: tenant.cgvMarkdown,
          reglementInterieurMarkdown: tenant.reglementInterieurMarkdown,
        }
      : null,
  });
}
