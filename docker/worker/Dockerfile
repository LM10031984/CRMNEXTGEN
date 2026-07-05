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
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

# --- Stage pruner : isole le sous-graphe @qualiof/web (deps + src filtrés) ---
FROM base AS pruner
WORKDIR /app
RUN pnpm add -g turbo@2.3.0
COPY . .
RUN turbo prune @qualiof/web --docker

# --- Stage installer : install depuis le lockfile filtré + client Prisma ---
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @qualiof/web exec prisma generate

# --- Stage runner : poppler + pm2 + lancement des 4 workers ---
FROM base AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils \
    && rm -rf /var/lib/apt/lists/*
RUN pnpm add -g pm2
COPY --from=installer /app .
COPY ecosystem.config.cjs ./
CMD ["pm2-runtime", "ecosystem.config.cjs"]
