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
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [animate],
};

export default config;
