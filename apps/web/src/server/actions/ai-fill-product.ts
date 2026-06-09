'use server';

/**
 * Pré-remplit les champs Qualiopi d'un produit de formation Start Academy
 * via le LLM configuré (profil 'text', cf ai-config.ts).
 *
 * Utilise un prompt few-shot calibré sur les 3 modèles DOCX réels de
 * Laurent (Maitrisez l'IA en 3 jours, Management & performance, Immobilier
 * 2h/jour) pour reproduire le style, les sections, le ton et les phrases
 * récurrentes spécifiques à Start Academy.
 *
 * Coût : ~3-10 sec via OpenRouter.
 */

import { validateRequest } from '@/lib/auth';
import { callLlm } from '@/lib/ai-llm';

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

const SYSTEM_PROMPT = `Tu es un rédacteur expert de programmes de formation Qualiopi pour Start Academy, organisme de formation spécialisé dans l'immobilier (Cagnes sur Mer, 06800).

RÈGLES ABSOLUES :
- Réponds UNIQUEMENT en JSON valide, sans aucun texte avant ou après
- Le ton est professionnel, clair, orienté terrain — JAMAIS commercial ou marketing
- Tu reproduis fidèlement la structure et les formulations des modèles Start Academy
- Tu ne réinventes pas le format : sections en MAJUSCULES, phrases standard récurrentes, pas d'emojis
- Tu adaptes au thème (immobilier, IA, management, prospection, …) en restant cohérent

⚠ RÈGLE HORAIRES STRICTES — NE JAMAIS VIOLER (BUG-2) :

1. **Durée totale respectée à la minute près** : la somme des durées de TOUS les blocs (hors pauses) DOIT être strictement égale au nombre d'heures de la formation. Si tu génères 8h, le programme contient 8h de contenu effectif. Pas 6h, pas 7h, pas 9h. EXACTEMENT le total.

2. **Découpage horaire OBLIGATOIRE pour une journée de 8h (35h/semaine = standard Code du travail FR)** :
   - 9h00 – 10h30 : 1er bloc (1h30)
   - 10h30 – 10h45 : **pause café matin** (15 min — Art. L3121-33 Code du travail)
   - 10h45 – 12h15 : 2ème bloc (1h30)
   - 12h15 – 13h45 : **pause déjeuner** (1h30 — usage formation pro)
   - 13h45 – 15h15 : 3ème bloc (1h30)
   - 15h15 – 15h30 : **pause café après-midi** (15 min)
   - 15h30 – 17h30 : 4ème bloc (2h) — total cumulé 8h00
   Soit 4 blocs de cours (1h30 × 3 + 2h) = 6h30 ? NON c'est faux. Compte bien : 4 blocs × ~1h30-2h = 8h.
   Si la durée diffère (4h, 6h, 7h, 14h, 21h, etc.), adapte le découpage en respectant : 1 pause café toutes les 4h max + 1 pause déjeuner si > 5h.

3. **Format obligatoire des blocs horaires** dans \`programMd\` :
   - Bloc cours : \`### 9h00 – 10h30 (1h30) | Titre du bloc\` puis 5-8 puces concrètes
   - Pause : \`### 10h30 – 10h45 | Pause café\` (ligne unique, pas de puces)
   - Pause déjeuner : \`### 12h15 – 13h45 | Pause déjeuner\` (ligne unique)
   Les pauses DOIVENT apparaître explicitement avec leur horaire.

4. **Niveau de détail par bloc** scaler avec la durée totale :
   - Formation 8h (1 jour) : 5-8 puces par bloc, mini-ateliers concrets, exemples sectoriels
   - Formation 14-21h (2-3 jours) : 6-10 puces par bloc, montée en compétence visible jour après jour
   - Formation 35h+ (5 jours+) : 8-12 puces par bloc, ateliers longs, cas pratiques, livrables intermédiaires

5. **Validation que tu fais avant de répondre** : recompte les durées de chaque bloc cours (hors pauses). La somme DOIT égaler le total demandé. Si erreur, reprends.

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

RÈGLES DE FORMAT TRÈS IMPORTANTES :

1. "objectives" est un TABLEAU DE CHAÎNES (string[]). Chaque chaîne est UN objectif court (max 30 mots), commençant par un VERBE D'ACTION à l'infinitif (Comprendre, Maîtriser, Identifier, Analyser, Élaborer, Intégrer, Utiliser…). NE JAMAIS commencer un objectif par "À l'issue de la formation" — cette phrase est intro, pas répétée dans chaque puce.

2. "programMd" est une SEULE CHAÎNE de texte au format Markdown (PAS un objet, PAS un tableau). Format selon durée :
   - <= 8h : format horaire avec sections "## 9h00 – 10h30 | Titre" puis listes "- puce"
   - 14h à 28h : format "## Jour 1 : Sous-titre" puis "### Matin (9h-12h)" / "### Après-midi (14h-18h)" puis listes
   - > 28h : format Jour avec sous-thèmes répartis dans la journée

3. "evaluationMethods" : multilignes commençant par "- " — émargement demi-journée, certificat, QCM final, satisfaction stagiaire.

4. "accessibility" : reprend systématiquement "La loi du 5 septembre 2018..." comme phrase d'ouverture.

5. "accessConditions" : commence par "Afin de vous inscrire à notre formation, merci de contacter minimum 14 jours avant le début de la formation." puis convention 7 jours avant, puis subrogation paiement.

Retourne EXCLUSIVEMENT le JSON ci-dessous (aucun texte avant ou après, pas de code fence) :
{
  "objectives": ["Comprendre les fondamentaux de…", "Maîtriser l'utilisation de…", "Identifier les opportunités…", "Élaborer un plan d'action…"],
  "targetAudience": "Description du public visé en 1-3 lignes",
  "prerequisites": "Description courte ou 'Aucun prérequis spécifique.'",
  "pedagogicalMethods": "La formation se déroule en présentiel.\\nLes formateurs proposeront des mises en situation professionnelles…",
  "pedagogicalSupport": "Un livret de formation sera remis à chaque participant en début de formation. Le formateur déroulera sa formation avec une présentation Canva projetée.",
  "evaluationMethods": "- Une liste d'émargement est à signer à la demi-journée.\\n- Un certificat de réalisation sera délivré à chaque participant à la fin de la formation.\\n- Une évaluation sous forme de QCM aura lieu en fin de formation.\\n- Évaluation de la satisfaction stagiaire et montée en compétences.",
  "trainerProfile": "Tous les formateurs de l'équipe Start Academy ont minimum 8 années d'expérience dans l'immobilier…",
  "accessibility": "La loi du 5 septembre 2018 pour la « liberté de choisir son avenir professionnel »…\\nNotre organisme tente de donner à tous les mêmes chances…",
  "accessConditions": "Afin de vous inscrire à notre formation, merci de contacter minimum 14 jours avant le début de la formation.\\nUne fois votre inscription validée, nous vous adresserons une convention de formation et une convocation vous sera envoyée par mail 7 jours avant le début de la formation.\\nEn cas de subrogation de paiement, un accord du financeur doit nous être parvenu avec le début de la formation.",
  "programMd": "## Jour 1 : Titre\\n### Matin (9h-12h)\\n- Point 1\\n- Point 2\\n\\n### Après-midi (14h-18h)\\n- Point 3\\n- Point 4"
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
    const r = await callLlm({
      profile: 'text',
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

    // Nettoyage défensif : certains modèles répètent "À l'issue de la
    // formation le stagiaire sera capable de :" en préfixe de chaque
    // objectif, on l'enlève. Et les puces qui commencent par - ou • aussi.
    const cleanObjective = (s: string): string =>
      s
        .replace(/^[-•*]\s*/, '')
        .replace(/^À l['']issue de la formation,?\s+le stagiaire sera capable de\s*:?\s*/i, '')
        .trim();

    // Si le modèle a renvoyé programMd comme un objet/tableau au lieu d'une
    // chaîne, on tente une conversion best-effort.
    const stringifyProgramMd = (v: unknown): string => {
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) {
        return v
          .map((day: any) => {
            const title = day?.jour ?? day?.title ?? '';
            const sections = Array.isArray(day?.sections) ? day.sections : [];
            const body = sections
              .map((sec: any) => {
                const secTitle = sec?.titre ?? sec?.title ?? '';
                const items = Array.isArray(sec?.points) ? sec.points : Array.isArray(sec?.items) ? sec.items : [];
                return `### ${secTitle}\n${items.map((p: string) => `- ${p}`).join('\n')}`;
              })
              .join('\n\n');
            return `## ${title}\n${body}`;
          })
          .join('\n\n');
      }
      return '';
    };

    const draft: AiProductDraft = {
      objectives: Array.isArray(j.objectives)
        ? j.objectives
            .filter((o): o is string => typeof o === 'string')
            .map(cleanObjective)
            .filter(Boolean)
        : [],
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
      programMd: stringifyProgramMd(j.programMd),
    };

    return { ok: true, draft, durationMs: r.durationMs };
  } catch (e: any) {
    return { ok: false, error: `Erreur Mistral : ${e?.message ?? e}` };
  }
}
