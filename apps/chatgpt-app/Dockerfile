# Ringee ChatGPT App — MCP server image.
#
# This serves the MCP endpoint ChatGPT connects to. The visual components are
# inlined into the tool results, so this single service is all you deploy.
#
# Build from the REPO ROOT (it needs the pnpm workspace):
#   docker build -f apps/chatgpt-app/Dockerfile -t ringee-chatgpt-mcp .
#   docker run -p 4250:4250 --env-file apps/chatgpt-app/.env ringee-chatgpt-mcp
#
# ChatGPT connector URL → https://<your-host>/mcp

FROM node:20-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @ringee-io/chatgpt-app build:widgets

FROM node:20-slim AS run
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo /repo
WORKDIR /repo/apps/chatgpt-app
ENV NODE_ENV=production
ENV RINGEE_MCP_PORT=4250
EXPOSE 4250
# Healthcheck hits GET /health.
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+(process.env.RINGEE_MCP_PORT||4250)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "exec", "tsx", "src/server/serve.ts"]
