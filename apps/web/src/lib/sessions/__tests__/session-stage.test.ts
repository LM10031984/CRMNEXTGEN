/**
 * Tests sessionStage() — source UNIQUE de vérité étape courante.
 *
 * Garde-fou Laurent 2026-06-05 : "ajoute un 6e cas de test blocked. Ton type
 * StageStatus inclut 'blocked', mais tes 5 cas ne l'exercent jamais. Un
 * contrat non testé finit par pourrir."
 *
 * 7 scénarios couvrent l'arbre de décision complet :
 *   1. BLOCKED — aucun apprenant inscrit
 *   2. BLOCKED — formateur principal manquant (inscrits OK)
 *   3. BLOCKED — programme IA non validé (inscrits + formateur OK)
 *   4. ACTIVE — DRAFT prêt à lancer la préparation (rien généré)
 *   5. ACTIVE — DRAFT prép partielle (manque convention/convocation)
 *   6. TODO   — PLANNED prép complète, en attente démarrage
 *   7. ACTIVE — IN_PROGRESS formation en cours
 *   8. ACTIVE — COMPLETED pack incomplet → générer pack fin
 *   9. ACTIVE — COMPLETED pack complet → facturation
 */

import { describe, expect, it } from 'vitest';
import { sessionStage, type SessionStageInput } from '../session-stage';
import type { SessionPreparationStatus } from '@/server/actions/prepare-training';
import type { SessionClosureStatus } from '@/server/actions/closure-status';

function emptyPrep(participantsCount: number): SessionPreparationStatus {
  return {
    ok: true,
    programme: false,
    deroule: false,
    checklist: false,
    conventionsCount: 0,
    convocationsCount: 0,
    analyseBesoinDone: 0,
    analyseBesoinInProgress: 0,
    analyseBesoinPending: 0,
    // Cas dominant du CRM : auto-payeurs → une analyse attendue par stagiaire.
    analyseBesoinAttendue: participantsCount,
    analyseBesoinEntrepriseAttendue: 0,
    analyseBesoinEntreprisePresente: 0,
    ageficeCount: 0,
    ageficeEligibleCount: 0,
    participantsCount,
  };
}

function completePrep(participantsCount: number): SessionPreparationStatus {
  return {
    ok: true,
    programme: true,
    deroule: true,
    checklist: true,
    conventionsCount: participantsCount,
    convocationsCount: participantsCount,
    analyseBesoinDone: participantsCount,
    analyseBesoinInProgress: 0,
    analyseBesoinPending: 0,
    analyseBesoinAttendue: participantsCount,
    analyseBesoinEntrepriseAttendue: 0,
    analyseBesoinEntreprisePresente: 0,
    ageficeCount: 0,
    ageficeEligibleCount: 0,
    participantsCount,
  };
}

function emptyClosure(participantsCount: number): SessionClosureStatus {
  return {
    ok: true,
    participantsCount,
    grilleObsSession: false,
    bilanSatisfaction: false,
    emargements: 0,
    assiduites: 0,
    ageficeEligibleCount: 0,
    attestations: 0,
    certificats: 0,
    qcm: 0,
    positionnements: 0,
    satisfactionChaud: 0,
    satisfactionFroid: 0,
  };
}

function completeClosure(participantsCount: number): SessionClosureStatus {
  return {
    ok: true,
    participantsCount,
    grilleObsSession: true,
    bilanSatisfaction: true,
    emargements: participantsCount,
    assiduites: 0,
    ageficeEligibleCount: 0,
    attestations: participantsCount,
    certificats: participantsCount,
    qcm: participantsCount,
    positionnements: participantsCount,
    satisfactionChaud: participantsCount,
    satisfactionFroid: participantsCount,
  };
}

function baseInput(overrides: Partial<SessionStageInput> = {}): SessionStageInput {
  return {
    status: 'DRAFT',
    startDate: new Date('2026-07-15T09:00:00Z'),
    endDate: new Date('2026-07-15T18:00:00Z'),
    participantsCount: 1,
    primaryTrainerName: 'Jean Dupont',
    productAiDraftPending: false,
    prep: emptyPrep(1),
    closure: emptyClosure(1),
    // `now` figé en pré-session par défaut → isAfterEnd reste faux pour
    // tous les tests existants même si on les lance après 2026-07-15.
    // Les nouveaux tests "session passée" overrident avec un now postérieur.
    now: new Date('2026-07-14T08:00:00Z'),
    ...overrides,
  };
}

