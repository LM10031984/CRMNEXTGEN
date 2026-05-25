import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Vitest config minimale pour apps/web — environnement node car les tests
// actuels font de la lecture-source / regex et n'ont pas besoin de DOM.
// Ajouter `environment: 'jsdom'` au cas par cas via /* @vitest-environment jsdom */
// si un test futur a besoin de rendre des composants React.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
