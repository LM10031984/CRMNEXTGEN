'use server';

/**
 * Devis monté depuis un compte rendu de rendez-vous.
 *
 * Idée de Laurent (28/08) : « je mets juste le nombre de jours et le tarif,
 * je colle mon retranscript, et j'ai un devis propre et explicatif qui
 * correspond à sa demande exacte — et qui me crée aussi un produit de
 * formation en draft ».
 *
 * Répartition des rôles, volontairement stricte :
 *  - le MODÈLE comprend le besoin et rédige l'argumentaire ;
 *  - l'ORGANISME chiffre. Les montants du devis viennent de `jours` et
 *    `tarifJourHT`, saisis ici, jamais du texte produit par l'IA. Le prompt le
 *    lui interdit, et cette action ne lui laisse de toute façon aucune prise
 *    sur les nombres.
 *
 * Ordre des opérations : rien n'est créé tant que l'extraction n'a pas abouti.
 * Un devis coquille vide chez un client est pire que pas de devis du tout.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { extraireDevisDuRdv } from '@/lib/quotes/rdv-extraction';
import { createQuote, addLine, updateQuote } from './quotes';
import { aiPreFillProduct } from './ai-fill-product';
import { createTrainingProduct } from './crud-edits';

export interface QuoteFromRdvResult {
  ok: boolean;
  quoteId?: string;
  number?: string;
  productId?: string;
  productCode?: string;
  /** Le devis est passé, le programme non — le premier reste utilisable. */
  productWarning?: string;
  error?: string;
}

/** 8 h = 1 journée (règle Start Academy) — devis et programme doivent concorder. */
const HEURES_PAR_JOUR = 8;

export async function createQuoteFromRdv(input: {
  recipientName: string;
  recipientContact?: string | null;
  recipientAddress?: string | null;
  recipientEmail?: string | null;
  recipientSiret?: string | null;
  /** Compte rendu du rendez-vous, collé tel quel. */
  transcript: string;
  jours: number;
  tarifJourHT: number;
  /** 0 par défaut : formation professionnelle exonérée de TVA. */
  vatRate?: number;
  modalite?: string | null;
  theme?: string | null;
  /** Crée aussi le programme, en brouillon. */
  creerProgramme?: boolean;
}): Promise<QuoteFromRdvResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  if (!input.recipientName?.trim()) return { ok: false, error: 'Nom du client requis.' };
  if (!input.transcript?.trim()) {
    return { ok: false, error: 'Collez le compte rendu du rendez-vous.' };
  }
  // Chiffrage : refusé plutôt qu'émis à zéro. Un devis part chez un client.
  if (!(input.jours > 0)) return { ok: false, error: 'Nombre de jours requis (supérieur à 0).' };
  if (!(input.tarifJourHT > 0)) {
    return { ok: false, error: 'Tarif journalier HT requis (supérieur à 0).' };
  }

  const besoin = await extraireDevisDuRdv(input.transcript, {
    jours: input.jours,
    tarifJourHT: input.tarifJourHT,
    client: input.recipientName,
    modalite: input.modalite,
  });
  if (!besoin) {
    return {
      ok: false,
      error:
        "Le compte rendu n'a pas pu être exploité (trop court, ou génération indisponible). Aucun devis n'a été créé — complétez le compte rendu et relancez.",
    };
  }

  const quote = await createQuote({
    recipientName: input.recipientName,
    recipientContact: input.recipientContact ?? null,
    recipientAddress: input.recipientAddress ?? null,
    recipientEmail: input.recipientEmail ?? null,
    recipientSiret: input.recipientSiret ?? null,
    title: besoin.intituleFormation,
  });
  // `ActionResult` porte `data` en optionnel : on ne présume pas de sa
  // présence, sans quoi un devis créé sans identifiant passerait inaperçu.
  if (!quote.ok || !quote.data) {
    return { ok: false, error: quote.ok ? 'Devis créé sans identifiant.' : quote.error };
  }

  const quoteId = quote.data.id;
  const quoteNumber = quote.data.number;

  await addLine({
    quoteId,
    description: besoin.descriptionLigne,
    quantity: input.jours,
    unitPriceHT: input.tarifJourHT,
    vatRate: input.vatRate ?? 0,
  });

  // L'argumentaire est ce que le client lit : contexte compris, réponse
  // proposée, déroulement. Il ne porte AUCUN montant (cf. prompt).
  await updateQuote({ quoteId, notes: besoin.argumentaire });

  const result: QuoteFromRdvResult = { ok: true, quoteId, number: quoteNumber };

  if (input.creerProgramme) {
    // Le programme est un CONFORT : son échec ne doit pas emporter le devis,
    // qui est déjà complet et envoyable.
    try {
      const heures = input.jours * HEURES_PAR_JOUR;
      const draft = await aiPreFillProduct({
        title: besoin.intituleFormation,
        theme: input.theme ?? null,
        durationHours: heures,
        // Les modules compris en rendez-vous font la SOURCE : l'IA les met en
        // forme, elle n'en invente pas d'autres pour remplir la durée.
        propositionClient: besoin.modules.join('\n'),
      });
      if (!draft.ok || !draft.draft) {
        result.productWarning = `Programme non généré : ${draft.error ?? 'erreur inconnue'}`;
      } else {
        const d = draft.draft;
        const produit = await createTrainingProduct({
          title: besoin.intituleFormation,
          durationHours: heures,
          priceHT: input.jours * input.tarifJourHT,
          theme: input.theme ?? null,
          objectives: d.objectives,
          programMd: d.programMd,
          targetAudience: d.targetAudience || besoin.publicConcerne,
          prerequisites: d.prerequisites,
          pedagogicalMethods: d.pedagogicalMethods,
          pedagogicalSupport: d.pedagogicalSupport,
          evaluationMethods: d.evaluationMethods,
          trainerProfile: d.trainerProfile,
          accessibility: d.accessibility,
          accessConditions: d.accessConditions,
          // Brouillon : il sort d'un compte rendu, personne ne l'a relu. Le
          // badge bloque la génération de conventions jusqu'à validation.
          aiDrafted: true,
        });
        if (produit.ok && produit.productId) {
          result.productId = produit.productId;
          result.productCode = produit.code;
          // Traçabilité : le devis pointe le programme qu'il vend.
          await prisma.quote.update({
            where: { id: quoteId },
            data: { sourceProductId: produit.productId },
          });
        } else {
          result.productWarning = `Programme non créé : ${produit.error ?? 'erreur inconnue'}`;
        }
      }
    } catch (e) {
      result.productWarning = `Programme non généré : ${(e as Error)?.message ?? e}`;
    }
  }

  revalidatePath('/app/devis');
  revalidatePath(`/app/devis/${quoteId}`);
  return result;
}
