/**
 * Le CÂBLAGE du sous-dossier `signes/` dans le ZIP du pack — smoke source.
 *
 * POURQUOI EN REGEX DE SOURCE. `entreesSignees` est pur et testé ; mais il
 * n'ajoute rien à l'archive tant que `buildClosureZipBuffer` ne l'appelle pas,
 * et cette server action ouvre Prisma, Lucia et le stockage — elle n'est pas
 * montable en test. C'est exactement le trou mesuré au lot C.2b-8 : le calcul
 * gardé, le câblage non, et 95 tests verts pendant que l'écran repartait comme
 * avant. Même forme que `fiche-session-cablage-signature.smoke.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = readFileSync(
  path.join(__dirname, '..', '..', '..', 'server', 'actions', 'closure-pack.ts'),
  'utf-8',
);

/**
 * La source SANS ses commentaires de ligne.
 *
 * Le commentaire qui explique le sous-dossier contient le mot « `signes/` » :
 * sans ce nettoyage, l'assertion « aucun chemin composé à la main » se
 * déclencherait sur sa propre documentation — c'est-à-dire qu'elle ne
 * garderait rien et empêcherait d'expliquer le code.
 */
const code = src.replace(/^\s*\/\/.*$/gm, '');

describe('pack de clôture — les pièces signées entrent dans l’archive', () => {
  it('le module des entrées signées est appelé, pas recopié', () => {
    expect(src).toMatch(/import \{ entreesSignees \} from '@\/lib\/closure\/entrees-signees'/);
    expect(src).toMatch(/for \(const entree of entreesSignees\(\{/);
    // Aucun chemin `signes/` composé à la main ici : ce serait la seconde règle
    // de nommage, et l'archive finirait par contredire le téléchargement
    // unitaire.
    expect(code).not.toMatch(/['"`]signes\//);
  });

  it('les signés sont RÉELLEMENT ajoutés à l’archive', () => {
    // La substitution qui compile et ne fait rien : appeler `entreesSignees`
    // sans jamais `archive.append`.
    expect(src).toMatch(/archive\.append\(await downloadFile\(DOCS_BUCKET, entree\.key\), \{ name: entree\.name \}\)/);
  });

  it('la requête charge la version signée ET le certificat de sa demande', () => {
    expect(src).toMatch(/signedPdfUrl: \{ not: null \}/);
    expect(src).toMatch(/signatureRequest: \{ select: \{ id: true, auditTrailUrl: true \} \}/);
  });

  it('elle porte sur la SESSION, pas sur le batch — une pièce signée n’a pas de lot', () => {
    // Filtrer par `batchId` ne ramènerait aucune convention : elle n'est pas
    // générée par le worker de clôture.
    expect(src).toMatch(/sessionId: batch\.sessionId,\n\s*signedPdfUrl:/);
  });

  it('une preuve introuvable ne fait pas échouer tout le pack', () => {
    expect(src).toMatch(/\[closure-zip\] skip signé/);
  });
});
