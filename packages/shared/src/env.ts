/**
 * Validation des variables d'environnement via @t3-oss/env-nextjs.
 * Centralisé ici pour cohérence entre apps/web, apps/workers et scripts.
 *
 * Les apps/web qui utilisent Next.js peuvent enrichir avec leurs variables `client` propres.
 */

import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

/**
 * Schémas isolés exportés pour test unitaire (Phase 16 Plan 16-01).
 * Définis dans `./env-schemas` (module pur sans effet de bord) puis re-exportés
 * ici pour compat : `createEnv` ci-dessous valide TOUT l'env au chargement, donc
 * les tests importent depuis `env-schemas` pour rester hermétiques (pas de .env requis).
 */
// NB extension `.ts` explicite : le chokepoint boot (Phase 17) importe ce module
// via `await import('@qualiof/shared/env')` dans next.config.mjs, évalué par Node
// ESM BRUT (avant le bundler Next) — Node ESM exige une extension sur les imports
// relatifs. Node 20+/25 résout nativement le `.ts`. Next (transpilePackages) et
// Vitest (moduleResolution Bundler) acceptent aussi le `.ts` explicite.
export {
  AI_PROVIDER_SCHEMA,
  OPENROUTER_MODEL_FAST_SCHEMA,
  STORAGE_PROVIDER_SCHEMA,
  WEASYPRINT_URL_SCHEMA,
  DIRECT_URL_SCHEMA,
} from './env-schemas.ts';
import {
  AI_PROVIDER_SCHEMA,
  OPENROUTER_MODEL_FAST_SCHEMA,
  STORAGE_PROVIDER_SCHEMA,
  WEASYPRINT_URL_SCHEMA,
  DIRECT_URL_SCHEMA,
} from './env-schemas.ts';

