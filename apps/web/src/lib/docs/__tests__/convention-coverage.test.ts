import { describe, it, expect } from 'vitest';
import {
  GROUP_CONVENTION_ENTITY_TYPE,
  GROUP_CONVENTION_ENTITY_TYPES,
  groupConventionWhere,
  groupConventionAnyShapeWhere,
  isGroupConventionDoc,
  expandGroupConventions,
  isCoveredByGroupConvention,
} from '../convention-coverage';

/**
 * Quick 260820-j8w — helper de couverture convention (suite revue Codex PR #13).
 *
 * La convention groupe est rattachée à l'ORGANISATION commanditaire, pas aux
 * participants. Quatre consommateurs doivent la résoudre de la même façon
 * (fiche session, dossier OPCO, statut de préparation, garde anti-doublon) —
 * d'où cette source unique. C'est le fait d'avoir traité un seul consommateur
 * qui avait produit les 5 findings.
 */

const PARTICIPANTS = [
  { id: 'sp-1', sponsorOrgId: 'org-optimmo' },
  { id: 'sp-2', sponsorOrgId: 'org-optimmo' },
  { id: 'sp-3', sponsorOrgId: 'org-autre' },
  { id: 'sp-4', sponsorOrgId: 'org-ei-alice' }, // auto-payeur
];

const DOC_GROUPE = {
  id: 'doc-groupe',
  type: 'CONVENTION',
  entityType: GROUP_CONVENTION_ENTITY_TYPE,
  entityId: 'org-optimmo',
};

describe('expandGroupConventions', () => {
  it('couvre tous les salariés du commanditaire, et eux seuls', () => {
    const m = expandGroupConventions([DOC_GROUPE], PARTICIPANTS);
    expect([...m.keys()].sort()).toEqual(['sp-1', 'sp-2']);
    expect(m.get('sp-1')).toBe('doc-groupe');
    expect(m.has('sp-3')).toBe(false); // autre commanditaire
    expect(m.has('sp-4')).toBe(false); // auto-payeur
  });

  it('ignore les documents d’un autre type rattachés à une organisation', () => {
    const autre = { ...DOC_GROUPE, id: 'doc-x', type: 'FACTURE' };
    expect(expandGroupConventions([autre], PARTICIPANTS).size).toBe(0);
  });

  it('ignore les conventions individuelles (entityType=participant)', () => {
    const individuelle = {
      id: 'doc-indiv',
      type: 'CONVENTION',
      entityType: 'participant',
      entityId: 'sp-1',
    };
    expect(expandGroupConventions([individuelle], PARTICIPANTS).size).toBe(0);
  });

  it('renvoie une map vide quand aucun document n’est fourni', () => {
    expect(expandGroupConventions([], PARTICIPANTS).size).toBe(0);
  });

  it('gère plusieurs commanditaires en une passe', () => {
    const docAutre = { ...DOC_GROUPE, id: 'doc-2', entityId: 'org-autre' };
    const m = expandGroupConventions([DOC_GROUPE, docAutre], PARTICIPANTS);
    expect(m.get('sp-1')).toBe('doc-groupe');
    expect(m.get('sp-3')).toBe('doc-2');
    expect(m.size).toBe(3);
  });
});

describe('isCoveredByGroupConvention', () => {
  it('vrai pour un salarié du commanditaire, faux pour un auto-payeur', () => {
    expect(isCoveredByGroupConvention([DOC_GROUPE], PARTICIPANTS[0]!)).toBe(true);
    expect(isCoveredByGroupConvention([DOC_GROUPE], PARTICIPANTS[3]!)).toBe(false);
  });
});

describe('groupConventionWhere', () => {
  it('scelle tenant + type + entityType + org + session', () => {
    expect(groupConventionWhere('tnt-1', 'ses-1', 'org-optimmo')).toEqual({
      tenantId: 'tnt-1',
      type: 'CONVENTION',
      entityType: GROUP_CONVENTION_ENTITY_TYPE,
      entityId: 'org-optimmo',
      sessionId: 'ses-1',
    });
  });

  it('reste scopé au tenant (jamais de fuite inter-tenant)', () => {
    expect(groupConventionWhere('tnt-2', 'ses-1', 'org-optimmo').tenantId).toBe('tnt-2');
  });
});

