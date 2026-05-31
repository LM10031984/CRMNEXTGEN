/**
 * Contenu stub pour les docs IA-assistés (QCM, GRILLE_OBS, ANALYSE_BESOIN, …).
 *
 * Permet de valider le rendu HTML+Gotenberg sans dépendance Mistral, et
 * sert de fallback si l'appel IA échoue (timeout, JSON invalide, quota).
 *
 * NB : les stubs sont volontairement génériques mais "lisibles" (pas de
 * Lorem Ipsum) pour repérer rapidement un problème de rendu en dev.
 */

import type { ClosureContext } from './shared-template';
import type { QcmContent } from './qcm-template';
import type { GrilleContent } from './grille-observation-template';
import type { AnalyseBesoinContent } from './analyse-besoin-template';
import type { PositionnementContent } from './positionnement-template';
import type { SatisfactionChaudContent } from './satisfaction-chaud-template';
import type { SatisfactionFroidContent } from './satisfaction-froid-template';
import type { DerouleContent } from './deroule-template';

export function stubQcmContent(_ctx: ClosureContext): QcmContent {
  // 11 questions génériques (>= 10 minimum Qualiopi). 9 bonnes / 11 = 82%
  // pour rester dans la fourchette cible 75-95% (>= 65% obligatoire).
  const rawQuestions = [
    { question: 'Quel est l\'objectif principal de cette formation ?', options: [{ letter: 'A', text: 'Vendre plus de produits' }, { letter: 'B', text: 'Acquérir des compétences professionnelles ciblées' }, { letter: 'C', text: 'Obtenir un diplôme' }, { letter: 'D', text: 'Faire du networking' }], correct_answer: 'B' },
    { question: 'Quelle est la première étape d\'une démarche professionnelle structurée ?', options: [{ letter: 'A', text: 'L\'analyse du besoin' }, { letter: 'B', text: 'La signature du contrat' }, { letter: 'C', text: 'L\'envoi de la facture' }, { letter: 'D', text: 'La communication sur les réseaux sociaux' }], correct_answer: 'A' },
    { question: 'Vrai ou faux : il est important d\'adapter son discours à son interlocuteur.', options: [{ letter: 'A', text: 'Vrai' }, { letter: 'B', text: 'Faux' }], correct_answer: 'A' },
    { question: 'Quel outil est le plus adapté pour assurer un suivi structuré de ses contacts ?', options: [{ letter: 'A', text: 'Un cahier papier' }, { letter: 'B', text: 'Un tableau Excel non partagé' }, { letter: 'C', text: 'Un CRM ou outil de gestion dédié' }, { letter: 'D', text: 'La mémoire' }], correct_answer: 'C' },
    { question: 'Vrai ou faux : la formation continue n\'est utile qu\'en début de carrière.', options: [{ letter: 'A', text: 'Vrai' }, { letter: 'B', text: 'Faux' }], correct_answer: 'B' },
    { question: 'Que faut-il faire après chaque échange professionnel important ?', options: [{ letter: 'A', text: 'Rien, passer au suivant' }, { letter: 'B', text: 'Noter les points clés et préparer la relance' }, { letter: 'C', text: 'Envoyer immédiatement un devis' }, { letter: 'D', text: 'Téléphoner pour conclure dans la journée' }], correct_answer: 'B' },
    { question: 'Quelle est la meilleure manière de gérer une objection client ?', options: [{ letter: 'A', text: 'L\'ignorer' }, { letter: 'B', text: 'Argumenter avec insistance' }, { letter: 'C', text: 'Écouter, reformuler et répondre avec des éléments factuels' }, { letter: 'D', text: 'Changer de sujet' }], correct_answer: 'C' },
    { question: 'Vrai ou faux : la prospection régulière augmente les chances de closing.', options: [{ letter: 'A', text: 'Vrai' }, { letter: 'B', text: 'Faux' }], correct_answer: 'A' },
    { question: 'Quel indicateur permet de mesurer la performance commerciale ?', options: [{ letter: 'A', text: 'Le taux de conversion' }, { letter: 'B', text: 'Le nombre de likes' }, { letter: 'C', text: 'La couleur du site' }, { letter: 'D', text: 'L\'âge de l\'entreprise' }], correct_answer: 'A' },
    { question: 'Comment renforcer la confiance d\'un nouveau client ?', options: [{ letter: 'A', text: 'En promettant l\'impossible' }, { letter: 'B', text: 'En tenant ses engagements et en communiquant régulièrement' }, { letter: 'C', text: 'En baissant systématiquement le prix' }, { letter: 'D', text: 'En limitant les échanges' }], correct_answer: 'B' },
    { question: 'Vrai ou faux : se former en continu permet d\'adapter sa pratique aux évolutions du marché.', options: [{ letter: 'A', text: 'Vrai' }, { letter: 'B', text: 'Faux' }], correct_answer: 'A' },
  ];

  // Stub déterministe : 9/11 = 82% (au-dessus du seuil 65%).
  // Marquer 2 questions comme incorrectes (q3 et q9 — choix arbitraire fixé pour reproductibilité).
  const wrongIndices = new Set([2, 8]);
  const questions = rawQuestions.map((q, idx) => {
    if (wrongIndices.has(idx)) {
      const wrong = q.options.find((o) => o.letter !== q.correct_answer);
      const picked = wrong ? wrong.letter : q.correct_answer;
      return { ...q, selected_answer: picked, is_correct: picked === q.correct_answer };
    }
    return { ...q, selected_answer: q.correct_answer, is_correct: true };
  });
  const correctCount = questions.filter((q) => q.is_correct).length;
  const score = Math.round((correctCount / questions.length) * 100);
  return { questions, score };
}

