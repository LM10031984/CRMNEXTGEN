import { describe, expect, it } from 'vitest';

import type { DiagnosticAlert } from '@/lib/diagnostic-r1/ratios';

import {
  moduleFamilyOf,
  recommendModules,
  type ChapterScoreLike,
  type EvidenceAnswer,
  type LibraryModule,
  type ModuleSourceProgramme,
} from '../module-matcher';

/**
 * Les rayons de la bibliothèque, tels qu'ils existent réellement sur la base
 * locale au 10/09/2026 : **tous inactifs**. C'est le cas nominal depuis le
 * corollaire D-19 — les conteneurs importés ne s'activent jamais, seul le
 * produit composé (lot I-2) portera l'état vendable.
 */
function rayon(
  code: string,
  title: string,
  opts: Partial<ModuleSourceProgramme> = {},
): ModuleSourceProgramme {
  return {
    productId: `id-${code}`,
    code,
    title,
    theme: null,
    fundingType: 'COEUR_METIER',
    isActive: false,
    supersededBy: null,
    excludedFromClientOutputs: false,
    ...opts,
  };
}

const VENDEUR = rayon('PROD-0680', 'Catalogue diagnostic — Vendeur');
const BOOSTER = rayon('DRV-058', 'Booster vendeur : devenir incontournable auprès des vendeurs');
const IA_MANAGER = rayon('DRV-060', 'IA Manager : piloter, motiver et performer grâce à l’IA', {
  theme: 'IA',
});
const TRACFIN = rayon('DRV-046', 'Tracfin', { fundingType: 'REGLEMENTAIRE' });

function mod(
  moduleId: string,
  title: string,
  source: ModuleSourceProgramme,
  opts: Partial<LibraryModule> = {},
): LibraryModule {
  return {
    moduleId,
    title,
    family: null,
    targetProfile: null,
    signals: [],
    needIdentification: null,
    isFoundation: false,
    durationMin: 90,
    excludedFromClientOutputs: false,
    // Animable par défaut : c'est le cas nominal d'un module de catalogue, et
    // le vide se déclare explicitement là où on veut le tester (règle 4).
    contentMd: '- Étape 1\n- Étape 2',
    source,
    ...opts,
  };
}

/**
 * Un extrait de bibliothèque volontairement mixte : des modules porteurs de
 * signaux (catalogue diagnostic), des modules qui ne se rapprochent que par
 * leur intitulé (production Drive), un module IA et un module réglementaire.
 */
const BIBLIOTHEQUE: LibraryModule[] = [
  mod('m-exclu-signal', 'Vente de mandats exclusifs', VENDEUR, {
    family: 'Vendeur',
    signals: ['Mandat — Trop de mandats simples, exclusivité difficile à obtenir'],
    isFoundation: true,
  }),
  mod('m-objections', 'Gérer efficacement les objections des vendeurs', VENDEUR, {
    family: 'Vendeur',
    needIdentification: 'Quelle part de mandats en exclusivité ? Comment traitez-vous l’objection ?',
  }),
  mod('m-prospecter', 'Prospecter autrement pour ne plus être ignoré', BOOSTER),
  mod('m-leads', 'Générer des leads vendeurs qualifiés', BOOSTER),
  mod('m-ia-pilotage', 'Piloter son équipe avec l’IA', IA_MANAGER),
  mod('m-atelier-ia', 'Atelier pratique', IA_MANAGER),
  mod('m-tracfin', 'Obligations de vigilance', TRACFIN),
  mod('m-pige', 'Exploiter la pige quotidienne', VENDEUR, {
    signals: ['Mandat — Trop de mandats simples, exclusivité difficile à obtenir'],
    excludedFromClientOutputs: true,
  }),
];

function alerte(code: string, chapter: number, questionIds: string[] = []): DiagnosticAlert {
  return {
    code,
    chapter,
    label: `Alerte ${code}`,
    severity: 'warning',
    audience: 'client',
    observed: 20,
    threshold: 40,
    questionIds,
  };
}

const REPONSES: EvidenceAnswer[] = [
  {
    questionId: 'mandates-exclusivity-percent',
    label: 'Part de mandats en exclusivité',
    value: '22 %',
  },
  {
    questionId: 'seller-discovery-formalized',
    label: 'La découverte vendeur est-elle formalisée ?',
    value: 'Non',
  },
];

/** Un chapitre faible, avec le détail qui permet de remonter à la réponse. */
function chapitre(chapter: number, score: number | null, questionId?: string): ChapterScoreLike {
  return {
    chapter,
    score,
    breakdown: questionId
      ? [
          {
            rule: `regle-${chapter}`,
            weight: 3,
            earned: 0,
            note: 'Découverte vendeur formalisée',
            questionId,
            ratioKey: null,
          },
        ]
      : [],
  };
}