describe('sessionStage — arbre de décision étape courante', () => {
  /* ── Catégorie 1 : BLOCKED (3 scénarios) ──────────────────────────── */

  it('1. BLOCKED — aucun apprenant inscrit → étape 1', () => {
    const result = sessionStage(
      baseInput({ participantsCount: 0, prep: emptyPrep(0), closure: emptyClosure(0) }),
    );
    expect(result.status).toBe('blocked');
    expect(result.current).toBe(1);
    expect(result.blocker).toBe('Aucun apprenant inscrit');
    expect(result.cta).toBeDefined();
    expect(result.cta!.primary).toBe(true);
    expect(result.cta!.href).toBe('#section-participants');
    expect(result.stagesState).toEqual({ 1: 'active', 2: 'todo', 3: 'todo', 4: 'todo', 5: 'todo' });
  });

  it('2. BLOCKED — formateur principal manquant → étape 1', () => {
    const result = sessionStage(baseInput({ primaryTrainerName: null }));
    expect(result.status).toBe('blocked');
    expect(result.current).toBe(1);
    expect(result.blocker).toBe('Formateur principal manquant');
    expect(result.cta!.href).toBe('#section-formateurs');
  });

  it('3. BLOCKED — programme IA non validé → CTA vers la fiche produit', () => {
    // Volet 3 (12/08) : la validation vit sur la fiche PRODUIT — le CTA doit
    // y mener directement (l'ancien « Valider en 1 clic » → #step-1 scrollait
    // vers une étape repliée sans action).
    const result = sessionStage(
      baseInput({ productAiDraftPending: true, productId: 'prod-123' }),
    );
    expect(result.status).toBe('blocked');
    expect(result.current).toBe(1);
    expect(result.blocker).toBe('Programme IA non validé');
    expect(result.cta!.label).toBe('Valider le programme (fiche produit)');
    expect(result.cta!.href).toBe('/app/produits/prod-123?tab=programme');
  });

  it('3bis. BLOCKED — programme IA non validé SANS productId → fallback ancre honnête', () => {
    const result = sessionStage(baseInput({ productAiDraftPending: true }));
    expect(result.status).toBe('blocked');
    expect(result.cta!.label).toBe("Voir l'étape 1 ↓");
    expect(result.cta!.href).toBe('#step-1');
  });

  /* ── Catégorie 2 : ACTIVE — préparation à lancer/compléter ────────── */

  it('4. ACTIVE — DRAFT prêt à lancer la préparation → étape 2', () => {
    const result = sessionStage(baseInput()); // prep vide
    expect(result.status).toBe('active');
    expect(result.current).toBe(2);
    expect(result.cta!.label).toBe('Lancer la préparation');
    expect(result.stagesState[1]).toBe('done');
    expect(result.stagesState[2]).toBe('active');
  });

  it('5. ACTIVE — préparation partielle (programme OK, convention manquante) → étape 2', () => {
    const partialPrep = emptyPrep(1);
    partialPrep.programme = true;
    partialPrep.deroule = true;
    partialPrep.checklist = true;
    // convention/convocation/analyse manquent
    const result = sessionStage(baseInput({ prep: partialPrep }));
    expect(result.status).toBe('active');
    expect(result.current).toBe(2);
    expect(result.cta!.label).toBe('Compléter');
    expect(result.reason).toMatch(/document\(s\) restant/i);
  });

  /* ── Catégorie 3 : TODO — wait / progression naturelle ────────────── */

  it('6. TODO — PLANNED prép complète, en attente du démarrage → étape 3', () => {
    const result = sessionStage(
      baseInput({ status: 'PLANNED', prep: completePrep(1) }),
    );
    expect(result.status).toBe('todo');
    expect(result.current).toBe(3);
    expect(result.cta).toBeUndefined(); // pas de CTA en wait
    expect(result.stagesState[1]).toBe('done');
    expect(result.stagesState[2]).toBe('done');
    expect(result.stagesState[3]).toBe('active');
  });

  it('7. ACTIVE — IN_PROGRESS formation en cours → étape 3', () => {
    const result = sessionStage(
      baseInput({ status: 'IN_PROGRESS', prep: completePrep(1) }),
    );
    expect(result.status).toBe('active');
    expect(result.current).toBe(3);
    expect(result.reason).toMatch(/cours/i);
  });

  /* ── Catégorie 4 : ACTIVE — pack fin + facturation ───────────────── */

  it('8. ACTIVE — COMPLETED pack incomplet → étape 4 + cta.kind=generate_pack', () => {
    const result = sessionStage(
      baseInput({
        status: 'COMPLETED',
        prep: completePrep(1),
        closure: emptyClosure(1),
      }),
    );
    expect(result.status).toBe('active');
    expect(result.current).toBe(4);
    expect(result.cta!.label).toBe('Générer le pack fin');
    expect(result.cta!.kind).toBe('generate_pack');
    expect(result.stagesState[4]).toBe('active');
  });

  it('9. ACTIVE — COMPLETED pack complet → étape 5 facturation + cta.kind=anchor', () => {
    const result = sessionStage(
      baseInput({
        status: 'COMPLETED',
        prep: completePrep(2),
        closure: completeClosure(2),
        participantsCount: 2,
      }),
    );
    expect(result.status).toBe('active');
    expect(result.current).toBe(5);
    expect(result.cta!.label).toBe('Voir les factures');
    expect(result.cta!.primary).toBe(false);
    // Garde-fou Laurent 2026-06-05 : COMPLETED + pack complet ne doit PAS
    // continuer à proposer "Générer le pack" — sessionStage doit basculer
    // sur "Émettre la facture" (kind=anchor, pas generate_pack).
    expect(result.cta!.kind).toBe('anchor');
    expect(result.stagesState[1]).toBe('done');
    expect(result.stagesState[4]).toBe('done');
    expect(result.stagesState[5]).toBe('active');
  });

  /* ── Garde-fou : priorité des blockers ───────────────────────────── */

  it('priorité — un blocker (formateur) gagne sur préparation déjà complète', () => {
    const result = sessionStage(
      baseInput({
        primaryTrainerName: null, // bloqueur
        prep: completePrep(1),    // pourtant tout est prêt côté docs
      }),
    );
    expect(result.status).toBe('blocked');
    expect(result.current).toBe(1);
    expect(result.blocker).toBe('Formateur principal manquant');
  });

  /* ── Cohérence stagesState : 1 seule étape 'active' à la fois ─────── */

  it('stagesState — exactement 1 seule étape "active" sauf si done complet', () => {
    const scenarios = [
      baseInput({ participantsCount: 0, prep: emptyPrep(0), closure: emptyClosure(0) }),
      baseInput({ primaryTrainerName: null }),
      baseInput(),
      baseInput({ status: 'PLANNED', prep: completePrep(1) }),
      baseInput({ status: 'IN_PROGRESS', prep: completePrep(1) }),
      baseInput({ status: 'COMPLETED', prep: completePrep(1), closure: emptyClosure(1) }),
    ];
    for (const s of scenarios) {
      const result = sessionStage(s);
      const activeCount = Object.values(result.stagesState).filter((v) => v === 'active').length;
      expect(activeCount).toBe(1);
    }
  });

  /* ── Catégorie 5 : SESSION PASSÉE (date dépassée, status pré-COMPLETED) ───
     Bug Laurent test visuel ui-e3 2026-06-08 : NextActionHero affichait
     « ÉTAPE 3 · EN ATTENTE — à J0 » à J+7 alors que la session est terminée
     côté agenda. sessionStage doit signaler le décalage entre la date et
     le status BDD plutôt que de mentir. ─────────────────────────────── */

  it("10. SESSION PASSÉE — PLANNED + endDate < now → étape 3 active + CTA 'Marquer'", () => {
    const result = sessionStage(
      baseInput({
        status: 'PLANNED',
        prep: completePrep(1),
        now: new Date('2026-07-22T08:00:00Z'), // J+7
      }),
    );
    expect(result.current).toBe(3);
    expect(result.status).toBe('active');
    expect(result.reason).toMatch(/passée/i);
    expect(result.cta).toBeDefined();
    expect(result.cta!.label).toBe('Marquer comme terminée');
    expect(result.cta!.href).toBe('#section-status');
    expect(result.cta!.kind).toBe('anchor');
    expect(result.cta!.primary).toBe(true);
  });

  it('11. SESSION PASSÉE — IN_PROGRESS + endDate < now → idem (override le branch IN_PROGRESS)', () => {
    const result = sessionStage(
      baseInput({
        status: 'IN_PROGRESS',
        prep: completePrep(1),
        now: new Date('2026-07-22T08:00:00Z'),
      }),
    );
    expect(result.current).toBe(3);
    expect(result.status).toBe('active');
    expect(result.reason).toMatch(/passée/i);
    // Cas typique du bug Laurent : IN_PROGRESS + date dépassée doit
    // afficher "Formation passée", PAS "Formation en cours".
    expect(result.reason).not.toMatch(/Formation en cours/);
  });

  it('12. SESSION PASSÉE — DRAFT + endDate < now → idem (DRAFT non bloqué)', () => {
    const result = sessionStage(
      baseInput({
        status: 'DRAFT',
        prep: completePrep(1),
        now: new Date('2026-07-22T08:00:00Z'),
      }),
    );
    expect(result.current).toBe(3);
    expect(result.status).toBe('active');
    expect(result.reason).toMatch(/passée/i);
  });

  it('13. SESSION PASSÉE n\'override PAS COMPLETED → continue vers étape 4', () => {
    // Garde-fou : un status COMPLETED reste prioritaire — on ne veut
    // pas régresser vers "Marquer comme terminée" après que l'utilisateur
    // l'a déjà fait.
    const result = sessionStage(
      baseInput({
        status: 'COMPLETED',
        prep: completePrep(1),
        closure: emptyClosure(1),
        now: new Date('2026-07-22T08:00:00Z'),
      }),
    );
    expect(result.current).toBe(4);
    expect(result.cta!.label).toBe('Générer le pack fin');
  });

  it('14. SESSION PASSÉE n\'override PAS CANCELLED → fallback', () => {
    // Une session annulée doit rester annulée même si la date est passée.
    // Pour CANCELLED, sessionStage tombe en fallback (étape 4 Compléter
    // le pack) — pas idéal mais inchangé par ce fix.
    const result = sessionStage(
      baseInput({
        status: 'CANCELLED',
        prep: completePrep(1),
        closure: emptyClosure(1),
        now: new Date('2026-07-22T08:00:00Z'),
      }),
    );
    expect(result.reason).not.toMatch(/passée/i);
  });

  it("15. SESSION FUTURE — PLANNED + endDate > now → branche 'À J0' préservée", () => {
    // Anti-régression : ne casse pas le cas heureux (la session n'a pas
    // encore commencé).
    const result = sessionStage(
      baseInput({
        status: 'PLANNED',
        prep: completePrep(1),
        now: new Date('2026-07-10T08:00:00Z'), // avant startDate
      }),
    );
    expect(result.current).toBe(3);
    expect(result.status).toBe('todo');
    expect(result.reason).toMatch(/À J0/);
  });

  /* ── Catégorie 6 : SESSION IN-WINDOW (dates en cours, status pré-IN_PROGRESS) ───
     Bug Laurent A2 2026-06-08 : session VALIDATED, dates 01→11 juin, on
     est le 8 → la branche isBeforeStart s'allumait à tort et le hero
     affichait « ÉTAPE 3 · EN ATTENTE — à J0 » alors qu'on est à J+7 dans
     la fenêtre. sessionStage doit dériver « en cours » sur les dates,
     pas le seul status. ───────────────────────────────────────────── */

  it('16. IN-WINDOW — VALIDATED + dates en cours → étape 3 active + "en cours"', () => {
    // baseInput a startDate=15/07 09:00, endDate=15/07 18:00.
    // On positionne now au milieu de la fenêtre.
    const result = sessionStage(
      baseInput({
        status: 'VALIDATED',
        prep: completePrep(1),
        now: new Date('2026-07-15T13:00:00Z'), // mid-window
      }),
    );
    expect(result.current).toBe(3);
    expect(result.status).toBe('active');
    expect(result.reason).toMatch(/cours/i);
    expect(result.reason).not.toMatch(/À J0/);
    expect(result.reason).not.toMatch(/passée/i);
    expect(result.stagesState[1]).toBe('done');
    expect(result.stagesState[2]).toBe('done');
    expect(result.stagesState[3]).toBe('active');
  });

  it('17. IN-WINDOW — OPEN/PLANNED/DRAFT + dates en cours → même branche "en cours"', () => {
    // Couvre tout le set isBeforeStart : aucun pré-status ne doit
    // retomber sur "À J0" quand on est physiquement dans la fenêtre.
    for (const status of ['DRAFT', 'PLANNED', 'OPEN', 'VALIDATED'] as const) {
      const result = sessionStage(
        baseInput({
          status,
          prep: completePrep(1),
          now: new Date('2026-07-15T13:00:00Z'),
        }),
      );
      expect(result.current).toBe(3);
      expect(result.status).toBe('active');
      expect(result.reason).toMatch(/cours/i);
    }
  });

  it('18. FRONTIÈRE — VALIDATED + now === endDate → encore in-window (pas de double-CTA)', () => {
    // À l'instant exact endDate : isAfterEnd=false (strict <), isInWindow=true.
    // Doit rester "en cours", PAS "Marquer comme terminée".
    const result = sessionStage(
      baseInput({
        status: 'VALIDATED',
        prep: completePrep(1),
        now: new Date('2026-07-15T18:00:00Z'), // === endDate
      }),
    );
    expect(result.current).toBe(3);
    expect(result.status).toBe('active');
    expect(result.reason).toMatch(/cours/i);
    // Garde-fou : pas de CTA "Marquer" à cette frontière (sinon double-CTA
    // avec le NextActionHero qui montre déjà "en cours").
    expect(result.cta).toBeUndefined();
  });

  it('19. FRONTIÈRE — VALIDATED + now > endDate → bascule sur "Marquer comme terminée"', () => {
    // 1 milliseconde après endDate : isAfterEnd=true → la branche ui-e3
    // prend la main. Compose proprement avec le in-window précédent.
    const result = sessionStage(
      baseInput({
        status: 'VALIDATED',
        prep: completePrep(1),
        now: new Date('2026-07-15T18:00:00.001Z'), // endDate + 1ms
      }),
    );
    expect(result.current).toBe(3);
    expect(result.status).toBe('active');
    expect(result.reason).toMatch(/passée/i);
    expect(result.cta!.label).toBe('Marquer comme terminée');
  });

  it('20. IN-WINDOW n\'override PAS COMPLETED / CANCELLED', () => {
    // Une session COMPLETED dans la fenêtre (utilisateur clic "terminé"
    // pendant le dernier jour) doit continuer vers étape 4. Une session
    // CANCELLED dans la fenêtre reste neutre (fallback).
    const completed = sessionStage(
      baseInput({
        status: 'COMPLETED',
        prep: completePrep(1),
        closure: emptyClosure(1),
        now: new Date('2026-07-15T13:00:00Z'),
      }),
    );
    expect(completed.current).toBe(4);
    expect(completed.cta!.label).toBe('Générer le pack fin');

    const cancelled = sessionStage(
      baseInput({
        status: 'CANCELLED',
        prep: completePrep(1),
        closure: emptyClosure(1),
        now: new Date('2026-07-15T13:00:00Z'),
      }),
    );
    expect(cancelled.reason).not.toMatch(/cours/i);
  });

  it("21. SESSION PASSÉE — VALIDATED + endDate < now → 'Marquer comme terminée' (raccord A2↔ui-e3)", () => {
    // Raccord explicite : les tests 10/11/12 couvrent PLANNED/IN_PROGRESS/
    // DRAFT post-endDate ; VALIDATED manquait à l'appel. Le statut
    // VALIDATED est précisément celui du bug Laurent A2 — il faut
    // verrouiller le passage de relais entre la branche in-window A2
    // (active tant que now ≤ endDate) et la branche post-endDate ui-e3
    // (active dès que now > endDate, indépendamment du statut BDD).
    const result = sessionStage(
      baseInput({
        status: 'VALIDATED',
        prep: completePrep(1),
        now: new Date('2026-07-22T08:00:00Z'), // J+7 — significantly past endDate
      }),
    );
    expect(result.current).toBe(3);
    expect(result.status).toBe('active');
    expect(result.reason).toMatch(/passée/i);
    expect(result.reason).not.toMatch(/cours/i);
    expect(result.cta!.label).toBe('Marquer comme terminée');
    expect(result.cta!.kind).toBe('anchor');
    expect(result.cta!.primary).toBe(true);
  });
});