export function stubGrilleContent(ctx: ClosureContext): GrilleContent {
  // Grille pré-remplie de manière positive (majorité A et B). Le formateur
  // peut éditer si besoin avant remise au stagiaire / dépôt OPCO.
  const prenom = ctx.apprenantPrenom;
  return {
    competences: [
      { nom: 'Comprendre le contexte professionnel et son cadre réglementaire', niveau: 'A', observation: `${prenom} a démontré une bonne compréhension du cadre métier dès les premiers échanges.` },
      { nom: 'Appliquer les méthodes vues en formation à un cas concret', niveau: 'B', observation: 'Mise en application concrète sur des situations réelles, avec une approche méthodique.' },
      { nom: 'Identifier les outils adaptés aux situations rencontrées', niveau: 'A', observation: 'Très bonne capacité à choisir l\'outil pertinent selon le contexte.' },
      { nom: 'Adapter sa communication à différents profils d\'interlocuteurs', niveau: 'B', observation: 'Adaptation fluide du discours, écoute active et reformulation maîtrisées.' },
      { nom: 'Structurer une démarche de suivi et de relance', niveau: 'B', observation: 'Démarche organisée, suivi rigoureux des actions à mener post-formation.' },
      { nom: 'Évaluer les résultats obtenus et ajuster sa pratique', niveau: 'A', observation: 'Excellente prise de recul et identification des axes d\'amélioration immédiatement actionnables.' },
      { nom: 'Mettre en œuvre un plan d\'action post-formation', niveau: 'B', observation: 'Plan d\'action structuré et priorisé pour les semaines suivant la formation.' },
    ],
    observations_globales: {
      commentaire: `${prenom} s'est investi(e) tout au long de la formation avec sérieux et curiosité. La progression est tangible sur l'ensemble des compétences évaluées, et la posture professionnelle est en phase avec les attendus du métier.`,
      axe_amelioration: 'Continuer à mettre en pratique les méthodes acquises dans le quotidien professionnel et capitaliser sur les premiers résultats pour ancrer durablement les nouveaux réflexes.',
    },
  };
}

export function stubAnalyseBesoinContent(ctx: ClosureContext): AnalyseBesoinContent {
  return {
    contexte_professionnel:
      `${ctx.apprenantPrenom} ${ctx.apprenantNom} exerce une activité professionnelle pour laquelle la formation « ${ctx.sessionTitle} » apporte des compétences directement applicables. Le recueil des besoins permet d'adapter le programme aux enjeux rencontrés sur le terrain.`,
    objectifs_stagiaire: [
      'Acquérir une vision claire des bonnes pratiques du domaine',
      'Maîtriser les outils et méthodes présentés pendant la formation',
      'Identifier les axes d\'amélioration immédiatement applicables au quotidien',
    ],
    attentes: [
      'Repartir avec des outils opérationnels',
      'Bénéficier de retours d\'expérience concrets',
      'Échanger avec d\'autres professionnels du secteur',
    ],
    competences_visees: [
      'Mettre en œuvre la méthode présentée',
      'Identifier les leviers de performance dans son activité',
      'Adapter sa pratique professionnelle aux exigences actuelles',
    ],
    freins_identifies: [
      'Manque de temps pour mettre en pratique entre les sessions',
    ],
    motivation:
      'Le stagiaire souhaite renforcer ses compétences pour gagner en autonomie et en performance dans son activité professionnelle.',
  };
}

// ===========================================================================
// Stubs pour les 4 nouveaux docs Qualiopi (positionnement, satisfaction
// chaud/froid, déroulé). Émargement n'a pas de stub : il est purement
// structurel (signatures à compléter).
// ===========================================================================