describe('recommendModules — corollaire D-19 : la bibliothèque se lit conteneurs inactifs', () => {
  it('propose des modules alors que TOUS les conteneurs sont inactifs', () => {
    // Le test qui tient la règle (spec §5.3). Une liste vide signifierait qu'un
    // filtre `isActive` s'est glissé dans le chemin de composition — et que les
    // 86 modules importés sont redevenus invisibles.
    expect(BIBLIOTHEQUE.every((m) => !m.source.isActive)).toBe(true);

    const out = recommendModules({
      chapterScores: [chapitre(5, 30)],
      alerts: [alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent'])],
      answers: REPONSES,
      library: BIBLIOTHEQUE,
    });

    const axe = out.recommendations.find((r) => r.need.code === 'mandat_exclusivite');
    expect(axe).toBeDefined();
    expect(axe!.candidates.length).toBeGreaterThan(0);
    expect(axe!.unmet).toBe(false);
  });

  it('ne change rien quand les conteneurs sont actifs — `isActive` n’est pas un critère', () => {
    const actifs = BIBLIOTHEQUE.map((m) => ({
      ...m,
      source: { ...m.source, isActive: true },
    }));
    const args = {
      chapterScores: [chapitre(5, 30)],
      alerts: [alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent'])],
      answers: REPONSES,
    };

    const inactifs = recommendModules({ ...args, library: BIBLIOTHEQUE });
    const actives = recommendModules({ ...args, library: actifs });

    expect(actives.recommendations.map((r) => r.candidates.map((c) => c.moduleId))).toEqual(
      inactifs.recommendations.map((r) => r.candidates.map((c) => c.moduleId)),
    );
  });
});

describe('recommendModules — traçabilité module ↔ signal ↔ réponse', () => {
  it('rattache chaque axe servi à une réponse du diagnostic', () => {
    const out = recommendModules({
      chapterScores: [chapitre(5, 30), chapitre(4, 20, 'seller-discovery-formalized')],
      alerts: [
        alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent']),
        alerte('seller_discovery_not_formalized', 4, ['seller-discovery-formalized']),
      ],
      answers: REPONSES,
      library: BIBLIOTHEQUE,
    });

    const servis = out.recommendations.filter((r) => r.candidates.length > 0);
    expect(servis.length).toBeGreaterThan(0);
    for (const axe of servis) {
      expect(axe.evidence.length).toBeGreaterThan(0);
      const citations = axe.evidence.flatMap((e) =>
        e.kind === 'alerte' ? e.answers.map((a) => a.questionId) : [e.questionId],
      );
      // Chaque axe cite au moins une réponse réellement donnée par le client.
      expect(citations.some((id) => REPONSES.some((r) => r.questionId === id))).toBe(true);
    }
  });

  it('nomme le signal du catalogue qui a fait entrer le module', () => {
    const out = recommendModules({
      chapterScores: [chapitre(5, 30)],
      alerts: [alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent'])],
      answers: REPONSES,
      library: BIBLIOTHEQUE,
    });

    const axe = out.recommendations.find((r) => r.need.code === 'mandat_exclusivite')!;
    const parSignal = axe.candidates.find((c) => c.matchSource === 'signaux');
    expect(parSignal).toBeDefined();
    expect(parSignal!.matchedSignals[0]).toContain('exclusivité difficile à obtenir');
    expect(parSignal!.confidence).toBe('forte');
  });

  it('remonte la réponse mal notée quand c’est le barème qui déclenche, sans alerte', () => {
    const out = recommendModules({
      chapterScores: [chapitre(4, 20, 'seller-discovery-formalized')],
      alerts: [],
      answers: REPONSES,
      library: BIBLIOTHEQUE,
    });

    const axe = out.recommendations.find((r) => r.need.code === 'decouverte_vendeur')!;
    const preuve = axe.evidence.find((e) => e.kind === 'reponse');
    expect(preuve).toBeDefined();
    expect(preuve).toMatchObject({
      kind: 'reponse',
      questionId: 'seller-discovery-formalized',
      value: 'Non',
    });
  });
});

describe('recommendModules — règles de catalogue gravées', () => {
  it('ne propose JAMAIS un module interdit en sortie client (pige)', () => {
    const out = recommendModules({
      chapterScores: [chapitre(5, 30)],
      alerts: [alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent'])],
      answers: REPONSES,
      library: BIBLIOTHEQUE,
    });

    const tous = out.recommendations.flatMap((r) => r.candidates.map((c) => c.moduleId));
    expect(tous).not.toContain('m-pige');
    expect(out.libraryModuleCount).toBe(BIBLIOTHEQUE.length - 1);
    expect(out.notices.some((n) => n.includes('pige'))).toBe(true);
  });

  it('sert une douleur métier avec un module métier, jamais avec de l’IA seule', () => {
    // Le besoin `mandat_exclusivite` n'accepte que METIER. Même si un module IA
    // matchait, il ne serait pas servi.
    const out = recommendModules({
      chapterScores: [chapitre(5, 30)],
      alerts: [alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent'])],
      answers: REPONSES,
      library: BIBLIOTHEQUE,
    });

    const axe = out.recommendations.find((r) => r.need.code === 'mandat_exclusivite')!;
    expect(axe.candidates.length).toBeGreaterThan(0);
    expect(axe.candidates.every((c) => c.family === 'METIER')).toBe(true);
  });

  it('propose des modules venus de plusieurs programmes sources', () => {
    const out = recommendModules({
      chapterScores: [chapitre(3, 25), chapitre(5, 30)],
      alerts: [
        alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent']),
        alerte('no_one_prospects', 3, []),
      ],
      answers: REPONSES,
      library: BIBLIOTHEQUE,
    });

    expect(out.sourceProgrammeCount).toBeGreaterThanOrEqual(2);
  });
});

describe('moduleFamilyOf — le module parle pour lui-même, son rayon parle à défaut', () => {
  it('classe REGLEMENTAIRE depuis la donnée de financement, jamais depuis le code', () => {
    expect(moduleFamilyOf(mod('x', 'Obligations de vigilance', TRACFIN))).toBe('REGLEMENTAIRE');
  });

  it('garde METIER un module métier rangé dans un programme IA', () => {
    expect(moduleFamilyOf(mod('x', 'Prospecter autrement sur son secteur', IA_MANAGER))).toBe(
      'METIER',
    );
  });

  it('hérite de la famille du rayon quand le titre du module ne dit rien', () => {
    expect(moduleFamilyOf(mod('x', 'Atelier pratique', IA_MANAGER))).toBe('IA');
    expect(moduleFamilyOf(mod('x', 'Atelier pratique', BOOSTER))).toBe('METIER');
  });

  it('classe IA sur les mots du module lui-même', () => {
    expect(moduleFamilyOf(mod('x', 'Rédiger ses annonces avec ChatGPT', BOOSTER))).toBe('IA');
  });
});

describe('recommendModules — ce qui ne se comble pas se dit', () => {
  it('signale une bibliothèque vide au lieu de rendre un résultat muet', () => {
    const out = recommendModules({
      chapterScores: [chapitre(5, 30)],
      alerts: [alerte('exclusivity_below_benchmark', 5, [])],
      answers: REPONSES,
      library: [],
    });
    expect(out.notices.some((n) => n.includes('bibliothèque de modules est vide'))).toBe(true);
    expect(out.recommendations.every((r) => r.unmet)).toBe(true);
  });

  it('badge « faible » un rapprochement qui ne tient qu’à l’intitulé', () => {
    const out = recommendModules({
      chapterScores: [chapitre(3, 25)],
      alerts: [alerte('no_one_prospects', 3, [])],
      answers: REPONSES,
      library: BIBLIOTHEQUE,
    });

    const axe = out.recommendations.find((r) => r.need.code === 'prospection')!;
    expect(axe.candidates.every((c) => c.confidence === 'faible')).toBe(true);
    expect(out.notices.some((n) => n.includes('les mots de son intitulé'))).toBe(true);
  });
});

describe('recommendModules — un mot qui matche tout ne qualifie rien (D-18 au niveau module)', () => {
  /**
   * Une bibliothèque réaliste : « vendeur » y est partout (comme dans le vrai
   * catalogue, où il touche un module sur cinq), « exclusivite » y est rare.
   */
  function grandeBibliotheque(): LibraryModule[] {
    const bruit = Array.from({ length: 60 }, (_, i) =>
      mod(`bruit-${i}`, `Travailler avec le vendeur — séance ${i}`, BOOSTER),
    );
    const generaliste = mod('generaliste', 'Module fourre-tout', VENDEUR, {
      signals: ['Vendeurs difficiles à faire baisser'],
    });
    const precis = mod('precis', 'Signer en exclusivité', VENDEUR, {
      signals: ['Mandat — Trop de mandats simples, exclusivité difficile à obtenir'],
    });
    return [...bruit, generaliste, precis];
  }

  const args = {
    chapterScores: [chapitre(5, 30)],
    alerts: [alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent'])],
    answers: REPONSES,
  };

  it('ne badge pas « forte » un signal accroché par le seul mot « vendeur »', () => {
    const out = recommendModules({ ...args, library: grandeBibliotheque() });
    const axe = out.recommendations.find((r) => r.need.code === 'mandat_exclusivite')!;

    const generaliste = axe.candidates.find((c) => c.moduleId === 'generaliste');
    // Il peut rester candidat — il matche vraiment — mais pas en confiance forte.
    if (generaliste) expect(generaliste.confidence).toBe('faible');
  });

  it('classe devant le module accroché par un mot réellement discriminant', () => {
    const out = recommendModules({ ...args, library: grandeBibliotheque() });
    const axe = out.recommendations.find((r) => r.need.code === 'mandat_exclusivite')!;

    expect(axe.candidates[0]!.moduleId).toBe('precis');
    expect(axe.candidates[0]!.confidence).toBe('forte');
  });

  it('ne pondère pas une bibliothèque trop petite pour être mesurée', () => {
    // Sur huit modules, « exclusivite » présent deux fois pèse 25 % : la
    // statistique dirait « passe-partout » là où il n'y a qu'un échantillon.
    const out = recommendModules({ ...args, library: BIBLIOTHEQUE });
    const axe = out.recommendations.find((r) => r.need.code === 'mandat_exclusivite')!;
    expect(axe.candidates.some((c) => c.confidence === 'forte')).toBe(true);
  });
});

describe('recommendModules — composer depuis plusieurs programmes, pas revendre un rayon', () => {
  it('plafonne à deux modules par programme source dans un même axe', () => {
    const monoculture: LibraryModule[] = [
      ...Array.from({ length: 6 }, (_, i) =>
        mod(`vendeur-${i}`, `Signer en exclusivité — étape ${i}`, VENDEUR, {
          signals: ['Mandat — Trop de mandats simples, exclusivité difficile à obtenir'],
        }),
      ),
      mod('ailleurs', 'Vente de mandats exclusifs', BOOSTER),
    ];

    const out = recommendModules({
      chapterScores: [chapitre(5, 30)],
      alerts: [alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent'])],
      answers: REPONSES,
      library: monoculture,
    });

    const axe = out.recommendations.find((r) => r.need.code === 'mandat_exclusivite')!;
    const parRayon = new Map<string, number>();
    for (const c of axe.candidates) {
      parRayon.set(c.source.code, (parRayon.get(c.source.code) ?? 0) + 1);
    }
    expect(Math.max(...parRayon.values())).toBeLessThanOrEqual(2);
    // Et le rayon voisin obtient sa place, alors que six modules mieux notés
    // auraient rempli l'axe à eux seuls.
    expect(axe.candidates.some((c) => c.moduleId === 'ailleurs')).toBe(true);
  });
});

describe('recommendModules — D-19 bis : la version VENDUE fait foi', () => {
  /**
   * Le cas réel : le Drive porte « 055 Maîtrise des techniques de vente » et
   * QualiOF vend `PROD-055` sous le même nom. Le produit vendu ne bouge pas —
   * ni sa durée, ni sa page publique, qui EST l'information préalable remise
   * au client. C'est le rayon importé qui s'efface.
   */
  const RAYON_DOUBLON = rayon('BIB-D055', 'Maîtrise des techniques de vente immobilière', {
    supersededBy: 'PROD-055',
  });

  const args = {
    chapterScores: [chapitre(5, 30)],
    alerts: [alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent'])],
    answers: REPONSES,
  };

  it('ne propose jamais un module dont le rayon fait doublon avec un produit vendu', () => {
    const out = recommendModules({
      ...args,
      library: [
        ...BIBLIOTHEQUE,
        mod('m-doublon', 'Vente de mandats exclusifs', RAYON_DOUBLON, {
          signals: ['Mandat — Trop de mandats simples, exclusivité difficile à obtenir'],
        }),
      ],
    });

    const tous = out.recommendations.flatMap((r) => r.candidates.map((c) => c.moduleId));
    expect(tous).not.toContain('m-doublon');
    expect(out.notices.some((n) => n.includes('BIB-D055 → PROD-055'))).toBe(true);
  });

  it('n’écarte pas un rayon simplement inactif — doublon et inactif sont deux choses', () => {
    // La confusion serait fatale : TOUS les rayons sont inactifs (c'est la
    // norme depuis D-19), alors qu'un seul sur vingt fait doublon.
    expect(BIBLIOTHEQUE.every((m) => !m.source.isActive)).toBe(true);
    const out = recommendModules({ ...args, library: BIBLIOTHEQUE });
    expect(out.libraryModuleCount).toBe(BIBLIOTHEQUE.length - 1); // -1 = la pige
  });

  it('compte le doublon à part de la pige', () => {
    const out = recommendModules({
      ...args,
      library: [...BIBLIOTHEQUE, mod('m-doublon', 'Signer en exclusivité', RAYON_DOUBLON)],
    });
    // La bibliothèque utilisable n'a pas grandi : le module en doublon en sort.
    expect(out.libraryModuleCount).toBe(BIBLIOTHEQUE.length - 1);
    expect(out.notices.filter((n) => n.includes('pige')).length).toBe(1);
    expect(out.notices.filter((n) => n.includes('fait foi')).length).toBe(1);
  });
});


describe('recommendModules — D-19 ter : un programme NON DIFFUSABLE ne sort jamais', () => {
  /**
   * Le cas réel, relevé le 11/09/2026 sur la liste de rattachement : « L'Agent
   * Incomparable » (PROD-0681) était proposé en TÊTE de deux douleurs — suivi
   * vendeur et sources de contacts. Son manifeste porte « v0.9, trous 🔴/🟠 non
   * levés, NE PAS DIFFUSER AUX APPRENANTS », et il a été importé inactif « et
   * il doit le rester ».
   *
   * Le filtre en place à ce moment-là écartait la pige et les rayons en
   * doublon, mais pas l'indiffusable : l'interdiction vivait dans un manifeste
   * et dans le `programMd`, nulle part dans la donnée. Elle y est désormais.
   */
  const PARCOURS_V09 = rayon('PROD-0681', "L'Agent Incomparable — parcours M0 → M6", {
    excludedFromClientOutputs: true,
  });

  const args = {
    chapterScores: [chapitre(5, 30)],
    alerts: [alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent'])],
    answers: REPONSES,
  };

  it('ne propose jamais un module venu d’un programme non diffusable, même le mieux placé', () => {
    const out = recommendModules({
      ...args,
      library: [
        ...BIBLIOTHEQUE,
        // Volontairement le meilleur candidat possible : porteur du signal
        // exact de la douleur, et module socle. S'il ressort, le filtre ne
        // tient pas.
        mod('m-v09', 'M2 — GAGNER LE MANDAT EN EXCLUSIVITÉ', PARCOURS_V09, {
          isFoundation: true,
          signals: ['Mandat — Trop de mandats simples, exclusivité difficile à obtenir'],
        }),
      ],
    });

    const tous = out.recommendations.flatMap((r) => r.candidates.map((c) => c.moduleId));
    expect(tous).not.toContain('m-v09');
    expect(out.notices.some((n) => n.includes('NON DIFFUSABLE') && n.includes('PROD-0681'))).toBe(
      true,
    );
  });

  it('n’écarte pas un rayon simplement inactif — non diffusable et inactif sont deux choses', () => {
    // La confusion viderait la bibliothèque : TOUS les rayons sont inactifs
    // (corollaire D-19), un seul programme est non diffusable.
    expect(BIBLIOTHEQUE.every((m) => !m.source.isActive)).toBe(true);
    expect(BIBLIOTHEQUE.every((m) => !m.source.excludedFromClientOutputs)).toBe(true);
    const out = recommendModules({ ...args, library: BIBLIOTHEQUE });
    expect(out.libraryModuleCount).toBe(BIBLIOTHEQUE.length - 1); // -1 = la pige
  });

  it('vaut pour TOUT ce que le programme contient, y compris un module ajouté demain', () => {
    const out = recommendModules({
      ...args,
      library: [
        ...BIBLIOTHEQUE,
        mod('m-v09-a', 'M1 — TROUVER VENDEURS', PARCOURS_V09),
        mod('m-v09-b', 'M4 — SUIVI VENDEUR', PARCOURS_V09),
        // Un module tout neuf, jamais marqué individuellement : l'interdiction
        // porte sur le conteneur, elle n'a pas à être recopiée sur chacun.
        mod('m-v09-neuf', 'M7 — SIGNER EN EXCLUSIVITÉ', PARCOURS_V09, {
          signals: ['Mandat — Trop de mandats simples, exclusivité difficile à obtenir'],
        }),
      ],
    });

    const tous = out.recommendations.flatMap((r) => r.candidates.map((c) => c.moduleId));
    expect(tous.filter((id) => id.startsWith('m-v09'))).toEqual([]);
    // La bibliothèque utilisable n'a pas grandi d'un module.
    expect(out.libraryModuleCount).toBe(BIBLIOTHEQUE.length - 1);
  });

  it('compte l’indiffusable à part de la pige et du doublon', () => {
    const out = recommendModules({
      ...args,
      library: [
        ...BIBLIOTHEQUE,
        mod('m-v09', 'M2 — GAGNER LE MANDAT', PARCOURS_V09),
        mod('m-doublon', 'Signer en exclusivité', rayon('BIB-D055', 'Maîtrise des techniques de vente immobilière', { supersededBy: 'PROD-055' })),
      ],
    });
    expect(out.notices.filter((n) => n.includes('pige')).length).toBe(1);
    expect(out.notices.filter((n) => n.includes('NON DIFFUSABLE')).length).toBe(1);
    expect(out.notices.filter((n) => n.includes('fait foi')).length).toBe(1);
  });
});


describe('recommendModules — règle 4 : une étiquette n’est pas un contenu', () => {
  /**
   * Le cas réel du 11/09/2026 : « Suivi » (PROD-0680), module du catalogue
   * diagnostic SANS déroulé, gagnait sa place sur « Piloter le stock et le
   * suivi vendeur » grâce à ses signaux — et produisait « déroulé à compléter »
   * sur le programme composé. Déplacer un signal ne suffisait pas : trois des
   * sept qui restaient contiennent « vendeurs » ou « Négociation », qui sont
   * aussi des mots-clés du besoin.
   *
   * L'arbitrage de Laurent ferme la question par le haut, sans chirurgie de
   * signaux : un module sans déroulé n'entre jamais, quel que soit son score.
   */
  const args = {
    chapterScores: [chapitre(5, 30)],
    alerts: [alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent'])],
    answers: REPONSES,
  };

  const SIGNAL = 'Mandat — Trop de mandats simples, exclusivité difficile à obtenir';

  it('n’entre jamais dans une recommandation, même porteur du signal exact', () => {
    const out = recommendModules({
      ...args,
      library: [
        ...BIBLIOTHEQUE,
        mod('m-vide', 'Suivi', VENDEUR, { signals: [SIGNAL], isFoundation: true, contentMd: null }),
      ],
    });
    const tous = out.recommendations.flatMap((r) => r.candidates.map((c) => c.moduleId));
    expect(tous).not.toContain('m-vide');
    expect(out.notices.some((n) => n.includes('aucun déroulé pédagogique'))).toBe(true);
  });

  it('écarte aussi le module dont le « contenu » n’est que les questions du besoin', () => {
    // Le piège du catalogue diagnostic : l'import du lot A y avait rangé
    // `needIdentification` faute de contenu. Ce n'est pas un déroulé, c'est la
    // trame d'un rendez-vous commercial.
    const questions = 'À quelle fréquence suivez-vous vos vendeurs ?';
    const out = recommendModules({
      ...args,
      library: [
        ...BIBLIOTHEQUE,
        mod('m-questions', 'Suivi vendeur', VENDEUR, {
          signals: [SIGNAL],
          contentMd: questions,
          needIdentification: questions,
        }),
      ],
    });
    const tous = out.recommendations.flatMap((r) => r.candidates.map((c) => c.moduleId));
    expect(tous).not.toContain('m-questions');
  });

  it('la douleur qui ne trouve plus rien le DIT, au lieu d’être servie par une étiquette', () => {
    // Une bibliothèque où le SEUL candidat du besoin est vide : le besoin doit
    // ressortir non comblé, pas rempli d'une coquille.
    const out = recommendModules({
      ...args,
      library: [mod('m-vide', 'Exclusivité', VENDEUR, { signals: [SIGNAL], contentMd: '' })],
    });
    expect(out.recommendations.every((r) => r.candidates.length === 0)).toBe(true);
    expect(out.recommendations.some((r) => r.unmet)).toBe(true);
    expect(out.notices.some((n) => n.includes('aucun déroulé pédagogique'))).toBe(true);
  });

  it('ne touche pas aux modules qui ont un vrai déroulé', () => {
    const avant = recommendModules({ ...args, library: BIBLIOTHEQUE });
    expect(avant.libraryModuleCount).toBe(BIBLIOTHEQUE.length - 1); // -1 = la pige
    expect(avant.recommendations.some((r) => r.candidates.length > 0)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Départage d'une égalité de score (arbitrage du 11/09/2026)
// ─────────────────────────────────────────────────────────────────────────────
//
// Le lot 1 a fait apparaître le défaut sur un dossier réel : la demi-journée 5
// de DIAG-0001 s'est jouée sur l'ORDRE ALPHABÉTIQUE des titres, entre deux
// modules à 10 points chacun. « Une égalité de score ne doit pas se trancher
// alphabétiquement » — et le correctif porte sur la RÈGLE, pas sur un module.
//
// Les bibliothèques de ces tests sont volontairement PETITES (< 30 modules,
// `MIN_LIBRARY_FOR_WEIGHTING`) : `discriminationWeights` rend alors une map vide
// et tous les poids valent 1. Les scores sont donc exactement prévisibles —
// `score = 5 × (mots-clés touchant un signal) + 2 × (mots-clés dans le titre)
// + (isFoundation ? 1 : 0)` — et chaque test ASSERTE l'égalité au lieu de la
// supposer. Un test de départage bâti sur une égalité non prouvée ne prouve rien.
//
// Le besoin servi est `mandat_exclusivite` :
//   label    « Rentrer des mandats en exclusivité, au bon prix »
//   keywords ['mandat', 'exclusivite', 'vente', 'negociation', 'booster']
// Son label contient donc `mandat` et `exclusivite`, mais NI `vente`, NI
// `negociation`, NI `booster` : c'est ce qui rend la 4ᵉ clé observable.

const ARGS_MANDAT = {
  chapterScores: [chapitre(5, 30)],
  alerts: [alerte('exclusivity_below_benchmark', 5, ['mandates-exclusivity-percent'])],
  answers: REPONSES,
};

/** Le signal réel de BIB-D017#3 — il parle du MANDAT, mot du label du besoin. */
const SIGNAL_MANDAT = 'Mandat — le prix de rentrée se lâche pour ne pas perdre l’affaire';
/** Le signal réel de BIB-D034#3 — il parle de la TRANSFORMATION, pas du mandat. */
const SIGNAL_TRANSFORMATION =
  'Transformation — trop d’offres ne deviennent pas des compromis, la négociation cale';

function axeMandat(library: LibraryModule[]) {
  const out = recommendModules({ ...ARGS_MANDAT, library });
  const axe = out.recommendations.find((r) => r.need.code === 'mandat_exclusivite');
  expect(axe, 'le besoin mandat_exclusivite doit être déclenché').toBeDefined();
  return axe!;
}

describe('recommendModules — départage d’une égalité de score (arbitrage du 11/09)', () => {
  it('le cas réel D017#3 / D034#3 : le candidat accroché par un mot du LABEL sort premier', () => {
    const axe = axeMandat([
      mod('m-d017', 'Convaincre le vendeur avec des arguments solides', VENDEUR, {
        signals: [SIGNAL_MANDAT],
      }),
      mod('m-d034', 'Gérer les objections et trouver des solutions de compromis', VENDEUR, {
        signals: [SIGNAL_TRANSFORMATION],
      }),
    ]);

    // L'égalité est PROUVÉE : un signal touché de chaque côté, aucun mot-clé dans
    // les titres, aucun module socle ⇒ 5 contre 5.
    expect(axe.candidates.map((c) => c.score)).toEqual([5, 5]);
    expect(axe.candidates.map((c) => c.matchSource)).toEqual(['signaux', 'signaux']);
    expect(axe.candidates.map((c) => c.confidence)).toEqual(['forte', 'forte']);
    expect(axe.candidates.find((c) => c.moduleId === 'm-d017')!.matchedTerms).toEqual(['mandat']);
    expect(axe.candidates.find((c) => c.moduleId === 'm-d034')!.matchedTerms).toEqual([
      'negociation',
    ]);

    expect(axe.candidates[0]!.moduleId).toBe('m-d017');
  });

  it('et c’est bien le vocabulaire du besoin qui tranche, PAS l’alphabet — titres échangés', () => {
    // LA variante discriminante. Sans elle, le test précédent ne prouverait rien :
    // l'alphabet met déjà « Convaincre… » avant « Gérer… ». Ici le module accroché
    // par `mandat` porte le titre alphabétiquement DERNIER.
    expect('Analyser les objections'.localeCompare('Zoom sur le prix de rentrée', 'fr')).toBeLessThan(
      0,
    );

    const axe = axeMandat([
      mod('m-mandat-dernier', 'Zoom sur le prix de rentrée', VENDEUR, {
        signals: [SIGNAL_MANDAT],
      }),
      mod('m-negociation-premier', 'Analyser les objections', VENDEUR, {
        signals: [SIGNAL_TRANSFORMATION],
      }),
    ]);

    expect(axe.candidates.map((c) => c.score)).toEqual([5, 5]);
    expect(axe.candidates[0]!.moduleId).toBe('m-mandat-dernier');
  });

  it('une PREUVE passe devant une PISTE : `signaux` avant `lexique`, même à score égal', () => {
    // Le module « piste » est en plus un module SOCLE et porte le titre
    // alphabétiquement premier : l'ancien comparateur le mettait donc devant par
    // deux fois. La source du rapprochement passe maintenant avant les deux.
    const axe = axeMandat([
      mod('m-preuve', 'Convaincre le vendeur', VENDEUR, { signals: [SIGNAL_MANDAT] }),
      mod('m-piste', 'Booster la vente en réunion', VENDEUR, { isFoundation: true }),
    ]);

    // 5 = 1 signal × 5  contre  5 = (« booster » + « vente » dans le titre) × 2 + 1 socle
    expect(axe.candidates.map((c) => c.score)).toEqual([5, 5]);
    const preuve = axe.candidates.find((c) => c.moduleId === 'm-preuve')!;
    const piste = axe.candidates.find((c) => c.moduleId === 'm-piste')!;
    expect(preuve.matchSource).toBe('signaux');
    expect(piste.matchSource).toBe('lexique');
    expect('Booster la vente en réunion'.localeCompare('Convaincre le vendeur', 'fr')).toBeLessThan(
      0,
    );
    expect(piste.isFoundation).toBe(true);

    expect(axe.candidates[0]!.moduleId).toBe('m-preuve');
  });

  it('une confiance FORTE passe devant une FAIBLE, à score et source égaux', () => {
    // Ce cas demande des poids < 1, donc une bibliothèque d'au moins 30 modules
    // (`MIN_LIBRARY_FOR_WEIGHTING`) : en dessous, `confidence` ne peut pas être
    // « faible » sur un candidat venu des signaux. On fabrique donc 40 modules où
    //   • « mandat » touche 2 haystacks sur 40 (= 0,05) ⇒ poids 1 ;
    //   • « vente » en touche 4 sur 40 (= 0,10)          ⇒ poids 0,6.
    const REMPLISSEUR = rayon('DRV-999', 'Rayon de remplissage');
    const library: LibraryModule[] = [
      mod('m-forte', 'Zoom sur le prix de rentrée', VENDEUR, { signals: [SIGNAL_MANDAT] }),
      mod('m-faible', 'Atelier mandat : cas pratiques', VENDEUR, {
        signals: ['Transformation — la vente se conclut mal'],
      }),
      ...Array.from({ length: 3 }, (_, i) =>
        mod(`m-vente-${i}`, `Conclure une vente ${i}`, REMPLISSEUR),
      ),
      ...Array.from({ length: 35 }, (_, i) =>
        mod(`m-neutre-${i}`, `Module de remplissage ${i}`, REMPLISSEUR),
      ),
    ];
    expect(library).toHaveLength(40);

    const axe = axeMandat(library);
    const forte = axe.candidates.find((c) => c.moduleId === 'm-forte')!;
    const faible = axe.candidates.find((c) => c.moduleId === 'm-faible')!;

    // 5 = 1 signal × poids 1 × 5   contre   5 = 0,6 × 5 + « mandat » dans le titre × 2
    expect(forte.score).toBe(5);
    expect(faible.score).toBe(5);
    expect(forte.matchSource).toBe('signaux');
    expect(faible.matchSource).toBe('signaux');
    expect(forte.confidence).toBe('forte');
    expect(faible.confidence).toBe('faible');
    // L'alphabet dirait le contraire.
    expect('Atelier mandat : cas pratiques'.localeCompare('Zoom sur le prix de rentrée', 'fr')).toBeLessThan(0);

    expect(axe.candidates[0]!.moduleId).toBe('m-forte');
  });

  it('l’alphabet tranche encore — mais en DERNIER recours seulement', () => {
    // Les deux candidats sont identiques sur les quatre premières clés : même
    // score, même source, même confiance, tous deux accrochés par « mandat », et
    // aucun des deux n'est socle. C'est le test qui interdit de supprimer le repli.
    const axe = axeMandat([
      mod('m-alpha-z', 'Travailler sa posture en rendez-vous', VENDEUR, {
        signals: [SIGNAL_MANDAT],
      }),
      mod('m-alpha-a', 'Améliorer sa posture en rendez-vous', VENDEUR, {
        signals: [SIGNAL_MANDAT],
      }),
    ]);

    expect(axe.candidates.map((c) => c.score)).toEqual([5, 5]);
    expect(axe.candidates.map((c) => c.matchedTerms)).toEqual([['mandat'], ['mandat']]);
    expect(axe.candidates.map((c) => c.moduleId)).toEqual(['m-alpha-a', 'm-alpha-z']);
  });
});
