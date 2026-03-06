# ──────────────────────────────────────────────
# Ringee Backend — Production Dockerfile
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
RUN pnpm --filter backend... build

# ── Final runner image ──
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Enable pnpm so we can invoke workspace scripts (e.g. prisma migrate deploy)
RUN corepack enable

# Copy root node_modules (preserves pnpm symlink structure)
COPY --from=builder /app/node_modules ./node_modules

# Copy built backend
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules

# Copy built packages
COPY --from=builder /app/packages ./packages

# Copy workspace config
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

USER node
EXPOSE 3000
# Run migrations before starting the server (idempotent — safe on already-migrated DBs)
CMD ["sh", "-c", "pnpm --filter @ringee/database db:deploy && node apps/backend/dist/apps/backend/src/main"]
