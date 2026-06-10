import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  MATRIX_DOC_TYPES,
  QUALIOPI_DOC_CATALOG_INDICATORS,
  DOC_INDICATORS,
} from '../../doc-scope';

/**
 * Phase 9.3 Plan 09.3-02 Task 3 — GATE PRINCIPAL NAV-05 + NAV-04.
 *
 * Ce test EST la recette « 0 drift » (D-09.3-08) : il lit le seed réel
 * `packages/db/prisma/seed.ts`, parse le bloc `seedQualiopiDocCatalog`, et
 * asserte que chaque entrée porte l'indicateur cible figé dans
 * `QUALIOPI_DOC_CATALOG_INDICATORS` (doc-scope.ts).
 *
 * Pourquoi lire le fichier source plutôt qu'importer le seed : seed.ts est un
 * script exécutable @qualiof/db (top-level `loadEnv` + `main()` auto-invoqué +
 * `@prisma/client`), non importable proprement dans un test apps/web. La lecture
 * source regex est le pattern de recette établi en Phase 9.1.
 *
 * Avantage 0-drift réel : ce test échoue si le seed dévie du mapping cible OU
 * si quelqu'un réintroduit `Indicateur 7` (la valeur racine erronée non-V9).
 */

const SEED_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../../packages/db/prisma/seed.ts',
);

/** Extrait le bloc de la fonction seedQualiopiDocCatalog (du nom jusqu'à la 1ʳᵉ accolade fermante en colonne 0). */
function readCatalogBlock(): string {
  const src = readFileSync(SEED_PATH, 'utf8');
  const start = src.indexOf('function seedQualiopiDocCatalog');
  expect(start, 'fonction seedQualiopiDocCatalog introuvable dans seed.ts').toBeGreaterThan(-1);
  const after = src.slice(start);
  const end = after.search(/\n}/);
  return after.slice(0, end);
}

/**
 * Parse les entrées `{ type: DocType.X, ... qualiopiIndicator: <val>, ... }`
 * du bloc catalog → Map<DocType, indicateur|null>.
 */
function parseCatalogIndicators(block: string): Map<string, string | null> {
  const map = new Map<string, string | null>();
  // Une entrée par ligne : { type: DocType.XXX, ... qualiopiIndicator: 'Y' | null, ... }
  const lineRe = /\{\s*type:\s*DocType\.(\w+),[^]*?qualiopiIndicator:\s*(null|'((?:[^'\\]|\\.)*)')/g;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(block)) !== null) {
    const docType = m[1]!;
    const value = m[2] === 'null' ? null : m[3]!;
    map.set(docType, value);
  }
  return map;
}

describe('seed QualiopiDocCatalog — recette 0 drift (NAV-05 / NAV-04)', () => {
  const block = readCatalogBlock();
  const seeded = parseCatalogIndicators(block);

  it('parse au moins 13 entrées du catalog (sanity)', () => {
    expect(seeded.size).toBeGreaterThanOrEqual(13);
  });

  // --- Test 1 (NAV-05) : les 7 corrections D-09.3-08 ---
  it('Test 1 — CONVENTION → Indicateur 9', () => {
    expect(seeded.get('CONVENTION')).toBe('Indicateur 9');
  });
  it('Test 1 — PROGRAMME → Indicateur 1', () => {
    expect(seeded.get('PROGRAMME')).toBe('Indicateur 1');
  });
  it('Test 1 — CONVOCATION → Indicateur 9', () => {
    expect(seeded.get('CONVOCATION')).toBe('Indicateur 9');
  });
  it('Test 1 — SUPPORT_PEDAGOGIQUE → Indicateur 19', () => {
    expect(seeded.get('SUPPORT_PEDAGOGIQUE')).toBe('Indicateur 19');
  });
  it('Test 1 — PRE_ACCORD_OPCO → null (administratif)', () => {
    expect(seeded.get('PRE_ACCORD_OPCO')).toBeNull();
  });
  it('Test 1 — AGEFICE → null (administratif)', () => {
    expect(seeded.get('AGEFICE')).toBeNull();
  });
  // CORRECTION 2 (V9 Kaïna) — le certificat de réalisation se range dans l'ind. 11.
  it('Test 1 — CERTIFICAT_REALISATION → Indicateur 11 (CORRECTION 2)', () => {
    expect(seeded.get('CERTIFICAT_REALISATION')).toBe('Indicateur 11');
  });

  // --- Test 2 (NAV-05) : émargement = seule preuve ind. 12 ---
  it('Test 2 — EMARGEMENT → Indicateur 12 (seule preuve ind. 12)', () => {
    expect(seeded.get('EMARGEMENT')).toBe('Indicateur 12');
  });
  // CORRECTION 1 (V9 Laurent) — l'assiduité AGEFICE n'est PAS une preuve Qualiopi.
  it('Test 2 — ASSIDUITE → null (pièce financeur, CORRECTION 1)', () => {
    expect(seeded.get('ASSIDUITE')).toBeNull();
  });
  it('Test 2 — EVALUATION_ACQUIS → Indicateur 11 (inchangé)', () => {
    expect(seeded.get('EVALUATION_ACQUIS')).toBe('Indicateur 11');
  });
  // CORRECTION 2 (swap) — l'attestation de fin devient « Légal » pur.
  it('Test 2 — ATTESTATION_FIN → Légal Art. L6353-1 (CORRECTION 2 swap)', () => {
    expect(seeded.get('ATTESTATION_FIN')).toBe('Légal Art. L6353-1');
  });

  // --- Test 3 (NAV-04) : triage fantômes ---
  it('Test 3 — SATISFACTION nu retiré du seed catalog', () => {
    expect(seeded.has('SATISFACTION')).toBe(false);
  });
  it('Test 3 — MATRIX_DOC_TYPES ne contient AUCUN fantôme', () => {
    const matrix = MATRIX_DOC_TYPES as readonly string[];
    expect(matrix).not.toContain('SATISFACTION');
    expect(matrix).not.toContain('PRE_ACCORD_OPCO');
    expect(matrix).not.toContain('VALIDATION_OPCO');
    expect(matrix).not.toContain('CUSTOM');
  });

  // --- Test 4 (GATE recette 0 drift) : aucun Indicateur 7, et seed == mapping cible figé ---
  it('Test 4 — AUCUNE entrée du catalog ne porte Indicateur 7 (valeur racine erronée non-V9)', () => {
    const drifts = [...seeded.entries()].filter(([, v]) => v === 'Indicateur 7');
    expect(drifts, `drift Indicateur 7 résiduel : ${JSON.stringify(drifts)}`).toHaveLength(0);
  });
  it('Test 4 — le seed correspond EXACTEMENT au mapping cible figé QUALIOPI_DOC_CATALOG_INDICATORS', () => {
    for (const [docType, expected] of Object.entries(QUALIOPI_DOC_CATALOG_INDICATORS)) {
      expect(
        seeded.get(docType),
        `${docType} : seed=${JSON.stringify(seeded.get(docType))} attendu=${JSON.stringify(expected)}`,
      ).toBe(expected);
    }
  });
});

