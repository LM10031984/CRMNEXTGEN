import { describe, it, expect } from 'vitest';

/**
 * Phase 9.3 (plan 09.3-01) — test comportemental du résolveur `resolveDocs`.
 *
 * Garde l'invariant : l'UNION couvre les 6 TABLES sources du stockage
 * documentaire (MATRICE-NAVIGATION-DOCS, plan directeur Partie 1 §3 —
 * vérifié schema.prisma, correctif D-09.3 discriminant 2026-06-10) :
 *   1. Document
 *   2. PedagogicalAsset
 *   3. Person          (.ribKey, schema l.155)
 *   4. SensitiveData   (.idDocumentUrl — CNI, schema l.185)
 *   5. AgeficeProfile  (.cfpAttestationKey, schema l.1267)
 *   6. Tenant          (.cgvMarkdown / .reglementInterieurMarkdown, l.51-52)
 *
 * Le discriminant est la référence POLYMORPHE `sourceTable` + `sourceId`
 * (topologie des tables réelles), pas un enum métier : une source = une
 * table. CNI et RIB sont deux tables distinctes (SensitiveData ≠ Person).
 *
 * Gate "test de puissance par mutation" : chaque TABLE a son assertion
 * dédiée — commenter une table dans resolveDocs() doit passer ce test
 * au rouge.
 */

import { resolveDocs, unifiedDocKey, type ResolveDocsInput } from '../resolve-docs';

const FULL_INPUT: ResolveDocsInput = {
  documents: [
    {
      id: 'doc-1',
      type: 'CONVENTION',
      entityType: 'participant',
      entityId: 'part-1',
      sessionId: 'ses-1',
      participantId: 'part-1',
      createdAt: new Date('2026-05-01T10:00:00Z'),
    },
    {
      id: 'doc-2',
      type: 'PROGRAMME',
      entityType: 'product',
      entityId: 'prod-1',
      sessionId: null,
      participantId: null,
      createdAt: new Date('2026-04-01T10:00:00Z'),
    },
  ],
  pedagogicalAssets: [
    {
      id: 'asset-1',
      kind: 'QCM',
      sessionId: 'ses-1',
      participantId: 'part-1',
      pdfUrl: 'closure/t1/ses-1/qcm.pdf',
      rawJson: { source: 'ollama', questions: [] },
      generatedAt: new Date('2026-05-02T10:00:00Z'),
    },
    {
      id: 'asset-2',
      kind: 'GRILLE_OBS',
      sessionId: 'ses-1',
      participantId: null,
      pdfUrl: 'closure/t1/ses-1/grille.pdf',
      rawJson: { source: 'stub' },
      generatedAt: new Date('2026-05-02T11:00:00Z'),
    },
  ],
  identity: {
    personId: 'pers-1',
    sensitiveDataId: 'sd-1',
    ribKey: 'rib/pers-1.pdf',
    idDocumentUrl: 'cni/pers-1.pdf',
    idDocumentType: 'CNI',
  },
  cfpAttestations: [
    {
      ageficeProfileId: 'agf-1',
      organizationId: 'org-1',
      personId: 'pers-1',
      cfpAttestationKey: 'cfp/org-1.pdf',
    },
  ],
  tenantLegal: {
    tenantId: 'tenant-1',
    cgvMarkdown: '# CGV\nContenu…',
    reglementInterieurMarkdown: '# RI\nContenu…',
  },
};