export function stubPositionnementContent(_ctx: ClosureContext): PositionnementContent {
  return {
    objectifs_formation:
      "Acquérir des compétences directement applicables au quotidien professionnel et structurer mes pratiques.",
    demande_specifique:
      "J'aimerais des cas concrets et des outils opérationnels que je peux mettre en place dès la fin de la formation.",
    prerequis:
      "Connaissances générales du métier, expérience terrain, à l'aise avec les outils numériques de base.",
    competences: [
      { label: "Maîtriser les fondamentaux du domaine", avant: 2, apres: 4 },
      { label: "Identifier les bonnes pratiques applicables au quotidien", avant: 1, apres: 3 },
      { label: "Utiliser les outils présentés en formation", avant: 1, apres: 4 },
      { label: "Adapter sa pratique à des contextes variés", avant: 2, apres: 3 },
      { label: "Structurer une démarche professionnelle", avant: 2, apres: 4 },
      { label: "Évaluer ses résultats et progresser en continu", avant: 1, apres: 3 },
    ],
    commentaires:
      "Formation alignée avec mes attentes, je repars avec des outils concrets à mettre en place.",
  };
}

export function stubSatisfactionChaudContent(_ctx: ClosureContext): SatisfactionChaudContent {
  // Stub conforme à la règle métier : score ≥ 90% (majorité de "Très bien"/"Bien").
  return {
    organisation: {
      communication: 'Très bien',
      delai: 'Très bien',
      duree: 'Bien',
      engagements: 'Très bien',
      commentaire: "Bonne communication amont, formation bien préparée.",
    },
    moyens: {
      cadre: 'Très bien',
      locaux: 'Bien',
      supports: 'Très bien',
      materiel: 'Très bien',
      commentaire: "Supports clairs et bien structurés.",
    },
    pedagogie: {
      difficulte: 'Bien',
      articulation: 'Très bien',
      theorique: 'Très bien',
      pratique: 'Très bien',
      rythme: 'Bien',
      approche: 'Très bien',
      ecoute: 'Très bien',
      animation: 'Très bien',
      commentaire: "Formateur très pédagogue, équilibre théorie/pratique excellent.",
    },
    groupe: {
      ambiance: 'Très bien',
      nombre: 'Bien',
      heterogeneite: 'Bien',
      attention: 'Très bien',
      commentaire: "Très bonnes interactions au sein du groupe.",
    },
    benefice: {
      adequation: 'Très bien',
      utilite: 'Très utile',
      commentaire: "Je vais pouvoir appliquer dès demain ce qui a été vu.",
    },
    recommandation: 'Oui',
    remarques: "Formation à recommander, j'aimerais suivre d'autres modules complémentaires.",
  };
}

export function stubSatisfactionFroidContent(_ctx: ClosureContext): SatisfactionFroidContent {
  // Stub conforme à la règle métier : score ≥ 90%.
  return {
    mise_en_pratique: {
      applique: 'Très bien',
      frequence: 'Bien',
      resultats: 'Très bien',
      commentaire: "J'utilise les méthodes vues en formation au quotidien depuis 3 mois.",
    },
    impact: {
      performance: 'Très bien',
      autonomie: 'Très bien',
      confiance: 'Très bien',
      satisfaction_client: 'Bien',
      commentaire: "Mes résultats se sont nettement améliorés depuis la formation.",
    },
    bilan: {
      atteinte_objectifs: 'Très bien',
      recommandation: 'Oui',
      utilite_long_terme: 'Très bien',
    },
    remarques: "Je conseille vivement cette formation à mes collègues.",
  };
}

/**
 * Format minutes en label "8h30" / "12h00" / "13h45".
 */
function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h00` : `${h}h${String(m).padStart(2, '0')}`;
}

/**
 * Format durée "1h30" / "30 min" / "1h00".
 */
function fmtDur(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h00` : `${h}h${String(m).padStart(2, '0')}`;
}

