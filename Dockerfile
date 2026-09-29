# syntax=docker/dockerfile:1.7
# Multi-stage build for Next.js standalone output. Runs as non-root, applies migrations on start.

FROM node:24-alpine AS base
RUN corepack enable && apk add --no-cache libc6-compat wget
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time placeholders only: `next build` imports route modules that validate env. Real values come from Dokploy at runtime.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build \
    AUTH_SECRET=build-time-placeholder-secret-not-used-at-runtime-0000 \
    VOTER_SESSION_SECRET=build-time-placeholder-secret-not-used-at-runtime-0000 \
    SCREEN_CODE_SECRET=build-time-placeholder-0000
RUN pnpm prisma generate && pnpm build

# Self-contained Prisma CLI (hoisted, no pnpm symlinks) used only to run `migrate deploy` at container start.
FROM base AS migrator
WORKDIR /migrate
COPY --from=deps /app/node_modules/prisma/package.json ./prisma-version.json
# npm gives a flat node_modules (no pnpm symlinks) with the exact prisma version the app resolved.
RUN V=$(node -p "require('./prisma-version.json').version") \
 && npm init -y >/dev/null && npm install --omit=dev --no-audit --no-fund prisma@$V @prisma/config@$V
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=migrator --chown=app:app /migrate ./migrate
COPY --from=build --chown=app:app /app/scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
USER app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s CMD wget -qO- http://localhost:3000/api/health || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
