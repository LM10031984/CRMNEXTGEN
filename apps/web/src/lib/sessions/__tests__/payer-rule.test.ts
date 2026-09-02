import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiresContratIndividuel } from '@/lib/legal-forms';
import {
  releveDeLaConvention,
  estEmployeurDeLApprenant,
  isPersonneMoralePayeur,
  partitionByPayerRule,
  selectAnalyseBesoinTargets,
  type PayerParticipant,
} from '../payer-rule';

/**
 * Quick 260821-md8 — règle « payeur personne morale » (figée par Laurent le
 * 12/08/2026).
 *
 * Payeur personne morale ⇒ UNE convention de groupe + UNE analyse des besoins
 * au nom de l'entreprise. Jamais une par stagiaire : une convention par salarié
 * là où le besoin est celui de l'entreprise est une non-conformité en audit.
 *
 * Constat de production du 21/08 (SES-0107 ASSALIT SYNDIC 8 inscrits,
 * SES-0108 EXPERTA 1 inscrite) : l'appli produisait encore des documents
 * nominatifs, en doublon des documents d'entreprise corrects.
 *
 * Test de puissance : retirer le `!` de `isPersonneMoralePayeur` fait rougir
 * les blocs « formes juridiques » et « partition ».
 */

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(
  SCRIPT_DIR,
  '../../../../../..',
  'packages/db/prisma/schema.prisma',
);

/**
 * Valeurs de l'enum `LegalForm` lues DANS LE SCHÉMA, pas recopiées ici.
 * Ajouter une forme juridique sans trancher son régime contractuel fera
 * échouer le test de complémentarité ci-dessous — c'est voulu.
 */
function readLegalFormEnum(): string[] {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const block = /enum LegalForm \{([^}]*)\}/.exec(schema);
  if (!block) throw new Error('enum LegalForm introuvable dans schema.prisma');
  return block[1]!
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter((l) => /^[A-Z_]+$/.test(l));
}

describe('isPersonneMoralePayeur — formes juridiques', () => {
  it.each(['SARL', 'SAS', 'SASU', 'EURL', 'SA', 'ASSOCIATION'])(
    '%s est une personne morale : régime de la convention',
    (forme) => {
      expect(isPersonneMoralePayeur(forme)).toBe(true);
    },
  );

  it.each(['EI', 'EIRL', 'AUTO_ENTREPRENEUR', 'PARTICULIER'])(
    '%s est une personne physique : régime du contrat individuel',
    (forme) => {
      expect(isPersonneMoralePayeur(forme)).toBe(false);
    },
  );

  it('est EXACTEMENT complémentaire de requiresContratIndividuel sur tout l’enum', () => {
    // Deux définitions divergentes de la même règle sont précisément ce qui a
    // produit les 5 findings de la revue Codex PR #13. `legal-forms.ts` reste
    // la source unique ; ce test scelle qu'aucune forme ne tombe entre les
    // deux prédicats, ni dans les deux à la fois.
    const formes = readLegalFormEnum();
    expect(formes.length).toBeGreaterThanOrEqual(10);
    for (const forme of formes) {
      expect(isPersonneMoralePayeur(forme)).toBe(!requiresContratIndividuel(forme));
    }
  });

  it.each([null, undefined, ''])(
    'ne présume pas d’une convention de groupe sur une forme absente (%s)',
    (forme) => {
      expect(isPersonneMoralePayeur(forme as string | null | undefined)).toBe(false);
    },
  );
});

function p(
  id: string,
  sponsorOrgId: string,
  sponsorLegalForm: string | null,
  sponsorName?: string,
): PayerParticipant {
  return { id, sponsorOrgId, sponsorLegalForm, sponsorName: sponsorName ?? null };
}

