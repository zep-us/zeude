# Go build stage - build zeude binaries
FROM golang:1.23-alpine AS go-builder

WORKDIR /go-src

# Version for auto-update (format: YYYYMMDD.HHMM)
ARG VERSION
RUN if [ -z "$VERSION" ]; then VERSION=$(date -u +%Y%m%d.%H%M); fi && echo $VERSION > /tmp/version

# Copy Go source
COPY cmd ./cmd
COPY internal ./internal
COPY go.mod ./
COPY go.su[m] ./

# Build for all platforms with version embedded
RUN VERSION=$(cat /tmp/version) && \
    LDFLAGS="-s -w -X github.com/zeude/zeude/internal/autoupdate.Version=$VERSION" && \
    mkdir -p /releases && \
    GOOS=darwin GOARCH=amd64 go build -ldflags="$LDFLAGS" -o /releases/claude-darwin-amd64 ./cmd/claude && \
    GOOS=darwin GOARCH=arm64 go build -ldflags="$LDFLAGS" -o /releases/claude-darwin-arm64 ./cmd/claude && \
    GOOS=linux GOARCH=amd64 go build -ldflags="$LDFLAGS" -o /releases/claude-linux-amd64 ./cmd/claude && \
    GOOS=linux GOARCH=arm64 go build -ldflags="$LDFLAGS" -o /releases/claude-linux-arm64 ./cmd/claude && \
    GOOS=darwin GOARCH=amd64 go build -ldflags="$LDFLAGS" -o /releases/codex-darwin-amd64 ./cmd/codex && \
    GOOS=darwin GOARCH=arm64 go build -ldflags="$LDFLAGS" -o /releases/codex-darwin-arm64 ./cmd/codex && \
    GOOS=linux GOARCH=amd64 go build -ldflags="$LDFLAGS" -o /releases/codex-linux-amd64 ./cmd/codex && \
    GOOS=linux GOARCH=arm64 go build -ldflags="$LDFLAGS" -o /releases/codex-linux-arm64 ./cmd/codex && \
    GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o /releases/zeude-darwin-amd64 ./cmd/doctor && \
    GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o /releases/zeude-darwin-arm64 ./cmd/doctor && \
    GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /releases/zeude-linux-amd64 ./cmd/doctor && \
    GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o /releases/zeude-linux-arm64 ./cmd/doctor && \
    echo "$VERSION" > /releases/version.txt

# Copy install and uninstall scripts
COPY scripts/install.sh /releases/install.sh
COPY scripts/install-server.sh /releases/install-server.sh
COPY scripts/uninstall.sh /releases/uninstall.sh

# Node build stage
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copy dashboard source
COPY dashboard/package*.json ./
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

COPY dashboard .

# Copy pre-built Go binaries
COPY --from=go-builder /releases ./public/releases

# Build with standalone output
RUN npm run build

# Production stage
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
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
