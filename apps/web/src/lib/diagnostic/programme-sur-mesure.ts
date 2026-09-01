/**
 * Programme d'une journée SUR MESURE, assemblé à partir du programme réel du
 * catalogue et des réponses du prospect au diagnostic du stand.
 *
 * Règle du jeu, non négociable : **le modèle n'invente aucun contenu
 * pédagogique**. Il SÉLECTIONNE, ORDONNE et EXPLIQUE des points qui existent
 * déjà dans le `programMd` du produit. C'est ce qui permet d'envoyer un
 * programme différent à chaque prospect sans jamais promettre une journée que
 * Start Academy n'anime pas — et sans écart entre l'information préalable et la
 * prestation réalisée, qui serait une réserve en audit Qualiopi.
 *
 * L'ancrage n'est pas une intention, il est VÉRIFIÉ : chaque point retenu doit
 * revenir avec la ligne source exacte, et cette ligne doit se retrouver dans le
 * `programMd`. Un point qui ne s'ancre pas est jeté. Sous le seuil, on renonce
 * au sur-mesure et on envoie le programme du catalogue tel quel.
 */

import { z } from 'zod';
import { callLlm } from '@/lib/llm-client';
import { QUESTIONS, PROBLEMATIQUES, type ProblematiqueKey } from './questions';

/**
 * Termes bannis des programmes envoyés aux prospects.
 *
 * La PIGE est interdite depuis le 11/08/2026 (règle métier Laurent, 01/09/2026).
 * Aucune des 7 journées du diagnostic ne la mentionne aujourd'hui, mais 4 autres
 * produits du catalogue si : le jour où l'un d'eux entre dans le périmètre, ou
 * si le modèle la reformule de lui-même, le point doit être écarté. Un garde-fou
 * qui ne sert jamais coûte moins cher qu'un email de trop.
 */
const TERMES_BANNIS = [/\bpige\b/i, /\bpiger\b/i];

export function contientTermeBanni(s: string): boolean {
  return TERMES_BANNIS.some((re) => re.test(s));
}

/** Part minimale de points ancrés sous laquelle on refuse le sur-mesure. */
const SEUIL_ANCRAGE = 0.7;
/** En dessous, le programme est trop maigre pour être envoyé. */
const MIN_SEQUENCES = 3;

const PointSchema = z.object({
  /** Ligne EXACTE recopiée du programme source — sert à vérifier l'ancrage. */
  source: z.string().min(8),
  /** La même idée, formulée pour ce prospect. */
  texte: z.string().min(5).max(300),
});

const SequenceSchema = z.object({
  moment: z.enum(['MATIN', 'APRES_MIDI']),
  titre: z.string().min(3).max(120),
  pourquoiVous: z.string().min(10).max(300),
  points: z.array(PointSchema).min(1).max(8),
});

const ProgrammeSchema = z.object({
  accroche: z.string().min(20).max(600),
  objectifs: z.array(z.string().min(5).max(250)).min(3).max(6),
  sequences: z.array(SequenceSchema).min(MIN_SEQUENCES).max(6),
});

export type ProgrammeSurMesure = z.infer<typeof ProgrammeSchema>;

