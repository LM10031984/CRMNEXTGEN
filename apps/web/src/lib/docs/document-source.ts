/**
 * Lot 0 · 0.2 — chargement de la donnée d'entrée d'un document + verdict de
 * péremption. Pendant « impur » de `source-fingerprint.ts` (qui, lui, ne
 * connaît pas Prisma).
 *
 * Deux usages, UNE seule mécanique (cf. règle 1 du module pur) :
 *  - à la GÉNÉRATION  : `computeDocumentFingerprint()` juste avant le
 *    `document.create`, pour figer l'état des champs rendus ;
 *  - au CONTRÔLE      : `getDocumentStaleness()` / `findStaleDocumentIds()`
 *    recalculent sur la donnée courante et comparent.
 *
 * Le calcul ne doit JAMAIS faire échouer une génération : tout appel est
 * enveloppé, une empreinte manquante vaut « inconnu », pas « erreur ».
 */

import { prisma } from '@qualiof/db';
import {
  buildDocumentSource,
  compareSourceFingerprint,
  computeFingerprint,
  isFingerprintable,
  type DocumentSourceContext,
  type SourcePerson,
  type StalenessVerdict,
} from './source-fingerprint';

// ─── Sélections Prisma (les champs RENDUS, rien de plus) ──────────────────

const PRODUCT_SELECT = {
  code: true,
  title: true,
  durationHours: true,
  priceHT: true,
  programMd: true,
  objectives: true,
  pedagogicalMethods: true,
  evaluationMethods: true,
  accessibility: true,
  accessConditions: true,
  trainerProfile: true,
  ageficeFormationType: true,
  ageficeNiveau: true,
  ageficeCertif: true,
  ageficeAttestation: true,
} as const;

const ORG_SELECT = {
  id: true,
  legalName: true,
  siret: true,
  siren: true,
  representative: true,
  address: true,
} as const;

const PERSON_SELECT = { firstName: true, lastName: true, email: true } as const;

type SessionGraph = Awaited<ReturnType<typeof loadSessionGraph>>;

async function loadSessionGraph(tenantId: string, sessionId: string) {
  const [session, tenant] = await Promise.all([
    prisma.trainingSession.findFirst({
      where: { id: sessionId, tenantId },
      select: {
        id: true,
        code: true,
        name: true,
        startDate: true,
        endDate: true,
        modality: true,
        pricePerLearner: true,
        productId: true,
        product: { select: PRODUCT_SELECT },
        location: { select: { legalName: true, name: true, address: true } },
        slots: {
          orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
          select: { date: true, startTime: true, endTime: true, halfDay: true },
        },
        trainers: {
          orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
          select: { isPrimary: true, person: { select: PERSON_SELECT } },
        },
        participants: {
          orderBy: [{ id: 'asc' }],
          select: {
            id: true,
            priceHT: true,
            financingMode: true,
            financingRequestDate: true,
            sponsorOrgId: true,
            sponsorOrg: { select: ORG_SELECT },
            person: { select: PERSON_SELECT },
          },
        },
      },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, siret: true, address: true },
    }),
  ]);
  if (!session) return null;
  return { session, tenant };
}

function orgCity(address: unknown): string | null {
  if (address && typeof address === 'object' && 'city' in address) {
    const c = (address as { city?: unknown }).city;
    return typeof c === 'string' ? c : null;
  }
  return null;
}

function tenantSource(tenant: { name: string; siret: string | null; address: unknown } | null) {
  if (!tenant) return null;
  return {
    legalName: tenant.name,
    siret: tenant.siret,
    // L'adresse du siège telle qu'elle est STOCKÉE. On ne passe pas par
    // `loadOfConfig` volontairement : son repli sur les variables d'env ferait
    // basculer tout le parc en « périmé » au moindre changement de déploiement
    // (précédent : les 22 OF_* absentes du worker Railway, 06/07/2026).
    address: tenant.address ? JSON.stringify(tenant.address) : null,
  };
}

function personSource(p: { firstName: string; lastName: string; email: string | null } | null): SourcePerson | null {
  return p ? { firstName: p.firstName, lastName: p.lastName, email: p.email } : null;
}