describe('resolveDocs — UNION des 6 tables sources', () => {
  const docs = resolveDocs(FULL_INPUT);

  it('table 1 — Document : rows exposées avec scope dérivé de entityType + href API', () => {
    const conv = docs.find((d) => d.sourceTable === 'Document' && d.sourceId === 'doc-1');
    expect(conv).toBeDefined();
    expect(conv?.docType).toBe('CONVENTION');
    expect(conv?.scope).toBe('participant');
    expect(conv?.href).toBe('/api/documents/doc-1');
    expect(conv?.label).toBe('Convention de formation');

    const prog = docs.find((d) => d.sourceTable === 'Document' && d.sourceId === 'doc-2');
    expect(prog?.scope).toBe('product');
  });

  it('table 2 — PedagogicalAsset : assets exposés avec docType remappé + href API', () => {
    const qcm = docs.find((d) => d.sourceTable === 'PedagogicalAsset' && d.sourceId === 'asset-1');
    expect(qcm).toBeDefined();
    expect(qcm?.docType).toBe('EVALUATION_ACQUIS');
    expect(qcm?.scope).toBe('participant');
    expect(qcm?.href).toBe('/api/pedagogical-assets/asset-1');
    expect(qcm?.usedStub).toBe(false);
  });

  it('table 3 — Person (.ribKey) : RIB exposé, sourceId = id de la row Person', () => {
    const rib = docs.find((d) => d.sourceTable === 'Person');
    expect(rib).toBeDefined();
    expect(rib?.sourceId).toBe('pers-1');
    expect(rib?.scope).toBe('person');
    expect(rib?.href).toBe('/api/apprenants/pers-1/docs/rib');
  });

  it('table 4 — SensitiveData (.idDocumentUrl) : CNI exposée, sourceId = id de la row SensitiveData', () => {
    const cni = docs.find((d) => d.sourceTable === 'SensitiveData');
    expect(cni).toBeDefined();
    expect(cni?.sourceId).toBe('sd-1');
    expect(cni?.label).toContain('CNI');
    expect(cni?.href).toBe('/api/apprenants/pers-1/docs/cni');
  });

  it('table 5 — AgeficeProfile (.cfpAttestationKey) : attestation CFP exposée, sourceId = id de la row', () => {
    const cfp = docs.find((d) => d.sourceTable === 'AgeficeProfile');
    expect(cfp).toBeDefined();
    expect(cfp?.sourceId).toBe('agf-1');
    expect(cfp?.scope).toBe('organization');
    expect(cfp?.href).toBe('/api/apprenants/pers-1/docs/cfp');
  });

  it('table 6 — Tenant (markdown) : CGV + Règlement intérieur, sourceId = id de la row Tenant', () => {
    const cgv = docs.find((d) => d.sourceTable === 'Tenant' && d.docType === 'CGV');
    const ri = docs.find(
      (d) => d.sourceTable === 'Tenant' && d.docType === 'REGLEMENT_INTERIEUR',
    );
    expect(cgv).toBeDefined();
    expect(ri).toBeDefined();
    expect(cgv?.sourceId).toBe('tenant-1');
    expect(cgv?.scope).toBe('tenant');
    expect(cgv?.href).toBe('/app/parametres');
  });

  it('les clés unifiées sont uniques (Tenant porte 2 docs sur la même row)', () => {
    const keys = docs.map(unifiedDocKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('resolveDocs — badge usedStub', () => {
  it("marque usedStub=true quand rawJson.source === 'stub' (littéral 'no_proof' côté UI)", () => {
    const docs = resolveDocs(FULL_INPUT);
    const grille = docs.find((d) => d.sourceId === 'asset-2');
    expect(grille?.usedStub).toBe(true);
  });

  it('ne marque jamais usedStub sur un Document (pas de stub persisté sur ce modèle)', () => {
    const docs = resolveDocs(FULL_INPUT);
    for (const d of docs.filter((x) => x.sourceTable === 'Document')) {
      expect(d.usedStub).toBe(false);
    }
  });
});

describe('resolveDocs — sources absentes', () => {
  it('input vide → union vide (aucune entrée fantôme)', () => {
    expect(
      resolveDocs({ documents: [], pedagogicalAssets: [] }),
    ).toEqual([]);
  });

  it('ribKey null / idDocumentUrl null / cfp null / markdown vide → pas d’entrée', () => {
    const docs = resolveDocs({
      documents: [],
      pedagogicalAssets: [],
      identity: {
        personId: 'pers-1',
        sensitiveDataId: 'sd-1',
        ribKey: null,
        idDocumentUrl: null,
        idDocumentType: null,
      },
      cfpAttestations: [
        {
          ageficeProfileId: 'agf-1',
          organizationId: 'org-1',
          personId: 'pers-1',
          cfpAttestationKey: null,
        },
      ],
      tenantLegal: { tenantId: 'tenant-1', cgvMarkdown: null, reglementInterieurMarkdown: '   ' },
    });
    expect(docs).toEqual([]);
  });
});

describe('resolveDocs — tri', () => {
  it('ordonne par generatedAt desc, les pièces sans date (identité/tenant) en fin', () => {
    const docs = resolveDocs(FULL_INPUT);
    const dated = docs.filter((d) => d.generatedAt !== null);
    for (let i = 1; i < dated.length; i++) {
      expect(dated[i - 1]!.generatedAt!.getTime()).toBeGreaterThanOrEqual(
        dated[i]!.generatedAt!.getTime(),
      );
    }
    const firstUndatedIdx = docs.findIndex((d) => d.generatedAt === null);
    const lastDatedIdx = docs.map((d) => d.generatedAt !== null).lastIndexOf(true);
    if (firstUndatedIdx !== -1) {
      expect(firstUndatedIdx).toBeGreaterThan(lastDatedIdx);
    }
  });
});
