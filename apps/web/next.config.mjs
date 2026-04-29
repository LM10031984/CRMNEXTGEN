import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Charge .env depuis la racine du mono-repo
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '../../.env') });

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
};

export default nextConfig;
