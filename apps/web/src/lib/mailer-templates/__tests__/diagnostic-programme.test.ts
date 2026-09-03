/**
 * Le template part chez des PROSPECTS. Ce qui doit tenir :
 *  - l'échappement ;
 *  - aucun PRIX de la journée (le tarif dépend du payeur — on ne s'engage pas à
 *    l'aveugle) ; les seuls montants tolérés sont ceux de la prise en charge
 *    AGEFICE, qui sont un droit du prospect, pas une facture ;
 *  - aucun chiffre de satisfaction (les notes en base sont générées par IA) ;
 *  - UN SEUL lien cliquable ;
 *  - une signature d’équipe, avec un humain joignable en dessous ;
 *  - le repli lisible quand le sur-mesure a échoué.
 */

import { describe, it, expect } from 'vitest';
import { renderDiagnosticProgrammeEmail, formatDuree, resolveCtaUrl,
  composerFinancement,
} from '../diagnostic-programme';
import type { ProduitPropose } from '../diagnostic-programme';
import { QUESTIONS, lireRole, lireEquipe } from '@/lib/diagnostic/questions';
import type { ProgrammeSurMesure } from '@/lib/diagnostic/programme-sur-mesure';
import type { OfConfig } from '@/lib/of-config';

const OF = {
  name: 'Start Academy',
  addressFull: '12 avenue des Camélias, 06800 Cagnes-sur-Mer',
  siret: '95131909400011',
  rnq: '93061048106',
  phone: '06 31 05 63 90',
  resp: { prenom: 'Laurent', nom: 'MARX', titre: 'Gérant', phone: '06 31 05 63 90' },
  contact: { prenom: 'Laurent', nom: 'MARX', titre: 'Gérant', phone: '06 31 05 63 90' },
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
      // Par défaut : un indépendant seul — c'est le profil du bloc financement
      // d'avant le 03/09/2026, pour que les tests existants gardent leur sens.
      role: 'AGENT_CO',
      equipe: 'SEUL',
      ctaUrl: 'https://cal.start-academy.fr/point-financement',
      ...over,
    },
    OF,
  );
}

describe('renderDiagnosticProgrammeEmail — ce qu’on ne dit JAMAIS', () => {
  it("n'annonce jamais le tarif de la journée", () => {
    for (const sm of [SUR_MESURE, null]) {
      const { html, text, subject } = render({ surMesure: sm });
      for (const [nom, contenu] of [['html', html], ['text', text], ['subject', subject]] as const) {
        expect(contenu, `${nom} parle de tarif`).not.toMatch(/tarif|\bprix\b|\bcoût\b|\bHT\b|\bTTC\b/i);
      }
    }
  });

  it('a supprimé la promesse fausse « pris en charge en totalité »', () => {
    const { html, text } = render();
    for (const contenu of [html, text]) {
      expect(contenu).not.toMatch(/en totalité/i);
    }
  });

  it("n'affiche aucun chiffre de satisfaction (les notes en base sont générées)", () => {
    const { html, text } = render();
    for (const contenu of [html, text]) {
      expect(contenu).not.toMatch(/satisfaction|\d[.,]\d\s?\/\s?5/i);
    }
  });
});

describe('renderDiagnosticProgrammeEmail — le bloc financement (AGEFICE 2026)', () => {
  it('porte les chiffres réels : 42 €/h, 3 000 €/an, 15 jours, 31 décembre', () => {
    const { html, text } = render();
    for (const contenu of [html, text]) {
      expect(contenu).toContain('42 €');
      expect(contenu).toContain('3 000 €');
      expect(contenu).toContain('336 €');
      expect(contenu).toMatch(/15 jours calendaires/);
      expect(contenu).toMatch(/31 décembre/);
    }
  });

  it('dit explicitement que l’enveloppe non consommée est perdue', () => {
    expect(render().text).toMatch(/est perdu/);
  });
});

