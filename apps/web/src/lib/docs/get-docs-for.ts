/**
 * Phase 9.3 — Wrappers Prisma minces autour de `resolveDocs` (fonction pure).
 *
 * Chaque wrapper fetch les sources de preuves puis délègue l'UNION à `resolveDocs`.
 *
 * RÈGLE DE SCOPE NON-NÉGOCIABLE (CLAUDE.md « Prisma queries always scoped to
 * user.tenantId » + RGPD) :
 *  - Toute source racine portant `tenantId` (person, document, pedagogicalAsset,
 *    tenant) inclut `tenantId` dans son `where` (defense-in-depth).
 *  - Les PII (CNI / RIB / CFP) NE sont JAMAIS lues par un findMany cross-tenant.
 *    Elles sont chargées en RELATIONS d'une racine `Person` déjà scopée
 *    `findFirst({ where: { id: personId, tenantId } })` → pas de fuite cross-tenant.
 *
 * DIVERGENCE SCHÉMA (constatée branche cloud-migration 2026-06-10, vs plan) :
 *  - SensitiveData (CNI) EST une relation 1-1 directe de Person (`sensitiveData`).
 *  - AgeficeProfile (CFP) N'EST PAS une relation directe de Person : il est rattaché
 *    à `Organization` (`AgeficeProfile.organizationId`). On l'atteint donc via
 *    `Person.legalLinks[].organization.ageficeProfile`. Le scope reste garanti par
 *    la racine Person scopée tenantId (les organizations liées appartiennent au
 *    même périmètre). On prend la première CFP non nulle trouvée sur les liens.
 */

import { prisma } from '@qualiof/db';
import {
  resolveDocs,
  type UnifiedDoc,
  type DocumentRow,
  type PedAssetRow,
  type IdentityRow,
} from './resolve-docs';

/** Mappe une row Prisma Document vers le row-type mince attendu par resolveDocs. */
function toDocumentRow(d: {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  pdfUrl: string;
  sessionId: string | null;
  participantId: string | null;
  createdAt: Date;
}): DocumentRow {
  return {
    id: d.id,
    type: d.type,
    entityType: d.entityType,
    entityId: d.entityId,
    pdfUrl: d.pdfUrl,
    sessionId: d.sessionId,
    participantId: d.participantId,
    createdAt: d.createdAt,
  };
}

function toPedAssetRow(a: {
  id: string;
  kind: string;
  sessionId: string;
  participantId: string | null;
  rawJson: unknown;
  pdfUrl: string | null;
  generatedAt: Date;
}): PedAssetRow {
  return {
    id: a.id,
    kind: a.kind,
    sessionId: a.sessionId,
    participantId: a.participantId,
    rawJson: a.rawJson,
    pdfUrl: a.pdfUrl,
    generatedAt: a.generatedAt,
  };
}

/**
 * Tous les docs d'un apprenant (toutes ses participations).
 * PII (CNI/RIB/CFP) lues via la racine Person scopée tenantId.
 */
