/**
 * Generators IA pour les 3 docs Qualiopi assistés (QCM, GRILLE_OBS, ANALYSE_BESOIN).
 *
 * Chaque generator :
 *   1. Construit un prompt user à partir du contexte (formation + stagiaire)
 *   2. Appelle Ollama via callOllama (format JSON)
 *   3. Valide la forme du JSON avec Zod (au cas où le modèle dérape)
 *   4. Si erreur ou JSON invalide → retourne null, l'appelant fallback sur le stub
 *
 * Logging : on persiste un AIGenerationJob (modèle, latence, status, erreur).
 */

import { z } from 'zod';
import { prisma } from '@qualiof/db';
import { callOllama } from '@/lib/ai-ollama';
import { callLlm, type LlmTier } from '@/lib/llm-client';
import { getDayStartEnd, PAUSE_DEJEUNER } from '@/lib/formation-horaires';
import {
  PROMPT_VERSION,
  SYSTEM_PROMPT_ANALYSE_BESOIN,
  SYSTEM_PROMPT_DEROULE,
  SYSTEM_PROMPT_GRILLE_OBSERVATION,
  SYSTEM_PROMPT_GRILLE_OBSERVATION_SESSION,
  SYSTEM_PROMPT_NORMALIZE_PROGRAMME,
  SYSTEM_PROMPT_POSITIONNEMENT,
  SYSTEM_PROMPT_QCM,
  SYSTEM_PROMPT_RAPPORT_FORMATEUR,
  SYSTEM_PROMPT_SATISFACTION_CHAUD,
  SYSTEM_PROMPT_SATISFACTION_FROID,
} from './qualiopi-prompts';
import {
  buildHoraireScaffold,
  renderHoraireScaffoldMd,
  enforceProgrammeFidelity,
} from '@/lib/programme-normalize';
import type { QcmContent } from './qcm-template';
import type { GrilleContent } from './grille-observation-template';
import type { AnalyseBesoinContent } from './analyse-besoin-template';
import type { PositionnementContent } from './positionnement-template';
import type { SatisfactionChaudContent } from './satisfaction-chaud-template';
import type { SatisfactionFroidContent } from './satisfaction-froid-template';
import type { DerouleContent } from './deroule-template';
import type { GrilleSessionContent } from './grille-obs-session-template';
import { normalizeGender } from './shared-template';

// mistral-small:24b est le meilleur compromis qualité/vitesse/JSON-compliance
// pour ces 3 docs. qwen3:30b-a3b a un comportement instable avec
// `format: json` (thinking caché → réponse vide) — éviter ici.
// Override possible via env CLOSURE_OLLAMA_MODEL.
const MODEL = process.env.CLOSURE_OLLAMA_MODEL ?? 'mistral-small:24b';
// Override de modèle par kind. Permet d'utiliser un modèle plus léger (gpt-oss:20b)
// pour les docs longs comme le déroulé pédagogique sans toucher au reste.
const MODEL_DEROULE = process.env.CLOSURE_OLLAMA_MODEL_DEROULE ?? MODEL;
const QCM_QUESTIONS_DEFAULT = Number(process.env.CLOSURE_QCM_QUESTIONS ?? 12);

export interface FormationCtx {
  titre: string;
  programmeMd: string;
  nombreHeures: number;
}

/**
 * Contexte de SESSION optionnel passé à `generateRapportFormateur` (quick
 * 260618-skk, CAUSE 2). Ancre les narratifs du rapport formateur sur des FAITS
 * concrets propres à la session (effectif, profils/enseignes, période, lieu,
 * résultats agrégés) pour qu'ils diffèrent d'une session à l'autre du MÊME
 * produit — sans jamais sortir du périmètre du programme (garde anti hors-sujet
 * conservée). Tous les champs résultats sont optionnels : le prompt les omet
 * proprement quand ils sont absents.
 */
export interface SessionRapportCtx {
  nbApprenants: number;
  /** brandName/legalName distincts des enseignes des apprenants (peut être vide). */
  enseignes: string[];
  dateDebut: Date | null;
  dateFin: Date | null;
  lieu: string | null;
  /** Score QCM moyen 0-100 (optionnel — agrégation lecture hors scope de ce quick). */
  qcmScoreMoyen?: number | null;
  /** Libellé satisfaction agrégé, ex. « Très bien » (optionnel). */
  satisfactionMoyenne?: string | null;
  /** Progression positionnement avant/après observée (optionnel). */
  positionnementProgressed?: boolean | null;
}

export interface StagiaireCtx {
  prenom: string;
  nom: string;
  entreprise: string | null;
  fonction: string | null;
  anciennete: string | null;
  diplomes: string | null;
  professionalStatus: string | null;
  civilite: string | null;
}

/**
 * Directive d'accord en genre injectée dans les prompts rédactionnels : sans
 * elle, le modèle défaute au masculin générique (« dirigeant », « ce
 * professionnel ») même pour une femme. Source de vérité = normalizeGender.
 */
function genderDirective(civilite: string | null): string {
  const g = normalizeGender(civilite);
  if (g === 'F')
    return `\n\nGENRE DU STAGIAIRE : FÉMININ. Accorde au FÉMININ tous les mots qui la désignent (ex : dirigeante, conseillère, indépendante, engagée, elle). N'emploie JAMAIS le masculin générique ni « ce professionnel » : écris « cette professionnelle » / « elle ».`;
  if (g === 'M')
    return `\n\nGENRE DU STAGIAIRE : MASCULIN. Accorde au masculin les mots qui le désignent (il, dirigeant, conseiller…).`;
  return '';
}

// =====================================================
// Schemas Zod (validation des outputs Ollama)
// =====================================================

// Output Ollama brut : questions + correct_answer.
// Le scoring (selected_answer, is_correct, score) est attribué en post-process
// par `attachQcmScoring` ci-dessous pour garantir un score >= 65%.
const QcmRawSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(5),
        options: z
          .array(
            z.object({
              letter: z.string().min(1).max(2),
              text: z.string().min(1),
            }),
          )
          .min(2)
          .max(4),
        correct_answer: z.string().min(1).max(2),
      }),
    )
    .min(10), // Qualiopi : volume suffisant pour un test représentatif
});

