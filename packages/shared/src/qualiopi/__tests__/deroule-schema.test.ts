import { describe, it, expect } from 'vitest';
import { DerouleSchema } from '../deroule-schema';

/**
 * Tests comportementaux P0.2 — garde-fous Qualiopi sur le déroulé généré.
 *
 * Stratégie : on part d'un déroulé MINIMAL conforme (5 séquences, 1 jour,
 * objectifs Bloom OK, MES + grilles équilibrées) puis on mute UN champ
 * précis pour vérifier qu'il déclenche la bonne issue. Le test du chemin
 * heureux confirme que la baseline parse.
 */

function buildConformeDeroule() {
  return {
    jours: [
      {
        theme: 'Prospection téléphonique en immobilier',
        sequences: [
          {
            duree: '9h00 - 9h30 (30 min)',
            objectifs: '— Tour de table et présentation du formateur.',
            contenu: 'Accueil et présentation des objectifs.',
            outils: 'Paperboard.',
            exercice: 'Présentation croisée.',
            evaluation: '—',
          },
          {
            duree: '9h30 - 12h00 (2h30)',
            objectifs:
              '- Identifier les 4 phases d\'un appel sortant.\n- Analyser les objections fréquentes.',
            contenu: 'Théorie + démos.',
            outils: 'Diaporama, scripts.',
            exercice: 'Mise en situation : appel simulé client réticent.',
            evaluation:
              'Grille d\'observation à 6 critères (accroche, écoute, reformulation, traitement objection, closing, hygiène vocale).',
          },
          {
            duree: '12h00 - 13h30 (pause déjeuner)',
            objectifs: '—',
            contenu: 'Pause repas.',
            outils: '—',
            exercice: '—',
            evaluation: '—',
            isPause: true,
          },
          {
            duree: '13h30 - 15h00 (1h30)',
            objectifs:
              '- Rédiger un script personnalisé.\n- Appliquer les techniques apprises.',
            contenu: 'Rédaction guidée du script.',
            outils: 'Trame imprimée.',
            exercice: 'Atelier d\'application : rédaction de son propre script.',
            evaluation:
              'Grille d\'évaluation à 4 critères (clarté, structure, accroche, conformité).',
          },
          {
            duree: '15h00 - 17h00 (2h00)',
            objectifs: 'Bilan : restituer les acquis et identifier les axes de progrès.',
            contenu: 'Tour de table final.',
            outils: 'Paperboard.',
            exercice: 'Restitution.',
            evaluation: 'QCM 10 questions, score minimum requis 65%.',
          },
        ],
      },
    ],
  };
}

describe('DerouleSchema : chemin heureux', () => {
  it('Test 1 — un déroulé conforme passe la validation Zod', () => {
    const data = buildConformeDeroule();
    const r = DerouleSchema.safeParse(data);
    expect(r.success).toBe(true);
  });
});

describe('DerouleSchema : refine objectifs Bloom (indicateur 2)', () => {
  it('Test 2 — séquence d\'apprentissage avec objectif "Comprendre…" est rejetée avec verbe vague', () => {
    const data = buildConformeDeroule();
    data.jours[0]!.sequences[1]!.objectifs = 'Comprendre les techniques de prospection.';
    const r = DerouleSchema.safeParse(data);
    expect(r.success).toBe(false);
    if (!r.success) {
      const objectifsIssue = r.error.issues.find(
        (i) => i.path.includes('objectifs') && /verbe vague/i.test(i.message),
      );
      expect(objectifsIssue).toBeDefined();
      expect(objectifsIssue?.message).toContain('comprendre');
    }
  });

  it('Test 3 — séquence avec objectif sans verbe Bloom du tout est rejetée', () => {
    const data = buildConformeDeroule();
    data.jours[0]!.sequences[1]!.objectifs = 'Les fondamentaux de la prospection.';
    const r = DerouleSchema.safeParse(data);
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find(
        (i) => i.path.includes('objectifs') && /verbe Bloom/i.test(i.message),
      );
      expect(issue).toBeDefined();
    }
  });

  it('Test 4 — pause / accueil / bilan exempts du contrôle objectifs', () => {
    const data = buildConformeDeroule();
    // séquence 0 (accueil) a "Tour de table" comme objectif — pas Bloom mais OK
    // séquence 2 (pause) a "—" comme objectif — OK car isPause: true
    // baseline doit déjà passer (cf Test 1)
    expect(DerouleSchema.safeParse(data).success).toBe(true);
  });
});