export async function getDocsForPerson(
  personId: string,
  tenantId: string,
): Promise<UnifiedDoc[]> {
  // (a) ACCÈS IDENTITÉ SCOPÉ PAR LA RACINE Person (tenantId dans le where).
  //     SensitiveData (CNI) en relation directe ; AgeficeProfile (CFP) via legalLinks→organization.
  const person = await prisma.person.findFirst({
    where: { id: personId, tenantId },
    select: {
      id: true,
      ribKey: true,
      sensitiveData: { select: { idDocumentUrl: true } },
      legalLinks: {
        select: { organization: { select: { ageficeProfile: { select: { cfpAttestationKey: true } } } } },
      },
      participations: {
        select: { id: true, session: { select: { id: true, productId: true } } },
      },
    },
  });
  if (!person) return [];

  const cniUrl = person.sensitiveData?.idDocumentUrl ?? null;
  const ribKey = person.ribKey ?? null;
  // Première CFP non nulle trouvée parmi les organisations liées.
  const cfpKey =
    person.legalLinks
      .map((l) => l.organization?.ageficeProfile?.cfpAttestationKey ?? null)
      .find((k) => !!k) ?? null;

  const participantIds = person.participations.map((p) => p.id);
  const sessionIds = Array.from(new Set(person.participations.map((p) => p.session.id)));
  const productIds = Array.from(new Set(person.participations.map((p) => p.session.productId)));

  // (b)+(c)+(d)+(e) Sources scopées tenantId.
  const [documents, pedagogicalAssets, tenant] = await Promise.all([
    participantIds.length || productIds.length
      ? prisma.document.findMany({
          where: {
            tenantId,
            OR: [
              ...(participantIds.length ? [{ participantId: { in: participantIds } }] : []),
              ...(productIds.length
                ? [{ entityType: 'product', entityId: { in: productIds } }]
                : []),
            ],
          },
          select: {
            id: true,
            type: true,
            entityType: true,
            entityId: true,
            pdfUrl: true,
            sessionId: true,
            participantId: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    participantIds.length
      ? prisma.pedagogicalAsset.findMany({
          where: { tenantId, participantId: { in: participantIds } },
          select: {
            id: true,
            kind: true,
            sessionId: true,
            participantId: true,
            rawJson: true,
            pdfUrl: true,
            generatedAt: true,
          },
        })
      : Promise.resolve([]),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { cgvMarkdown: true, reglementInterieurMarkdown: true },
    }),
  ]);

  // (f) Construit identity par participation (CNI/RIB/CFP attachées à la personne,
  //     répliquées sur chaque participation pour porter participantId/sessionId).
  const identity: IdentityRow[] = person.participations.map((p) => ({
    participantId: p.id,
    personId: person.id,
    sessionId: p.session.id,
    cniUrl,
    ribKey,
    cfpKey,
  }));
  // Si aucune participation mais des PII existent, émettre une entrée identity minimale.
  if (!identity.length && (cniUrl || ribKey || cfpKey)) {
    identity.push({ participantId: '', personId: person.id, sessionId: '', cniUrl, ribKey, cfpKey });
  }

  return resolveDocs({
    documents: documents.map((d) => toDocumentRow(d as never)),
    pedagogicalAssets: pedagogicalAssets.map((a) => toPedAssetRow(a as never)),
    identity,
    legal: {
      tenantId,
      cgvMarkdown: tenant?.cgvMarkdown ?? null,
      reglementInterieurMarkdown: tenant?.reglementInterieurMarkdown ?? null,
    },
  });
}

/**
 * Tous les docs d'une session (docs session-level + assets + docs legal tenant).
 * Pas de PII apprenant ici (vue session, pas vue personne).
 */
export async function getDocsForSession(
  sessionId: string,
  tenantId: string,
): Promise<UnifiedDoc[]> {
  const [documents, pedagogicalAssets, tenant] = await Promise.all([
    prisma.document.findMany({
      where: {
        tenantId,
        OR: [{ sessionId }, { entityType: 'session', entityId: sessionId }],
      },
      select: {
        id: true,
        type: true,
        entityType: true,
        entityId: true,
        pdfUrl: true,
        sessionId: true,
        participantId: true,
        createdAt: true,
      },
    }),
    prisma.pedagogicalAsset.findMany({
      where: { tenantId, sessionId },
      select: {
        id: true,
        kind: true,
        sessionId: true,
        participantId: true,
        rawJson: true,
        pdfUrl: true,
        generatedAt: true,
      },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { cgvMarkdown: true, reglementInterieurMarkdown: true },
    }),
  ]);

  return resolveDocs({
    documents: documents.map((d) => toDocumentRow(d as never)),
    pedagogicalAssets: pedagogicalAssets.map((a) => toPedAssetRow(a as never)),
    identity: [],
    legal: {
      tenantId,
      cgvMarkdown: tenant?.cgvMarkdown ?? null,
      reglementInterieurMarkdown: tenant?.reglementInterieurMarkdown ?? null,
    },
  });
}

/**
 * Tous les docs d'un produit (docs product-level + agrégation des sessions du produit).
 */
export async function getDocsForProduct(
  productId: string,
  tenantId: string,
): Promise<UnifiedDoc[]> {
  // Sessions du produit, scopées tenantId.
  const sessions = await prisma.trainingSession.findMany({
    where: { tenantId, productId },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);

  const [documents, pedagogicalAssets, tenant] = await Promise.all([
    prisma.document.findMany({
      where: {
        tenantId,
        OR: [
          { entityType: 'product', entityId: productId },
          ...(sessionIds.length ? [{ sessionId: { in: sessionIds } }] : []),
          ...(sessionIds.length
            ? [{ entityType: 'session', entityId: { in: sessionIds } }]
            : []),
        ],
      },
      select: {
        id: true,
        type: true,
        entityType: true,
        entityId: true,
        pdfUrl: true,
        sessionId: true,
        participantId: true,
        createdAt: true,
      },
    }),
    sessionIds.length
      ? prisma.pedagogicalAsset.findMany({
          where: { tenantId, sessionId: { in: sessionIds } },
          select: {
            id: true,
            kind: true,
            sessionId: true,
            participantId: true,
            rawJson: true,
            pdfUrl: true,
            generatedAt: true,
          },
        })
      : Promise.resolve([]),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { cgvMarkdown: true, reglementInterieurMarkdown: true },
    }),
  ]);

  return resolveDocs({
    documents: documents.map((d) => toDocumentRow(d as never)),
    pedagogicalAssets: pedagogicalAssets.map((a) => toPedAssetRow(a as never)),
    identity: [],
    legal: {
      tenantId,
      cgvMarkdown: tenant?.cgvMarkdown ?? null,
      reglementInterieurMarkdown: tenant?.reglementInterieurMarkdown ?? null,
    },
  });
}