const AnalyseBesoinSchema = z.object({
  contexte_professionnel: z.string().min(10),
  objectifs_stagiaire: z.array(z.string()).min(2),
  attentes: z.array(z.string()).min(2),
  competences_visees: z.array(z.string()).min(2),
  freins_identifies: z.array(z.string()).optional().default([]),
  motivation: z.string().min(10),
});

// Grille remplie de manière positive : niveau A/B obligatoire (max 1-2 'C'
// tolérés, jamais 'D'), observation 1-2 phrases positives obligatoires.
const GrilleSchema = z.object({
  competences: z
    .array(
      z.object({
        nom: z.string().min(5),
        niveau: z.union([z.literal('A'), z.literal('B'), z.literal('C')]),
        observation: z.string().min(10),
      }),
    )
    .min(5),
  observations_globales: z.object({
    commentaire: z.string().min(10),
    axe_amelioration: z.string().min(10),
  }),
});

// Positionnement : 6-8 compétences avec niveaux avant/après (progression nette).
const NiveauPositionnement = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const PositionnementSchema = z.object({
  objectifs_formation: z.string().min(10),
  demande_specifique: z.string().nullable().optional(),
  prerequis: z.string().min(10),
  competences: z
    .array(
      z.object({
        label: z.string().min(5),
        avant: NiveauPositionnement,
        apres: NiveauPositionnement,
      }),
    )
    .min(6)
    .max(10),
  commentaires: z.string().nullable().optional(),
});

// Grille observation session (C3.i11) : 7 compétences × N stagiaires + 1 obs/stagiaire.
// Niveaux A/B/C autorisés en sortie IA — D refusé pour garder un ton bienveillant.
const NiveauGrilleSession = z.union([z.literal('A'), z.literal('B'), z.literal('C')]);
const GrilleSessionSchema = z.object({
  competences: z
    .array(
      z.object({
        nom: z.string().min(5),
        // Map participantId → niveau (la clé est validée par l'appelant)
        niveaux: z.record(z.string(), NiveauGrilleSession),
      }),
    )
    .min(5),
  observations: z
    .array(
      z.object({
        participantId: z.string().min(1),
        texte: z.string().min(20),
      }),
    )
    .min(1),
});

// Satisfaction chaud : ratings sur 5 sections + récap.
const RatingSchema = z.union([z.literal('Très bien'), z.literal('Bien'), z.literal('Moyen'), z.literal('Mauvais')]);
const UtiliteSchema = z.union([z.literal('Très utile'), z.literal('Utile'), z.literal('Peu utile'), z.literal('Pas utile')]);
const SatisfactionChaudSchema = z.object({
  organisation: z.object({
    communication: RatingSchema,
    delai: RatingSchema,
    duree: RatingSchema,
    engagements: RatingSchema,
    commentaire: z.string().nullable().optional(),
  }),
  moyens: z.object({
    cadre: RatingSchema,
    locaux: RatingSchema,
    supports: RatingSchema,
    materiel: RatingSchema,
    commentaire: z.string().nullable().optional(),
  }),
  pedagogie: z.object({
    difficulte: RatingSchema,
    articulation: RatingSchema,
    theorique: RatingSchema,
    pratique: RatingSchema,
    rythme: RatingSchema,
    approche: RatingSchema,
    ecoute: RatingSchema,
    animation: RatingSchema,
    commentaire: z.string().nullable().optional(),
  }),
  groupe: z.object({
    ambiance: RatingSchema,
    nombre: RatingSchema,
    heterogeneite: RatingSchema,
    attention: RatingSchema,
    commentaire: z.string().nullable().optional(),
  }),
  benefice: z.object({
    adequation: RatingSchema,
    utilite: UtiliteSchema,
    commentaire: z.string().nullable().optional(),
  }),
  recommandation: z.union([z.literal('Oui'), z.literal('Non')]),
  remarques: z.string().nullable().optional(),
});

// Satisfaction froid : 9 ratings + bilan.
const SatisfactionFroidSchema = z.object({
  mise_en_pratique: z.object({
    applique: RatingSchema,
    frequence: RatingSchema,
    resultats: RatingSchema,
    commentaire: z.string().nullable().optional(),
  }),
  impact: z.object({
    performance: RatingSchema,
    autonomie: RatingSchema,
    confiance: RatingSchema,
    satisfaction_client: RatingSchema,
    commentaire: z.string().nullable().optional(),
  }),
  bilan: z.object({
    atteinte_objectifs: RatingSchema,
    recommandation: z.union([z.literal('Oui'), z.literal('Non')]),
    utilite_long_terme: RatingSchema,
  }),
  remarques: z.string().nullable().optional(),
});

// Déroulé pédagogique : N jours × M séquences (pauses incluses avec isPause).
// Pour les séquences non-pause, on impose des longueurs minimales sur chaque
// champ — sinon Ollama produit du contenu superficiel inutilisable en audit
// Qualiopi. Les pauses (isPause:true) sont exemptées de ces minimums via un
// refine() qui n'applique le check que si isPause !== true.
const DerouleSequenceSchema = z
  .object({
    duree: z.string().min(3),
    objectifs: z.string(),
    contenu: z.string(),
    outils: z.string(),
    exercice: z.string(),
    evaluation: z.string(),
    isPause: z.boolean().optional(),
  })
  .superRefine((seq, ctx) => {
    if (seq.isPause) return; // pauses : champs vides tolérés
    // Minimums BAS (Kaïna 16/06) : on garantit juste des cellules non vides et
    // signifiantes. La CONCISION (quelques lignes/cellule, format 6 colonnes)
    // est pilotée par le prompt, pas par un plancher de caractères.
    const checks: Array<[keyof typeof seq, number, string]> = [
      ['objectifs', 15, 'Objectifs vides ou trop courts — au moins un objectif actionnable.'],
      ['contenu', 20, 'Contenu vide ou trop court — au moins la notion-clé de la séquence.'],
      ['outils', 6, 'Outils manquants — au moins un support.'],
      ['exercice', 15, 'Exercice manquant — au moins l\'intitulé de la mise en situation.'],
      ['evaluation', 8, 'Évaluation manquante — au moins le type.'],
    ];
    for (const [field, min, msg] of checks) {
      const v = seq[field];
      if (typeof v !== 'string' || v.trim().length < min) {
        ctx.addIssue({ code: 'custom', path: [field], message: msg });
      }
    }
  });

const DerouleSchema = z.object({
  jours: z
    .array(
      z.object({
        theme: z.string().min(10),
        sequences: z.array(DerouleSequenceSchema).min(5),
      }),
    )
    .min(1),
});