/**
 * Quick 260821-md8 — DEUX formes de stockage rivales pour le même document.
 *
 * Vérifié en base cloud le 21/08 sur SES-0107 / SES-0108 :
 *  - les scripts `_gen-*` écrivent la convention de groupe en
 *    `entityType='session'`, `entityId=sessionId`, `participantId=null`
 *    (portée = la session entière, aucun commanditaire porté) ;
 *  - l'appli (quick 260817-mm0) l'écrit en `entityType='organization'`,
 *    `entityId=sponsorOrgId` (portée = les salariés de ce commanditaire).
 *
 * Les deux cohabitaient sans se connaître : c'est la cause du doublon
 * constaté. `organization` reste la seule forme d'ÉCRITURE ; `session` devient
 * une forme RECONNUE EN LECTURE, sinon l'appli annonce « convention
 * manquante » sur un document qui existe.
 *
 * Test de puissance : retirer `'session'` de GROUP_CONVENTION_ENTITY_TYPES
 * fait rougir ce bloc.
 */
const DOC_SESSION_SHAPE = {
  id: 'doc-script',
  type: 'CONVENTION',
  entityType: 'session',
  entityId: 'ses-1',
};

describe('reconnaissance des deux formes de convention groupe', () => {
  it('déclare les deux formes en lecture, mais n’écrit qu’en `organization`', () => {
    expect([...GROUP_CONVENTION_ENTITY_TYPES]).toEqual(['organization', 'session']);
    expect(GROUP_CONVENTION_ENTITY_TYPE).toBe('organization');
    expect(GROUP_CONVENTION_ENTITY_TYPES).toContain(GROUP_CONVENTION_ENTITY_TYPE);
  });

  it('isGroupConventionDoc reconnaît les deux formes et rejette le reste', () => {
    expect(isGroupConventionDoc(DOC_GROUPE)).toBe(true);
    expect(isGroupConventionDoc(DOC_SESSION_SHAPE)).toBe(true);
    // Convention individuelle → n'est pas un document de groupe.
    expect(
      isGroupConventionDoc({ id: 'd', type: 'CONVENTION', entityType: 'participant', entityId: 'sp-1' }),
    ).toBe(false);
    // Autre type rattaché à une organisation → ignoré.
    expect(isGroupConventionDoc({ ...DOC_GROUPE, type: 'FACTURE' })).toBe(false);
    // Check-list de session : même entityType, mais pas une convention.
    expect(isGroupConventionDoc({ ...DOC_SESSION_SHAPE, type: 'CHECKLIST_FORMATION' })).toBe(false);
  });

  it('la forme `session` couvre TOUS les inscrits reçus (portée = session entière)', () => {
    // Précondition de l'appelant : ne passer que les participants de CETTE
    // session — le document ne porte aucun commanditaire pour discriminer.
    const m = expandGroupConventions([DOC_SESSION_SHAPE], PARTICIPANTS);
    expect([...m.keys()].sort()).toEqual(['sp-1', 'sp-2', 'sp-3', 'sp-4']);
    expect(m.get('sp-4')).toBe('doc-script');
  });

  it('avec les deux formes, chaque inscrit est couvert UNE fois et `organization` gagne', () => {
    // La forme `organization` porte le commanditaire : c'est elle qui fait foi
    // quand les deux cohabitent (cas exact de SES-0107 / SES-0108).
    const m = expandGroupConventions([DOC_SESSION_SHAPE, DOC_GROUPE], PARTICIPANTS);
    expect(m.size).toBe(4);
    expect(m.get('sp-1')).toBe('doc-groupe'); // salarié du commanditaire
    expect(m.get('sp-2')).toBe('doc-groupe');
    expect(m.get('sp-3')).toBe('doc-script'); // autre commanditaire, couvert par la session
    expect(m.get('sp-4')).toBe('doc-script');
  });

  it('isCoveredByGroupConvention voit aussi la convention produite par script', () => {
    expect(isCoveredByGroupConvention([DOC_SESSION_SHAPE], PARTICIPANTS[3]!)).toBe(true);
  });
});

describe('groupConventionAnyShapeWhere', () => {
  it('produit un OR des deux formes, scopé tenant + session + type CONVENTION', () => {
    expect(groupConventionAnyShapeWhere('tnt-1', 'ses-1', 'org-optimmo')).toEqual({
      tenantId: 'tnt-1',
      type: 'CONVENTION',
      sessionId: 'ses-1',
      OR: [
        { entityType: 'organization', entityId: 'org-optimmo' },
        { entityType: 'session', participantId: null },
      ],
    });
  });

  it('reste scopé au tenant et à la session (jamais de fuite)', () => {
    const w = groupConventionAnyShapeWhere('tnt-2', 'ses-9', 'org-x');
    expect(w.tenantId).toBe('tnt-2');
    expect(w.sessionId).toBe('ses-9');
    expect(w.type).toBe('CONVENTION');
  });
});
