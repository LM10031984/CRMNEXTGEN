# QualiOF — image du 3ᵉ hôte (service "worker" Railway).
#
# Monorepo prune (turbo prune @qualiof/web) + poppler (pdftoppm, OCR PDF
# scannés) + pm2 (mode runtime PID-1) qui supervise 4 workers dans un conteneur :
#   closure (Postgres SKIP LOCKED) · veille (croner) · relances (croner) · OCR (poll)
#
# node:20-slim = Debian/glibc (Pitfall 5 RESEARCH) : le binaire Prisma généré
# matche la libc du runner, et poppler s'installe proprement via apt (ARM64/x64).
# Pas de `next build` : tsx exécute directement les .ts des workers.
#
# Source Dockerfile : https://turborepo.dev/docs/guides/tools/docker (vérifié 2026-07-05)

FROM node:20-slim AS base
# PNPM_HOME + PATH AVANT tout `pnpm add -g` : sur node:20-slim, pnpm (via corepack)
# n'a pas de global bin dir configure -> `pnpm add -g` echoue
# `ERR_PNPM_NO_GLOBAL_BIN_DIR` (revele au build Railway, 20-05). On fixe l'env
# global une fois pour toutes les stages heritant de `base`.
ENV PNPM_HOME="/pnpm"
ENV PATH="/pnpm:$PATH"
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate && mkdir -p /pnpm

# --- Stage pruner : isole le sous-graphe @qualiof/web (deps + src filtrés) ---
FROM base AS pruner
WORKDIR /app
RUN pnpm add -g turbo@2.3.0
COPY . .
RUN turbo prune @qualiof/web --docker

# --- Stage installer : install depuis le lockfile filtré + client Prisma ---
FROM base AS installer
WORKDIR /app
# openssl AVANT `prisma generate` : sinon Prisma ne detecte pas libssl et
# telecharge le moteur openssl-1.1.x (mismatch avec le runner bookworm en 3.0.x).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# Le client Prisma vit dans @qualiof/db (schema packages/db/prisma/schema.prisma),
# PAS @qualiof/web (revele au build Railway, 20-05). pnpm 10 saute aussi le
# postinstall de @prisma/client ("Ignored build scripts") -> on genere
# explicitement. `pnpm exec` depuis le dossier du package resout le binaire
# `prisma` (devDep de @qualiof/db) sans passer par le script `db:generate`
# (qui charge un ../../.env absent de l'image).
RUN cd packages/db && pnpm exec prisma generate

# --- Stage runner : poppler + pm2 + lancement des 4 workers ---
FROM base AS runner
WORKDIR /app
# poppler-utils = pdftoppm (OCR PDF scannes). openssl = requis par le moteur
# Prisma (sinon warning "failed to detect libssl" au generate + risque runtime).
# ca-certificates = TLS sortant (Supabase pooler, OpenRouter, SMTP OVH).
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# pm2 (superviseur) + tsx GLOBAL : ecosystem.config.cjs lance les workers avec
# `interpreter: 'tsx'`. Sans tsx sur le PATH global, pm2 ne resout pas
# l'interpreter (tsx n'est qu'en devDep locale de @qualiof/web). On l'installe
# global pour garantir la resolution PID-1 (fallback prevu au commentaire ecosystem).
RUN pnpm add -g pm2 tsx
COPY --from=installer /app .
COPY ecosystem.config.cjs ./
# turbo prune n'embarque PAS tsconfig.base.json à la racine du sous-graphe
# (révélé au smoke conteneur 20-05). apps/web/tsconfig.json fait
# `extends: '../../tsconfig.base.json'` → sans ce fichier, tsx échoue
# `File '../../tsconfig.base.json' not found` et n'applique pas les `paths` (@/*).
# On le copie explicitement depuis le contexte de build (racine repo) vers /app.
COPY tsconfig.base.json ./
CMD ["pm2-runtime", "ecosystem.config.cjs"]