/**
 * Variante LOCALE de DerouleSchema avec un plancher de séquences ADAPTATIF à la
 * durée du jour (quick 260618-vg2). Utilisée par la boucle multi-jours pour valider
 * CHAQUE jour : le DERNIER jour d'une formation non multiple de 8h est PARTIEL
 * (ex. PROD-0670 = 105h → 14 jours, jour 14 = 1h) et ne peut pas produire ≥5
 * séquences. Le `DerouleSchema` global (l.310, cas nbJours===1) reste INCHANGÉ.
 *
 * minSeq = max(2, min(5, round(heuresJour)) :
 *   - jour plein 8h → min(5, 8) = 5 (plancher historique inchangé)
 *   - jour 1h/2h → max(2, 1|2) = 2 (Accueil/contenu + bloc clôture)
 *   - jour 5h → min(5, 5) = 5 (plafonné — palier simple, corrections §1)
 *
 * PUR : aucun plancher de cellule touché (DerouleSequenceSchema réutilisé tel quel).
 * Forme IDENTIQUE à DerouleSchema ({ jours: [...] }) → compatible runOllamaJson<T>.
 */
export function buildDerouleJourSchema(heuresJour: number) {
  const minSeq = Math.max(2, Math.min(5, Math.round(heuresJour)));
  return z.object({
    jours: z
      .array(
        z.object({
          theme: z.string().min(10),
          sequences: z.array(DerouleSequenceSchema).min(minSeq),
        }),
      )
      .min(1),
  });
}

const RapportFormateurSchema = z.object({
  adaptations: z.string().min(10),
  remarquesGroupe: z.string().min(10),
  bilan: z.string().min(10),
});

// =====================================================
// Generators
// =====================================================

/**
 * Construit les lignes factuelles compactes décrivant la session, filtrées sur
 * les valeurs non nulles (pure, sans IO). Renvoie '' si rien d'exploitable.
 */
function buildFaitsSession(s: SessionRapportCtx): string {
  const fmtDate = (d: Date | null): string | null =>
    d ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : null;
  const lines: string[] = [];

  const effectif =
    s.nbApprenants > 0
      ? `- Effectif : ${s.nbApprenants} apprenant${s.nbApprenants > 1 ? 's' : ''}${
          s.enseignes.length ? `, issus de ${s.enseignes.join(', ')}` : ''
        }`
      : null;
  if (effectif) lines.push(effectif);

  const debut = fmtDate(s.dateDebut);
  const fin = fmtDate(s.dateFin);
  if (debut && fin) lines.push(`- Période : du ${debut} au ${fin}`);
  else if (debut) lines.push(`- Date : ${debut}`);

  if (s.lieu) lines.push(`- Lieu : ${s.lieu}`);

  if (typeof s.qcmScoreMoyen === 'number') {
    lines.push(`- Score QCM moyen du groupe : ${Math.round(s.qcmScoreMoyen)}%`);
  }
  if (s.satisfactionMoyenne) lines.push(`- Satisfaction moyenne : ${s.satisfactionMoyenne}`);
  if (s.positionnementProgressed === true) {
    lines.push(`- Progression mesurée au positionnement avant/après`);
  }

  return lines.join('\n');
}

/**
 * Génère les narratifs du « Rapport formateur » du déroulé (adaptations / remarques
 * groupe / bilan) par LLM, ANCRÉS au programme réel — au lieu des pools génériques
 * codés en dur (qui faisaient fuiter des thèmes hors programme, ex. « prompts/IA »
 * sur une formation Tracfin). tier 'fast' = Haiku en cloud (texte court).
 * Avec un `sessionCtx` (quick 260618-skk), les narratifs sont en plus ancrés sur
 * les faits concrets de la session → distincts d'une session à l'autre.
 * Retourne null sur échec → l'appelant retombe sur les pools (fallback).
 */
