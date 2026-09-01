/**
 * Le template part chez des PROSPECTS. Trois choses doivent tenir :
 * l'échappement, l'absence de prix (le tarif dépend du payeur — on ne s'engage
 * pas à l'aveugle), et le repli lisible quand le sur-mesure a échoué.
 */

import { describe, it, expect } from 'vitest';
import { renderDiagnosticProgrammeEmail, formatDuree } from '../diagnostic-programme';
import type { ProduitPropose } from '../diagnostic-programme';
import type { ProgrammeSurMesure } from '@/lib/diagnostic/programme-sur-mesure';
import type { OfConfig } from '@/lib/of-config';

const OF = {
  name: 'Start Academy',
  addressFull: '12 avenue des Camélias, 06800 Cagnes-sur-Mer',
  siret: '95131909400011',
  rnq: '93061048106',
} as unknown as OfConfig;

const PRODUIT: ProduitPropose = {
  title: "L'IA au service des conseillers immobiliers (8h)",
  dureeHeures: 8,
  objectifs: ['Comprendre le fonctionnement de ChatGPT', 'Optimiser la prospection avec l’IA'],
  programmeMd: 'Matinée (9h - 13h)\n● Présentation de ChatGPT.\n● Création de prompts.',
};

const SUR_MESURE: ProgrammeSurMesure = {
  accroche: 'Vos matinées partent en rédaction. Cette journée attaque ce point précis.',
  objectifs: ['Rédiger une annonce en trois minutes', 'Automatiser vos relances', 'Préparer un RDV vendeur'],
  sequences: [
    {
      moment: 'MATIN',
      titre: 'Prendre en main ChatGPT',
      pourquoiVous: 'Vous n’en avez jamais utilisé : on part de zéro.',
      points: [{ source: 'Présentation de ChatGPT.', texte: 'Découvrir ChatGPT et ses limites' }],
    },
    {
      moment: 'APRES_MIDI',
      titre: 'Rédiger vite et bien',
      pourquoiVous: 'C’est là que part votre temps.',
      points: [{ source: 'Création de prompts.', texte: 'Écrire des prompts qui marchent' }],
    },
  ],
};

function render(over: Partial<Parameters<typeof renderDiagnosticProgrammeEmail>[0]> = {}) {
  return renderDiagnosticProgrammeEmail(
    {
      firstName: 'Camille',
      dominante: 'IA_PRODUCTIVITE',
      secondaire: null,
      produit: PRODUIT,
      surMesure: SUR_MESURE,
      ...over,
    },
    OF,
  );
}

describe('renderDiagnosticProgrammeEmail', () => {
  it("n'annonce jamais de prix", () => {
    for (const sm of [SUR_MESURE, null]) {
      const { html, text, subject } = render({ surMesure: sm });
      for (const [nom, contenu] of [['html', html], ['text', text], ['subject', subject]] as const) {
        expect(contenu, `${nom} contient un montant`).not.toMatch(/\d\s?(€|EUR)/i);
      }
    }
  });

  it('porte le titre RÉEL du produit du catalogue', () => {
    const { subject, html } = render();
    expect(subject).toContain("L'IA au service des conseillers immobiliers");
    // Dans le HTML l'apostrophe est échappée — c'est le comportement voulu.
    expect(html).toContain('L&#39;IA au service des conseillers immobiliers');
  });

  it('rend le programme sur mesure quand il existe', () => {
    const { html } = render();
    expect(html).toContain('Prendre en main ChatGPT');
    expect(html).toContain('Vous n’en avez jamais utilisé');
    expect(html).toContain('Matinée (9h - 13h)');
    expect(html).toContain('Après-midi (14h - 18h)');
  });

  it('retombe sur le programme du catalogue quand le sur-mesure a échoué', () => {
    const { html, text } = render({ surMesure: null });
    expect(html).toContain('Présentation de ChatGPT.');
    expect(text).toContain('Présentation de ChatGPT.');
    expect(html).not.toContain('Prendre en main ChatGPT');
  });

  it('échappe les valeurs interpolées', () => {
    const { html } = render({ firstName: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('mentionne la problématique secondaire quand elle existe, et se tait sinon', () => {
    expect(render({ secondaire: 'PROSPECTION_MANDATS' }).html).toContain('En prolongement');
    expect(render({ secondaire: null }).html).not.toContain('En prolongement');
  });

  it("porte les mentions de l'organisme (SIRET, NDA) en pied", () => {
    const { html } = render();
    expect(html).toContain('95131909400011');
    expect(html).toContain('93061048106');
  });
});

describe('formatDuree', () => {
  it('applique la convention 8 h = 1 jour', () => {
    expect(formatDuree(8)).toBe('8 h / 1 jour');
    expect(formatDuree(16)).toBe('16 h / 2 jours');
    expect(formatDuree(72)).toBe('72 h / 9 jours');
  });
});
