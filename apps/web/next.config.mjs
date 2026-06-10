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
    ];
  },
};

export default nextConfig;
