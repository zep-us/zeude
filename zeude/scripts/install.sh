#!/bin/bash
# Zeude Installation Script
# Installs the claude shim and configures PATH for telemetry collection
set -e

# Configuration
DOWNLOAD_BASE="${ZEUDE_DOWNLOAD_BASE:-https://your-dashboard-url}"
DEFAULT_ENDPOINT="https://your-otel-collector-url/"
DEFAULT_DASHBOARD="https://your-dashboard-url"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

INSTALL_DIR="$HOME/.zeude/bin"
CONFIG_DIR="$HOME/.zeude"

printf "${GREEN}Zeude Installer${NC}\n"
echo "======================================"

# Check jq (required for hooks) - no auto-install to avoid sudo/CI issues
check_jq() {
    if command -v jq &> /dev/null; then
        return 0
    fi

    printf "${YELLOW}jq is required for hooks but not installed.${NC}\n"

    local os="$(uname -s | tr '[:upper:]' '[:lower:]')"
    case "$os" in
        darwin)
            printf "${RED}Please install jq: brew install jq${NC}\n"
            ;;
        linux)
            if command -v apt-get &> /dev/null; then
                printf "${RED}Please install jq: sudo apt-get install -y jq${NC}\n"
            elif command -v yum &> /dev/null; then
                printf "${RED}Please install jq: sudo yum install -y jq${NC}\n"
            elif command -v apk &> /dev/null; then
                printf "${RED}Please install jq: sudo apk add jq${NC}\n"
            else
                printf "${RED}Please install jq manually${NC}\n"
            fi
            ;;
        *)
            printf "${RED}Please install jq manually${NC}\n"
            ;;
    esac
    return 1
}

echo -n "Checking jq... "
if command -v jq &> /dev/null; then
    printf "${GREEN}$(jq --version)${NC}\n"
else
    check_jq || printf "${YELLOW}jq not installed (hooks may not work)${NC}\n"
fi

# Detect OS and architecture
detect_platform() {
    local os arch
    os="$(uname -s | tr '[:upper:]' '[:lower:]')"
    arch="$(uname -m)"

    case "$os" in
        darwin) os="darwin" ;;
        linux) os="linux" ;;
        *) printf "${RED}Unsupported OS: $os${NC}\n"; exit 1 ;;
    esac

    case "$arch" in
        x86_64|amd64) arch="amd64" ;;
        arm64|aarch64) arch="arm64" ;;
        *) printf "${RED}Unsupported architecture: $arch${NC}\n"; exit 1 ;;
    esac

    echo "${os}-${arch}"
}

# 1. Detect platform
echo -n "Detecting platform... "
PLATFORM=$(detect_platform)
printf "${GREEN}$PLATFORM${NC}\n"

# 2. Find real claude location (excluding our shim)
echo -n "Finding claude binary... "

# Remove our shim directory from PATH temporarily to find the real claude
CLEAN_PATH=$(echo "$PATH" | tr ':' '\n' | grep -v "\.zeude/bin" | tr '\n' ':' | sed 's/:$//')
REAL_CLAUDE=$(PATH="$CLEAN_PATH" which claude 2>/dev/null || echo "")

# Also check common locations if not found
if [ -z "$REAL_CLAUDE" ]; then
    for candidate in \
        "$HOME/.nvm/versions/node/"*/bin/claude \
        /usr/local/bin/claude \
        /opt/homebrew/bin/claude \
        "$HOME/.npm-global/bin/claude"; do
        if [ -x "$candidate" ] 2>/dev/null; then
            REAL_CLAUDE="$candidate"
            break
        fi
    done
fi

if [ -z "$REAL_CLAUDE" ]; then
    printf "${RED}FAILED${NC}\n"
    echo "Error: claude not found in PATH. Please install claude first."
    echo "  Install: npm install -g @anthropic-ai/claude-code"
    exit 1
fi

# Resolve symlinks to get the real path
REAL_CLAUDE=$(readlink -f "$REAL_CLAUDE" 2>/dev/null || realpath "$REAL_CLAUDE" 2>/dev/null || echo "$REAL_CLAUDE")

