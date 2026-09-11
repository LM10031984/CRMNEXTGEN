import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // Charte Start Academy (issue de Qualiopi Gen)
        primary: {
          DEFAULT: '#00527A',
          /**
           * ⚠ CETTE CLÉ MANQUAIT, ET C'EST UN BUG D'ACCESSIBILITÉ (Laurent,
           * 11/09/2026).
           *
           * `text-primary-foreground` est une convention shadcn recopiée dans
           * une douzaine de composants de ce dépôt, alors que le jeton n'y a
           * jamais été défini. Tailwind la résout en
           * `colors.primary.foreground` : le `foreground: '#0F172A'` ci-dessous
           * est un FRÈRE de `primary`, jamais son enfant. La classe ne
           * produisait donc AUCUNE règle CSS, et le texte des boutons primaires
           * héritait du gris ardoise ambiant — 2,12:1 sur le bleu Start
           * Academy, très en dessous du seuil AA de 4,5:1.
           *
           * Blanc sur #00527A = 8,44:1 (AAA). Définir la clé répare d'un coup
           * tous les composants qui portent la classe, sans en toucher aucun.
           */
          foreground: '#FFFFFF',
          50: '#E6F0F5',
          100: '#CCE1EB',
          500: '#00527A',
          600: '#004161',
          700: '#003049',
          900: '#001824',
        },
        background: '#FAFBFC',
        foreground: '#0F172A',
        muted: {
          DEFAULT: '#F1F5F9',
          foreground: '#64748B',
        },
        border: '#E2E8F0',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [animate],
};

export default config;
