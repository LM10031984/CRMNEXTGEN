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
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Ombres "Premium SaaS" teintées bleu marine (charte Start Academy).
        // Renforcées pour un rendu Stripe/Linear/Vercel marqué.
        'soft': '0 1px 2px 0 rgba(15, 23, 42, 0.06), 0 1px 8px -1px rgba(15, 23, 42, 0.08)',
        'card': '0 4px 16px -4px rgba(6, 81, 237, 0.12), 0 2px 6px -2px rgba(15, 23, 42, 0.06)',
        'card-hover': '0 12px 32px -8px rgba(6, 81, 237, 0.20), 0 4px 12px -4px rgba(15, 23, 42, 0.08)',
        'elevated': '0 20px 50px -12px rgba(6, 81, 237, 0.25), 0 8px 24px -6px rgba(15, 23, 42, 0.10)',
        'glow': '0 0 0 1px rgba(6, 81, 237, 0.08), 0 8px 24px -4px rgba(6, 81, 237, 0.16)',
      },
    },
  },
  plugins: [animate],
};

export default config;
