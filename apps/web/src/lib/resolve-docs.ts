/**
 * Phase 9.3 (plan 09.3-01) — résolveur lecture seule `resolveDocs`.
 *
 * Le stockage documentaire est éclaté sur 6 sources (audit
 * MATRICE-NAVIGATION-DOCS, plan directeur Partie 1 §3) :
 *   1. Document            (entityType participant/session/product/invoice/tenant)
 *   2. PedagogicalAsset    (session-wide ou par participant)
 *   3. Person.ribKey
 *   4. SensitiveData.idDocumentUrl (CNI / pièce d'identité)
 *   5. AgeficeProfile.cfpAttestationKey (attestation CFP)
 *   6. Tenant.cgvMarkdown / reglementInterieurMarkdown
 *
 * Ce module est PUR (aucun IO, aucun import Prisma) : il prend des rows
 * pré-chargées et produit l'UNION `UnifiedDoc[]`. Les wrappers Prisma
 * scopés tenantId vivent dans `resolve-docs-db.ts`.
 *
 * Décision actée : résolveur lecture seule, AUCUNE migration de schéma
 * avant le 3 juillet (la consolidation est en Partie 2, U2 — le résolveur
 * en devient alors l'oracle de non-régression).
 */

import { DOC_TYPE_LABELS } from './doc-scope';

export type UnifiedDocSource =
  | 'document'
  | 'pedagogical_asset'
  | 'person_rib'
  | 'sensitive_cni'
  | 'agefice_cfp'
  | 'tenant_markdown';

export type UnifiedDocScope =
  | 'participant'
  | 'session'
  | 'product'
  | 'invoice'
  | 'person'
  | 'organization'
  | 'tenant';

/** Contrat UnifiedDoc — sortie unique du résolveur, consommée par les 3 surfaces UI (09.3-03). */
export type UnifiedDoc = {
  source: UnifiedDocSource;
  /** id de la row source, ou clé synthétique `{source}:{ownerId}` pour les champs-fichiers. */
  sourceId: string;
  /** DocType Prisma quand applicable (null pour RIB/CNI/CFP). */
  docType: string | null;
  /** Libellé FR affichable. */
  label: string;
  scope: UnifiedDocScope;
  sessionId: string | null;
  participantId: string | null;
  personId: string | null;
  /** Lien navigable (téléchargement API ou écran d'édition) — recette ≤ 2 clics. */
  href: string;
  /** true si le contenu vient d'un fallback stub IA — badge littéral 'no_proof' côté UI. */
  usedStub: boolean;
  generatedAt: Date | null;
};

export type ResolveDocsInput = {
  documents: Array<{
    id: string;
    type: string;
    entityType: string;
    entityId: string;
    sessionId: string | null;
    participantId: string | null;
    createdAt: Date;
  }>;
  pedagogicalAssets: Array<{
    id: string;
    kind: string;
    sessionId: string;
    participantId: string | null;
    pdfUrl: string | null;
    rawJson: unknown;
    generatedAt: Date;
  }>;
  identity?: {
    personId: string;
    ribKey: string | null;
    idDocumentUrl: string | null;
    idDocumentType: string | null;
  } | null;
  cfpAttestations?: Array<{
    organizationId: string;
    personId: string;
    cfpAttestationKey: string | null;
  }>;
  tenantLegal?: {
    cgvMarkdown: string | null;
    reglementInterieurMarkdown: string | null;
  } | null;
};

/** entityType Document → scope UnifiedDoc (fallback 'session' pour valeur inattendue). */
const ENTITY_TYPE_TO_SCOPE: Record<string, UnifiedDocScope> = {
  participant: 'participant',
  session: 'session',
  product: 'product',
  invoice: 'invoice',
  tenant: 'tenant',
};

/** PedagogicalKind → DocType matrice (inverse de DOC_TYPE_TO_PED_KIND, figé doc-scope D-04). */
const PED_KIND_TO_DOC_TYPE: Record<string, string> = {
  QCM: 'EVALUATION_ACQUIS',
  EMARGEMENT: 'EMARGEMENT',
  ANALYSE_BESOIN: 'ANALYSE_BESOIN',
  POSITIONNEMENT: 'POSITIONNEMENT',
  SATISFACTION_CHAUD: 'SATISFACTION_CHAUD',
  SATISFACTION_FROID: 'SATISFACTION_FROID',
  GRILLE_OBS: 'GRILLE_OBS_SESSION',
  DEROULE: 'DEROULE_PEDAGOGIQUE',
};

/** Libellés des kinds asset sans DocType matrice (COMPETENCES). */
const PED_KIND_LABELS: Record<string, string> = {
  COMPETENCES: 'Référentiel de compétences',
};

function labelForDocType(docType: string): string {
  return DOC_TYPE_LABELS[docType]?.long ?? docType;
}

