import { describe, it, expect } from 'vitest';
import { renderEmargementHtml } from '../emargement-template';
import type { ClosureContext } from '../shared-template';

/**
 * Le tampon de la feuille d'émargement n'est jamais orphelin (SES-0111, 21/09).
 *
 * Ce test garde la STRUCTURE qui l'empêche ; la pagination réelle, elle, se
 * prouve avec le moteur — `scripts/proof-emargement-tampon.ts`, rendu WeasyPrint
 * (la CI n'en a pas). Les deux se complètent : la preuve dit que la structure
 * suffit, ce test dit que la structure est toujours là.
 *
 * La structure : UN tableau, DEUX <tbody>. Le premier, sécable, porte les jours
 * 1 à n-2. Le second, INSÉCABLE, porte les deux derniers jours ET le bloc de
 * fin (signatures formateur, « Certifié exact », tampon). L'insécable ne porte
 * donc jamais le bloc seul — c'est ce qui le faisait sauter en laissant du vide
 * (avant le 01/07) puis, une fois retiré, laissait sa queue s'orpheliner.
 */

const ctx = (debut: Date, fin: Date): ClosureContext => ({
  apprenantPrenom: 'Alex',
  apprenantNom: 'EXEMPLE',
  apprenantCivility: null,
  sessionId: 'test',
  sessionCode: 'SES-TEST',
  sessionTitle: 'Formation de démonstration',
  sessionStartDate: debut,
  sessionEndDate: fin,
  sessionLocation: 'Organisme de démonstration — 06800 Cagnes-sur-Mer',
  sessionLocationCity: 'Cagnes-sur-Mer',
  sessionTrainers: ['Jean-Guy EXEMPLE'],
  durationHours: 16,
  tenantId: 'test',
});

/** Les <tbody> du tableau d'émargement, dans l'ordre. */
function corps(html: string): string[] {
  // Le bloc d'information est lui-même un tableau : la fin se cherche APRÈS le
  // début du tableau d'émargement, pas depuis le haut du document.
  const debut = html.indexOf('<table class="data"');
  const table = html.slice(debut, html.indexOf('</table>', debut));
  return [...table.matchAll(/<tbody[^>]*>[\s\S]*?<\/tbody>/g)].map((m) => m[0]);
}
const nbLignesDatees = (tbody: string) => (tbody.match(/\d{2} \S+ 20\d{2}<\/td>/g) ?? []).length;

describe('émargement — le tampon voyage avec les lignes qu’il certifie', () => {
  it('SES-0111, 2 jours : un seul groupe, insécable, qui porte les 2 lignes ET le tampon', () => {
    const groupes = corps(renderEmargementHtml(ctx(new Date(2026, 8, 28), new Date(2026, 8, 29))));
    expect(groupes).toHaveLength(1);
    const final = groupes[0]!;
    expect(final).toMatch(/<tbody style="break-inside: avoid;">/);
    expect(nbLignesDatees(final)).toBe(2);
    expect(final).toContain('Certifié exact');
    expect(final).toContain('alt="Tampon Start Academy"');
  });

  it('9 jours : 7 lignes sécables, puis le groupe final avec les 2 dernières', () => {
    // 02 → 13 novembre 2026 : neuf jours ouvrés, le 11 (férié) est sauté.
    const groupes = corps(renderEmargementHtml(ctx(new Date(2026, 10, 2), new Date(2026, 10, 13))));
    expect(groupes).toHaveLength(2);
    expect(groupes[0]).not.toContain('break-inside');
    expect(nbLignesDatees(groupes[0]!)).toBe(7);
    expect(nbLignesDatees(groupes[1]!)).toBe(2);
    expect(groupes[1]).toContain('13 novembre 2026');
    expect(groupes[1]).toContain('Certifié exact');
  });

  it('1 jour : pas de groupe sécable vide, et le tampon reste avec l’unique ligne', () => {
    const groupes = corps(renderEmargementHtml(ctx(new Date(2026, 8, 28), new Date(2026, 8, 28))));
    expect(groupes).toHaveLength(1);
    expect(nbLignesDatees(groupes[0]!)).toBe(1);
    expect(groupes[0]).toContain('Certifié exact');
  });

  it('le groupe final n’emploie AUCUN flex — WeasyPrint pagine mal une rangée flex en bas de page', () => {
    // C'est la rangée d'images en display:flex qui sautait en page 2, alors que
    // ses 26 mm tenaient dans le vide laissé en page 1.
    const final = corps(renderEmargementHtml(ctx(new Date(2026, 8, 28), new Date(2026, 8, 29)))).at(-1)!;
    expect(final).not.toMatch(/display:\s*flex/);
  });

  it('chaque ligne du groupe final est soudée à la précédente (ceinture et bretelles)', () => {
    const final = corps(renderEmargementHtml(ctx(new Date(2026, 8, 28), new Date(2026, 8, 29)))).at(-1)!;
    const lignes = [...final.matchAll(/<tr[^>]*>/g)].map((m) => m[0]);
    expect(lignes).toHaveLength(3); // 2 jours + le bloc de fin
    expect(lignes[0]).not.toContain('break-before');
    expect(lignes[1]).toContain('break-before: avoid');
    expect(lignes[2]).toContain('break-before: avoid');
  });

  it('les cases à signer gardent leurs 18 mm — on resserre les marges, pas la place du stylo', () => {
    const html = renderEmargementHtml(ctx(new Date(2026, 8, 28), new Date(2026, 8, 29)));
    expect((html.match(/<td style="height: 18mm;">/g) ?? []).length).toBe(4);
    expect((html.match(/<div style="height: 12mm;"><\/div>/g) ?? []).length).toBe(2);
    expect(html).toContain('height: 26mm;');
  });
});
