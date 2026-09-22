'use client';

/**
 * Générer un document en respectant le protocole de remplacement.
 *
 * POURQUOI CE MODULE EXISTE (21/09/2026)
 *
 * Le serveur refuse de remplacer une pièce engagée : il répond `ok: false` avec
 * `requiresConfirmation`, puis `requiresMotif` si l'engagement est PROUVÉ. Un
 * appelant qui ignore ces deux drapeaux ne voit qu'un échec, et l'utilisateur
 * un toast rouge incompréhensible — c'est ce que faisait le bouton
 * « Régénérer » de l'onglet Après.
 *
 * Le protocole est identique partout ; la formulation vient TOUJOURS du serveur,
 * seul à connaître le motif d'engagement. Le recopier dans chaque écran
 * garantissait qu'un écran finirait par l'oublier — la panne de composition du
 * lieu (trois copies, un refus AGEFICE le 28/08) a déjà coûté ce prix.
 *
 * `window.confirm` / `window.prompt` natifs, pas de Radix : dans une Dialog
 * Radix un clic peut rester sans effet (constat Laurent), et le protocole doit
 * fonctionner depuis n'importe quel écran.
 */

import { dispatchGenerateDoc } from '@/server/actions/dispatch-generate-doc';
import type {
  DispatchGenerateDocInput,
  DispatchResult,
} from '@/lib/sessions/dispatch-doc-types';

/**
 * @returns le résultat du serveur, ou `null` si l'utilisateur a RENONCÉ — un
 *   renoncement n'est pas une erreur et ne doit pas afficher de toast rouge.
 */
export async function dispatchGenerateDocAvecConfirmation(
  input: DispatchGenerateDocInput,
): Promise<DispatchResult | null> {
  let res = await dispatchGenerateDoc(input);

  // 1er refus : le document est sorti de la maison. On nomme pourquoi.
  if (!res.ok && res.requiresConfirmation && res.warning) {
    if (!window.confirm(res.warning)) return null;
    res = await dispatchGenerateDoc({ ...input, confirmEngaged: true });
  }

  // Engagement PROUVÉ : confirmer ne suffit pas, il faut écrire pourquoi. Le
  // motif part dans l'AuditLog et se relit six mois plus tard.
  if (!res.ok && res.requiresMotif && res.warning) {
    const motif = window.prompt(res.warning) ?? '';
    if (!motif.trim()) return null;
    res = await dispatchGenerateDoc({ ...input, confirmEngaged: true, motif });
  }

  return res;
}
