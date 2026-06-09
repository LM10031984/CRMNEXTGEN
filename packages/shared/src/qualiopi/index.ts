/**
 * Schémas + helpers Qualiopi (P0.2).
 *
 * Centralise les garde-fous de conformité applicables aux sorties LLM
 * avant écriture en BDD ou rendu PDF. Importé par les actions IA et les
 * workers de génération.
 */

export * from './bloom-verbs';
export * from './deroule-schema';
export * from './programme-schema';