describe('partitionByPayerRule — groupes vs auto-payeurs', () => {
  it('rend une partition vide sur une session sans inscrit', () => {
    expect(partitionByPayerRule([])).toEqual({ groups: [], individuels: [] });
  });

  it('regroupe 8 salariés d’une SARL en UN seul groupe (cas ASSALIT / SES-0107)', () => {
    const participants = Array.from({ length: 8 }, (_, i) =>
      p(`sp-${i + 1}`, 'org-assalit', 'SARL', 'ASSALIT SYNDIC'),
    );
    const { groups, individuels } = partitionByPayerRule(participants);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.sponsorOrgId).toBe('org-assalit');
    expect(groups[0]!.sponsorName).toBe('ASSALIT SYNDIC');
    expect(groups[0]!.participantIds).toEqual([
      'sp-1', 'sp-2', 'sp-3', 'sp-4', 'sp-5', 'sp-6', 'sp-7', 'sp-8',
    ]);
    expect(individuels).toEqual([]);
  });

  it('traite UNE salariée seule comme un groupe, pas comme un auto-payeur (cas EXPERTA / SES-0108)', () => {
    // Le format « groupe » ne dépend pas de l'effectif : c'est l'employeur qui
    // paye, donc c'est lui qui signe la convention.
    const { groups, individuels } = partitionByPayerRule([p('sp-1', 'org-experta', 'SARL', 'EXPERTA')]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.participantIds).toEqual(['sp-1']);
    expect(individuels).toEqual([]);
  });

  it('sépare une session mixte : 2 groupes + 2 auto-payeurs, groupes triés', () => {
    const { groups, individuels } = partitionByPayerRule([
      p('sp-1', 'org-b', 'SAS', 'B SAS'),
      p('sp-2', 'org-a', 'SARL', 'A SARL'),
      p('sp-3', 'org-ei-1', 'AUTO_ENTREPRENEUR'),
      p('sp-4', 'org-a', 'SARL', 'A SARL'),
      p('sp-5', 'org-b', 'SAS', 'B SAS'),
      p('sp-6', 'org-ei-2', 'EI'),
      p('sp-7', 'org-a', 'SARL', 'A SARL'),
    ]);

    // Ordre stable et reproductible (tests, logs, journal d'audit).
    expect(groups.map((g) => g.sponsorOrgId)).toEqual(['org-a', 'org-b']);
    expect(groups[0]!.participantIds).toEqual(['sp-2', 'sp-4', 'sp-7']);
    expect(groups[1]!.participantIds).toEqual(['sp-1', 'sp-5']);
    expect(individuels).toEqual(['sp-3', 'sp-6']);
  });

  it('ne produit JAMAIS deux groupes pour un même commanditaire', () => {
    const { groups } = partitionByPayerRule([
      p('sp-1', 'org-a', 'SARL'),
      p('sp-2', 'org-a', 'SARL'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.participantIds).toEqual(['sp-1', 'sp-2']);
  });

  it('range un commanditaire de forme inconnue chez les individuels (prudence)', () => {
    const { groups, individuels } = partitionByPayerRule([p('sp-1', 'org-x', null)]);
    expect(groups).toEqual([]);
    expect(individuels).toEqual(['sp-1']);
  });
});

/**
 * Analyse des besoins — même règle, autre document.
 *
 * Une analyse des besoins au nom d'un SALARIÉ alors que le besoin est celui de
 * l'entreprise est une non-conformité à l'indicateur 4. Le document de
 * référence attendu est celui de `_gen-assalit-experta-analyses.ts` : contexte,
 * besoins exprimés, objectifs attendus, public et prérequis, modalités,
 * adaptation proposée, situation de handicap, signature.
 */
describe('selectAnalyseBesoinTargets', () => {
  const AUCUN_RENDU = { dejaRenduParStagiaire: new Set<string>(), analyseEntrepriseExiste: false };

  it('enfile tous les auto-payeurs (cas dominant du CRM, non-régression)', () => {
    const t = selectAnalyseBesoinTargets(
      [p('sp-1', 'org-ei-1', 'AUTO_ENTREPRENEUR'), p('sp-2', 'org-ei-2', 'EI')],
      AUCUN_RENDU,
    );
    expect(t.participantIds).toEqual(['sp-1', 'sp-2']);
    expect(t.entreprisesEnAttente).toEqual([]);
  });

  it('n’enfile RIEN par stagiaire quand le payeur est une personne morale', () => {
    const t = selectAnalyseBesoinTargets(
      [p('sp-1', 'org-experta', 'SARL', 'EXPERTA'), p('sp-2', 'org-experta', 'SARL', 'EXPERTA')],
      AUCUN_RENDU,
    );
    expect(t.participantIds).toEqual([]);
    expect(t.entreprisesEnAttente.map((g) => g.sponsorOrgId)).toEqual(['org-experta']);
    expect(t.entreprisesEnAttente[0]!.sponsorName).toBe('EXPERTA');
  });

  it('sépare une session mixte', () => {
    const t = selectAnalyseBesoinTargets(
      [
        p('sp-1', 'org-assalit', 'SARL', 'ASSALIT SYNDIC'),
        p('sp-2', 'org-ei-1', 'AUTO_ENTREPRENEUR'),
        p('sp-3', 'org-assalit', 'SARL', 'ASSALIT SYNDIC'),
      ],
      AUCUN_RENDU,
    );
    expect(t.participantIds).toEqual(['sp-2']);
    expect(t.entreprisesEnAttente.map((g) => g.sponsorOrgId)).toEqual(['org-assalit']);
  });

  it('idempotence : une analyse entreprise déjà rendue vide la file d’attente', () => {
    const t = selectAnalyseBesoinTargets([p('sp-1', 'org-experta', 'SARL', 'EXPERTA')], {
      dejaRenduParStagiaire: new Set<string>(),
      analyseEntrepriseExiste: true,
    });
    expect(t.entreprisesEnAttente).toEqual([]);
    expect(t.participantIds).toEqual([]); // jamais d'empilement par stagiaire
  });

  it('idempotence : un auto-payeur déjà servi n’est pas ré-enfilé', () => {
    const t = selectAnalyseBesoinTargets(
      [p('sp-1', 'org-ei-1', 'EI'), p('sp-2', 'org-ei-2', 'EI')],
      { dejaRenduParStagiaire: new Set(['sp-1']), analyseEntrepriseExiste: false },
    );
    expect(t.participantIds).toEqual(['sp-2']);
  });

  it('un résidu d’analyse PAR STAGIAIRE sur un salarié n’est ni ré-enfilé ni supprimé', () => {
    // Cas SES-0108 : l'appli avait déjà produit une analyse nominative pour la
    // salariée. Le helper est PUR : il ne supprime rien, il cesse simplement
    // d'en produire de nouvelles.
    const participants = [p('sp-1', 'org-experta', 'SARL', 'EXPERTA')];
    const avant = JSON.stringify(participants);
    const t = selectAnalyseBesoinTargets(participants, {
      dejaRenduParStagiaire: new Set(['sp-1']),
      analyseEntrepriseExiste: false,
    });
    expect(t.participantIds).toEqual([]);
    expect(t.entreprisesEnAttente.map((g) => g.sponsorOrgId)).toEqual(['org-experta']);
    expect(JSON.stringify(participants)).toBe(avant); // aucune mutation
  });

  it('session sans inscrit : rien à faire', () => {
    expect(selectAnalyseBesoinTargets([], AUCUN_RENDU)).toEqual({
      participantIds: [],
      entreprisesEnAttente: [],
    });
  });
});


/**
 * Correction du 02/09/2026 — cas AGENCE DE L'OLIVIER (SES-0109).
 *
 * La règle ne regardait que la forme juridique : toute EI partait en contrat
 * individuel. Or une entreprise individuelle PEUT employer — registre INSEE,
 * SIREN 337700504 : entrepreneur individuel, tranche d'effectif 1 à 2 salariés.
 * Quand elle paye pour ses salariés, elle n'est pas « à ses frais » (L6353-3) :
 * c'est un employeur, donc une convention (L6353-2).
 *
 * Le piège que ces tests protègent, signalé par Laurent : une agence héberge
 * aussi des AUTO-ENTREPRENEURS rattachés (agents commerciaux). Eux se forment
 * à leurs frais — leur donner une convention avec l'agence serait faux. Le
 * régime se décide donc PAR INSCRIT, jamais par entreprise.
 *
 * Test de puissance : ajouter 'AGENT_COMMERCIAL' à `ROLES_EMPLOYEUR` fait
 * rougir « un agent commercial rattaché reste en contrat individuel ».
 */
describe('releveDeLaConvention — le lien tranche, pas seulement la forme', () => {
  it('une société relève de la convention, quel que soit le lien', () => {
    for (const role of ['SALARIE', 'DIRIGEANT', 'AGENT_COMMERCIAL', null]) {
      expect(releveDeLaConvention({ sponsorLegalForm: 'SARL', roleChezSponsor: role })).toBe(true);
    }
  });

  it('une EI qui paye pour SON SALARIÉ relève de la convention', () => {
    expect(releveDeLaConvention({ sponsorLegalForm: 'EI', roleChezSponsor: 'SALARIE' })).toBe(true);
    expect(
      releveDeLaConvention({ sponsorLegalForm: 'AUTO_ENTREPRENEUR', roleChezSponsor: 'SALARIE' }),
    ).toBe(true);
    expect(releveDeLaConvention({ sponsorLegalForm: 'EIRL', roleChezSponsor: 'ALTERNANT' })).toBe(true);
  });

  it('un auto-entrepreneur qui se forme lui-même reste en contrat individuel', () => {
    expect(releveDeLaConvention({ sponsorLegalForm: 'EI', roleChezSponsor: 'EI_SELF' })).toBe(false);
    expect(
      releveDeLaConvention({ sponsorLegalForm: 'AUTO_ENTREPRENEUR', roleChezSponsor: 'EI_SELF' }),
    ).toBe(false);
  });

  it('un agent commercial rattaché reste en contrat individuel — il paye à ses frais', () => {
    expect(
      releveDeLaConvention({ sponsorLegalForm: 'EI', roleChezSponsor: 'AGENT_COMMERCIAL' }),
    ).toBe(false);
    expect(estEmployeurDeLApprenant('AGENT_COMMERCIAL')).toBe(false);
    expect(estEmployeurDeLApprenant('DIRIGEANT')).toBe(false);
    expect(estEmployeurDeLApprenant('EI_SELF')).toBe(false);
  });

  it('rôle inconnu ou absent sur une forme solo ⇒ contrat individuel (repli sûr)', () => {
    expect(releveDeLaConvention({ sponsorLegalForm: 'EI', roleChezSponsor: null })).toBe(false);
    expect(releveDeLaConvention({ sponsorLegalForm: 'EI' })).toBe(false);
  });

  it('forme juridique absente ⇒ jamais de convention présumée', () => {
    expect(releveDeLaConvention({ sponsorLegalForm: null, roleChezSponsor: 'SALARIE' })).toBe(false);
  });

  it('PARTICULIER reste toujours en contrat individuel', () => {
    expect(releveDeLaConvention({ sponsorLegalForm: 'PARTICULIER', roleChezSponsor: 'SALARIE' })).toBe(
      false,
    );
  });
});

describe('partitionByPayerRule — une même EI, deux régimes', () => {
  it('sépare les salariés (convention) des agents commerciaux (contrat) chez le MÊME commanditaire', () => {
    const { groups, individuels } = partitionByPayerRule([
      { id: 'p-salarie-1', sponsorOrgId: 'org-olivier', sponsorLegalForm: 'EI', sponsorName: "AGENCE DE L'OLIVIER", roleChezSponsor: 'SALARIE' },
      { id: 'p-salarie-2', sponsorOrgId: 'org-olivier', sponsorLegalForm: 'EI', sponsorName: "AGENCE DE L'OLIVIER", roleChezSponsor: 'SALARIE' },
      { id: 'p-agent-co', sponsorOrgId: 'org-olivier', sponsorLegalForm: 'EI', sponsorName: "AGENCE DE L'OLIVIER", roleChezSponsor: 'AGENT_COMMERCIAL' },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.participantIds).toEqual(['p-salarie-1', 'p-salarie-2']);
    expect(individuels).toEqual(['p-agent-co']);
  });

  it('sans rôle chargé, l’EI retombe en contrat individuel (comportement d’avant, conservé)', () => {
    const { groups, individuels } = partitionByPayerRule([
      { id: 'p-1', sponsorOrgId: 'org-ei', sponsorLegalForm: 'EI', sponsorName: 'EI X' },
    ]);
    expect(groups).toEqual([]);
    expect(individuels).toEqual(['p-1']);
  });
});
