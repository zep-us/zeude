#!/bin/bash
# Build release binaries for all platforms
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."
OUTPUT_DIR="$PROJECT_DIR/releases"

# Colors
GREEN='\033[0;32m'
NC='\033[0m'

echo "Building Zeude release binaries..."
echo "======================================"

mkdir -p "$OUTPUT_DIR"
cd "$PROJECT_DIR"

# Platforms to build
PLATFORMS=(
    "darwin/amd64"
    "darwin/arm64"
    "linux/amd64"
    "linux/arm64"
)

# Build claude shim
echo ""
echo "Building claude shim..."
for platform in "${PLATFORMS[@]}"; do
    GOOS="${platform%/*}"
    GOARCH="${platform#*/}"
    OUTPUT_NAME="claude-${GOOS}-${GOARCH}"

    echo -n "  $OUTPUT_NAME... "
    GOOS=$GOOS GOARCH=$GOARCH go build -ldflags="-s -w" -o "$OUTPUT_DIR/$OUTPUT_NAME" ./cmd/claude
    echo -e "${GREEN}OK${NC}"
done

# Build zeude doctor
echo ""
echo "Building zeude doctor..."
for platform in "${PLATFORMS[@]}"; do
    GOOS="${platform%/*}"
    GOARCH="${platform#*/}"
    OUTPUT_NAME="zeude-${GOOS}-${GOARCH}"

    echo -n "  $OUTPUT_NAME... "
    GOOS=$GOOS GOARCH=$GOARCH go build -ldflags="-s -w" -o "$OUTPUT_DIR/$OUTPUT_NAME" ./cmd/doctor
    echo -e "${GREEN}OK${NC}"
done

# Copy install script
echo ""
echo -n "Copying install script... "
cp "$SCRIPT_DIR/install.sh" "$OUTPUT_DIR/install.sh"
echo -e "${GREEN}OK${NC}"

echo ""
echo "======================================"
echo -e "${GREEN}Build complete!${NC}"
echo "Output directory: $OUTPUT_DIR"
echo ""
echo "Files:"
ls -lh "$OUTPUT_DIR"