/**
 * CORRECTION V9 (tranchées Laurent / Kaïna audit blanc) — mapping `DOC_INDICATORS`
 * (table LUE par le résolveur, miroir étendu du catalogue). Verrouille les 3
 * décisions :
 *  - ASSIDUITE → null (pièce financeur, la preuve ind. 12 est l'émargement) ;
 *  - CERTIFICAT_REALISATION → 'Indicateur 11' (rangé ind. 11 par Kaïna) ;
 *  - ATTESTATION_FIN → 'Légal Art. L6353-1' (swap : 11 part au certificat).
 */
describe('DOC_INDICATORS — corrections V9 (résolveur)', () => {
  it('ASSIDUITE → null (CORRECTION 1)', () => {
    expect(DOC_INDICATORS.ASSIDUITE).toBeNull();
  });
  it('CERTIFICAT_REALISATION → Indicateur 11 (CORRECTION 2)', () => {
    expect(DOC_INDICATORS.CERTIFICAT_REALISATION).toBe('Indicateur 11');
  });
  it('ATTESTATION_FIN → Légal Art. L6353-1 (CORRECTION 2 swap)', () => {
    expect(DOC_INDICATORS.ATTESTATION_FIN).toBe('Légal Art. L6353-1');
  });
  it('EMARGEMENT reste seul porteur de Indicateur 12', () => {
    expect(DOC_INDICATORS.EMARGEMENT).toBe('Indicateur 12');
    const ind12 = Object.entries(DOC_INDICATORS)
      .filter(([, v]) => v === 'Indicateur 12')
      .map(([k]) => k);
    expect(ind12).toEqual(['EMARGEMENT']);
  });
});

/**
 * CORRECTION 3 (V9 Laurent) — captions d'étape (curatées EN DUR, prop `qualiopi`).
 * Lecture source des composants (même pattern de recette que le seed) :
 *  - Préparation = Ind 1 · 4 · 5 · 6 · 9 · 17 → DOIT contenir « 5 », NE DOIT PAS
 *    contenir « 8 » ;
 *  - aucune caption ne doit ré-introduire « 27 » (sous-traitance, hors scope).
 */
describe('Captions d’étape — CORRECTION 3 (1·4·5·6·9·17 et pas de 8/27)', () => {
  const PREP_PATH = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../components/sessions/preparation-pedagogique-block.tsx',
  );
  const PACK_PATH = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../components/sessions/closure-formation-block.tsx',
  );

  /** Extrait la valeur de la prop `qualiopi="…"` du composant. */
  function readQualiopiCaption(file: string): string {
    const src = readFileSync(file, 'utf8');
    const m = src.match(/qualiopi="([^"]+)"/);
    expect(m, `prop qualiopi="…" introuvable dans ${file}`).not.toBeNull();
    return m![1]!;
  }

  it('Préparation = « Ind 1 · 4 · 5 · 6 · 9 · 17 »', () => {
    expect(readQualiopiCaption(PREP_PATH)).toBe('Ind 1 · 4 · 5 · 6 · 9 · 17');
  });
  it('Préparation CONTIENT « 5 » et NE CONTIENT PAS « 8 »', () => {
    const caption = readQualiopiCaption(PREP_PATH);
    const nums = caption.match(/\d+/g) ?? [];
    expect(nums).toContain('5');
    expect(nums).not.toContain('8');
  });
  it('Pack = « Ind 8 · 11 · 12 · 30 » (inchangé, validé Laurent)', () => {
    expect(readQualiopiCaption(PACK_PATH)).toBe('Ind 8 · 11 · 12 · 30');
  });
  it('Aucune caption ne contient « 27 » (sous-traitance hors scope)', () => {
    expect(readQualiopiCaption(PREP_PATH)).not.toContain('27');
    expect(readQualiopiCaption(PACK_PATH)).not.toContain('27');
  });
});
