import { describe, it, expect } from 'vitest';

/**
 * Phase 9.3 (plan 09.3-01) — test comportemental du résolveur `resolveDocs`.
 *
 * Garde l'invariant : l'UNION couvre les 6 sources de stockage documentaire
 * (MATRICE-NAVIGATION-DOCS, décision actée plan directeur Partie 1 §3) :
 *   1. Document (entityType participant/session/product/invoice/tenant)
 *   2. PedagogicalAsset (session-wide ou par participant)
 *   3. Person.ribKey               (RIB)
 *   4. SensitiveData.idDocumentUrl (CNI / pièce d'identité)
 *   5. AgeficeProfile.cfpAttestationKey (attestation CFP)
 *   6. Tenant.cgvMarkdown / reglementInterieurMarkdown (docs légaux)
 *
 * Gate "test de puissance par mutation" : chaque source a son assertion
 * dédiée — commenter une source dans resolveDocs() doit passer ce test
 * au rouge.
 */

import { resolveDocs, type ResolveDocsInput } from '../resolve-docs';

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
    ribKey: 'rib/pers-1.pdf',
    idDocumentUrl: 'cni/pers-1.pdf',
    idDocumentType: 'CNI',
  },
  cfpAttestations: [
    { organizationId: 'org-1', personId: 'pers-1', cfpAttestationKey: 'cfp/org-1.pdf' },
  ],
  tenantLegal: {
    cgvMarkdown: '# CGV\nContenu…',
    reglementInterieurMarkdown: '# RI\nContenu…',
  },
};

describe('resolveDocs — UNION des 6 sources', () => {
  const docs = resolveDocs(FULL_INPUT);

  it('source 1 — Document : expose les rows avec scope dérivé de entityType + href API', () => {
    const conv = docs.find((d) => d.source === 'document' && d.sourceId === 'doc-1');
    expect(conv).toBeDefined();
    expect(conv?.docType).toBe('CONVENTION');
    expect(conv?.scope).toBe('participant');
    expect(conv?.href).toBe('/api/documents/doc-1');
    expect(conv?.label).toBe('Convention de formation');

    const prog = docs.find((d) => d.source === 'document' && d.sourceId === 'doc-2');
    expect(prog?.scope).toBe('product');
  });

  it('source 2 — PedagogicalAsset : expose les assets avec docType remappé + href API', () => {
    const qcm = docs.find((d) => d.source === 'pedagogical_asset' && d.sourceId === 'asset-1');
    expect(qcm).toBeDefined();
    expect(qcm?.docType).toBe('EVALUATION_ACQUIS');
    expect(qcm?.scope).toBe('participant');
    expect(qcm?.href).toBe('/api/pedagogical-assets/asset-1');
    expect(qcm?.usedStub).toBe(false);
  });

  it('source 3 — Person.ribKey : expose le RIB avec href docs apprenant', () => {
    const rib = docs.find((d) => d.source === 'person_rib');
    expect(rib).toBeDefined();
    expect(rib?.scope).toBe('person');
    expect(rib?.href).toBe('/api/apprenants/pers-1/docs/rib');
  });

  it("source 4 — SensitiveData.idDocumentUrl : expose la pièce d'identité", () => {
    const cni = docs.find((d) => d.source === 'sensitive_cni');
    expect(cni).toBeDefined();
    expect(cni?.label).toContain('CNI');
    expect(cni?.href).toBe('/api/apprenants/pers-1/docs/cni');
  });

  it('source 5 — AgeficeProfile.cfpAttestationKey : expose l’attestation CFP', () => {
    const cfp = docs.find((d) => d.source === 'agefice_cfp');
    expect(cfp).toBeDefined();
    expect(cfp?.scope).toBe('organization');
    expect(cfp?.href).toBe('/api/apprenants/pers-1/docs/cfp');
  });

  it('source 6 — markdown tenant : expose CGV + Règlement intérieur', () => {
    const cgv = docs.find((d) => d.source === 'tenant_markdown' && d.docType === 'CGV');
    const ri = docs.find(
      (d) => d.source === 'tenant_markdown' && d.docType === 'REGLEMENT_INTERIEUR',
    );
    expect(cgv).toBeDefined();
    expect(ri).toBeDefined();
    expect(cgv?.scope).toBe('tenant');
    expect(cgv?.href).toBe('/app/parametres');
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
    for (const d of docs.filter((x) => x.source === 'document')) {
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
      identity: { personId: 'pers-1', ribKey: null, idDocumentUrl: null, idDocumentType: null },
      cfpAttestations: [{ organizationId: 'org-1', personId: 'pers-1', cfpAttestationKey: null }],
      tenantLegal: { cgvMarkdown: null, reglementInterieurMarkdown: '   ' },
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
