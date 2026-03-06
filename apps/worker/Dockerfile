# ──────────────────────────────────────────────
# Ringee Worker — Production Dockerfile
# ──────────────────────────────────────────────
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ── Build everything in one stage ──
FROM base AS builder
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @ringee/database prisma:generate
RUN pnpm --filter @ringee/worker... build

# ── Final runner image ──
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy root node_modules (preserves pnpm symlink structure)
COPY --from=builder /app/node_modules ./node_modules

# Copy built worker
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder /app/apps/worker/node_modules ./apps/worker/node_modules

# Copy built packages
COPY --from=builder /app/packages ./packages

# Copy workspace config
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

USER node
CMD ["node", "apps/worker/dist/apps/worker/src/main"]