# Final sanity check: make sure we didn't find our own shim
if echo "$REAL_CLAUDE" | grep -q "\.zeude/bin"; then
    printf "${RED}FAILED${NC}\n"
    echo "Error: Could not find original claude binary (only found our shim)."
    echo "Please reinstall claude: npm install -g @anthropic-ai/claude-code"
    exit 1
fi

printf "${GREEN}$REAL_CLAUDE${NC}\n"

# 3. Create directories
echo -n "Creating directories... "
mkdir -p "$INSTALL_DIR" "$CONFIG_DIR"
printf "${GREEN}OK${NC}\n"

# 4. Store real binary path
echo -n "Storing real binary path... "
echo "$REAL_CLAUDE" > "$CONFIG_DIR/real_binary_path"
printf "${GREEN}OK${NC}\n"

# 5. Download pre-built binaries
echo -n "Downloading zeude shim... "
SHIM_URL="$DOWNLOAD_BASE/releases/claude-$PLATFORM"
if curl -fsSL "$SHIM_URL" -o "$INSTALL_DIR/claude" 2>/dev/null; then
    chmod +x "$INSTALL_DIR/claude"
    printf "${GREEN}OK${NC}\n"
else
    printf "${RED}FAILED${NC}\n"
    echo "Error: Failed to download from $SHIM_URL"
    exit 1
fi

echo -n "Downloading zeude doctor... "
DOCTOR_URL="$DOWNLOAD_BASE/releases/zeude-$PLATFORM"
if curl -fsSL "$DOCTOR_URL" -o "$INSTALL_DIR/zeude" 2>/dev/null; then
    chmod +x "$INSTALL_DIR/zeude"
    printf "${GREEN}OK${NC}\n"
else
    printf "${YELLOW}SKIPPED (optional)${NC}\n"
fi

# 6. Configure default endpoint and dashboard
echo -n "Configuring defaults... "
cat > "$CONFIG_DIR/config" << EOF
endpoint=${ZEUDE_ENDPOINT:-$DEFAULT_ENDPOINT}
dashboard_url=${ZEUDE_DASHBOARD_URL:-$DEFAULT_DASHBOARD}
EOF
printf "${GREEN}OK${NC}\n"