export async function generateRapportFormateur(
  formation: FormationCtx,
  refTable = 'PedagogicalAsset',
  refId: string | null = null,
  tenantId: string | null = null,
  sessionCtx: SessionRapportCtx | null = null,
): Promise<z.infer<typeof RapportFormateurSchema> | null> {
  const hasProgramme = !!formation.programmeMd && formation.programmeMd.trim().length > 10;

  // CAUSE 2 (quick 260618-skk) : bloc de FAITS CONCRETS de la session. Construit
  // uniquement si un sessionCtx est fourni ; chaque ligne est filtrée sur les
  // valeurs non nulles → narratifs distincts d'une session à l'autre.
  const faitsSession = sessionCtx ? buildFaitsSession(sessionCtx) : '';

  const prompt = `Tu remplis ton rapport de formateur APRÈS avoir animé cette formation.

Titre : ${formation.titre}
Durée : ${formation.nombreHeures} heures

${hasProgramme ? `PROGRAMME DE LA FORMATION (ancre-toi STRICTEMENT dessus, n'introduis aucun thème absent) :
${formation.programmeMd}` : `Aucun programme détaillé disponible — reste strictement sur le thème « ${formation.titre} » sans introduire d'autre sujet.`}
${faitsSession ? `
FAITS CONCRETS DE CETTE SESSION PRÉCISE :
${faitsSession}
Ancre tes trois narratifs sur CES FAITS CONCRETS de la session (effectif, profils/enseignes, période, lieu, résultats) pour qu'ils soient DISTINCTS d'une session à l'autre, tout en restant STRICTEMENT dans le périmètre du programme ci-dessus (aucun thème hors programme).` : ''}

Rédige tes trois narratifs (adaptations pédagogiques / observations, remarques sur le groupe, bilan de la formation), à la première personne, 1 à 2 phrases chacun.`;

  return runOllamaJson(
    'generate-rapport-formateur',
    SYSTEM_PROMPT_RAPPORT_FORMATEUR,
    prompt,
    RapportFormateurSchema,
    refTable,
    refId,
    tenantId,
    undefined,
    'fast',
  );
}

export async function generateQcmContent(
  formation: FormationCtx,
  refTable = 'PedagogicalAsset',
  refId: string | null = null,
  tenantId: string | null = null,
): Promise<QcmContent | null> {
  const prompt = `Génère un QCM d'au moins ${QCM_QUESTIONS_DEFAULT} questions pour la formation suivante.

Titre : ${formation.titre}
Durée : ${formation.nombreHeures} heures

Programme :
${formation.programmeMd || '(programme à compléter)'}`;

  const raw = await runOllamaJson(
    'generate-qcm',
    SYSTEM_PROMPT_QCM,
    prompt,
    QcmRawSchema,
    refTable,
    refId,
    tenantId,
    undefined,
    'quality', // rédactionnel → Sonnet (audit routage 17/06)
  );
  if (!raw) return null;
  return attachQcmScoring(raw.questions);
}

/**
 * Post-process : attribue à chaque question un `selected_answer` et `is_correct`,
 * en visant un score global entre 75% et 95% (jamais < 65%). Le scoring est
 * forcé en code (et non délégué à Ollama) pour garantir le seuil Qualiopi.
 *
 * Exporté pour permettre la réutilisation : pour 1 même QCM (questions partagées
 * par session), on appelle cette fonction N fois (une par stagiaire) afin
 * d'obtenir N scorings différents.
 */
export function attachQcmScoring(
  rawQuestions: { question: string; options: { letter: string; text: string }[]; correct_answer: string }[],
): QcmContent {
  const total = rawQuestions.length;
  // Score cible : 75% à 95% (en nombre absolu de bonnes réponses arrondi)
  const targetRatio = 0.75 + Math.random() * 0.20;
  const targetCorrect = Math.max(Math.ceil(total * 0.65) + 1, Math.round(total * targetRatio));

  // Choisir au hasard `targetCorrect` indices qui auront une réponse correcte.
  const indices = Array.from({ length: total }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = indices[i] as number;
    indices[i] = indices[j] as number;
    indices[j] = tmp;
  }
  const correctSet = new Set(indices.slice(0, targetCorrect));

  const questions = rawQuestions.map((q, idx) => {
    if (correctSet.has(idx)) {
      return { ...q, selected_answer: q.correct_answer, is_correct: true };
    }
    // Réponse incorrecte : pick une option ≠ correct_answer au hasard.
    const wrongOptions = q.options.filter((o) => o.letter !== q.correct_answer);
    const picked =
      wrongOptions.length > 0
        ? (wrongOptions[Math.floor(Math.random() * wrongOptions.length)] as { letter: string }).letter
        : q.correct_answer; // edge case : 1 seule option → forcément correcte
    const isCorrect = picked === q.correct_answer;
    return { ...q, selected_answer: picked, is_correct: isCorrect };
  });

  const finalCorrect = questions.filter((q) => q.is_correct).length;
  const score = Math.round((finalCorrect / total) * 100);

  return { questions, score };
}

export async function generateAnalyseBesoinContent(
  formation: FormationCtx,
  stagiaire: StagiaireCtx,
  refTable = 'PedagogicalAsset',
  refId: string | null = null,
  tenantId: string | null = null,
): Promise<AnalyseBesoinContent | null> {
  const stagiaireBlock = [
    `Prénom : ${stagiaire.prenom}`,
    `Nom : ${stagiaire.nom}`,
    stagiaire.entreprise ? `Entreprise / structure : ${stagiaire.entreprise}` : null,
    stagiaire.fonction ? `Fonction : ${stagiaire.fonction}` : null,
    stagiaire.professionalStatus ? `Statut professionnel : ${stagiaire.professionalStatus}` : null,
    stagiaire.anciennete ? `Ancienneté dans le métier : ${stagiaire.anciennete}` : null,
    stagiaire.diplomes ? `Diplômes / formations : ${stagiaire.diplomes}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `Rédige une analyse des besoins de formation pour le stagiaire ci-dessous.
La formation est :
Titre : ${formation.titre}
Durée : ${formation.nombreHeures} heures
Programme :
${formation.programmeMd || '(programme à compléter)'}

Stagiaire :
${stagiaireBlock || '(profil non détaillé)'}

L'analyse doit donner l'impression que le stagiaire a réellement répondu à un questionnaire en amont de la formation.${genderDirective(stagiaire.civilite)}`;

  return runOllamaJson(
    'generate-analyse-besoin',
    SYSTEM_PROMPT_ANALYSE_BESOIN,
    prompt,
    AnalyseBesoinSchema,
    refTable,
    refId,
    tenantId,
    undefined,
    'quality', // rédactionnel → Sonnet (audit routage 17/06)
  );
}

export async function generateGrilleContent(
  formation: FormationCtx,
  stagiaire: StagiaireCtx,
  refTable = 'PedagogicalAsset',
  refId: string | null = null,
  tenantId: string | null = null,
): Promise<GrilleContent | null> {
  const prompt = `Génère une grille d'observation individuelle pré-remplie pour le stagiaire ci-dessous. Cette grille doit être livrable telle quelle, prête à être signée par le formateur.

Formation :
Titre : ${formation.titre}
Durée : ${formation.nombreHeures} heures
Programme :
${formation.programmeMd || '(programme à compléter)'}

Stagiaire : ${stagiaire.prenom} ${stagiaire.nom}

Consignes (impératives) :

1. Génère exactement 7 compétences directement liées au contenu réel de la formation (pas génériques). Le nom de la compétence est une phrase d'action concrète (ex: "Maîtriser l'usage de ChatGPT pour la prospection immobilière", pas "Comprendre l'IA").

2. Pour chaque compétence, attribue un niveau réaliste mais POSITIF :
   - Majorité de "A" (Objectif atteint avec maîtrise parfaite) — environ 4-5 sur 7
   - Le reste en "B" (Objectif atteint) — environ 2-3 sur 7
   - Rares "C" tolérés uniquement si justifié par une observation honnête, jamais plus d'1 sur 7
   - Jamais de "D"

3. Pour chaque compétence, rédige une observation personnalisée et factuelle (1-2 phrases minimum, 10 caractères min) qui :
   - Mentionne ${stagiaire.prenom} (prénom) au moins 1 fois sur les 7 observations
   - Valorise le stagiaire avec des éléments concrets (ex: "${stagiaire.prenom} a démontré une excellente maîtrise...", "Très bonne capacité à...", "Mise en application immédiate sur...")
   - Est crédible pour un audit Qualiopi (pas générique, pas creux)
   - Cohérente avec le niveau attribué (un A demande un commentaire élogieux, un C est plus mesuré)

4. Remplis aussi le bloc "observations_globales" avec :
   - "commentaire" : bilan global personnalisé du parcours de ${stagiaire.prenom} en formation (2-3 phrases, mentionne son prénom)
   - "axe_amelioration" : 1-2 phrases sur ce que ${stagiaire.prenom} peut continuer à développer après la formation

La grille doit être positive (valorise le parcours) tout en étant crédible (pas tout du A, pas de phrases creuses).${genderDirective(stagiaire.civilite)}`;

  return runOllamaJson(
    'generate-grille',
    SYSTEM_PROMPT_GRILLE_OBSERVATION,
    prompt,
    GrilleSchema,
    refTable,
    refId,
    tenantId,
    undefined,
    'quality', // rédactionnel → Sonnet (audit routage 17/06)
  );
}

// =====================================================
// Runner partagé : appel Ollama + validation Zod + logging AIGenerationJob
// =====================================================

/**
 * 1 essai = appel Ollama + parse JSON + validation Zod.
 * Retourne `{ ok: true, data }` si tout OK, sinon `{ ok: false, reason }`
 * pour que l'appelant décide de retry ou non.
 */
async function tryOnce<T>(
  taskName: string,
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodSchema<T>,
  modelOverride?: string,
  tier: LlmTier = 'fast',
): Promise<{ ok: true; data: T; latencyMs: number } | { ok: false; reason: string; latencyMs: number }> {
  const startedAt = Date.now();
  const cloud = (process.env.AI_PROVIDER ?? 'ollama') === 'openrouter';
  const modelUsed = cloud ? `cloud:${tier}` : modelOverride ?? MODEL;
  try {
    // Wiring cloud (Kaïna 16/06) : si AI_PROVIDER=openrouter, le déroulé et les
    // docs rédactionnels passent par callLlm (tier quality = Sonnet). Sinon
    // Ollama local inchangé. `tier` est ignoré côté Ollama (modelOverride prime).
    const result = cloud
      ? await callLlm({
          tier,
          systemPrompt,
          prompt: userPrompt,
          jsonOutput: true,
          temperature: 0.3,
          maxTokens: 8192,
          timeoutMs: 240_000,
        })
      : await callOllama({
          model: modelUsed,
          systemPrompt,
          prompt: userPrompt,
          jsonOutput: true,
          temperature: 0.3,
          maxTokens: 8192,
          // 10 min : avec saturation GPU sur Apple Silicon, le QCM peut prendre 5+ min
          timeoutMs: 600_000,
        });
    const latencyMs = Date.now() - startedAt;

    if (result.parsedJson === null) {
      const preview = result.raw.slice(0, 200).replace(/\s+/g, ' ');
      return { ok: false, reason: `JSON non parsable. Raw: ${preview}`, latencyMs };
    }
    const parsed = schema.safeParse(result.parsedJson);
    if (!parsed.success) {
      const msg = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(' / ');
      return { ok: false, reason: `Schema invalide : ${msg}`, latencyMs };
    }
    console.log(`[ollama-${taskName}] ✓ ${latencyMs}ms (model=${modelUsed}, prompt=${PROMPT_VERSION})`);
    return { ok: true, data: parsed.data, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg, latencyMs };
  }
}

// =====================================================
// Generators 4 nouveaux docs (positionnement, satisfactions, déroulé)
// =====================================================

export async function generatePositionnementContent(
  formation: FormationCtx,
  stagiaire: StagiaireCtx,
  refTable = 'PedagogicalAsset',
  refId: string | null = null,
  tenantId: string | null = null,
): Promise<PositionnementContent | null> {
  const stagiaireBlock = [
    `Prénom : ${stagiaire.prenom}`,
    `Nom : ${stagiaire.nom}`,
    stagiaire.fonction ? `Fonction : ${stagiaire.fonction}` : null,
    stagiaire.entreprise ? `Entreprise : ${stagiaire.entreprise}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const prompt = `Génère un questionnaire de positionnement personnalisé pour le stagiaire ci-dessous.

Formation :
Titre : ${formation.titre}
Durée : ${formation.nombreHeures} heures
Programme :
${formation.programmeMd || '(programme à compléter)'}

Stagiaire :
${stagiaireBlock || '(profil non détaillé)'}

Génère 6-8 compétences spécifiques au programme avec niveaux AVANT (majoritairement 1-2) et niveaux APRÈS (majoritairement 4) — la formation doit montrer une progression nette.${genderDirective(stagiaire.civilite)}`;

  return runOllamaJson(
    'generate-positionnement',
    SYSTEM_PROMPT_POSITIONNEMENT,
    prompt,
    PositionnementSchema,
    refTable,
    refId,
    tenantId,
    undefined,
    'quality', // rédactionnel (objectifs/prérequis) → Sonnet (audit routage 17/06)
  );
}

export async function generateSatisfactionChaudContent(
  formation: FormationCtx,
  stagiaire: StagiaireCtx,
  refTable = 'PedagogicalAsset',
  refId: string | null = null,
  tenantId: string | null = null,
): Promise<SatisfactionChaudContent | null> {
  const prompt = `Rédige une évaluation de satisfaction à chaud pour le stagiaire ${stagiaire.prenom} ${stagiaire.nom} qui vient de terminer la formation "${formation.titre}" (${formation.nombreHeures} heures).

Programme :
${formation.programmeMd || '(programme à compléter)'}

Le stagiaire est satisfait : au moins 90% de "Très bien" / "Bien", aucun "Mauvais", maximum 1-2 "Moyen". Recommandation : Oui. Commentaires courts et naturels par section.

Rédige TOUS les commentaires à la 1re personne du stagiaire (« j'ai », « ma pratique »), sans jamais citer son prénom ni utiliser la 3e personne, en restant STRICTEMENT sur le thème de la formation "${formation.titre}" ; n'introduis aucun autre domaine.${genderDirective(stagiaire.civilite)}`;

  return runOllamaJson(
    'generate-satisfaction-chaud',
    SYSTEM_PROMPT_SATISFACTION_CHAUD,
    prompt,
    SatisfactionChaudSchema,
    refTable,
    refId,
    tenantId,
  );
}

export async function generateSatisfactionFroidContent(
  formation: FormationCtx,
  stagiaire: StagiaireCtx,
  refTable = 'PedagogicalAsset',
  refId: string | null = null,
  tenantId: string | null = null,
): Promise<SatisfactionFroidContent | null> {
  const prompt = `Rédige une évaluation de satisfaction à froid (3-6 mois après la formation) pour ${stagiaire.prenom} ${stagiaire.nom} sur la formation "${formation.titre}".

Programme :
${formation.programmeMd || '(programme à compléter)'}

Profil : ${stagiaire.fonction ?? 'professionnel'}${stagiaire.entreprise ? ` chez ${stagiaire.entreprise}` : ''}.

Au moins 90% des ratings en "Très bien" / "Bien". Commentaires concrets sur l'application des acquis depuis la formation.

Rédige TOUS les commentaires à la 1re personne du stagiaire (« j'applique », « mon activité »), sans jamais citer son prénom ni utiliser la 3e personne, en restant STRICTEMENT sur le thème de la formation "${formation.titre}" ; n'introduis aucun autre domaine.${genderDirective(stagiaire.civilite)}`;

  return runOllamaJson(
    'generate-satisfaction-froid',
    SYSTEM_PROMPT_SATISFACTION_FROID,
    prompt,
    SatisfactionFroidSchema,
    refTable,
    refId,
    tenantId,
  );
}

/**
 * Réassemble N déroulés partiels (1 par jour) en UN seul DerouleContent.
 * PURE : `flatMap` préserve l'ordre d'entrée, gère 0/1/N partiels ET les partiels
 * multi-jours (cas dégénéré LLM → tous les jours aplatis dans l'ordre). Source
 * unique du réassemblage chunké de generateDerouleContent (testée en déterministe).
 */
export function assembleDeroule(partiels: DerouleContent[]): DerouleContent {
  return { jours: partiels.flatMap((p) => p.jours) };
}

/**
 * Construit le prompt user d'UN jour (k sur N) pour le déroulé chunké. Réutilise
 * SYSTEM_PROMPT_DEROULE (qui décrit déjà une journée 9h-18h) et cadre le périmètre
 * « jour k » dans le user prompt. La grille figée du jour vient de buildHoraireScaffold.
 */
function buildDerouleJourPrompt(
  formation: FormationCtx,
  k: number,
  nbJours: number,
  jourGrille: string,
  hasProgramme: boolean,
  heuresJour: number,
): string {
  const jourCourt =
    heuresJour < 8
      ? `\nATTENTION : ce jour ne fait que ${heuresJour}h — produis un nombre de séquences PROPORTIONNÉ à cette durée (pas de remplissage artificiel pour atteindre une journée pleine).`
      : '';
  return `Génère le déroulé pédagogique du JOUR ${k} sur ${nbJours} de la formation suivante.

Titre : ${formation.titre}
Durée totale : ${formation.nombreHeures} heures réparties sur ${nbJours} jours.

Tu génères UNIQUEMENT le Jour ${k} (un seul élément dans "jours"). N'invente pas les autres jours.${jourCourt}

GRILLE HORAIRE IMPOSÉE DU JOUR ${k} (à recopier telle quelle) :
${jourGrille}

${hasProgramme ? `PROGRAMME DE RÉFÉRENCE COMPLET (reprendre EXACTEMENT ses blocs horaires et titres pour la part qui revient au Jour ${k}) :
${formation.programmeMd}

INSTRUCTION : chaque bloc de contenu du programme attribué à ce jour devient une séquence. Reformule et structure le CONTENU dans objectifs/contenu, SANS rien ajouter (aucun concept, outil, framework ou exemple absent du programme). Tu peux préciser les MODALITÉS (durée, format de travail, type d'exercice et d'évaluation).` : `Aucun programme détaillé disponible — génère un déroulé cohérent pour le Jour ${k} de "${formation.titre}".`}

Ajoute obligatoirement pour ce jour :
${k === 1 ? '- Accueil en début de journée (9h00, 15-30 min) — UNIQUEMENT au Jour 1.' : "- PAS d'accueil ni de tour de table d'ouverture (réservé au Jour 1)."}
- Pause déjeuner ${PAUSE_DEJEUNER.start}–${PAUSE_DEJEUNER.end} (1h) (isPause: true, objectifs: "Pause déjeuner", autres champs vides) SI le jour comporte un après-midi.
- Pause café si la journée dépasse 6h (isPause: true, objectifs: "Pause", autres champs vides)
${k === nbJours ? '- Dernier bloc : "Évaluation des acquis et clôture" — QCM Kahoot final (12 questions) et remise des attestations — UNIQUEMENT ce dernier jour.' : '- PAS de bloc d\'évaluation finale / QCM Kahoot (réservé au dernier jour).'}`;
}

export async function generateDerouleContent(
  formation: FormationCtx,
  refTable = 'PedagogicalAsset',
  refId: string | null = null,
  tenantId: string | null = null,
): Promise<DerouleContent | null> {
  const nbJours = Math.max(1, Math.ceil(formation.nombreHeures / 8));
  const hasProgramme = !!formation.programmeMd && formation.programmeMd.trim().length > 10;

  // ── Cas 1 jour : comportement HISTORIQUE strictement inchangé (non-régression). ──
  if (nbJours === 1) {
    const heuresParJour = Math.round(formation.nombreHeures / nbJours);
    const { start, end } = getDayStartEnd(heuresParJour);

    const prompt = `Génère un déroulé pédagogique pour la formation suivante.

Titre : ${formation.titre}
Durée totale : ${formation.nombreHeures} heures — ${nbJours} jour${nbJours > 1 ? 's' : ''} (${heuresParJour}h/jour, ${start}–${end})

${hasProgramme ? `PROGRAMME DE RÉFÉRENCE (reprendre EXACTEMENT ces blocs horaires et titres) :
${formation.programmeMd}

INSTRUCTION : chaque bloc horaire du programme ci-dessus devient une séquence du déroulé. Copie les horaires et les titres tels quels. Reformule et structure le CONTENU du programme dans les champs objectifs/contenu, SANS rien y ajouter (aucun concept, outil, framework ou exemple absent du programme). Tu peux préciser les MODALITÉS (durée, format de travail, type d'exercice et d'évaluation) qui ne figurent pas dans le programme.` : `Aucun programme détaillé disponible — génère un déroulé cohérent pour "${formation.titre}" (${formation.nombreHeures}h).`}

Ajoute obligatoirement :
- Accueil en début de journée (9h00, 15-30 min)
- Pause déjeuner ${PAUSE_DEJEUNER.start}–${PAUSE_DEJEUNER.end} (1h) (isPause: true, objectifs: "Pause déjeuner", autres champs vides)
- Pause café si la journée dépasse 6h (isPause: true, objectifs: "Pause", autres champs vides)
- Dernier bloc du dernier jour : "Évaluation des acquis et clôture" avec QCM et remise des attestations`;

    const deroule = await runOllamaJson(
      'generate-deroule',
      SYSTEM_PROMPT_DEROULE,
      prompt,
      DerouleSchema,
      refTable,
      refId,
      tenantId,
      MODEL_DEROULE,
      'quality', // tier quality → Sonnet 4.6 quand AI_PROVIDER=openrouter (Kaïna 16/06)
    );
    if (!deroule) return null;
    // Rapport formateur ancré au programme — UN seul appel, échec → champ absent
    // (renderBilanFormateur fallback pool), le déroulé n'est PAS avorté.
    const rapport = await generateRapportFormateur(formation, refTable, refId, tenantId);
    return rapport ? { ...deroule, rapportFormateur: rapport } : deroule;
  }

  // ── Multi-jours (quick 260618-jy1) : 1 appel LLM PAR JOUR, puis réassemblage pur. ──
  // Évite le timeout/troncature d'un déroulé monolithique sur formation longue
  // (PROD-0042 9j, jusqu'à 14j). Échec d'UN jour → null GLOBAL (console.error) :
  // pas de PDF partiel trompeur, l'appelant fallback sur le stub.
  const scaffold = buildHoraireScaffold(formation.nombreHeures);
  const partiels: DerouleContent[] = [];
  for (let k = 1; k <= nbJours; k++) {
    const jourGrille = renderHoraireScaffoldMd({
      durationHours: formation.nombreHeures,
      nbJours: 1,
      jours: [scaffold.jours[k - 1]!],
      multiDayDeferred: false,
    });
    // Plancher de séquences PROPORTIONNÉ à la durée du jour (quick 260618-vg2) :
    // débloque le DERNIER jour PARTIEL (durationHours non multiple de 8). Le jour
    // plein garde min 5 ; un jour court accepte 2. DerouleSchema global inchangé.
    const heuresJour = scaffold.jours[k - 1]!.travailTotalMin / 60;
    const jourPrompt = buildDerouleJourPrompt(
      formation,
      k,
      nbJours,
      jourGrille,
      hasProgramme,
      heuresJour,
    );
    const partiel = await runOllamaJson(
      'generate-deroule',
      SYSTEM_PROMPT_DEROULE,
      jourPrompt,
      buildDerouleJourSchema(heuresJour),
      refTable,
      refId,
      tenantId,
      MODEL_DEROULE,
      'quality',
    );
    if (!partiel) {
      console.error(
        `[generate-deroule] jour ${k}/${nbJours} échoué — déroulé GLOBAL abandonné (null), pas de troncature silencieuse.`,
      );
      return null;
    }
    partiels.push(partiel);
  }

  // 1 seul DerouleContent → 1 seul PDF (renderDerouleHtml pagine les N jours + rapport unique).
  const deroule = assembleDeroule(partiels);
  // Rapport formateur ancré au programme — UN seul appel APRÈS assemblage (pas par jour),
  // échec → champ absent (fallback pool), le déroulé multi-jours n'est PAS avorté.
  const rapport = await generateRapportFormateur(formation, refTable, refId, tenantId);
  return rapport ? { ...deroule, rapportFormateur: rapport } : deroule;
}

/** Schéma de sortie du générateur de programme normalisé : markdown plat,
 *  réutilisable directement par renderProgrammeHtml / renderConventionHtml
 *  (qui font marked.parse). */
const NormalizedProgrammeSchema = z.object({
  programmeMd: z.string().min(20),
});

/**
 * Normalise un programme (Laurent 2026-06-18) : impose une grille horaire FIGÉE
 * (9h00–13h00 / 14h00–18h00 = 8h pile, cas 1 jour PROD-0062) et reformule chaque
 * intitulé en verbe d'action évaluable, en DÉCLINANT le programme source SANS
 * inventer ni retirer de thème. Le markdown retourné alimente À LA FOIS
 * Programme.pdf ET Convention.pdf (source unique).
 *
 * - tier 'quality' → Sonnet quand AI_PROVIDER=openrouter.
 * - Post-traitement de fidélité NON bloquant : si des thèmes étrangers sont
 *   détectés, on WARN (on ne bloque pas — on veut voir le rendu témoin).
 * - Retourne null si le LLM échoue (l'appelant fallback sur le programMd brut).
 *
 * MULTI-JOURS (quick 260618-jy1) : la grille imposée est désormais MULTI-JOURS
 * (buildHoraireScaffold rend N journées). Le mapping reste UN SEUL appel LLM par
 * défaut : le programme normalisé est un markdown PLAT (pas de N séquences riches
 * comme le déroulé), donc le risque de troncature est faible même à 14 jours, et
 * un appel unique préserve la cohérence transversale (répartition des thèmes sur
 * les jours). Le chunking par jour est réservé au DÉROULÉ (generateDerouleContent),
 * lui beaucoup plus lourd en tokens. Signature publique inchangée.
 */
export async function generateNormalizedProgramme(
  programMd: string,
  objectives: string[],
  durationHours: number,
  titre: string,
  tenantId: string | null = null,
): Promise<string | null> {
  // 1) Grille horaire IMPOSÉE (déterministe) injectée dans le prompt user.
  const scaffold = buildHoraireScaffold(durationHours);
  const grilleImposee = renderHoraireScaffoldMd(scaffold);

  // Titres de modules source (pour le post-traitement de fidélité).
  const sourceModuleTitles = [
    titre,
    ...objectives,
    ...programMd.split('\n').map((l) => l.trim()).filter(Boolean),
  ];

  const objectifsBlock = objectives.length
    ? objectives.map((o) => `- ${o}`).join('\n')
    : '(objectifs non détaillés)';

  const userPrompt = `Normalise le programme de la formation suivante.

Titre : ${titre}
Durée : ${durationHours} heures réparties sur ${scaffold.nbJours} jour${scaffold.nbJours > 1 ? 's' : ''}

GRILLE HORAIRE IMPOSÉE — ${scaffold.nbJours} jour${scaffold.nbJours > 1 ? 's' : ''} (à recopier telle quelle, NE PAS recalculer) :
${grilleImposee}

Objectifs de la formation :
${objectifsBlock}

PROGRAMME SOURCE (à RÉPARTIR sur les ${scaffold.nbJours} journées de la grille, SANS rien ajouter ni retirer ; les horaires éventuels de ce programme source sont OBSOLÈTES et remplacés par la grille imposée) :
${programMd || '(programme source vide — structure les objectifs ci-dessus en contenus, sans inventer)'}

Produis le programme normalisé en markdown : ${scaffold.nbJours > 1 ? 'une section ### Jour K par journée, ' : ''}intitulés en verbes d'action évaluables, contenus strictement issus de la source répartis sur les journées, horaires = grille imposée.`;

  const result = await runOllamaJson(
    'generate-normalized-programme',
    SYSTEM_PROMPT_NORMALIZE_PROGRAMME,
    userPrompt,
    NormalizedProgrammeSchema,
    'PedagogicalAsset',
    null,
    tenantId,
    undefined,
    'quality',
  );

  if (!result) return null;

  // Post-traitement fidélité (NON bloquant) : on signale, on ne bloque pas.
  const fidelity = enforceProgrammeFidelity(result.programmeMd, sourceModuleTitles);
  if (!fidelity.ok) {
    console.warn(
      `[generate-normalized-programme] ⚠ thèmes potentiellement étrangers au programme source : ${fidelity.extraneous.join(' | ')}`,
    );
  }

  return result.programmeMd;
}

const MAX_ATTEMPTS = Number(process.env.CLOSURE_OLLAMA_RETRIES ?? 2); // 1 essai initial + 1 retry par défaut

async function runOllamaJson<T>(
  taskName: string,
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodSchema<T>,
  refTable: string,
  refId: string | null,
  tenantId: string | null,
  modelOverride?: string,
  tier: LlmTier = 'fast',
): Promise<T | null> {
  const cloud = (process.env.AI_PROVIDER ?? 'ollama') === 'openrouter';
  const modelUsed = cloud ? `cloud:${tier}` : modelOverride ?? MODEL;
  const inputHash = simpleHash(`${taskName}:${userPrompt}`);
  const jobLog = tenantId
    ? await prisma.aIGenerationJob.create({
        data: {
          tenantId,
          provider: cloud ? 'openrouter' : 'ollama',
          model: modelUsed,
          promptVersion: PROMPT_VERSION,
          inputHash,
          status: 'running',
          refTable,
          refId,
        },
      })
    : null;

  let lastReason = '';
  let totalLatency = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const r = await tryOnce(taskName, systemPrompt, userPrompt, schema, modelOverride, tier);
    totalLatency += r.latencyMs;
    if (r.ok) {
      if (jobLog) {
        await prisma.aIGenerationJob.update({
          where: { id: jobLog.id },
          data: { status: 'done', latencyMs: totalLatency, retries: attempt - 1 },
        });
      }
      if (attempt > 1) console.log(`[ollama-${taskName}] ✓ après retry #${attempt - 1}`);
      return r.data;
    }
    lastReason = r.reason;
    console.warn(`[ollama-${taskName}] attempt ${attempt}/${MAX_ATTEMPTS} KO (${r.latencyMs}ms): ${r.reason.slice(0, 120)}`);
    // Petit backoff entre 2 tentatives pour laisser la queue Ollama se vider
    if (attempt < MAX_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }

  if (jobLog) await failJob(jobLog.id, lastReason, totalLatency, MAX_ATTEMPTS - 1);
  return null;
}

async function failJob(jobId: string, errorMsg: string, latencyMs: number, retries = 0): Promise<void> {
  try {
    await prisma.aIGenerationJob.update({
      where: { id: jobId },
      data: { status: 'failed', errorMsg: errorMsg.slice(0, 500), latencyMs, retries },
    });
  } catch {
    /* ne pas masquer l'erreur principale */
  }
}

// =====================================================
// Grille observation consolidée par SESSION (C3.i11)
// =====================================================

export interface GrilleSessionStagiaireInput {
  participantId: string;
  prenom: string;
  nom: string;
  fonction: string | null;
  professionalStatus: string | null;
  civilite: string | null;
}

export async function generateGrilleSessionContent(
  formation: FormationCtx,
  stagiaires: GrilleSessionStagiaireInput[],
  refTable = 'Document',
  refId: string | null = null,
  tenantId: string | null = null,
): Promise<GrilleSessionContent | null> {
  if (stagiaires.length === 0) return null;
  const stagiairesList = stagiaires
    .map(
      (s) => {
        const g = normalizeGender(s.civilite);
        const genre = g === 'F' ? ' {genre: féminin}' : g === 'M' ? ' {genre: masculin}' : '';
        return `- participantId="${s.participantId}" — ${s.prenom} ${s.nom}${s.fonction ? ` (${s.fonction})` : ''}${s.professionalStatus ? ` [${s.professionalStatus}]` : ''}${genre}`;
      },
    )
    .join('\n');

  const prompt = `Génère une grille d'observation consolidée pour la formation suivante.

Titre : ${formation.titre}
Durée totale : ${formation.nombreHeures} heures

Programme :
${formation.programmeMd || '(programme à compléter)'}

Stagiaires présents (${stagiaires.length}) :
${stagiairesList}

Pour chaque compétence, l'objet "niveaux" doit OBLIGATOIREMENT contenir une clé pour CHAQUE participantId listé ci-dessus avec un niveau A, B ou C.
Pour "observations", produis exactement ${stagiaires.length} entrées (1 par participantId) avec une observation positive et personnalisée (2-3 phrases). Accorde chaque observation au genre indiqué entre accolades {genre: …} pour le stagiaire concerné (féminin → conseillère, engagée, elle ; masculin → conseiller, il).`;

  const result = await runOllamaJson(
    'generate-grille-obs-session',
    SYSTEM_PROMPT_GRILLE_OBSERVATION_SESSION,
    prompt,
    GrilleSessionSchema,
    refTable,
    refId,
    tenantId,
    undefined,
    'quality', // rédactionnel (observations perso) → Sonnet (audit routage 17/06)
  );
  if (!result) return null;

  // Coerce Map de zod vers le type GrilleSessionContent
  return {
    competences: result.competences.map((c) => ({
      nom: c.nom,
      niveaux: c.niveaux as Record<string, 'A' | 'B' | 'C' | 'D'>,
    })),
    observations: result.observations,
  };
}

function simpleHash(s: string): string {
  // FNV-1a 32-bit — suffisant pour dédoublonner les inputs identiques en logs
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