export const sharedEnv = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url(),

    // Storage
    S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
    S3_REGION: z.string().default('us-east-1'),
    S3_ACCESS_KEY: z.string().default('qualiof'),
    S3_SECRET_KEY: z.string().default('qualiof_dev_minio'),
    S3_BUCKET_DOCS: z.string().default('qualiof-docs'),
    S3_BUCKET_TEMPLATES: z.string().default('qualiof-templates'),
    S3_FORCE_PATH_STYLE: z.string().default('true'),

    // Doc engine + Gotenberg
    GOTENBERG_URL: z.string().url().default('http://localhost:3001'),
    DOC_ENGINE_TOKEN: z.string().optional(),

    // Cloud v6 (Phase 17) — Supabase Postgres/Storage + WeasyPrint
    DIRECT_URL: DIRECT_URL_SCHEMA,                              // Prisma directUrl (schema.prisma:22) — requise
    STORAGE_PROVIDER: STORAGE_PROVIDER_SCHEMA,                  // 'minio' (défaut) | 'supabase'
    SUPABASE_URL: z.string().url().optional(),                 // requise en runtime si STORAGE_PROVIDER=supabase (throw storage.ts)
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),          // secret, idem
    WEASYPRINT_URL: WEASYPRINT_URL_SCHEMA,                      // moteur PDF secondaire réel (:5001), remplace l'alias mort du palier 3

    // Google Calendar OAuth (Phase 22 D-07) — portage cloud ; fallback files/secrets/ en dev local
    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
    GOOGLE_OAUTH_REFRESH_TOKEN: z.string().optional(),

    // IA
    AI_PROVIDER: AI_PROVIDER_SCHEMA,
    OLLAMA_URL: z.string().url().default('http://localhost:11434'),
    OLLAMA_MODEL_FAST: z.string().default('mistral-small:24b'),
    OLLAMA_MODEL_REASONING: z.string().default('qwen3:30b-a3b'),
    OLLAMA_MODEL_EMBED: z.string().default('nomic-embed-text:latest'),
    OLLAMA_MODEL_VISION: z.string().default('llama3.2-vision:11b'),
    ANTHROPIC_API_KEY: z.string().optional(),
    ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-7'),

    // OpenRouter (gateway cloud Claude — migration v6, lu par llm-client.ts)
    OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
    OPENROUTER_API_KEY: z.string().optional(),
    OPENROUTER_MODEL_FAST: OPENROUTER_MODEL_FAST_SCHEMA,
    OPENROUTER_MODEL_QUALITY: z.string().default('anthropic/claude-sonnet-4.6'),
    OPENROUTER_MODEL_VISION: z.string().default('anthropic/claude-haiku-4.5'),
    OPENROUTER_APP_NAME: z.string().default('QualiOF'),
    OPENROUTER_SITE_URL: z.string().url().default('http://localhost:3010'),

    // Qualiopi Gen (Supabase Edge Functions)
    QUALIOPI_GEN_URL: z.string().url().optional(),
    QUALIOPI_GEN_TOKEN: z.string().optional(),

    // Auth
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 chars (use `openssl rand -hex 32`)'),
    SESSION_LIFETIME: z.coerce.number().default(2_592_000),

    // SMTP
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional(),
    SMTP_SECURE: z.coerce.boolean().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().default('QualiOF <noreply@startacademy.fr>'),

    // Tenant default
    TENANT_DEFAULT_NAME: z.string().default('Start Academy'),
    TENANT_DEFAULT_NUM_DA: z.string().optional(),
    TENANT_DEFAULT_SIRET: z.string().optional(),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('debug'),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
    NEXT_PUBLIC_APP_NAME: z.string().default('QualiOF'),
    // Clés CLIENT Supabase Storage (upload direct-to-storage, Phase 18 STOR-03).
    // optional : le dev local MinIO n'en a pas besoin ; la validation d'usage réel
    // se fait au call site upload direct (throw si absent en mode supabase).
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
    // Environnement applicatif (Phase 21 APP-01) — staging = filigrane PDF +
    // bandeau UI + gardes sorties (calendar skip, MAIL_DRY_RUN). Inlinée au
    // build côté client, lue au runtime côté serveur — les deux via sharedEnv.
    NEXT_PUBLIC_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
    S3_SECRET_KEY: process.env.S3_SECRET_KEY,
    S3_BUCKET_DOCS: process.env.S3_BUCKET_DOCS,
    S3_BUCKET_TEMPLATES: process.env.S3_BUCKET_TEMPLATES,
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
    GOTENBERG_URL: process.env.GOTENBERG_URL,
    DOC_ENGINE_TOKEN: process.env.DOC_ENGINE_TOKEN,
    DIRECT_URL: process.env.DIRECT_URL,
    STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    WEASYPRINT_URL: process.env.WEASYPRINT_URL,
    GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_OAUTH_REFRESH_TOKEN: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    AI_PROVIDER: process.env.AI_PROVIDER,
    OLLAMA_URL: process.env.OLLAMA_URL,
    OLLAMA_MODEL_FAST: process.env.OLLAMA_MODEL_FAST,
    OLLAMA_MODEL_REASONING: process.env.OLLAMA_MODEL_REASONING,
    OLLAMA_MODEL_EMBED: process.env.OLLAMA_MODEL_EMBED,
    OLLAMA_MODEL_VISION: process.env.OLLAMA_MODEL_VISION,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
    OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL_FAST: process.env.OPENROUTER_MODEL_FAST,
    OPENROUTER_MODEL_QUALITY: process.env.OPENROUTER_MODEL_QUALITY,
    OPENROUTER_MODEL_VISION: process.env.OPENROUTER_MODEL_VISION,
    OPENROUTER_APP_NAME: process.env.OPENROUTER_APP_NAME,
    OPENROUTER_SITE_URL: process.env.OPENROUTER_SITE_URL,
    QUALIOPI_GEN_URL: process.env.QUALIOPI_GEN_URL,
    QUALIOPI_GEN_TOKEN: process.env.QUALIOPI_GEN_TOKEN,
    AUTH_SECRET: process.env.AUTH_SECRET,
    SESSION_LIFETIME: process.env.SESSION_LIFETIME,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_SECURE: process.env.SMTP_SECURE,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: process.env.SMTP_FROM,
    TENANT_DEFAULT_NAME: process.env.TENANT_DEFAULT_NAME,
    TENANT_DEFAULT_NUM_DA: process.env.TENANT_DEFAULT_NUM_DA,
    TENANT_DEFAULT_SIRET: process.env.TENANT_DEFAULT_SIRET,
    LOG_LEVEL: process.env.LOG_LEVEL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === 'true',
});