# 7. Add to PATH (idempotent, ensures zeude is first)
# Detect shell config file and choose appropriate PATH export syntax
if [ -n "$ZSH_VERSION" ] || [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
    # bash/zsh: remove existing zeude from PATH and prepend fresh (handles WSL, nvm, etc.)
    PATH_EXPORT='PATH="${PATH//:$HOME\/.zeude\/bin/}"; PATH="${PATH#$HOME/.zeude/bin:}"; export PATH="$HOME/.zeude/bin:$PATH"'
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
    PATH_EXPORT='PATH="${PATH//:$HOME\/.zeude\/bin/}"; PATH="${PATH#$HOME/.zeude/bin:}"; export PATH="$HOME/.zeude/bin:$PATH"'
elif [ -f "$HOME/.bash_profile" ]; then
    SHELL_RC="$HOME/.bash_profile"
    PATH_EXPORT='PATH="${PATH//:$HOME\/.zeude\/bin/}"; PATH="${PATH#$HOME/.zeude/bin:}"; export PATH="$HOME/.zeude/bin:$PATH"'
else
    SHELL_RC="$HOME/.profile"
    # POSIX fallback: simple prepend (no bash-specific syntax)
    PATH_EXPORT='export PATH="$HOME/.zeude/bin:$PATH"'
fi

echo -n "Configuring shell ($SHELL_RC)... "
# Remove old zeude PATH config if exists (for upgrade)
if grep -q "zeude/bin" "$SHELL_RC" 2>/dev/null; then
    # Remove old config lines
    sed -i.bak '/# Zeude - Claude telemetry shim/d' "$SHELL_RC" 2>/dev/null || \
        sed -i '' '/# Zeude - Claude telemetry shim/d' "$SHELL_RC"
    sed -i.bak '/\.zeude\/bin/d' "$SHELL_RC" 2>/dev/null || \
        sed -i '' '/\.zeude\/bin/d' "$SHELL_RC"
    rm -f "$SHELL_RC.bak" 2>/dev/null
fi
# Add fresh config
echo "" >> "$SHELL_RC"
echo "# Zeude - Claude telemetry shim (ensures PATH priority)" >> "$SHELL_RC"
echo "$PATH_EXPORT" >> "$SHELL_RC"
printf "${GREEN}Configured${NC}\n"

# 8. Install /zeude skill for Claude Code
SKILL_DIR="$HOME/.claude/commands"
echo -n "Installing /zeude skill... "
mkdir -p "$SKILL_DIR"
cat > "$SKILL_DIR/zeude.md" << 'SKILL_EOF'
---
name: zeude
description: Open Zeude dashboard (auto-login)
allowed-tools: Bash, Read
---

Open the Zeude monitoring dashboard in your browser with automatic authentication.

## Steps

1. **Read Agent Key**
   - Read the agent key from `~/.zeude/credentials`
   - The file contains `agent_key=zd_xxxxxxxx`

2. **Get Dashboard URL**
   - Read the server URL from `~/.zeude/config`
   - Look for `dashboard_url=` line, default to `https://your-dashboard-url`

3. **Request One-Time Token**
   - POST to `{dashboard_url}/api/auth/ott` with JSON body: `{"agentKey": "<agent_key>"}`
   - Extract the `token` from the response

4. **Open Browser**
   - Open `{dashboard_url}/auth?ott={token}` in the default browser
   - Use `open` on macOS, `xdg-open` on Linux, or `start` on Windows

## Example Bash Commands

```bash
# Read agent key
AGENT_KEY=$(grep "^agent_key=" ~/.zeude/credentials | cut -d'=' -f2)

# Read dashboard URL (with default)
DASHBOARD_URL=$(grep "^dashboard_url=" ~/.zeude/config 2>/dev/null | cut -d'=' -f2)
DASHBOARD_URL=${DASHBOARD_URL:-https://your-dashboard-url}

# Get OTT
OTT=$(curl -s -X POST "$DASHBOARD_URL/api/auth/ott" \
  -H "Content-Type: application/json" \
  -d "{\"agentKey\": \"$AGENT_KEY\"}" | jq -r '.token')

# Open browser
open "$DASHBOARD_URL/auth?ott=$OTT"
```

Execute these steps now using bash commands. If any step fails, explain the error to the user.
SKILL_EOF
printf "${GREEN}OK${NC}\n"

# 9. Configure agent key
if [ -z "$ZEUDE_AGENT_KEY" ]; then
    echo ""
    printf "${YELLOW}Agent key required for telemetry collection.${NC}\n"
    printf "Get your key from: ${BLUE}${DEFAULT_DASHBOARD}${NC}\n"
    echo ""
    printf "Enter your agent key (zd_xxx): "
    read -r ZEUDE_AGENT_KEY < /dev/tty
fi

if [ -n "$ZEUDE_AGENT_KEY" ]; then
    echo -n "Configuring agent key... "
    if [[ "$ZEUDE_AGENT_KEY" =~ ^zd_ ]]; then
        echo "agent_key=$ZEUDE_AGENT_KEY" > "$CONFIG_DIR/credentials"
        chmod 600 "$CONFIG_DIR/credentials"
        printf "${GREEN}OK${NC}\n"
    else
        printf "${RED}Invalid key format (should start with zd_)${NC}\n"
        echo "You can add it later by running: echo 'agent_key=YOUR_KEY' > ~/.zeude/credentials"
    fi
else
    printf "${YELLOW}Skipped${NC} - No agent key provided\n"
    echo "You can add it later by running: echo 'agent_key=YOUR_KEY' > ~/.zeude/credentials"
fi

# 10. Summary
echo ""
printf "${GREEN}Installation complete!${NC}\n"
echo "======================================"
echo "Real claude:  $REAL_CLAUDE"
echo "Shim binary:  $INSTALL_DIR/claude"
echo "Config dir:   $CONFIG_DIR"
echo "Dashboard:    $DEFAULT_DASHBOARD"
echo ""
printf "${YELLOW}Next steps:${NC}\n"
printf "  1. Restart your shell or run: ${BLUE}source $SHELL_RC${NC}\n"
printf "  2. Run '${BLUE}zeude doctor${NC}' to verify installation\n"
printf "  3. Run '${BLUE}claude${NC}' to start with telemetry enabled\n"
printf "  4. Type '${BLUE}/zeude${NC}' in Claude to open the dashboard\n"
