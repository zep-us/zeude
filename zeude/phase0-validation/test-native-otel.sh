#!/bin/bash
# Phase 0 Validation: Test Claude Code Native OTel Support
#
# This script tests if Claude Code has built-in OpenTelemetry support
# by setting the documented environment variables and observing output.

set -e

echo "=== Phase 0: Claude Code Native OTel Validation ==="
echo ""

# Check if docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker first."
    exit 1
fi

# Create output directory
mkdir -p output

# Start OTel Collector
echo "[1/4] Starting OTel Collector..."
docker-compose up -d

# Wait for collector to be ready
echo "[2/4] Waiting for OTel Collector to be ready..."
sleep 3

# Check collector health
if ! docker-compose ps | grep -q "Up"; then
    echo "Error: OTel Collector failed to start"
    docker-compose logs
    exit 1
fi
echo "      OTel Collector is running on ports 4317 (gRPC) and 4318 (HTTP)"

echo ""
echo "[3/4] Environment variables to test:"
echo ""
echo "  export CLAUDE_CODE_ENABLE_TELEMETRY=1"
echo "  export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317"
echo "  export OTEL_METRICS_EXPORTER=otlp"
echo "  export OTEL_LOGS_EXPORTER=otlp"
echo "  export OTEL_TRACES_EXPORTER=otlp"
echo ""

echo "[4/4] Run a test Claude session with telemetry:"
echo ""
echo "  CLAUDE_CODE_ENABLE_TELEMETRY=1 \\"
echo "  OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 \\"
echo "  claude --version"
echo ""
echo "Then check the OTel Collector logs:"
echo "  docker-compose logs -f otel-collector"
echo ""
echo "Or check the output file:"
echo "  cat output/otel-data.json"
echo ""
echo "=== Collector Ready - Run your test session ==="
