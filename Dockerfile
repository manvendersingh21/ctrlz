# syntax=docker/dockerfile:1

# ctrlz — multi-stage build producing a minimal, non-root runtime image
# using Next.js `output: "standalone"` (next.config.ts).

FROM node:22-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# libc6-compat: commonly needed by native deps on alpine
RUN apk add --no-cache libc6-compat \
    && corepack enable pnpm

# ---- install dependencies (layer-cached on lockfile) --------------------
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# pnpm version is resolved from `packageManager` in package.json via corepack
RUN pnpm install --frozen-lockfile

# ---- build ---------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ---- runtime --------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN apk add --no-cache libc6-compat

# standalone server already pins its dependency tree; copy static assets in
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:${PORT}/api/health || exit 1

CMD ["node", "server.js"]