function assetUsedStub(rawJson: unknown): boolean {
  return (
    typeof rawJson === 'object' &&
    rawJson !== null &&
    (rawJson as Record<string, unknown>).source === 'stub'
  );
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * UNION lecture seule des 6 sources documentaires → UnifiedDoc[],
 * triée generatedAt desc, entrées sans date (identité / tenant) en fin.
 */
export function resolveDocs(input: ResolveDocsInput): UnifiedDoc[] {
  const out: UnifiedDoc[] = [];

  // Source 1 — Document
  for (const doc of input.documents) {
    out.push({
      source: 'document',
      sourceId: doc.id,
      docType: doc.type,
      label: labelForDocType(doc.type),
      scope: ENTITY_TYPE_TO_SCOPE[doc.entityType] ?? 'session',
      sessionId: doc.sessionId,
      participantId: doc.participantId,
      personId: null,
      href: `/api/documents/${doc.id}`,
      usedStub: false,
      generatedAt: doc.createdAt,
    });
  }

  // Source 2 — PedagogicalAsset
  for (const asset of input.pedagogicalAssets) {
    const docType = PED_KIND_TO_DOC_TYPE[asset.kind] ?? null;
    out.push({
      source: 'pedagogical_asset',
      sourceId: asset.id,
      docType,
      label: docType
        ? labelForDocType(docType)
        : (PED_KIND_LABELS[asset.kind] ?? asset.kind),
      scope: asset.participantId ? 'participant' : 'session',
      sessionId: asset.sessionId,
      participantId: asset.participantId,
      personId: null,
      href: asset.pdfUrl
        ? `/api/pedagogical-assets/${asset.id}`
        : `/app/sessions/${asset.sessionId}`,
      usedStub: assetUsedStub(asset.rawJson),
      generatedAt: asset.generatedAt,
    });
  }

  // Sources 3 + 4 — Person.ribKey / SensitiveData.idDocumentUrl
  if (input.identity) {
    const { personId, ribKey, idDocumentUrl, idDocumentType } = input.identity;
    if (hasText(idDocumentUrl)) {
      out.push({
        source: 'sensitive_cni',
        sourceId: `sensitive_cni:${personId}`,
        docType: null,
        label: `Pièce d'identité (${idDocumentType ?? 'CNI'})`,
        scope: 'person',
        sessionId: null,
        participantId: null,
        personId,
        href: `/api/apprenants/${personId}/docs/cni`,
        usedStub: false,
        generatedAt: null,
      });
    }
    if (hasText(ribKey)) {
      out.push({
        source: 'person_rib',
        sourceId: `person_rib:${personId}`,
        docType: null,
        label: 'RIB',
        scope: 'person',
        sessionId: null,
        participantId: null,
        personId,
        href: `/api/apprenants/${personId}/docs/rib`,
        usedStub: false,
        generatedAt: null,
      });
    }
  }

  // Source 5 — AgeficeProfile.cfpAttestationKey
  for (const cfp of input.cfpAttestations ?? []) {
    if (!hasText(cfp.cfpAttestationKey)) continue;
    out.push({
      source: 'agefice_cfp',
      sourceId: `agefice_cfp:${cfp.organizationId}`,
      docType: null,
      label: 'Attestation CFP (AGEFICE)',
      scope: 'organization',
      sessionId: null,
      participantId: null,
      personId: cfp.personId,
      href: `/api/apprenants/${cfp.personId}/docs/cfp`,
      usedStub: false,
      generatedAt: null,
    });
  }

  // Source 6 — markdown tenant (CGV / Règlement intérieur)
  if (input.tenantLegal) {
    const entries: Array<{ docType: 'CGV' | 'REGLEMENT_INTERIEUR'; markdown: string | null; label: string }> = [
      { docType: 'CGV', markdown: input.tenantLegal.cgvMarkdown, label: 'Conditions Générales de Vente' },
      {
        docType: 'REGLEMENT_INTERIEUR',
        markdown: input.tenantLegal.reglementInterieurMarkdown,
        label: 'Règlement intérieur',
      },
    ];
    for (const entry of entries) {
      if (!hasText(entry.markdown)) continue;
      out.push({
        source: 'tenant_markdown',
        sourceId: `tenant_markdown:${entry.docType}`,
        docType: entry.docType,
        label: entry.label,
        scope: 'tenant',
        sessionId: null,
        participantId: null,
        personId: null,
        href: '/app/parametres',
        usedStub: false,
        generatedAt: null,
      });
    }
  }

  // Tri : daté desc d'abord, non-daté (identité / tenant) en fin, ordre stable.
  return out.sort((a, b) => {
    if (a.generatedAt === null && b.generatedAt === null) return 0;
    if (a.generatedAt === null) return 1;
    if (b.generatedAt === null) return -1;
    return b.generatedAt.getTime() - a.generatedAt.getTime();
  });
}
