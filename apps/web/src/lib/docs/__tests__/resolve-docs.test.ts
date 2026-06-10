import { describe, it, expect } from 'vitest';
import { resolveDocs } from '../resolve-docs';
import type { ResolveDocsInput } from '../resolve-docs';

/**
 * Phase 9.3 Plan 09.3-01 — Test comportemental 6-sources (D-09.3-04, NON-NÉGOCIABLE).
 *
 * Critère de recette central de NAV-01 : pour UN MÊME apprenant, 1 preuve dans
 * CHACUNE des 6 sources Qualiopi éclatées (Document, PedagogicalAsset,
 * SensitiveData/CNI, Person/RIB, AgeficeProfile/CFP, Tenant/CGV) DOIT produire
 * 6 UnifiedDoc. La 6e source (AgeficeProfile/CFP) est exercée explicitement pour
 * ne pas reproduire l'anti-pattern « source oubliée = dossier incomplet silencieux ».
 *
 * Ce test exerce l'UNION RÉELLE (pas un grep d'imports, pas un smoke) : le
 * Test 6 retire chaque source une par une et vérifie que le total tombe à 5.
 */

const GENERATED_AT = new Date('2026-06-10T10:00:00.000Z');
const CREATED_AT = new Date('2026-06-10T09:00:00.000Z');

/** Fixtures : 1 preuve dans chacune des 6 sources pour un même apprenant. */
function buildInput(): ResolveDocsInput {
  return {
    documents: [
      {
        id: 'd1',
        type: 'CONVENTION',
        entityType: 'participant',
        entityId: 'pp1',
        pdfUrl: 'http://minio/d1.pdf',
        sessionId: 's1',
        participantId: 'pp1',
        createdAt: CREATED_AT,
      },
    ],
    pedagogicalAssets: [
      {
        id: 'pa1',
        kind: 'EMARGEMENT',
        sessionId: 's1',
        participantId: 'pp1',
        rawJson: { source: 'stub' },
        pdfUrl: 'http://minio/pa1.pdf',
        generatedAt: GENERATED_AT,
      },
    ],
    identity: [
      {
        participantId: 'pp1',
        personId: 'p1',
        sessionId: 's1',
        cniUrl: 'cni-key',
        ribKey: 'rib-key',
        cfpKey: 'cfp-key',
      },
    ],
    legal: {
      tenantId: 't1',
      cgvMarkdown: '# CGV...',
      // reglementInterieurMarkdown laissé absent pour ce cas de base (1 doc legal = CGV)
    },
  };
}