describe('DerouleSchema : refine évaluation non vague (indicateur 11)', () => {
  it('Test 5 — évaluation "Feedback formateur" seule est rejetée', () => {
    const data = buildConformeDeroule();
    data.jours[0]!.sequences[1]!.evaluation = 'Feedback formateur.';
    const r = DerouleSchema.safeParse(data);
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find(
        (i) => i.path.includes('evaluation') && /vague|trop vague/i.test(i.message),
      );
      expect(issue).toBeDefined();
    }
  });

  it('Test 6 — évaluation "—" sur séquence d\'apprentissage rejetée', () => {
    const data = buildConformeDeroule();
    data.jours[0]!.sequences[1]!.evaluation = '—';
    const r = DerouleSchema.safeParse(data);
    expect(r.success).toBe(false);
  });

  it('Test 7 — évaluation "—" sur PAUSE acceptée (isPause exempte le refine)', () => {
    const data = buildConformeDeroule();
    // séquence 2 est déjà la pause avec evaluation="—", baseline conforme
    expect(DerouleSchema.safeParse(data).success).toBe(true);
  });
});

describe('DerouleSchema : refine mise en situation ↔ grille', () => {
  it('Test 8 — séquence "mise en situation" SANS grille dans évaluation est rejetée', () => {
    const data = buildConformeDeroule();
    // seq 1 a déjà une MES avec grille. On retire la grille mais on garde
    // une évaluation NON vague pour isoler ce refine (sinon le refine
    // "vague" se déclencherait aussi).
    data.jours[0]!.sequences[1]!.evaluation =
      'QCM 10 questions sur les techniques de prospection avec score minimum 65%.';
    const r = DerouleSchema.safeParse(data);
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) =>
        /grille\s+critéri|grille critériée/i.test(i.message),
      );
      expect(issue).toBeDefined();
    }
  });
});

describe('DerouleSchema : invariant nb mises en situation == nb grilles', () => {
  it('Test 9 — 2 mises en situation mais 1 seule grille → invariant rompu', () => {
    const data = buildConformeDeroule();
    // seq 1 et seq 3 sont déjà des MES avec grilles (baseline 2/2)
    // On transforme la grille de seq 3 en évaluation concrète sans grille
    // → ratio 2 MES / 1 grille
    data.jours[0]!.sequences[3]!.evaluation =
      'Auto-évaluation écrite : chaque participant note la clarté de son script sur 10.';
    const r = DerouleSchema.safeParse(data);
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => /Invariant Qualiopi/i.test(i.message));
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('2 mise');
      expect(issue?.message).toContain('1 grille');
    }
  });

  it('Test 10 — 0 MES et 1 grille orpheline → invariant rompu', () => {
    const data = buildConformeDeroule();
    // On vide les MES : seq 1 et seq 3 deviennent du cours magistral
    data.jours[0]!.sequences[1]!.exercice = 'Démonstration au tableau.';
    data.jours[0]!.sequences[1]!.contenu = 'Cours magistral sur les phases d\'appel.';
    data.jours[0]!.sequences[3]!.exercice = 'Démonstration de rédaction au tableau.';
    data.jours[0]!.sequences[3]!.contenu = 'Cours sur la structure d\'un script.';
    // seq 1 garde sa grille → 0 MES et 1 grille
    // seq 3 : on enlève la grille pour ne pas avoir 2 grilles orphelines
    data.jours[0]!.sequences[3]!.evaluation =
      'QCM rapide 5 questions sur la structure du script.';
    const r = DerouleSchema.safeParse(data);
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => /Invariant Qualiopi/i.test(i.message));
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('0 mise');
      expect(issue?.message).toContain('1 grille');
    }
  });
});
