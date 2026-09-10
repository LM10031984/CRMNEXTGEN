import { describe, expect, it } from 'vitest';

import {
  DUREE_CONSERVATION_TRANSCRIPT_JOURS,
  calculerEcheanceTranscript,
  transcriptEchu,
} from '../retention';

/**
 * La durée de vie d'un compte rendu de rendez-vous (spec §6.4).
 *
 * Ce texte est le verbatim d'une conversation : il porte des appréciations
 * nommées sur des salariés qui n'ont pas été informés. C'est la donnée la plus
 * sensible que la chaîne diagnostic manipule, et c'est celle qu'on garde le
 * moins longtemps.
 */

const j = (iso: string) => new Date(`${iso}T09:00:00.000Z`);

describe('Le repère de départ', () => {
  it('part du rendez-vous quand c’est le fait le plus récent', () => {
    const echeance = calculerEcheanceTranscript({
      meetingAt: j('2026-09-10'),
      prefillAt: null,
      createdAt: j('2026-09-01'),
    });
    expect(echeance.toISOString().slice(0, 10)).toBe('2026-12-09');
  });

  it('repart de la dernière extraction — un texte qui sert encore vit encore', () => {
    // Le cas réel : l'enregistrement dort trois mois dans un Plaud, puis on le
    // colle. Compté depuis le rendez-vous, il serait purgé la nuit suivante.
    const echeance = calculerEcheanceTranscript({
      meetingAt: j('2026-06-01'),
      prefillAt: j('2026-09-10'),
      createdAt: j('2026-06-01'),
    });
    expect(echeance.toISOString().slice(0, 10)).toBe('2026-12-09');
  });

  it('retombe sur la création quand rien d’autre n’est connu', () => {
    const echeance = calculerEcheanceTranscript({
      meetingAt: null,
      prefillAt: null,
      createdAt: j('2026-09-10'),
    });
    expect(echeance.toISOString().slice(0, 10)).toBe('2026-12-09');
  });
});

describe('L’échéance', () => {
  const dossier = { meetingAt: j('2026-06-01'), prefillAt: null, createdAt: j('2026-06-01') };

  it('ne purge pas la veille du 90ᵉ jour', () => {
    expect(transcriptEchu(dossier, j('2026-08-29'))).toBe(false);
  });

  it('purge le jour venu', () => {
    expect(transcriptEchu(dossier, j('2026-08-30'))).toBe(true);
  });

  it('vaut 90 jours, et le dit', () => {
    expect(DUREE_CONSERVATION_TRANSCRIPT_JOURS).toBe(90);
  });
});