describe('renderDiagnosticProgrammeEmail — le CTA unique', () => {
  it('rend UN SEUL lien cliquable dans le corps', () => {
    const { html } = render();
    const liens = html.match(/<a\s/g) ?? [];
    expect(liens).toHaveLength(1);
    expect(html).toContain('Réserver mon point financement');
    expect(html).toContain('https://cal.start-academy.fr/point-financement');
  });

  it('replie sur le portable de l’organisme quand la variable est vide', () => {
    const { html, text } = render({ ctaUrl: '' });
    expect(html).toContain('href="tel:0631056390"');
    expect(text).toContain('tel:0631056390');
    expect((html.match(/<a\s/g) ?? [])).toHaveLength(1);
  });

  it('n’affiche aucun bouton plutôt qu’un bouton mort', () => {
    const sansTel = { ...OF, phone: '', resp: { ...OF.resp, phone: '' }, contact: { ...OF.contact, phone: '' } } as OfConfig;
    const { html } = renderDiagnosticProgrammeEmail(
      { firstName: 'Camille', dominante: 'IA_PRODUCTIVITE', secondaire: null, produit: PRODUIT, surMesure: null, role: 'AGENT_CO', equipe: 'SEUL', ctaUrl: '' },
      sansTel,
    );
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('Réserver mon point financement');
  });
});

describe('resolveCtaUrl', () => {
  it('préfère la variable d’environnement', () => {
    expect(resolveCtaUrl('https://cal.com/laurent', '06 31 05 63 90')).toBe('https://cal.com/laurent');
  });

  it('replie sur un tel: normalisé (espaces et points retirés)', () => {
    expect(resolveCtaUrl('', '06.31.05 63 90')).toBe('tel:0631056390');
    expect(resolveCtaUrl(undefined, '+33 6 31 05 63 90')).toBe('tel:+33631056390');
  });

  it('refuse un schéma non autorisé — une variable mal remplie ne doit rien injecter', () => {
    expect(resolveCtaUrl('javascript:alert(1)', '')).toBeNull();
  });

  it('retourne null quand il n’y a ni lien ni téléphone', () => {
    expect(resolveCtaUrl('', '')).toBeNull();
  });
});

