import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Vitest config minimale pour apps/web — environnement node par défaut car
// la majorité des tests font de la lecture-source / regex et n'ont pas
// besoin de DOM. Un test individuel peut basculer en jsdom via
// `/* @vitest-environment jsdom */` (et alors le plugin React ci-dessous
// active automatiquement le JSX transform — sans ça, render() crashe sur
// « React is not defined » dans les composants qui utilisent le new JSX
// runtime).
export default defineConfig({
  plugins: [react()],
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
