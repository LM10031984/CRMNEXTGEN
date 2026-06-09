import { defineConfig } from 'vitest/config';

// Vitest config minimale pour packages/db — environnement node.
// Tests ciblent les scripts d'import idempotents et helpers purs.
// Pas d'I/O réel : tous les tests mockent @qualiof/db et xlsx au besoin.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/__tests__/**/*.{test,spec}.ts', 'src/**/__tests__/**/*.{test,spec}.ts'],
  },
});
