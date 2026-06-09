/**
 * Configuration Vitest — résolution de l'alias `@/*` pour les tests.
 *
 * Avant Sprint 3 il n'y avait pas de vitest.config et les tests utilisaient
 * uniquement des imports relatifs (`../foo`). Pour les nouveaux tests qui
 * touchent des modules qui s'appuient sur l'alias `@/`, on doit le résoudre
 * explicitement ici (Vitest ne lit pas tsconfig.json paths par défaut).
 */

import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
