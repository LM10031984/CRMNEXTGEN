/**
 * Validation des variables d'environnement via @t3-oss/env-nextjs.
 * Centralisé ici pour cohérence entre apps/web, apps/workers et scripts.
 *
 * Les apps/web qui utilisent Next.js peuvent enrichir avec leurs variables `client` propres.
 */

import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const sharedEnv = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url().optional(),

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
    DOC_ENGINE_URL: z.string().url().default('http://localhost:5000'),
    DOC_ENGINE_TOKEN: z.string().optional(),

    // IA
    AI_PROVIDER: z.enum(['mistral', 'anthropic', 'qualiopi-gen']).default('mistral'),
    MISTRAL_API_KEY: z.string().optional(),
    MISTRAL_MODEL_TEXT: z.string().default('mistral-large-latest'),
    MISTRAL_MODEL_VISION: z.string().default('pixtral-large-latest'),
    ANTHROPIC_API_KEY: z.string().optional(),
    ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-7'),

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
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
    S3_SECRET_KEY: process.env.S3_SECRET_KEY,
    S3_BUCKET_DOCS: process.env.S3_BUCKET_DOCS,
    S3_BUCKET_TEMPLATES: process.env.S3_BUCKET_TEMPLATES,
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
    GOTENBERG_URL: process.env.GOTENBERG_URL,
    DOC_ENGINE_URL: process.env.DOC_ENGINE_URL,
    DOC_ENGINE_TOKEN: process.env.DOC_ENGINE_TOKEN,
    AI_PROVIDER: process.env.AI_PROVIDER,
    MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
    MISTRAL_MODEL_TEXT: process.env.MISTRAL_MODEL_TEXT,
    MISTRAL_MODEL_VISION: process.env.MISTRAL_MODEL_VISION,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
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
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === 'true',
});