/** Normalisation pour comparer une ligne du modèle au programme source. */
function normaliser(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // diacritiques
    .replace(/[\u2019']/g, "'") // apostrophes typographiques vs droites
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Les réponses du prospect, en clair, pour le prompt. */
export function decrireReponses(reponses: Record<string, string>): string {
  return QUESTIONS.map((q) => {
    const choix = q.choix.find((c) => c.value === reponses[q.id]);
    return choix ? `- ${q.label} → ${choix.label}` : null;
  })
    .filter((l): l is string => l !== null)
    .join('\n');
}

const SYSTEM = `Tu assembles le programme d'UNE JOURNÉE de formation pour un professionnel de l'immobilier rencontré sur un salon.

RÈGLE ABSOLUE : tu n'inventes AUCUN contenu pédagogique. Chaque point que tu retiens doit exister dans le PROGRAMME SOURCE fourni. Tu recopies la ligne source exacte dans le champ "source", et tu la reformules pour ce prospect dans "texte". Si tu ne trouves pas de ligne source, tu ne mets pas le point.

Ce que tu personnalises :
- l'ACCROCHE : pourquoi cette journée, pour CETTE personne, à partir de ses réponses ;
- la SÉLECTION et l'ORDRE des points, selon ce qui lui coûte du temps et son niveau ;
- le "pourquoiVous" de chaque séquence : une phrase qui relie la séquence à sa situation.

Ce que tu ne touches pas : le fond pédagogique, la durée, le prix (n'en mentionne JAMAIS).

INTERDIT : le mot « pige » et ses dérivés. Cette pratique est interdite depuis le 11/08/2026. Si le programme source la mentionne, saute ce point.

Ton : vouvoiement, direct, concret, sans jargon ni superlatif commercial. Français.
Réponds en JSON strict, sans texte autour.`;

export interface EntreeSurMesure {
  reponses: Record<string, string>;
  dominante: ProblematiqueKey;
  produitTitre: string;
  produitObjectifs: string[];
  produitProgrammeMd: string;
}

export type ResultatSurMesure =
  | { ok: true; programme: ProgrammeSurMesure; ancrage: number }
  | { ok: false; raison: 'llm-error' | 'json-invalide' | 'ancrage-insuffisant'; detail?: string };

export async function genererProgrammeSurMesure(
  entree: EntreeSurMesure,
): Promise<ResultatSurMesure> {
  const probl = PROBLEMATIQUES[entree.dominante];

  const prompt = `PRIORITÉ IDENTIFIÉE PAR LE DIAGNOSTIC
${probl.titre}
${probl.accroche}

RÉPONSES DU PROSPECT
${decrireReponses(entree.reponses)}

FORMATION RETENUE (catalogue Start Academy)
${entree.produitTitre}

OBJECTIFS OFFICIELS
${entree.produitObjectifs.map((o) => `- ${o}`).join('\n')}

PROGRAMME SOURCE — c'est ton SEUL réservoir de contenu
${entree.produitProgrammeMd}

Assemble la journée pour ce prospect. Format JSON attendu :
{
  "accroche": "2 à 3 phrases",
  "objectifs": ["3 à 6 objectifs, dérivés des objectifs officiels"],
  "sequences": [
    {
      "moment": "MATIN" | "APRES_MIDI",
      "titre": "titre de la séquence",
      "pourquoiVous": "une phrase reliée à ses réponses",
      "points": [{ "source": "ligne EXACTE du programme source", "texte": "la même idée pour lui" }]
    }
  ]
}`;

  let brut: unknown;
  try {
    const r = await callLlm({
      tier: 'quality',
      systemPrompt: SYSTEM,
      prompt,
      jsonOutput: true,
      temperature: 0.4,
      maxTokens: 4000,
    });
    if (r.finishReason === 'length') {
      return { ok: false, raison: 'llm-error', detail: 'réponse coupée (maxTokens)' };
    }
    brut = r.parsedJson;
  } catch (e) {
    return { ok: false, raison: 'llm-error', detail: e instanceof Error ? e.message : String(e) };
  }

  const parsed = ProgrammeSchema.safeParse(brut);
  if (!parsed.success) {
    return { ok: false, raison: 'json-invalide', detail: parsed.error.issues[0]?.message };
  }

  const verdict = ancrerProgramme(parsed.data, entree.produitProgrammeMd);
  if (!verdict.ok) {
    return { ok: false, raison: 'ancrage-insuffisant', detail: verdict.detail };
  }
  return { ok: true, programme: verdict.programme, ancrage: verdict.ancrage };
}

/**
 * Jette tout point dont la ligne source ne se retrouve pas dans le programme du
 * catalogue, puis tranche.
 *
 * Séparé de l'appel au modèle pour être testable sans réseau : c'est LA garde
 * qui empêche d'envoyer à un prospect une journée que Start Academy n'anime pas.
 */
export function ancrerProgramme(
  candidat: ProgrammeSurMesure,
  programmeMd: string,
):
  | { ok: true; programme: ProgrammeSurMesure; ancrage: number }
  | { ok: false; ancrage: number; detail: string } {
  const sourceNorm = normaliser(programmeMd);
  let total = 0;
  let ancres = 0;

  const sequences = candidat.sequences
    .map((seq) => {
      const points = seq.points.filter((pt) => {
        total += 1;
        // Un terme banni disqualifie le point même s'il est parfaitement ancré :
        // le programme source peut le contenir, l'email non.
        if (contientTermeBanni(pt.texte) || contientTermeBanni(pt.source)) return false;
        const ok = sourceNorm.includes(normaliser(pt.source));
        if (ok) ancres += 1;
        return ok;
      });
      return { ...seq, points };
    })
    .filter((seq) => seq.points.length > 0);

  const ancrage = total === 0 ? 0 : ancres / total;
  const detail = `${ancres}/${total} points ancrés, ${sequences.length} séquence(s)`;

  if (ancrage < SEUIL_ANCRAGE || sequences.length < MIN_SEQUENCES) {
    return { ok: false, ancrage, detail };
  }
  return { ok: true, programme: { ...candidat, sequences }, ancrage };
}

/** Exporté pour les tests — la vérification d'ancrage sans appel réseau. */
export const _internes = { normaliser, ProgrammeSchema, SEUIL_ANCRAGE, MIN_SEQUENCES };

/**
 * Lecture DÉFENSIVE de `DiagnosticSubmission.personnalisation`.
 *
 * Ce champ est un `Json` : il contient soit `{ ancrage, programme }` quand le
 * sur-mesure a abouti, soit `{ ancrage: 0, repliCatalogue: true, raison }` quand
 * on est retombé sur le programme du catalogue. Il peut aussi contenir la forme
 * d'une version antérieure du code — d'où la validation, plutôt qu'un cast.
 *
 * Sert à la fiche du lead : au téléphone, Laurent doit avoir sous les yeux
 * EXACTEMENT ce que le prospect a reçu.
 */
export function lirePersonnalisation(json: unknown): {
  programme: ProgrammeSurMesure | null;
  ancrage: number | null;
  repliCatalogue: boolean;
  raison: string | null;
} {
  const vide = { programme: null, ancrage: null, repliCatalogue: false, raison: null };
  if (!json || typeof json !== 'object') return vide;

  const o = json as Record<string, unknown>;
  const parsed = ProgrammeSchema.safeParse(o.programme);
  return {
    programme: parsed.success ? parsed.data : null,
    ancrage: typeof o.ancrage === 'number' ? o.ancrage : null,
    repliCatalogue: o.repliCatalogue === true,
    raison: typeof o.raison === 'string' ? o.raison : null,
  };
}
