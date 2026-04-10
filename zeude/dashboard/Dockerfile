# NOTE: Use ../Dockerfile for production builds (includes Go binaries)
# This file is for local dashboard-only development

# Build stage
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

ENV NODE_ENV=production
ENV DATABASE_PROVIDER=sqlite
ENV DATABASE_PATH=/tmp/zeude-build.db
ENV SESSION_SECRET=build-session-secret
ENV NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV CLICKHOUSE_URL=http://localhost:8123
ENV CLICKHOUSE_USER=default
ENV CLICKHOUSE_PASSWORD=build
ENV CLICKHOUSE_DATABASE=default

# Copy source and build
COPY . .

# Build with standalone output
RUN npm run build

# Production stage
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user and SQLite data dir
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid 1001 nextjs && \
    mkdir -p /var/lib/zeude && \
    chown -R nextjs:nodejs /var/lib/zeude

# Copy built assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_PROVIDER=sqlite
ENV DATABASE_PATH=/var/lib/zeude/zeude.db

CMD ["node", "server.js"]
