/**
 * Phase 15 Lot 2 (15-02) — Helpers NEUTRES de l'onglet « Après ».
 *
 * Module SANS `'use client'` : ces fonctions pures sont utilisées par le
 * composant client `<TabApres>` ET par le test pur `doc-completion-source`.
 * Garder ça hors d'un module `'use client'` évite la frontière RSC
 * (une fonction exportée d'un module client devient une référence proxy non
 * appelable côté serveur).
 *
 * Garde-fou source unique (LOCKED CONTEXT + Laurent 2026-06-05) : le compteur
 * « manquants » de l'onglet Après DOIT dériver de `docCompletion`, JAMAIS d'un
 * recompte local. `apresMissingCount` n'est qu'un alias typé qui délègue.
 */

import { docCompletion, type CompletionItem } from '@/lib/sessions/doc-completion';

/**
 * Nombre de docs « manquants » pour l'onglet Après — DÉLÈGUE à `docCompletion`
 * (même source que la matrice et les step blocks). Ne pas réimplémenter.
 */
export function apresMissingCount(items: ReadonlyArray<CompletionItem>): number {
  return docCompletion(items).missing;
}
