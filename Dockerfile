# Stage 1: Build
FROM node:22-slim AS builder

# STRIP BLOAT: Use --no-install-recommends to avoid X11, Mesa, and other desktop libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root manifest and workspaces structure
COPY package.json package-lock.json ./
COPY packages/ ./packages/
COPY server/package.json ./server/

# Install dependencies for the server workspace (includes root hoisting)
RUN npm ci --workspace=echomind-server --include-workspace-root

# Copy server source
COPY server/ ./server/

# Generate Prisma Client (needed for build and runtime)
WORKDIR /app/server
RUN npx prisma generate

# Build (compile TS)
RUN npm run build

# Stage 2: Runtime
FROM node:22-slim AS runner

# STRIP BLOAT: Minimal runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy artifacts from builder
# We need node_modules, dist, package.json, and prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/package.json
COPY --from=builder /app/server/prisma ./server/prisma
# We also need the local packages referenced in package.json
COPY --from=builder /app/packages ./packages

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Run from server directory
WORKDIR /app/server
CMD ["node", "dist/index.js"]
