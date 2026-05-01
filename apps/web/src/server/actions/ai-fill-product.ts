'use server';

/**
 * Pré-remplit les champs Qualiopi d'un produit de formation Start Academy
 * via Ollama (mistral-small:24b par défaut).
 *
 * Utilise un prompt few-shot calibré sur les 3 modèles DOCX réels de
 * Laurent (Maitrisez l'IA en 3 jours, Management & performance, Immobilier
 * 2h/jour) pour reproduire le style, les sections, le ton et les phrases
 * récurrentes spécifiques à Start Academy.
 *
 * Coût : ~10-30 sec sur M5 Pro.
 */

import { validateRequest } from '@/lib/auth';
import { callOllama } from '@/lib/ai-ollama';

export interface AiProductDraft {
  objectives: string[];
  targetAudience: string;
  prerequisites: string;
  pedagogicalMethods: string;
  pedagogicalSupport: string;
  evaluationMethods: string;
  trainerProfile: string;
  accessibility: string;
  accessConditions: string;
  programMd: string;
}

const SYSTEM_PROMPT = `Tu es un rédacteur expert de programmes de formation Qualiopi pour Start Academy, organisme de formation spécialisé dans l'immobilier (Vence, 06140).

RÈGLES ABSOLUES :
- Réponds UNIQUEMENT en JSON valide, sans aucun texte avant ou après
- Le ton est professionnel, clair, orienté terrain — JAMAIS commercial ou marketing
- Tu reproduis fidèlement la structure et les formulations des modèles Start Academy
- Tu ne réinventes pas le format : sections en MAJUSCULES, phrases standard récurrentes, pas d'emojis
- Tu adaptes au thème (immobilier, IA, management, prospection, …) en restant cohérent

PHRASES STANDARD À TOUJOURS UTILISER :
- "À l'issue de la formation, le stagiaire sera capable de :" (avant les objectifs)
- "La formation se déroule en présentiel."
- "Un livret de formation sera remis à chaque participant en début de formation. Le formateur déroulera sa formation avec une présentation Canva projetée."
- "Tous les formateurs de l'équipe Start Academy ont minimum 8 années d'expérience dans l'immobilier..."
- "Une liste d'émargement est à signer à la demi-journée"
- "Un certificat de réalisation sera délivré..."
- "Une évaluation sous forme de QCM aura lieu en fin de formation"
- "Afin de vous inscrire à notre formation, merci de contacter minimum 14 jours avant le début de la formation"
- "La loi du 5 septembre 2018 pour la « liberté de choisir son avenir professionnel »..."
`;

const FEW_SHOT = `EXEMPLES DE PROGRAMMES START ACADEMY :

═══ EXEMPLE 1 — "Maîtriser l'IA en 3 jours" (21h, 3 jours, immobilier/IA) ═══

objectives :
- Comprendre les fondamentaux de l'IA et ses applications concrètes pour identifier des opportunités d'innovation dans votre entreprise.
- Maîtriser les outils d'IA (ChatGPT, Canva, Zapier, etc.) pour automatiser des tâches répétitives et améliorer l'efficacité opérationnelle.
- Intégrer l'IA dans une stratégie globale en alignant ses capacités sur les besoins spécifiques et les objectifs de l'entreprise.
- Élaborer un plan d'action personnalisé pour utiliser l'IA de manière éthique et stratégique dans les activités quotidiennes.

targetAudience : Chef d'entreprise, assistantes de direction, directeur(trice), gérant.

prerequisites : Aucune connaissance préalable en intelligence artificielle n'est requise.

pedagogicalMethods :
La formation se déroule en présentiel.
Les formateurs proposeront des mises en situation professionnelles sur les techniques de prospection, les discours et la posture ainsi que des échanges sur les pratiques actuelles.

pedagogicalSupport : Un livret de formation sera remis à chaque participant en début de formation. Le formateur déroulera sa formation avec une présentation Canva projetée.

programMd format Jour/Matin/Après-midi :
## Jour 1 : Comprendre les bases de l'IA et son potentiel
### Matin (9h-12h)
- Introduction : accueil, présentation des participants et test de positionnement.
- Bases de l'IA : définitions, enjeux et exemples d'applications.
- Identifier les besoins spécifiques des entreprises (atelier interactif).

### Après-midi (14h-18h)
- Panorama des outils d'IA accessibles (ChatGPT, Canva, Zapier, etc.).
- Activité pratique : création de prompts sur ChatGPT.
- Identification des opportunités d'automatisation.

## Jour 2 : Automatisation et intégration
### Matin (9h-12h)
- Automatisation des processus internes : Zapier et Make.
- Atelier : scénarisation d'un workflow automatisé.
[…]

═══ EXEMPLE 2 — "Management et performance augmentés par l'IA" (8h, 1 jour, management) ═══

programMd format Sections + durée :
## Accueil et cadrage managérial (30 min)
- Présentation des objectifs et du déroulé de la journée.
- Clarification des enjeux managériaux actuels.
- Positionnement de l'IA comme outil d'aide à la décision.

## Réaliser un benchmark structuré de son marché immobilier (2h)
- Identification des sources de données pertinentes.
- Analyse de la concurrence locale : positionnement, services, avis Google.
- Étude de la pression concurrentielle : volume de biens, nombre de biens par agent.
- Construction d'un benchmark clair, factuel et exploitable.

## Maîtriser la recherche approfondie (1h)
- Méthodologie de recherche approfondie appliquée à l'immobilier.
- Collecte, croisement et hiérarchisation des données.
[…]

trainerProfile : Formateur Start Academy. Expert en management immobilier, pilotage d'agence et stratégie de performance. Formateur professionnel enregistré. Expérience : accompagnement de dirigeants, managers et réseaux immobiliers.

═══ EXEMPLE 3 — "Immobilier : gagnez 2h par jour grâce à l'IA" (8h, 1 jour, immobilier/IA) ═══

programMd format horaire détaillé :
## 9h00 – 9h30 | Accueil & mise en confiance
- Accueil des participants
- Tour de table rapide : attentes & usages actuels
- Dédramatisation de l'IA
- Présentation des objectifs concrets de la journée

**Objectif :** Mettre tout le monde à l'aise, casser les peurs.

## 9h30 – 11h00 | Comprendre l'IA et ChatGPT (sans jargon)
- Ce qu'est l'IA (exemples concrets immobiliers)
- Ce que ChatGPT peut faire pour un agent immobilier
- Création et paramétrage du compte ChatGPT
- Comment bien "parler" à ChatGPT : donner le contexte, expliquer la situation, demander clairement

**Atelier guidé :** Premier prompt simple, transformer un message brouillon en message pro.
**Objectif :** Tout le monde sait déjà se servir de ChatGPT avant la pause.
[…]
`;

