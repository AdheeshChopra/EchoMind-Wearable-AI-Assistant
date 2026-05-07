# ─────────────────────────────────────────────
# Stage 1: Build packages & server
# ─────────────────────────────────────────────
FROM node:22.12-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Copy shared tsconfig ──────────────────────
COPY tsconfig.base.json ./

# ── Build @echomind/logger ────────────────────
COPY packages/logger/package.json ./packages/logger/
COPY packages/logger/tsconfig.json ./packages/logger/
COPY packages/logger/src ./packages/logger/src

WORKDIR /app/packages/logger
RUN npm install --no-audit --no-fund
RUN npx tsc

# ── Build @echomind/types ─────────────────────
WORKDIR /app
COPY packages/types/package.json ./packages/types/
COPY packages/types/tsconfig.json ./packages/types/
COPY packages/types/src ./packages/types/src

WORKDIR /app/packages/types
RUN npm install --no-audit --no-fund
RUN npx tsc

# ── Install & build server ────────────────────
WORKDIR /app/server

COPY server/package.json server/package-lock.json* ./

# Rewrite local package refs to point at built dist folders (no workspace protocol)
RUN node -e "\
  const fs = require('fs'); \
  const pkg = JSON.parse(fs.readFileSync('package.json','utf8')); \
  pkg.dependencies['@echomind/logger'] = 'file:../packages/logger'; \
  pkg.dependencies['@echomind/types'] = 'file:../packages/types'; \
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2)); \
"

RUN npm install --no-audit --no-fund

COPY server/tsconfig.json ./
COPY server/src ./src
COPY server/prisma ./prisma

RUN npx prisma generate
RUN npx tsc

# ─────────────────────────────────────────────
# Stage 2: Lean production runtime
# ─────────────────────────────────────────────
FROM node:22.12-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only what's needed to run
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/prisma ./prisma
COPY --from=builder /app/server/package.json ./package.json
# Prisma client is generated into node_modules, already copied above

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "dist/index.js"]
