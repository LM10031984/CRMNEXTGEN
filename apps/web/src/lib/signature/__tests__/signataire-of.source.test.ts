import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * UNE SEULE RÉSOLUTION DU SIGNATAIRE OF, ET UN SEUL CÂBLAGE VERS L'ÉCRAN.
 * Contrainte de Laurent, 11/09/2026.
 *
 * POURQUOI UN TEST DE SOURCE, ET PAS UN TEST DE COMPORTEMENT. Ce que ce fichier
 * garde vit dans un COMPOSANT SERVEUR (`app/app/sessions/[id]/page.tsx`, 1900
 * lignes, Prisma et `validateRequest` en tête) : il n'est pas montable en jsdom,
 * et le rendre testable coûterait une refonte que ce lot ne justifie pas. Le
 * reste — la composition de l'ordre, la table des ancres, le rendu — est couvert
 * par des tests de comportement (`bloc-signature-vue.test.ts`,
 * `bloc-signature.test.tsx`). Il ne manquait que le FIL entre les deux.
 *
 * CE QUE LA MUTATION DOIT CASSER, et c'est vérifié : retirer `signataireOf:` de
 * l'appel de `page.tsx` fait disparaître l'organisme de TOUTES les lignes en
 * production, sans qu'aucun test de comportement ne bouge. C'est exactement le
 * trou que ce fichier ferme.
 *
 * ⚠ CE FICHIER N'EST PLUS SEUL DEPUIS LE 11/09/2026 (demande n°2 de Laurent).
 * `signataireOf` est devenu une prop OBLIGATOIRE de `construireVueSignature` :
 * l'omettre est désormais une erreur `tsc`, et c'est la garde forte. Ce test de
 * source garde ce que le typeur ne peut pas voir — que la valeur passée est
 * bien CELLE QUI A ÉTÉ RÉSOLUE (`signataireOfDeLOrganisme`), et non un `null`
 * de complaisance qui compilerait tout aussi bien.
 *
 * ⚠ Les chemins sont assertés en LITTÉRAL. Comparer au résultat d'un helper de
 * chemin ferait bouger les deux côtés ensemble.
 */

const RACINE = path.join(__dirname, '..', '..', '..');

const pageSession = readFileSync(
  path.join(RACINE, 'app', 'app', 'sessions', '[id]', 'page.tsx'),
  'utf-8',
);
const moteurEnvoi = readFileSync(
  path.join(RACINE, 'server', 'actions', 'signature-envoi.ts'),
  'utf-8',
);

describe('Le signataire OF est résolu UNE fois, par le module que le moteur utilise', () => {
  it('la fiche session passe par `@/lib/signature/signataire-of` — pas par sa propre lecture', () => {
    expect(pageSession).toContain("from '@/lib/signature/signataire-of'");
    expect(pageSession).toContain('resoudreSignataireOf');
    expect(pageSession).toContain('signataireOfPrevu');
  });

  it('le MOTEUR d’envoi passe par le MÊME module — sinon ce serait deux résolutions', () => {
    expect(moteurEnvoi).toContain("from '@/lib/signature/signataire-of'");
    expect(moteurEnvoi).toContain('resoudreSignataireOf');
    expect(moteurEnvoi).toContain('signataireOfPrevu');
  });

  it('PUISSANCE — ni l’un ni l’autre ne relit les colonnes `Tenant.signatory*`', () => {
    // La cascade de `resolveTenantSignatory` n'est pas un SELECT : ce qui est
    // saisi en base gagne, sinon on retombe sur `OF_RESP_*` (D-01 hybride). La
    // recopier ferait diverger l'écran du lien qui part réellement.
    expect(pageSession).not.toContain('signatoryName');
    expect(pageSession).not.toContain('signatoryEmail');
    expect(moteurEnvoi).not.toContain('signatoryName');
    expect(moteurEnvoi).not.toContain('signatoryEmail');
  });
});

describe('Le fil jusqu’aux LIGNES du bloc « Signature »', () => {
  it('la fiche session passe `signataireOf` à `construireVueSignature`', () => {
    // ⚠ CE QUE `tsc` NE VOIT PAS. Depuis que la prop est obligatoire, l'oublier
    // ne compile plus — mais écrire `signataireOf: null` compile parfaitement,
    // et fait disparaître l'organisme de toutes les lignes en production sans
    // qu'aucun test de comportement ne bouge. C'est CETTE substitution que
    // l'assertion littérale ci-dessous attrape.
    expect(pageSession).toContain('signataireOf: signataireOfDeLOrganisme');
  });

  it('il est résolu UNE fois, pas une fois par scope (Avant / Après)', () => {
    const resolutions = pageSession.split('resoudreSignataireOf(').length - 1;
    expect(resolutions).toBe(1);
  });
});
