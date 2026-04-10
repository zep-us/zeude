#!/bin/bash
# Zeude server installation script
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

INSTALL_DIR="${ZEUDE_INSTALL_DIR:-/opt/zeude}"
APP_DIR="$INSTALL_DIR/app"
CONFIG_DIR="$INSTALL_DIR/config"
ENV_FILE="$CONFIG_DIR/zeude.env"
DATA_DIR="${ZEUDE_DATA_DIR:-/var/lib/zeude}"
REPO_URL="${ZEUDE_REPO_URL:-https://github.com/zep-us/zeude.git}"
GIT_REF="${ZEUDE_GIT_REF:-main}"
APP_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://host.docker.internal:8123}"
CLICKHOUSE_USER="${CLICKHOUSE_USER:-default}"
CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD:-dev}"
CLICKHOUSE_DATABASE="${CLICKHOUSE_DATABASE:-default}"
OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-}"
OPENROUTER_MODEL="${OPENROUTER_MODEL:-anthropic/claude-3.5-sonnet}"
SESSION_SECRET="${SESSION_SECRET:-}"
DRY_RUN="${DRY_RUN:-0}"
SKIP_SYSTEMD="${SKIP_SYSTEMD:-0}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

printf "${GREEN}Zeude Server Installer${NC}\n"
echo "======================================"

run_cmd() {
  if [ "$DRY_RUN" = "1" ]; then
    printf "${BLUE}[dry-run]${NC} %s\n" "$*"
    return 0
  fi
  "$@"
}

run_shell() {
  if [ "$DRY_RUN" = "1" ]; then
    printf "${BLUE}[dry-run]${NC} %s\n" "$1"
    return 0
  fi
  bash -lc "$1"
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf "${RED}Missing required command:${NC} %s\n" "$1"
    exit 1
  fi
}

generate_secret() {
  if [ -n "$SESSION_SECRET" ]; then
    printf "%s" "$SESSION_SECRET"
    return 0
  fi
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return 0
  fi
  python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
}

prepare_source_tree() {
  if [ -f "$REPO_ROOT/dashboard/docker-compose.yaml" ] && [ -f "$REPO_ROOT/Dockerfile" ]; then
    echo "local"
    return 0
  fi
  echo "remote"
}

copy_local_repo() {
  printf "Copying local repository into %s... " "$APP_DIR"
  run_cmd mkdir -p "$APP_DIR"
  run_shell "rsync -a --delete --exclude '.git' --exclude 'node_modules' --exclude '.next' --exclude '.data' --exclude '.omc' '$REPO_ROOT/' '$APP_DIR/'"
  printf "${GREEN}OK${NC}\n"
}

clone_remote_repo() {
  printf "Fetching repository %s (%s)... " "$REPO_URL" "$GIT_REF"
  run_cmd mkdir -p "$INSTALL_DIR"
  if [ "$DRY_RUN" = "1" ]; then
    printf "${GREEN}OK${NC}\n"
    return 0
  fi
  rm -rf "$APP_DIR"
  git clone --depth 1 --branch "$GIT_REF" "$REPO_URL" "$APP_DIR" >/dev/null 2>&1
  printf "${GREEN}OK${NC}\n"
}

write_env_file() {
  local secret
  secret="$(generate_secret)"
  printf "Writing env file... "
  run_cmd mkdir -p "$CONFIG_DIR" "$DATA_DIR"
  if [ "$DRY_RUN" = "1" ]; then
    printf "${GREEN}OK${NC}\n"
    return 0
  fi
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
DATABASE_PROVIDER=sqlite
DATABASE_PATH=/var/lib/zeude/zeude.db
ZEUDE_DATA_DIR=$DATA_DIR
SESSION_SECRET=$secret
NEXT_PUBLIC_APP_URL=$APP_URL
CLICKHOUSE_URL=$CLICKHOUSE_URL
CLICKHOUSE_USER=$CLICKHOUSE_USER
CLICKHOUSE_PASSWORD=$CLICKHOUSE_PASSWORD
CLICKHOUSE_DATABASE=$CLICKHOUSE_DATABASE
OPENROUTER_API_KEY=$OPENROUTER_API_KEY
OPENROUTER_MODEL=$OPENROUTER_MODEL
EOF
  printf "${GREEN}OK${NC}\n"
}

install_systemd_unit() {
  if [ "$SKIP_SYSTEMD" = "1" ]; then
    printf "${YELLOW}Skipping systemd registration${NC}\n"
    return 0
  fi

  if ! command -v systemctl >/dev/null 2>&1; then
    printf "${YELLOW}systemd not available, skipping service registration${NC}\n"
    return 0
  fi

  local service_path="/etc/systemd/system/zeude-dashboard.service"
  local docker_bin
  docker_bin="$(command -v docker)"
  printf "Registering systemd service... "

  if [ "$DRY_RUN" = "1" ]; then
    printf "${GREEN}OK${NC}\n"
    return 0
  fi

  cat > /tmp/zeude-dashboard.service <<EOF
[Unit]
Description=Zeude Dashboard
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
WorkingDirectory=$APP_DIR/dashboard
RemainAfterExit=yes
EnvironmentFile=$ENV_FILE
ExecStart=$docker_bin compose --env-file $ENV_FILE -f $APP_DIR/dashboard/docker-compose.yaml up -d --build
ExecStop=$docker_bin compose --env-file $ENV_FILE -f $APP_DIR/dashboard/docker-compose.yaml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

  if [ "$(id -u)" -eq 0 ]; then
    mv /tmp/zeude-dashboard.service "$service_path"
    systemctl daemon-reload
    systemctl enable zeude-dashboard.service >/dev/null
  else
    need_cmd sudo
    sudo mv /tmp/zeude-dashboard.service "$service_path"
    sudo systemctl daemon-reload
    sudo systemctl enable zeude-dashboard.service >/dev/null
  fi
  printf "${GREEN}OK${NC}\n"
}

start_stack() {
  printf "Starting Zeude dashboard stack... "
  local cmd="cd '$APP_DIR/dashboard' && docker compose --env-file '$ENV_FILE' -f docker-compose.yaml up -d --build"
  run_shell "$cmd"
  printf "${GREEN}OK${NC}\n"
}

main() {
  need_cmd docker
  run_shell "docker compose version >/dev/null"

  local source_mode
  source_mode="$(prepare_source_tree)"

  printf "Install directory: ${BLUE}%s${NC}\n" "$INSTALL_DIR"
  printf "Data directory: ${BLUE}%s${NC}\n" "$DATA_DIR"
  printf "Source mode: ${BLUE}%s${NC}\n" "$source_mode"

  if [ "$source_mode" = "local" ]; then
    need_cmd rsync
    copy_local_repo
  else
    need_cmd git
    clone_remote_repo
  fi

  write_env_file
  start_stack
  install_systemd_unit

  echo ""
  printf "${GREEN}Install complete${NC}\n"
  echo "======================================"
  printf "Dashboard: ${BLUE}%s${NC}\n" "$APP_URL"
  printf "Env file:  ${BLUE}%s${NC}\n" "$ENV_FILE"
  printf "Data dir:  ${BLUE}%s${NC}\n" "$DATA_DIR"
  echo ""
  echo "Basic checks:"
  echo "  docker compose --env-file '$ENV_FILE' -f '$APP_DIR/dashboard/docker-compose.yaml' ps"
  echo "  curl -s '$APP_URL/api/health'"
  echo "  docker compose --env-file '$ENV_FILE' -f '$APP_DIR/dashboard/docker-compose.yaml' logs -f"
}

main "$@"
