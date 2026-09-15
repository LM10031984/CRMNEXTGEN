import { describe, it, expect } from 'vitest';

/**
 * L'état AFFICHÉ d'une demande d'inscription sur la fiche session.
 *
 * ⚠ LE BUG QUE CE MODULE EXISTE POUR TUER. L'ancien affichage ne lisait que
 * `PreEnrollment.status`. Un dossier converti depuis /app/inscriptions passe à
 * CONVERTED sans qu'aucun SessionParticipant soit créé : la fiche session
 * annonçait donc « Inscrite » pour trois personnes sur une session qui comptait
 * ZÉRO inscrit (SES-0114, 15/09/2026). Et comme le badge « Inscrite » masquait
 * aussi le bouton d'action, le dossier devenait définitivement intraitable.
 *
 * La vérité d'une inscription n'est pas dans le statut du dossier, elle est
 * dans l'existence du participant. `estInscrit` est donc un paramètre à part
 * entière, et c'est lui qui tranche.
 */

import { etatDemande } from '../etat-demande';

describe('etatDemande — la vérité vient du participant', () => {
  it('CONVERTED SANS participant n’est PAS « inscrite », et reste actionnable', () => {
    const e = etatDemande({ status: 'CONVERTED', estInscrit: false });
    expect(e.libelle.toLowerCase()).not.toBe('inscrite');
    expect(e.actionPossible).toBe(true);
    expect(e.ton).toBe('alerte');
  });

  it('CONVERTED AVEC participant est « inscrite », et n’est plus actionnable', () => {
    const e = etatDemande({ status: 'CONVERTED', estInscrit: true });
    expect(e.libelle).toBe('Inscrite');
    expect(e.actionPossible).toBe(false);
    expect(e.ton).toBe('neutre');
  });

  it('dit ce qui manque, pas seulement que quelque chose manque', () => {
    const e = etatDemande({ status: 'CONVERTED', estInscrit: false });
    expect(e.libelle.toLowerCase()).toContain('pas inscrit');
  });
});

describe('etatDemande — les autres statuts', () => {
  it.each([
    ['SUBMITTED', 'Reçue'],
    ['EXTRACTING', 'Lecture en cours'],
    ['EXTRACTED', 'À valider'],
    ['VALIDATED', 'Validée'],
  ])('%s reste actionnable', (status, libelle) => {
    const e = etatDemande({ status, estInscrit: false });
    expect(e.libelle).toBe(libelle);
    expect(e.actionPossible).toBe(true);
  });

  it.each(['REJECTED', 'EXPIRED'])('%s n’est plus actionnable', (status) => {
    const e = etatDemande({ status, estInscrit: false });
    expect(e.actionPossible).toBe(false);
  });

  it('PENDING_FORM n’est pas actionnable : le formulaire n’est pas rempli', () => {
    const e = etatDemande({ status: 'PENDING_FORM', estInscrit: false });
    expect(e.actionPossible).toBe(false);
  });

  it('un statut inconnu s’affiche tel quel plutôt que de disparaître', () => {
    const e = etatDemande({ status: 'PLAN_B', estInscrit: false });
    expect(e.libelle).toBe('PLAN_B');
  });

  it('un participant existant l’emporte sur n’importe quel statut', () => {
    // Inscription faite à la main après coup : le dossier n'a jamais changé de
    // statut, mais la personne EST dans la session. Proposer « inscrire » là
    // fabriquerait un doublon que la server action refuserait — autant ne pas
    // le proposer.
    const e = etatDemande({ status: 'EXTRACTED', estInscrit: true });
    expect(e.libelle).toBe('Inscrite');
    expect(e.actionPossible).toBe(false);
  });
});
