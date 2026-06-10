/**
 * Phase 9.3 — Navigation documentaire unifiée — Résolveur LECTURE pur.
 *
 * `resolveDocs` UNIONise les 6 sources de preuves Qualiopi éclatées
 * (Document, PedagogicalAsset, SensitiveData/CNI, Person/RIB, AgeficeProfile/CFP,
 * Tenant/CGV-RI) en une liste `UnifiedDoc[]` normalisée.
 *
 * Contrainte d'architecture (D-09.3-01, CONTEXT.md) : ZÉRO import du package DB.
 * C'est une FONCTION PURE testable sans base de données. L'accès Prisma + le
 * scope `tenantId` vivent dans les wrappers `get-docs-for.ts`.
 *
 * Contrat `UnifiedDoc` figé verbatim depuis 09.3-CONTEXT.md.
 *
 * Règle `usedStub` (tracée code, renderer.ts:155) : un PedagogicalAsset est un
 * stub quand `rawJson.source === 'stub'`. Les docs basés sur `Document`
 * (convention / convocation / certificat / AGEFICE / programme) sont des
 * templates déterministes → jamais stub → `usedStub=false`.
 */

// === Contrat figé (CONTEXT.md) ===

export type DocSourceTable =
  | 'Document'
  | 'PedagogicalAsset'
  | 'SensitiveData' /*CNI*/
  | 'Person' /*RIB*/
  | 'AgeficeProfile' /*CFP*/
  | 'Tenant' /*CGV/RI*/;

export type DocAnchor =
  | { level: 'participant'; participantId: string; personId: string; sessionId: string }
  | { level: 'session'; sessionId: string }
  | { level: 'product'; productId: string }
  | { level: 'tenant'; tenantId: string };

export interface UnifiedDoc {
  sourceTable: DocSourceTable; // D-#2 : réf polymorphe (T7-ready)
  sourceId: string;
  docType: string;
  qualiopiIndicator: string | null; // D-#1 : conformité, pas juste existence
  anchor: DocAnchor;
  generatedAt: Date | null;
  href: string | null; // null = preuve à produire (markdown tenant) ou clé MinIO sinon
  status: 'present' | 'stub' | 'missing';
  usedStub: boolean; // D-#1 : stub = pire qu'absent (blocker T4 ind. 11)
}

// === Row-types minces (champs LUS seulement — pas le type Prisma complet,
//     pour rester testable sans DB). ===

export interface DocumentRow {
  id: string;
  type: string; // DocType (enum Prisma) — gardé string pour découplage
  entityType: string; // "session" | "participant" | "product" | "tenant" | "invoice"
  entityId: string;
  pdfUrl: string;
  sessionId: string | null;
  participantId: string | null;
  createdAt: Date;
}

export interface PedAssetRow {
  id: string;
  kind: string; // PedagogicalKind (enum Prisma)
  sessionId: string;
  participantId: string | null;
  rawJson: unknown; // attendu : { source?: 'ollama'|'stub'|'shared', ... }
  pdfUrl: string | null;
  generatedAt: Date;
}

export interface IdentityRow {
  participantId: string;
  personId: string;
  sessionId: string;
  cniUrl?: string | null; // SensitiveData.idDocumentUrl
  ribKey?: string | null; // Person.ribKey
  cfpKey?: string | null; // AgeficeProfile.cfpAttestationKey
}

export interface LegalInput {
  tenantId: string;
  cgvMarkdown?: string | null;
  reglementInterieurMarkdown?: string | null;
}

export interface ResolveDocsInput {
  documents: DocumentRow[];
  pedagogicalAssets: PedAssetRow[];
  identity: IdentityRow[];
  legal: LegalInput;
  /** Réservé T7 / OPCO jalons — pas encore unionisé (D-09.3-07). */
  opcoSubmissions?: never;
}

/**
 * Map docType → indicateur Qualiopi V1.
 *
 * Volontairement PARTIEL : le câblage fin du catalog (seed `QualiopiDocCatalog`)
 * + corrections RNQ V9 (D-09.3-08) sont dans le Plan 09.3-02. Ici on accepte
 * `null` pour tout type non mappé (NE PAS bloquer — cf <action> §7 du plan).
 * Les valeurs présentes reprennent les indicateurs déjà non-contestés du CONTEXT
 * (EMARGEMENT 12, EVALUATION_ACQUIS 11, ATTESTATION_FIN 11). Les types ambigus
 * (CONVENTION, PROGRAMME, CONVOCATION…) sont laissés `null` pour ne pas figer
 * une valeur que le Plan 02 va trancher sur 3 sources.
 */
const DOC_TYPE_TO_INDICATOR: Record<string, string | null> = {
  EMARGEMENT: '12',
  ASSIDUITE: '12',
  EVALUATION_ACQUIS: '11',
  QCM: '11',
  ATTESTATION_FIN: '11',
  CERTIFICAT_REALISATION: '11',
};

function indicatorFor(docType: string): string | null {
  return DOC_TYPE_TO_INDICATOR[docType] ?? null;
}

