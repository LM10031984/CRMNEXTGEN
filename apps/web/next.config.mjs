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
    // Vercel serverless : les binaires natifs chargés dynamiquement (moteur
    // Prisma rhel, prebuild argon2 via node-gyp-build) vivent dans le store
    // pnpm à la racine du mono-repo et ne sont PAS tracés dans le bundle des
    // fonctions → PrismaClientInitializationError / « No native build was
    // found » au runtime. Copie forcée pour toutes les routes.
    // ⚠ Pas de `**` récursif dans le chemin : ça fait scanner tout le store
    // pnpm en phase « Collecting build traces » (build bloqué >10 min).
    // `@prisma+client*` / `argon2*` = un seul segment, simple listing de .pnpm.
    outputFileTracingIncludes: {
      '**': [
        '../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/*.node',
        '../../node_modules/.pnpm/argon2*/node_modules/argon2/prebuilds/linux-x64/*.node',
      ],
    },
  },
  transpilePackages: ['@qualiof/db', '@qualiof/shared'],
  // Redirects pour URLs "naturelles" tapées à la main par les utilisateurs.
  // Audit 2026-05-12 BUG-03 — voir CLAUDE.md > Routes (convention naming).
  async redirects() {
    return [
      // Inscriptions publiques par session (spec 2026-08-28). La route
      // canonique est /inscription/{jeton} au SINGULIER ; on rattrape le
      // pluriel tapé à la main. Attention : ne matche que la racine, jamais
      // /app/inscriptions qui est l'écran admin.
      {
        source: '/inscriptions/:token',
        destination: '/inscription/:token',
        permanent: true,
      },
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