export function stubDerouleContent(ctx: ClosureContext): DerouleContent {
  // Nombre de jours de formation : on prend la durée en jours calendaires
  // (sessionEndDate - sessionStartDate) si cohérent, sinon ceil(durationHours/7).
  const startDay = new Date(ctx.sessionStartDate.getFullYear(), ctx.sessionStartDate.getMonth(), ctx.sessionStartDate.getDate());
  const endDay = new Date(ctx.sessionEndDate.getFullYear(), ctx.sessionEndDate.getMonth(), ctx.sessionEndDate.getDate());
  const calDays = Math.max(1, Math.round((endDay.getTime() - startDay.getTime()) / 86400000) + 1);
  const nbJours = Math.max(1, Math.min(calDays, Math.ceil(ctx.durationHours / 4))); // borne large : 4h/jour min
  const minutesPerDay = Math.round((ctx.durationHours * 60) / nbJours);

  // Structure d'une journée : 30 min accueil + matin + déjeuner 60 min +
  // après-midi (séq1 + pause 10 min + séq2) + 30 min bilan.
  // Heures formation effectives (hors pauses) : matin + 2 séquences aprem = minutesPerDay - accueil - bilan
  // = minutesPerDay - 60 min. La pause déjeuner et la pause 10 min ne comptent pas dans les heures de formation.
  const accueilDur = 30;
  const bilanDur = 30;
  const lunchDur = 60;
  const pauseAmDur = 10;
  const formationMinHorsAccBilan = Math.max(60, minutesPerDay - accueilDur - bilanDur);
  const matinDur = Math.round(formationMinHorsAccBilan * 0.5);
  const aprem1Dur = Math.round(formationMinHorsAccBilan * 0.28);
  const aprem2Dur = formationMinHorsAccBilan - matinDur - aprem1Dur;

  // Heure de début standard : 8h30. On reconstruit les horaires en cumulant.
  const startMin = 8 * 60 + 30;

  const jours = Array.from({ length: nbJours }, (_, idx) => {
    const isLast = idx === nbJours - 1;
    let cur = startMin;
    const seqs = [];

    // Accueil
    seqs.push({
      duree: `${fmtTime(cur)} - ${fmtTime(cur + accueilDur)} (${fmtDur(accueilDur)})`,
      objectifs: "Accueil des stagiaires, présentation du programme du jour",
      contenu: "Tour de table, attentes, rappel du fil conducteur",
      outils: "Paperboard, support PDF",
      exercice: "—",
      evaluation: "—",
    });
    cur += accueilDur;

    // Séquence matin
    seqs.push({
      duree: `${fmtTime(cur)} - ${fmtTime(cur + matinDur)} (${fmtDur(matinDur)})`,
      objectifs: "Apport théorique sur le thème central du jour",
      contenu: "Concepts clés, méthodologie, illustrations",
      outils: "Slides, vidéos, fiches outils",
      exercice: "Étude de cas en sous-groupes",
      evaluation: "Restitution collective",
    });
    cur += matinDur;

    // Pause déjeuner
    seqs.push({
      duree: `${fmtTime(cur)} - ${fmtTime(cur + lunchDur)} (${fmtDur(lunchDur)})`,
      objectifs: "Pause déjeuner",
      contenu: '', outils: '', exercice: '', evaluation: '',
      isPause: true,
    });
    cur += lunchDur;

    // Séquence après-midi 1
    seqs.push({
      duree: `${fmtTime(cur)} - ${fmtTime(cur + aprem1Dur)} (${fmtDur(aprem1Dur)})`,
      objectifs: "Mise en application",
      contenu: "Exercice pratique appliqué au métier",
      outils: "Cas réels, fiches méthode",
      exercice: "Travaux individuels",
      evaluation: "Feedback formateur",
    });
    cur += aprem1Dur;

    // Pause courte
    seqs.push({
      duree: `${fmtTime(cur)} - ${fmtTime(cur + pauseAmDur)} (${fmtDur(pauseAmDur)})`,
      objectifs: "Pause",
      contenu: '', outils: '', exercice: '', evaluation: '',
      isPause: true,
    });
    cur += pauseAmDur;

    // Séquence après-midi 2
    seqs.push({
      duree: `${fmtTime(cur)} - ${fmtTime(cur + aprem2Dur)} (${fmtDur(aprem2Dur)})`,
      objectifs: "Approfondissement et cas concrets",
      contenu: "Mise en situation, analyse collective",
      outils: "Jeux de rôles, debriefing",
      exercice: "Simulations",
      evaluation: "Auto-évaluation",
    });
    cur += aprem2Dur;

    // Bilan / Clôture
    seqs.push({
      duree: `${fmtTime(cur)} - ${fmtTime(cur + bilanDur)} (${fmtDur(bilanDur)})`,
      objectifs: isLast ? "Évaluation des acquis et clôture" : "Bilan de la journée",
      contenu: isLast ? "QCM final, synthèse, remise des attestations" : "Synthèse des apports, plan d'action pour le lendemain",
      outils: "QCM, fiche bilan",
      exercice: "—",
      evaluation: isLast ? "QCM noté ≥ 70%" : "Auto-évaluation",
    });

    return {
      theme: `Jour ${idx + 1} — Module pédagogique`,
      sequences: seqs,
    };
  });

  return { jours };
}