describe('renderDiagnosticProgrammeEmail — signature et contenu', () => {
  it("signe « L'équipe Start Academy », avec le prénom et le portable du responsable en dessous", () => {
    const { html, text } = render();
    // Comme pour le titre produit ci-dessous : l'apostrophe est échappée dans le
    // HTML et brute dans le texte. Chercher la même chaîne dans les deux ferait
    // échouer un template pourtant correct.
    expect(text).toContain("L'équipe Start Academy");
    expect(html).toContain('L&#39;équipe Start Academy');
    for (const contenu of [html, text]) {
      expect(contenu).toContain('Laurent MARX');
      expect(contenu).toContain('06 31 05 63 90');
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

describe('bloc financement — il dépend du STATUT, pas de la formation', () => {
  // Jusqu'au 03/09/2026 l'email annonçait des droits AGEFICE à tout le monde.
  // C'est faux pour un salarié, et ça se retourne au moment précis où il
  // vérifie. Ces tests tiennent les trois variantes.

  describe('indépendant — ses droits AGEFICE personnels, chiffrés', () => {
    for (const role of ['AGENT_CO', 'AUTRE'] as const) {
      it(`${role} seul reçoit les 336 € et l'enveloppe annuelle`, () => {
        const b = composerFinancement(role, 'SEUL');
        expect(b.chiffre).toBe('336 €');
        expect(b.legende).toMatch(/AGEFICE/);
        expect(b.paragraphes.join('\n')).toMatch(/3 000 € par an/);
        expect(b.paragraphes.join('\n')).toMatch(/31 décembre/);
        expect(b.paragraphes.join('\n')).toMatch(/15 jours calendaires/);
      });
    }

    it('un indépendant ENTOURÉ garde son bloc individuel — ses droits sont personnels', () => {
      // On ignore le statut de ceux qui travaillent avec lui : lui parler d'une
      // enveloppe d'équipe serait exactement l'erreur qu'on corrige.
      const b = composerFinancement('AGENT_CO', 'DE_6_A_15');
      expect(b.chiffre).toBe('336 €');
      expect(b.paragraphes.join('\n')).not.toMatch(/votre équipe/);
    });
  });

  describe('conseiller salarié — OPCO EP, et AUCUN montant', () => {
    const b = composerFinancement('CONSEILLER', 'SEUL');

    it('n’annonce aucun chiffre : ni sa branche ni l’engagement de son agence ne sont connus', () => {
      expect(b.chiffre).toBeNull();
      expect(b.legende).toBeNull();
      expect(b.paragraphes.join('\n')).not.toMatch(/\d+\s*€/);
    });

    it('nomme le bon financeur et dit qui dépose', () => {
      const t = b.paragraphes.join('\n');
      expect(t).toMatch(/OPCO EP/);
      expect(t).toMatch(/employeur/);
      expect(t).toMatch(/montons le dossier avec vous/);
    });

    it('ne promet JAMAIS de droits AGEFICE à un salarié', () => {
      const t = b.paragraphes.join('\n');
      expect(t).toMatch(/ne relève pas de l['’]AGEFICE/);
      expect(t).not.toMatch(/votre enveloppe formation 2026/i);
    });

    it('la taille de l’équipe ne change rien pour un salarié', () => {
      for (const eq of ['SEUL', 'DE_2_A_5', 'DE_6_A_15', 'PLUS_DE_15'] as const) {
        expect(composerFinancement('CONSEILLER', eq)).toEqual(b);
      }
    });
  });

  describe('dirigeant — raisonnement collectif, en FOURCHETTE', () => {
    const CAS = [
      ['DE_2_A_5', '700 à 1 700 €'],
      ['DE_6_A_15', '2 000 à 5 000 €'],
      ['PLUS_DE_15', 'plus de 5 000 €'],
    ] as const;

    for (const [equipe, attendu] of CAS) {
      it(`${equipe} → « ${attendu} »`, () => {
        const b = composerFinancement('DIRIGEANT', equipe);
        expect(b.chiffre).toBe(attendu);
        expect(b.legende).toMatch(/votre équipe/);
      });
    }

    it('explique les deux régimes : AGEFICE pour les indépendants, OPCO EP pour les salariés', () => {
      const t = composerFinancement('DIRIGEANT', 'DE_2_A_5').paragraphes.join('\n');
      expect(t).toMatch(/indépendant de votre équipe.*AGEFICE/s);
      expect(t).toMatch(/336 €/);
      expect(t).toMatch(/salariés.*OPCO EP/s);
      expect(t).toMatch(/31 décembre/);
      expect(t).toMatch(/15 jours calendaires/);
    });

    it('renvoie le chiffrage précis au rendez-vous, sans jamais donner de total', () => {
      for (const [equipe] of CAS) {
        const t = composerFinancement('DIRIGEANT', equipe).paragraphes.join('\n');
        expect(t).toMatch(/15 minutes/);
        // Un total exact serait un engagement qu'on ne peut pas tenir : on ne
        // connaît ni le statut de chacun ni ce qui a déjà été consommé.
        expect(t, `${equipe} : un total a été calculé`).not.toMatch(/au total|soit \d/i);
      }
    });

    it('un dirigeant qui travaille SEUL n’a pas d’équipe — il retombe sur ses droits personnels', () => {
      const b = composerFinancement('DIRIGEANT', 'SEUL');
      expect(b.chiffre).toBe('336 €');
      expect(b.legende).toMatch(/AGEFICE/);
    });
  });

  describe('le bloc arrive vraiment dans l’email, HTML et texte', () => {
    it('le salarié ne voit aucun montant dans le corps du mail', () => {
      const { html, text } = render({ role: 'CONSEILLER', equipe: 'SEUL' });
      for (const contenu of [html, text]) {
        expect(contenu).toMatch(/OPCO EP/);
        expect(contenu).not.toMatch(/336/);
        expect(contenu).not.toMatch(/3 000/);
      }
    });

    it('le dirigeant voit sa fourchette, pas 336 € en gros', () => {
      const { html, text } = render({ role: 'DIRIGEANT', equipe: 'DE_6_A_15' });
      for (const contenu of [html, text]) {
        expect(contenu).toMatch(/2 000 à 5 000 €/);
      }
      // 336 € reste cité dans le corps du raisonnement, mais pas comme LE chiffre.
      expect(html).not.toMatch(/font-size:26px[^>]*>336 €/);
    });

    it('l’indépendant garde exactement l’email d’avant', () => {
      const { html, text } = render({ role: 'AGENT_CO', equipe: 'SEUL' });
      for (const contenu of [html, text]) {
        expect(contenu).toMatch(/336 €/);
        expect(contenu).toMatch(/3 000 €/);
      }
    });

    it('rôle inconnu : on garde le bloc individuel plutôt qu’un texte que personne n’a relu', () => {
      const b = composerFinancement(null, null);
      expect(b).toEqual(composerFinancement('AGENT_CO', 'SEUL'));
    });

    it('le CTA et la signature ne bougent pas, quel que soit le profil', () => {
      for (const [role, equipe] of [['AGENT_CO', 'SEUL'], ['CONSEILLER', 'SEUL'], ['DIRIGEANT', 'PLUS_DE_15']] as const) {
        const { html } = render({ role, equipe });
        expect((html.match(/<a\s/g) ?? []), `${role}/${equipe}`).toHaveLength(1);
        expect(html).toContain('Réserver mon point financement');
        expect(html).toContain('L&#39;équipe Start Academy');
      }
    });
  });
});

describe('les valeurs de Q1 et Q2 n’ont pas divergé du formulaire', () => {
  // Le bloc financement se décide sur ces deux réponses. Si quelqu'un renomme
  // un choix dans le formulaire sans toucher aux gardes, `lireRole` rendra
  // `null` et TOUT LE MONDE recevra le bloc « indépendant » — y compris les
  // salariés. La panne serait invisible : l'email reste bien formé, il ment
  // juste. Ce test la rend bruyante.

  it('chaque choix de « rôle » proposé est reconnu par la garde', () => {
    const q = QUESTIONS.find((x) => x.id === 'role');
    expect(q, 'la question « rôle » a disparu').toBeDefined();
    for (const c of q!.choix) {
      expect(lireRole(c.value), `choix « ${c.value} » non reconnu`).toBe(c.value);
    }
    expect(q!.choix.map((c) => c.value).sort()).toEqual(
      ['AGENT_CO', 'AUTRE', 'CONSEILLER', 'DIRIGEANT'],
    );
  });

  it('chaque choix de « taille d’équipe » proposé est reconnu par la garde', () => {
    const q = QUESTIONS.find((x) => x.id === 'equipe');
    expect(q, 'la question « équipe » a disparu').toBeDefined();
    for (const c of q!.choix) {
      expect(lireEquipe(c.value), `choix « ${c.value} » non reconnu`).toBe(c.value);
    }
    expect(q!.choix.map((c) => c.value).sort()).toEqual(
      ['DE_2_A_5', 'DE_6_A_15', 'PLUS_DE_15', 'SEUL'],
    );
  });

  it('une valeur inventée est refusée, elle ne devient pas un profil par accident', () => {
    expect(lireRole('PATRON')).toBeNull();
    expect(lireRole('')).toBeNull();
    expect(lireRole(undefined)).toBeNull();
    expect(lireEquipe('DE_2_A_6')).toBeNull();
    expect(lireEquipe(42)).toBeNull();
  });
});
