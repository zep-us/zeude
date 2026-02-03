-- Seed: Update Checker Hook
-- This hook enforces zeude updates when a new version is available

INSERT INTO zeude_hooks (
  name,
  event,
  description,
  script_content,
  script_type,
  is_global,
  teams,
  env,
  status
) VALUES (
  'Update Checker',
  'UserPromptSubmit',
  'Enforces zeude updates when new version is available (checks after 12 hours)',
  E'#!/bin/bash
# Update Checker Hook - Enforces zeude updates when new version available
# Only checks after 12 hours, and only blocks if there''s actually a new version

ZEUDE_DIR="$HOME/.zeude"
LAST_UPDATE_FILE="$ZEUDE_DIR/last_successful_update"
VERSION_FILE="$ZEUDE_DIR/current_version"
VERSION_VERIFIED_FILE="$ZEUDE_DIR/version_verified"
MAX_AGE_SECONDS=60  # 1 minute (for testing)

# Read dashboard URL from config (set during install)
DASHBOARD_URL=$(grep ''dashboard_url='' "$ZEUDE_DIR/config" 2>/dev/null | cut -d= -f2 | tr -d ''[:space:]'')
REMOTE_VERSION_URL="${DASHBOARD_URL:-https://localhost:3000}/releases/version.txt"

# If last_update file doesn''t exist, allow (first-time user)
if [ ! -f "$LAST_UPDATE_FILE" ]; then
  exit 0
fi

# Get file modification time
if [[ "$OSTYPE" == "darwin"* ]]; then
  FILE_MTIME=$(stat -f %m "$LAST_UPDATE_FILE" 2>/dev/null || echo 0)
  VERIFIED_MTIME=$(stat -f %m "$VERSION_VERIFIED_FILE" 2>/dev/null || echo 0)
else
  FILE_MTIME=$(stat -c %Y "$LAST_UPDATE_FILE" 2>/dev/null || echo 0)
  VERIFIED_MTIME=$(stat -c %Y "$VERSION_VERIFIED_FILE" 2>/dev/null || echo 0)
fi

CURRENT_TIME=$(date +%s)
AGE=$((CURRENT_TIME - FILE_MTIME))

# If within 12 hours, allow without check
if [ "$AGE" -lt "$MAX_AGE_SECONDS" ]; then
  exit 0
fi

# If version was already verified in this session (file touched after last_update), skip
if [ "$VERIFIED_MTIME" -gt "$FILE_MTIME" ]; then
  exit 0
fi

# Read current version
if [ ! -f "$VERSION_FILE" ]; then
  exit 0  # No version file, allow
fi
CURRENT_VERSION=$(cat "$VERSION_FILE" 2>/dev/null | tr -d ''[:space:]'')

if [ -z "$CURRENT_VERSION" ] || [ "$CURRENT_VERSION" = "dev" ]; then
  exit 0  # Dev build, allow
fi

# Fetch remote version (with timeout)
REMOTE_VERSION=$(curl -s --max-time 3 "$REMOTE_VERSION_URL" 2>/dev/null | tr -d ''[:space:]'')

if [ -z "$REMOTE_VERSION" ]; then
  exit 0  # Can''t reach server, fail-open
fi

# Strip ''v'' prefix for comparison
CURRENT_VERSION="${CURRENT_VERSION#v}"
REMOTE_VERSION="${REMOTE_VERSION#v}"

# Compare versions
if [ "$CURRENT_VERSION" = "$REMOTE_VERSION" ]; then
  # Versions match - mark as verified so we don''t check again
  touch "$VERSION_VERIFIED_FILE"
  exit 0
fi

# New version available - block
HOURS=$((AGE / 3600))
echo "" >&2
echo "⚠️  Zeude update available! (${CURRENT_VERSION} → ${REMOTE_VERSION})" >&2
echo "" >&2
echo "Please exit and restart claude to apply the update." >&2
echo "" >&2
exit 2',
  'bash',
  true,
  '{}',
  '{}'::jsonb,
  'active'
);