/**
 * Construit le contexte source à partir du graphe session déjà chargé.
 * `participantId` → contexte nominatif ; `organizationId` → convention groupe.
 */
function contextFromGraph(
  graph: NonNullable<SessionGraph>,
  opts: { participantId?: string | null; organizationId?: string | null } = {},
): DocumentSourceContext {
  const { session, tenant } = graph;
  const participant = opts.participantId
    ? session.participants.find((p) => p.id === opts.participantId) ?? null
    : null;
  const primary = session.trainers.find((t) => t.isPrimary) ?? session.trainers[0] ?? null;

  const groupMembers = opts.organizationId
    ? session.participants
        .filter((p) => p.sponsorOrgId === opts.organizationId)
        .map((p) => personSource(p.person))
        .filter((p): p is SourcePerson => p !== null)
    : null;

  const groupOrg = opts.organizationId
    ? session.participants.find((p) => p.sponsorOrgId === opts.organizationId)?.sponsorOrg ?? null
    : null;
  const org = participant?.sponsorOrg ?? groupOrg;

  return {
    tenant: tenantSource(tenant),
    session: {
      code: session.code,
      name: session.name,
      startDate: session.startDate,
      endDate: session.endDate,
      modality: session.modality,
      pricePerLearner: session.pricePerLearner,
    },
    slots: session.slots.map((s) => ({
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      halfDay: s.halfDay,
    })),
    location: session.location
      ? {
          legalName: session.location.legalName,
          name: session.location.name,
          address: session.location.address,
        }
      : null,
    product: session.product,
    primaryTrainer: primary
      ? `${primary.person.firstName} ${primary.person.lastName}`.trim()
      : null,
    participant: participant
      ? {
          priceHT: participant.priceHT,
          financingMode: participant.financingMode,
          financingRequestDate: participant.financingRequestDate,
        }
      : null,
    person: personSource(participant?.person ?? null),
    sponsorOrg: org
      ? {
          legalName: org.legalName,
          siret: org.siret,
          siren: org.siren,
          representative: org.representative,
          city: orgCity(org.address),
        }
      : null,
    groupStagiaires: groupMembers,
  };
}

/** Contexte d'un document ancré sur un PRODUIT (programme catalogue). */
async function loadProductContext(
  tenantId: string,
  productId: string,
): Promise<DocumentSourceContext | null> {
  const [product, tenant] = await Promise.all([
    prisma.trainingProduct.findFirst({
      where: { id: productId, tenantId },
      select: PRODUCT_SELECT,
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, siret: true, address: true },
    }),
  ]);
  if (!product) return null;
  return {
    tenant: tenantSource(tenant),
    session: null,
    slots: [],
    location: null,
    product,
    primaryTrainer: null,
    participant: null,
    person: null,
    sponsorOrg: null,
    groupStagiaires: null,
  };
}

// ─── API publique ─────────────────────────────────────────────────────────

export interface DocumentAnchor {
  tenantId: string;
  docType: string;
  participantId?: string | null;
  sessionId?: string | null;
  productId?: string | null;
  /** Convention ENTREPRISE (groupe) : l'organisation commanditaire. */
  organizationId?: string | null;
}

export async function loadDocumentSourceContext(
  anchor: DocumentAnchor,
): Promise<DocumentSourceContext | null> {
  let sessionId = anchor.sessionId ?? null;
  if (!sessionId && anchor.participantId) {
    const p = await prisma.sessionParticipant.findFirst({
      where: { id: anchor.participantId, session: { tenantId: anchor.tenantId } },
      select: { sessionId: true },
    });
    sessionId = p?.sessionId ?? null;
  }

  if (sessionId) {
    const graph = await loadSessionGraph(anchor.tenantId, sessionId);
    if (!graph) return null;
    return contextFromGraph(graph, {
      participantId: anchor.participantId,
      organizationId: anchor.organizationId,
    });
  }

  if (anchor.productId) return loadProductContext(anchor.tenantId, anchor.productId);
  return null;
}