const USER_TEMPLATE = `Génère le programme complet pour une formation Start Academy avec les paramètres suivants :

- Intitulé : {{TITLE}}
- Thème : {{THEME}}
- Durée totale : {{DURATION}} heures
- Modalité : {{MODALITY}}
- Prix HT par stagiaire : {{PRICE}} €

CHOIX DU FORMAT programMd selon la durée :
- < 12h : format horaire détaillé (## 9h00 – 10h30 | Titre)
- 14h à 28h : format Jour 1/2/3 + Matin/Après-midi
- > 28h : format Jour avec sous-thèmes

Retourne EXCLUSIVEMENT le JSON suivant (aucun texte avant ou après, pas de code fence) :
{
  "objectives": ["puce 1", "puce 2", "puce 3", "puce 4"],
  "targetAudience": "Description du public visé en 1-3 lignes",
  "prerequisites": "Description des prérequis ou 'Aucun prérequis spécifique.'",
  "pedagogicalMethods": "Méthodes pédagogiques (commencer par 'La formation se déroule en présentiel.' puis 1-2 lignes spécifiques)",
  "pedagogicalSupport": "Un livret de formation sera remis à chaque participant en début de formation. Le formateur déroulera sa formation avec une présentation Canva projetée.",
  "evaluationMethods": "Liste des modalités d'évaluation au format multilignes (émargement + certificat + QCM + satisfaction)",
  "trainerProfile": "Profil du formateur en 2-4 lignes",
  "accessibility": "Texte d'accessibilité PMR (loi du 5 septembre 2018...)",
  "accessConditions": "Modalités d'inscription et délais (14 jours avant + convention 7 jours avant + subrogation)",
  "programMd": "Programme détaillé en Markdown avec ## et puces, format adapté à la durée"
}`;

export async function aiPreFillProduct(input: {
  title: string;
  theme?: string | null;
  durationHours: number;
  modality?: string;
  priceHT?: number;
}): Promise<{ ok: boolean; draft?: AiProductDraft; error?: string; durationMs?: number }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Intitulé obligatoire pour générer le brouillon.' };
  if (!input.durationHours || input.durationHours <= 0) {
    return { ok: false, error: 'Durée en heures obligatoire.' };
  }

  const userPrompt = USER_TEMPLATE.replace('{{TITLE}}', title)
    .replace('{{THEME}}', input.theme?.trim() || 'immobilier')
    .replace('{{DURATION}}', String(input.durationHours))
    .replace('{{MODALITY}}', input.modality ?? 'PRESENTIEL')
    .replace('{{PRICE}}', String(input.priceHT ?? 0));

  try {
    const r = await callOllama({
      model: process.env.OLLAMA_MODEL_FAST,
      systemPrompt: SYSTEM_PROMPT + '\n\n' + FEW_SHOT,
      prompt: userPrompt,
      jsonOutput: true,
      temperature: 0.4, // un peu de créativité pour le programmeMd, sans dériver
      maxTokens: 4096,
    });

    if (!r.parsedJson || typeof r.parsedJson !== 'object') {
      return {
        ok: false,
        error: `Le modèle n'a pas retourné un JSON valide. Réessaie ou ajuste les paramètres.`,
        durationMs: r.durationMs,
      };
    }

    const j = r.parsedJson as Partial<AiProductDraft>;
    const draft: AiProductDraft = {
      objectives: Array.isArray(j.objectives) ? j.objectives.filter((o): o is string => typeof o === 'string') : [],
      targetAudience: typeof j.targetAudience === 'string' ? j.targetAudience : '',
      prerequisites: typeof j.prerequisites === 'string' ? j.prerequisites : '',
      pedagogicalMethods: typeof j.pedagogicalMethods === 'string' ? j.pedagogicalMethods : '',
      pedagogicalSupport: typeof j.pedagogicalSupport === 'string'
        ? j.pedagogicalSupport
        : 'Un livret de formation sera remis à chaque participant en début de formation. Le formateur déroulera sa formation avec une présentation Canva projetée.',
      evaluationMethods: typeof j.evaluationMethods === 'string' ? j.evaluationMethods : '',
      trainerProfile: typeof j.trainerProfile === 'string' ? j.trainerProfile : '',
      accessibility: typeof j.accessibility === 'string' ? j.accessibility : '',
      accessConditions: typeof j.accessConditions === 'string' ? j.accessConditions : '',
      programMd: typeof j.programMd === 'string' ? j.programMd : '',
    };

    return { ok: true, draft, durationMs: r.durationMs };
  } catch (e: any) {
    return { ok: false, error: `Erreur Ollama : ${e?.message ?? e}` };
  }
}
