import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Charge .env depuis la racine du mono-repo, puis .env.local en override.
// Convention Next.js standard : .env.local pour les secrets/overrides locaux
// non-commit (clés OpenRouter, DB locale, ports custom...). Sans override:true,
// dotenv ne réécrit pas une variable déjà set par .env — d'où l'AI_PROVIDER
// qui restait "ollama" même si .env.local disait "openrouter".
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '../../.env') });
loadEnv({ path: path.resolve(__dirname, '../../.env.local'), override: true });

// Chokepoint fail-loud (Phase 17) : force createEnv() de @qualiof/shared/env à
// s'exécuter au boot. Sans cet import, sharedEnv n'était chargé nulle part et la
// validation t3-env ne tournait jamais (CLAUDE.md « fail loud » était fictif).
// Une des 5 clés cloud manquante/malformée fait désormais échouer next build/dev.
// `await import` dynamique (pas import statique en tête) : dotenv doit avoir chargé
// .env AVANT que createEnv lise process.env, sinon l'env serait vide.
await import('@qualiof/shared/env');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
    serverActions: {
      // Upload public pré-inscription : CNI/RIB/CFP scannés peuvent peser 3-8 Mo.
      // Le serveur autorise 10 Mo / fichier × 3 fichiers + champs déclaratifs.
      bodySizeLimit: '40mb',
    },
  },
  transpilePackages: ['@qualiof/db', '@qualiof/shared'],
  // Redirects pour URLs "naturelles" tapées à la main par les utilisateurs.
  // Audit 2026-05-12 BUG-03 — voir CLAUDE.md > Routes (convention naming).
  async redirects() {
    return [
      {
        source: '/app/pre-inscriptions',
        destination: '/app/preinscriptions',
        permanent: true,
      },
      {
        source: '/app/pre-inscriptions/:path*',
        destination: '/app/preinscriptions/:path*',
        permanent: true,
      },
      // Phase 12 D-02 reverse alias : route admin renommée
      // `/app/preinscriptions(/:path*)` → `/app/inscriptions(/:path*)`.
      // La chaîne `pre-inscriptions → preinscriptions → inscriptions` est OK
      // pour le browser (Next.js résout les redirect chains en double-hop ;
      // les bookmarks utilisateurs aboutissent à `/app/inscriptions` au final).
      {
        source: '/app/preinscriptions',
        destination: '/app/inscriptions',
        permanent: true,
      },
      {
        source: '/app/preinscriptions/:path*',
        destination: '/app/inscriptions/:path*',
        permanent: true,
      },
      {
        source: '/app/modeles',
        destination: '/app/templates',
        permanent: true,
      },
      {
        source: '/app/modeles/:path*',
        destination: '/app/templates/:path*',
        permanent: true,
      },
      // quick 260620-d42 : variante naturelle tapée à la main pour le Pilotage
      // Direction (PROJECT.md BUG-03). Pas d'accent dans les URLs.
      {
        source: '/app/pilotage-direction',
        destination: '/app/pilotage',
        permanent: true,
      },
      {
        source: '/app/pilotage-direction/:path*',
        destination: '/app/pilotage/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
