/**
 * Devis rédigé depuis un compte rendu de rendez-vous.
 *
 * Idée de Laurent (28/08) : « on revient de RDV avec un retranscript et les
 * besoins du client ; je mets juste le nombre de jours et le tarif, je colle
 * mon retranscript, et j'ai un devis propre et explicatif qui correspond à sa
 * demande exacte ».
 *
 * Le compte rendu est du VERBATIM : digressions, hésitations, phrases coupées,
 * sujets abandonnés en cours de route. On en EXTRAIT le besoin — on ne le
 * recopie pas. C'est pour cela que cette étape est séparée de la mise en forme
 * du programme : transcrire directement un verbatim en programme y ferait
 * entrer les digressions du rendez-vous.
 *
 * Ce que le modèle n'a PAS le droit de faire, et qui est répété dans le
 * prompt : inventer un chiffre, une date, un effectif ou un montant. Les
 * montants d'un devis viennent de ce que Laurent saisit — jamais du modèle.
 *
 * MODULE NEUTRE : ni 'use server' ni 'use client'.
 */

import { z } from 'zod';
import { callLlm } from '@/lib/llm-client';

export const BesoinRdvSchema = z.object({
  /** Intitulé de la formation, tel qu'il apparaîtra sur le devis. */
  intituleFormation: z.string().min(5),
  /** Le client et sa situation, en 2-4 phrases, tirés du compte rendu. */
  contexteClient: z.string().min(30),
  /** Ce que le client a exprimé comme besoin, dans ses termes. */
  besoins: z.array(z.string()).min(1),
  /** Ce qu'il doit savoir faire à l'issue. */
  objectifs: z.array(z.string()).min(1),
  /** Modules proposés — base du programme si Laurent demande sa création. */
  modules: z.array(z.string()).min(1),
  publicConcerne: z.string().min(5),
  /** Libellé de la ligne de prestation du devis. */
  descriptionLigne: z.string().min(10),
  /** Texte adressé au client : contexte, réponse proposée, déroulement. */
  argumentaire: z.string().min(120),
});

export type BesoinRdv = z.infer<typeof BesoinRdvSchema>;

const SYSTEM_PROMPT_DEVIS_RDV = `Tu es responsable commercial d'un organisme de formation professionnelle certifié Qualiopi. Tu rédiges une proposition à partir du COMPTE RENDU d'un rendez-vous client.

CE QU'EST LE DOCUMENT SOURCE : un verbatim de conversation — digressions, hésitations, sujets abandonnés en cours de route, parfois plusieurs interlocuteurs. Tu en EXTRAIS le besoin de formation ; tu ne le recopies pas et tu ne commentes pas le déroulement du rendez-vous.

RÈGLE ABSOLUE — N'INVENTE RIEN :
- aucun chiffre, aucun montant, aucun tarif, aucune remise : les montants du devis sont saisis par l'organisme, pas par toi. N'écris AUCUN prix dans l'argumentaire ;
- aucune date, aucun effectif, aucun nom qui ne soit pas dans le compte rendu ;
- aucun besoin que le client n'a pas exprimé. Si un point reste flou dans le compte rendu, reste général plutôt que d'inventer un détail crédible.

RÈGLE ABSOLUE — AUCUNE PROMESSE DE RÉSULTAT :
Tu décris ce que la formation permet de TRAVAILLER et ce que les participants sauront FAIRE. Tu ne garantis jamais une performance commerciale, un gain chiffré ou un résultat (« vous doublerez vos ventes », « +30 % de mandats » sont INTERDITS) : une promesse de résultat engage l'organisme au-delà du réel et n'a rien à faire dans un devis.

TON : vouvoiement, professionnel, concret, orienté terrain. Jamais de superlatifs commerciaux ni de jargon creux. L'argumentaire reprend les mots du client — il doit se reconnaître.

L'argumentaire est structuré en trois temps, sans titres de section :
1. ce que le client nous a exposé (sa situation, ses contraintes) ;
2. ce que nous proposons en réponse, et pourquoi ce format ;
3. comment se déroule la formation (modalité, rythme, ce que repartent avec les participants).

Réponds UNIQUEMENT en JSON, sans markdown ni texte autour :
{
  "intituleFormation": "string (intitulé métier, sans mention de durée ni de prix)",
  "contexteClient": "string (2-4 phrases : qui est le client, sa situation, ce qui motive la demande)",
  "besoins": ["string", ...] (ce que le client a exprimé, dans SES termes),
  "objectifs": ["string", ...] (3-5, à l'infinitif, ce que les participants sauront faire),
  "modules": ["string", ...] (3-8 modules qui couvrent les besoins — ils serviront de base au programme),
  "publicConcerne": "string (qui est formé, tel qu'annoncé en rendez-vous)",
  "descriptionLigne": "string (libellé de la ligne de devis : intitulé + durée en jours et en heures)",
  "argumentaire": "string (le texte adressé au client, 3 paragraphes, AUCUN montant)"
}`;

export interface ParametresCommerciaux {
  /** Nombre de jours vendus, saisi par l'organisme. */
  jours: number;
  /** Tarif journalier HT, saisi par l'organisme. */
  tarifJourHT: number;
  /** Nom du client, s'il est déjà connu. */
  client?: string | null;
  modalite?: string | null;
}

/**
 * Extrait le besoin et rédige l'argumentaire. Renvoie `null` si le compte rendu
 * est vide ou si le modèle rend un JSON hors format — un devis à moitié inventé
 * est pire qu'un devis absent : il part chez un client.
 */
export async function extraireDevisDuRdv(
  transcript: string,
  params: ParametresCommerciaux,
): Promise<BesoinRdv | null> {
  const compteRendu = (transcript ?? '').trim();
  if (compteRendu.length === 0) return null;

  // 8 h = 1 journée (règle Start Academy) — la durée annoncée au client doit
  // être cohérente entre le devis et le futur programme.
  const heures = params.jours * 8;
  const prompt = `Rédige la proposition à partir du compte rendu ci-dessous.

PARAMÈTRES COMMERCIAUX (saisis par l'organisme — à REPRENDRE tels quels, jamais à recalculer ni à discuter) :
- Nombre de jours vendus : ${params.jours} (soit ${heures} heures)
- Tarif journalier HT : ${params.tarifJourHT} €
${params.client ? `- Client : ${params.client}\n` : ''}${params.modalite ? `- Modalité : ${params.modalite}\n` : ''}
COMPTE RENDU DU RENDEZ-VOUS :
${compteRendu}`;

  const r = await callLlm({
    tier: 'quality',
    systemPrompt: SYSTEM_PROMPT_DEVIS_RDV,
    prompt,
    jsonOutput: true,
    temperature: 0.3,
    maxTokens: 3000,
  });

  const parsed = BesoinRdvSchema.safeParse(r?.parsedJson);
  if (!parsed.success) {
    console.warn('[rdv-extraction] JSON hors format :', parsed.error.issues.map((i) => i.path.join('.')).join(', '));
    return null;
  }
  return parsed.data;
}