/**
 * Empreinte à poser sur le document au moment de sa création.
 * Ne lève jamais : un incident de calcul ne doit pas empêcher la production
 * d'un document Qualiopi. On perd la détection, pas le document.
 */
export async function computeDocumentFingerprint(
  anchor: DocumentAnchor,
): Promise<string | null> {
  if (!isFingerprintable(anchor.docType)) return null;
  try {
    const ctx = await loadDocumentSourceContext(anchor);
    if (!ctx) return null;
    const source = buildDocumentSource(anchor.docType, ctx);
    return source === null ? null : computeFingerprint(source);
  } catch (e) {
    console.warn(
      `[source-fingerprint] empreinte non calculée (${anchor.docType}) :`,
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

export interface DocumentStaleness {
  verdict: StalenessVerdict;
  storedFingerprint: string | null;
  currentFingerprint: string | null;
}

/** Verdict pour UN document identifié. */
export async function getDocumentStaleness(
  tenantId: string,
  documentId: string,
): Promise<DocumentStaleness> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, tenantId },
    select: {
      type: true,
      entityType: true,
      entityId: true,
      sessionId: true,
      participantId: true,
      sourceFingerprint: true,
    },
  });
  if (!doc) return { verdict: 'unknown', storedFingerprint: null, currentFingerprint: null };

  const current = await computeDocumentFingerprint({
    tenantId,
    docType: doc.type,
    participantId: doc.participantId,
    sessionId: doc.sessionId,
    productId: doc.entityType === 'product' ? doc.entityId : null,
    organizationId: doc.entityType === 'organization' ? doc.entityId : null,
  });

  return {
    verdict: compareSourceFingerprint(doc.sourceFingerprint, current),
    storedFingerprint: doc.sourceFingerprint,
    currentFingerprint: current,
  };
}

/**
 * Verdict pour TOUS les documents d'une session, en un seul chargement du
 * graphe (la fiche session est une page chaude : pas de N+1).
 *
 * Retourne les ids des documents dont au moins un champ rendu a bougé. Les
 * documents sans empreinte (parc antérieur au 02/09/2026, types non couverts)
 * ne remontent PAS : ils sont « inconnus », pas « à jour ».
 */
export async function findStaleDocumentIds(
  tenantId: string,
  sessionId: string,
): Promise<Set<string>> {
  const stale = new Set<string>();
  try {
    const graph = await loadSessionGraph(tenantId, sessionId);
    if (!graph) return stale;

    const documents = await prisma.document.findMany({
      where: {
        tenantId,
        sourceFingerprint: { not: null },
        OR: [
          { sessionId },
          ...(graph.session.productId
            ? [{ entityType: 'product', entityId: graph.session.productId }]
            : []),
        ],
      },
      select: {
        id: true,
        type: true,
        entityType: true,
        entityId: true,
        participantId: true,
        sourceFingerprint: true,
      },
    });
    if (documents.length === 0) return stale;

    // Contexte produit chargé une seule fois, et seulement s'il sert.
    let productCtx: DocumentSourceContext | null | undefined;

    for (const doc of documents) {
      if (!isFingerprintable(doc.type)) continue;

      let ctx: DocumentSourceContext | null;
      if (doc.entityType === 'product') {
        if (productCtx === undefined) {
          productCtx = graph.session.productId
            ? await loadProductContext(tenantId, graph.session.productId)
            : null;
        }
        ctx = productCtx;
      } else {
        ctx = contextFromGraph(graph, {
          participantId: doc.participantId,
          organizationId: doc.entityType === 'organization' ? doc.entityId : null,
        });
      }
      if (!ctx) continue;

      const source = buildDocumentSource(doc.type, ctx);
      const current = source === null ? null : computeFingerprint(source);
      if (compareSourceFingerprint(doc.sourceFingerprint, current) === 'stale') {
        stale.add(doc.id);
      }
    }
  } catch (e) {
    // Une page session ne tombe pas parce que la détection de péremption
    // a échoué : on n'affiche simplement aucun avertissement.
    console.warn(
      '[source-fingerprint] détection de péremption indisponible :',
      e instanceof Error ? e.message : e,
    );
  }
  return stale;
}
