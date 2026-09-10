'use client';

/**
 * Le tri des dossiers OPCO — ré-export du composant partagé
 * `components/ui/sortable-th.tsx`, avec les clés de CETTE table.
 *
 * Le composant a été généralisé le 2026-09-10 pour servir aussi la liste des
 * factures. Ce fichier reste pour garder ici le typage étroit : `SortKey` liste
 * les colonnes triables des dossiers OPCO, et `page.tsx` s'en sert pour
 * traduire `?sort=` en `orderBy` — une clé de la table des factures n'a rien à
 * faire dans ce `switch`.
 */

export { SortableTh } from '@/components/ui/sortable-th';
export type { SortDir } from '@/components/ui/sortable-th';

export type SortKey = 'date' | 'apprenant' | 'montant' | 'opco';