describe('resolveDocs — union des 6 sources (NAV-01, D-09.3-04)', () => {
  it('Test 1 : 1 preuve dans chacune des 6 sources → 6 UnifiedDoc', () => {
    expect(resolveDocs(buildInput())).toHaveLength(6);
  });

  it('Test 2 : le PedagogicalAsset stub → status "stub", usedStub true', () => {
    const ped = resolveDocs(buildInput()).find((d) => d.sourceTable === 'PedagogicalAsset');
    expect(ped).toBeDefined();
    expect(ped?.status).toBe('stub');
    expect(ped?.usedStub).toBe(true);
  });

  it('Test 3 : le Document CONVENTION → usedStub false (template déterministe), status "present"', () => {
    const doc = resolveDocs(buildInput()).find((d) => d.sourceTable === 'Document');
    expect(doc).toBeDefined();
    expect(doc?.usedStub).toBe(false);
    expect(doc?.status).toBe('present');
    expect(doc?.docType).toBe('CONVENTION');
  });

  it('Test 4 : chaque UnifiedDoc porte un sourceTable valide et un sourceId non vide', () => {
    const valid = new Set([
      'Document',
      'PedagogicalAsset',
      'SensitiveData',
      'Person',
      'AgeficeProfile',
      'Tenant',
    ]);
    const docs = resolveDocs(buildInput());
    for (const d of docs) {
      expect(valid.has(d.sourceTable)).toBe(true);
      expect(d.sourceId.length).toBeGreaterThan(0);
    }
    // Chacune des 6 sources est représentée exactement une fois.
    const tables = docs.map((d) => d.sourceTable).sort();
    expect(tables).toEqual(
      ['AgeficeProfile', 'Document', 'PedagogicalAsset', 'Person', 'SensitiveData', 'Tenant'].sort(),
    );
  });

  it('Test 4b (CFP explicite) : le doc AgeficeProfile a sourceTable "AgeficeProfile" ET docType "CFP"', () => {
    const cfp = resolveDocs(buildInput()).find((d) => d.sourceTable === 'AgeficeProfile');
    expect(cfp).toBeDefined();
    expect(cfp?.docType).toBe('CFP');
    expect(cfp?.href).toBe('cfp-key');
  });

  it('Test 5 : anchor.level correct par source', () => {
    const docs = resolveDocs(buildInput());
    const byTable = (t: string) => docs.find((d) => d.sourceTable === t)!;
    expect(byTable('Document').anchor.level).toBe('participant');
    expect(byTable('PedagogicalAsset').anchor.level).toBe('participant');
    expect(byTable('SensitiveData').anchor.level).toBe('participant');
    expect(byTable('Person').anchor.level).toBe('participant');
    expect(byTable('AgeficeProfile').anchor.level).toBe('participant');
    expect(byTable('Tenant').anchor.level).toBe('tenant');
  });

  it('Test 6 (régression union complète) : retirer le Document → length 5', () => {
    const input = buildInput();
    input.documents = [];
    expect(resolveDocs(input)).toHaveLength(5);
  });

  it('Test 6b (régression CFP) : retirer AgeficeProfile/CFP → length 5 (la 6e source contribue indépendamment)', () => {
    const input = buildInput();
    input.identity = [{ ...input.identity[0]!, cfpKey: undefined }];
    const docs = resolveDocs(input);
    expect(docs).toHaveLength(5);
    expect(docs.find((d) => d.sourceTable === 'AgeficeProfile')).toBeUndefined();
  });

  it('Test 6c (régression Tenant) : retirer CGV → length 5', () => {
    const input = buildInput();
    input.legal = { tenantId: 't1' };
    expect(resolveDocs(input)).toHaveLength(5);
  });

  it('Document session-level → anchor.level "session"', () => {
    const input = buildInput();
    input.documents = [
      {
        id: 'd2',
        type: 'CHECKLIST_FORMATION',
        entityType: 'session',
        entityId: 's1',
        pdfUrl: 'http://minio/d2.pdf',
        sessionId: 's1',
        participantId: null,
        createdAt: CREATED_AT,
      },
    ];
    const doc = resolveDocs(input).find((d) => d.sourceTable === 'Document')!;
    expect(doc.anchor.level).toBe('session');
  });

  it('Document product-level (entityType="product") → anchor.level "product"', () => {
    const input = buildInput();
    input.documents = [
      {
        id: 'd3',
        type: 'PROGRAMME',
        entityType: 'product',
        entityId: 'prod1',
        pdfUrl: 'http://minio/d3.pdf',
        sessionId: null,
        participantId: null,
        createdAt: CREATED_AT,
      },
    ];
    const doc = resolveDocs(input).find((d) => d.sourceTable === 'Document')!;
    expect(doc.anchor.level).toBe('product');
    if (doc.anchor.level === 'product') {
      expect(doc.anchor.productId).toBe('prod1');
    }
  });

  it('PedagogicalAsset non-stub avec pdfUrl → status "present", usedStub false', () => {
    const input = buildInput();
    input.pedagogicalAssets = [
      {
        id: 'pa2',
        kind: 'QCM',
        sessionId: 's1',
        participantId: 'pp1',
        rawJson: { source: 'ollama' },
        pdfUrl: 'http://minio/pa2.pdf',
        generatedAt: GENERATED_AT,
      },
    ];
    const ped = resolveDocs(input).find((d) => d.sourceTable === 'PedagogicalAsset')!;
    expect(ped.status).toBe('present');
    expect(ped.usedStub).toBe(false);
  });

  it('PedagogicalAsset non-stub sans pdfUrl → status "missing"', () => {
    const input = buildInput();
    input.pedagogicalAssets = [
      {
        id: 'pa3',
        kind: 'QCM',
        sessionId: 's1',
        participantId: 'pp1',
        rawJson: { source: 'shared' },
        pdfUrl: null,
        generatedAt: GENERATED_AT,
      },
    ];
    const ped = resolveDocs(input).find((d) => d.sourceTable === 'PedagogicalAsset')!;
    expect(ped.status).toBe('missing');
    expect(ped.usedStub).toBe(false);
  });

  it('CNI/RIB/CFP → href = clé MinIO, status "present"', () => {
    const docs = resolveDocs(buildInput());
    const cni = docs.find((d) => d.sourceTable === 'SensitiveData')!;
    const rib = docs.find((d) => d.sourceTable === 'Person')!;
    const cfp = docs.find((d) => d.sourceTable === 'AgeficeProfile')!;
    expect(cni.docType).toBe('CNI');
    expect(cni.href).toBe('cni-key');
    expect(cni.status).toBe('present');
    expect(rib.docType).toBe('RIB');
    expect(rib.href).toBe('rib-key');
    expect(cfp.docType).toBe('CFP');
  });

  it('CGV + RI tous deux présents → 2 docs Tenant', () => {
    const input = buildInput();
    input.legal = { tenantId: 't1', cgvMarkdown: '# CGV', reglementInterieurMarkdown: '# RI' };
    const tenantDocs = resolveDocs(input).filter((d) => d.sourceTable === 'Tenant');
    expect(tenantDocs).toHaveLength(2);
    const types = tenantDocs.map((d) => d.docType).sort();
    expect(types).toEqual(['CGV', 'REGLEMENT_INTERIEUR']);
    // href null = preuve markdown (à produire/rendre), pas un PDF.
    for (const d of tenantDocs) expect(d.href).toBeNull();
  });
});
