import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiresContratIndividuel } from '@/lib/legal-forms';
import {
  isPersonneMoralePayeur,
  partitionByPayerRule,
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
