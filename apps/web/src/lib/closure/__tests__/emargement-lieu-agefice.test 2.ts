import { describe, it, expect } from 'vitest';
import { renderEmargementHtml } from '../emargement-template';
import type { ClosureContext } from '../shared-template';

/**
 * AGEFICE 2026-08-28 — demande de complément reçue sur une prise en charge :
 * « Le document Feuille(s) d'émargement est incomplet : raison sociale du lieu
 * de formation ».
 *
 * Cause : la feuille composait son lieu à partir du seul nom d'usage et de la
 * ville (« Nice — Akorimmo — Nice »), sans jamais lire `Location.legalName`.
 * Ces tests verrouillent le rendu attendu : raison sociale + adresse complète
 * dans le corps, ville seule sous « Fait à … ».
 */

const CTX: ClosureContext = {
  apprenantPrenom: 'Caroline',
  apprenantNom: 'Vescovi',
  apprenantCivility: 'Mme',
  sessionId: 'ses-test',
  sessionCode: 'SES-0110',
  sessionTitle: "Maîtriser l'IA pour développer son activité",
  sessionStartDate: new Date('2026-09-14T09:00:00'),
  sessionEndDate: new Date('2026-09-16T18:00:00'),
  sessionLocation:
    "SARL L'Agence Signature — Agence Nice Centre, 12 rue Masséna, 06000 Nice",
  sessionLocationCity: 'Nice',
  sessionTrainers: ['Jean-Guy Ferrero'],
  durationHours: 24,
};

describe("feuille d'émargement — mentions du lieu exigées par l'AGEFICE", () => {
  it('porte la raison sociale du lieu, son code postal et sa ville', () => {
    const html = renderEmargementHtml(CTX);
    // `escapeHtml` ne touche pas l'apostrophe : le libellé sort tel quel.
    expect(html).toContain("SARL L'Agence Signature");
    expect(html).toContain('12 rue Masséna');
    expect(html).toContain('06000 Nice');
  });

  it('intitule le bloc « Lieu de formation » et non « Lieu »', () => {
    expect(renderEmargementHtml(CTX)).toContain('Lieu de formation :');
  });

  it('ne met que la VILLE sous « Fait à … »', () => {
    const html = renderEmargementHtml(CTX);
    expect(html).toContain('Fait à <strong>Nice</strong>');
    // L'adresse entière y serait illisible (décision Laurent 28/08).
    expect(html).not.toContain('Fait à <strong>SARL');
  });

  it("retombe sur le libellé complet quand la ville n'est pas fournie", () => {
    // Rendus anciens / mocks qui ne peuplent pas `sessionLocationCity` :
    // mieux vaut un « Fait à » verbeux qu'un « Fait à ⚠ ».
    const html = renderEmargementHtml({ ...CTX, sessionLocationCity: undefined });
    expect(html).toContain('Fait à <strong>SARL');
  });

  it('signale un lieu absent au lieu de laisser un blanc', () => {
    const html = renderEmargementHtml({
      ...CTX,
      sessionLocation: null,
      sessionLocationCity: null,
    });
    expect(html).toContain('LIEU À RENSEIGNER');
  });
});
