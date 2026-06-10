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

import { DOC_INDICATORS } from '@/lib/doc-scope';

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
  // ── 09.3-03-fix CORRECTION 2 — dédup version courante (champs ADDITIFS).
  //    Le résolveur remonte toutes les régénérations d'un même (docType × ancrage)
  //    comme versions successives. `version` = rang dans le groupe (N = la plus
  //    récente, 1 = la plus ancienne) ; `isCurrent` = vrai pour la plus récente
  //    SEULEMENT. L'UI n'affiche par défaut que `isCurrent:true`.
  version: number;
  isCurrent: boolean;
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
 * Map docType → indicateur Qualiopi.
 *
 * 09.3-03-fix CORRECTION 1 — SOURCE UNIQUE (NAV-05 étendu) : ZÉRO mapping local.
 * L'indicateur vient EXCLUSIVEMENT du catalogue `QUALIOPI_DOC_CATALOG_INDICATORS`
 * (doc-scope.ts), recoupé sur le RNQ V9. Format propagé TEL QUEL (« Indicateur 11 »,
 * « Légal Art. L6353-1 », null) — JAMAIS de numéro nu concaténé. Tout docType/kind
 * non couvert par le catalogue → `null` (ne bloque pas), mais le catalogue est
 * censé être EXHAUSTIF (cf test `resolve-docs.test.ts`).
 */
function indicatorFor(docType: string): string | null {
  return DOC_INDICATORS[docType] ?? null;
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
 * Doc « brut » avant calcul de version/isCurrent (CORRECTION 2).
 * Le résolveur construit d'abord ces RawDoc, puis `assignVersions` les groupe
 * par (docType × ancrage) et leur attribue version/isCurrent.
 */
type RawDoc = Omit<UnifiedDoc, 'version' | 'isCurrent'>;

/**
 * Clé d'ancrage logique pour la dédup (CORRECTION 2). « Cible logique » :
 *  - participant → sessionId + participantId (le doc d'UN stagiaire dans UNE session)
 *  - session     → sessionId
 *  - product     → productId
 *  - tenant      → tenantId
 * Combinée au docType, elle identifie une lignée de régénérations successives.
 */
function anchorKey(anchor: DocAnchor): string {
  switch (anchor.level) {
    case 'participant':
      return `participant:${anchor.sessionId}:${anchor.participantId}`;
    case 'session':
      return `session:${anchor.sessionId}`;
    case 'product':
      return `product:${anchor.productId}`;
    case 'tenant':
      return `tenant:${anchor.tenantId}`;
    default:
      return 'unknown';
  }
}

/**
 * CORRECTION 2 — regroupe les RawDoc par (docType × ancrage), trie chaque groupe
 * par `generatedAt` DESC (le plus récent d'abord), et attribue :
 *  - le plus récent → `isCurrent:true`, `version = N` (N = taille du groupe) ;
 *  - les autres     → `isCurrent:false`, `version = N-1, N-2, …` (rang décroissant).
 * Les docs sans `generatedAt` (identité/légal) sont traités comme une lignée
 * d'un seul élément la plupart du temps (sourceId distinct) → version 1, courant.
 */
function assignVersions(raws: RawDoc[]): UnifiedDoc[] {
  const groups = new Map<string, RawDoc[]>();
  for (const r of raws) {
    const key = `${r.docType}@@${anchorKey(r.anchor)}`;
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }

  const result: UnifiedDoc[] = [];
  for (const arr of groups.values()) {
    // Tri DESC par generatedAt (null = le plus ancien possible → epoch 0).
    const sorted = [...arr].sort(
      (a, b) => (b.generatedAt?.getTime() ?? 0) - (a.generatedAt?.getTime() ?? 0),
    );
    const total = sorted.length;
    sorted.forEach((r, idx) => {
      result.push({
        ...r,
        version: total - idx, // idx 0 (le plus récent) → version = N (courant)
        isCurrent: idx === 0,
      });
    });
  }
  return result;
}

/**
 * Résolveur pur : UNION des 6 sources → UnifiedDoc[].
 * Aucun effet de bord, aucune lecture DB, déterministe.
 *
 * CORRECTION 2 — chaque doc porte `version`/`isCurrent` calculés par dédup
 * (docType × ancrage). L'UI n'affiche par défaut que les courants.
 */
export function resolveDocs(input: ResolveDocsInput): UnifiedDoc[] {
  const out: RawDoc[] = [];

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
        qualiopiIndicator: indicatorFor('CNI'), // catalogue → null (source unique)
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
        qualiopiIndicator: indicatorFor('RIB'), // catalogue → null (source unique)
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
        qualiopiIndicator: indicatorFor('CFP'), // catalogue → null (source unique)
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
      qualiopiIndicator: indicatorFor('CGV'), // catalogue → null (source unique)
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
      qualiopiIndicator: indicatorFor('REGLEMENT_INTERIEUR'), // catalogue → null
      anchor: { level: 'tenant', tenantId: input.legal.tenantId },
      generatedAt: null,
      href: null,
      status: 'present',
      usedStub: false,
    });
  }

  // CORRECTION 2 — dédup version courante par (docType × ancrage).
  return assignVersions(out);
}