/** Déduit l'ancrage d'un Document depuis entityType (seules sessionId/participantId sont de vraies FK). */
function anchorForDocument(doc: DocumentRow): DocAnchor {
  switch (doc.entityType) {
    case 'participant':
      return {
        level: 'participant',
        participantId: doc.participantId ?? doc.entityId,
        // personId indisponible au niveau Document (pas de FK) — chaîne vide tolérée :
        // le wrapper qui connaît la racine Person peut ré-enrichir si nécessaire.
        personId: '',
        sessionId: doc.sessionId ?? '',
      };
    case 'session':
      return { level: 'session', sessionId: doc.sessionId ?? doc.entityId };
    case 'product':
      return { level: 'product', productId: doc.entityId };
    case 'tenant':
      return { level: 'tenant', tenantId: doc.entityId };
    default:
      // invoice ou autre → rattaché à la session si dispo, sinon entityId.
      return { level: 'session', sessionId: doc.sessionId ?? doc.entityId };
  }
}

/** Extrait `rawJson.source` de façon défensive (rawJson est un Json Prisma non typé). */
function pedSource(rawJson: unknown): string | undefined {
  if (rawJson && typeof rawJson === 'object' && 'source' in rawJson) {
    const s = (rawJson as { source?: unknown }).source;
    return typeof s === 'string' ? s : undefined;
  }
  return undefined;
}

/**
 * Résolveur pur : UNION des 6 sources → UnifiedDoc[].
 * Aucun effet de bord, aucune lecture DB, déterministe.
 */
export function resolveDocs(input: ResolveDocsInput): UnifiedDoc[] {
  const out: UnifiedDoc[] = [];

  // 1) Document → UnifiedDoc (templates déterministes : usedStub=false, status=present).
  for (const doc of input.documents) {
    out.push({
      sourceTable: 'Document',
      sourceId: doc.id,
      docType: doc.type,
      qualiopiIndicator: indicatorFor(doc.type),
      anchor: anchorForDocument(doc),
      generatedAt: doc.createdAt,
      href: doc.pdfUrl,
      status: 'present',
      usedStub: false,
    });
  }

  // 2) PedagogicalAsset → UnifiedDoc (seule source potentiellement stub).
  for (const pa of input.pedagogicalAssets) {
    const usedStub = pedSource(pa.rawJson) === 'stub';
    const status: UnifiedDoc['status'] = usedStub ? 'stub' : pa.pdfUrl ? 'present' : 'missing';
    out.push({
      sourceTable: 'PedagogicalAsset',
      sourceId: pa.id,
      docType: pa.kind,
      qualiopiIndicator: indicatorFor(pa.kind),
      anchor: pa.participantId
        ? { level: 'participant', participantId: pa.participantId, personId: '', sessionId: pa.sessionId }
        : { level: 'session', sessionId: pa.sessionId },
      generatedAt: pa.generatedAt,
      href: pa.pdfUrl,
      status,
      usedStub,
    });
  }

  // 3) Identité (CNI / RIB / CFP) → clés MinIO éparses. Les 3 DOIVENT être émis.
  //    sourceId = la clé MinIO elle-même (pas de row id distinct disponible).
  for (const id of input.identity) {
    const participantAnchor: DocAnchor = {
      level: 'participant',
      participantId: id.participantId,
      personId: id.personId,
      sessionId: id.sessionId,
    };
    if (id.cniUrl) {
      out.push({
        sourceTable: 'SensitiveData',
        sourceId: id.cniUrl,
        docType: 'CNI',
        qualiopiIndicator: null,
        anchor: participantAnchor,
        generatedAt: null,
        href: id.cniUrl,
        status: 'present',
        usedStub: false,
      });
    }
    if (id.ribKey) {
      out.push({
        sourceTable: 'Person',
        sourceId: id.ribKey,
        docType: 'RIB',
        qualiopiIndicator: null,
        anchor: participantAnchor,
        generatedAt: null,
        href: id.ribKey,
        status: 'present',
        usedStub: false,
      });
    }
    if (id.cfpKey) {
      // 6e source — AgeficeProfile/CFP. NE JAMAIS l'oublier de l'union (D-09.3-04).
      out.push({
        sourceTable: 'AgeficeProfile',
        sourceId: id.cfpKey,
        docType: 'CFP',
        qualiopiIndicator: null,
        anchor: participantAnchor,
        generatedAt: null,
        href: id.cfpKey,
        status: 'present',
        usedStub: false,
      });
    }
  }

  // 4) Legal (CGV / RI) — markdown Tenant. href=null (preuve à rendre, pas un PDF stocké).
  if (input.legal.cgvMarkdown) {
    out.push({
      sourceTable: 'Tenant',
      sourceId: input.legal.tenantId,
      docType: 'CGV',
      qualiopiIndicator: null,
      anchor: { level: 'tenant', tenantId: input.legal.tenantId },
      generatedAt: null,
      href: null,
      status: 'present',
      usedStub: false,
    });
  }
  if (input.legal.reglementInterieurMarkdown) {
    out.push({
      sourceTable: 'Tenant',
      sourceId: input.legal.tenantId,
      docType: 'REGLEMENT_INTERIEUR',
      qualiopiIndicator: null,
      anchor: { level: 'tenant', tenantId: input.legal.tenantId },
      generatedAt: null,
      href: null,
      status: 'present',
      usedStub: false,
    });
  }

  return out;
}
