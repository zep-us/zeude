// Package oteltest validates OTEL Collector configuration for Codex integration.
// These tests verify that the collector config correctly routes both Claude Code
// and Codex telemetry data through the same pipeline to ClickHouse.
//
// Uses string-based config validation (no YAML parser dependency) to keep
// the Go module dependency-free. The OTEL Collector YAML format is stable
// and simple enough for substring matching.
package oteltest

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// findRepoRoot walks up from the current directory to find the repo root (go.mod).
func findRepoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}

	root := dir
	for {
		if _, err := os.Stat(filepath.Join(root, "go.mod")); err == nil {
			return root
		}
		parent := filepath.Dir(root)
		if parent == root {
			t.Fatal("could not find repo root (go.mod)")
		}
		root = parent
	}
}

// findCollectorConfigs returns paths to all otel-collector-config.yaml files.
func findCollectorConfigs(t *testing.T) []string {
	t.Helper()
	root := findRepoRoot(t)

	var configs []string
	for _, relPath := range []string{
		"dashboard/otel-collector-config.yaml",
		"deployments/otel-collector-config.yaml",
	} {
		path := filepath.Join(root, relPath)
		if _, err := os.Stat(path); err == nil {
			configs = append(configs, path)
		}
	}

	if len(configs) == 0 {
		t.Skip("no otel-collector-config.yaml files found")
	}
	return configs
}

// readConfig reads a collector config file and returns its content.
func readConfig(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

// TestCollectorConfig_OTLPReceiver verifies that the OTLP receiver is configured
// to accept data from both Claude Code and Codex shims (both use OTLP).
func TestCollectorConfig_OTLPReceiver(t *testing.T) {
	for _, configPath := range findCollectorConfigs(t) {
		t.Run(filepath.Base(filepath.Dir(configPath)), func(t *testing.T) {
			content := readConfig(t, configPath)

			// OTLP receiver must be defined
			if !strings.Contains(content, "otlp:") {
				t.Error("OTLP receiver not found in collector config")
			}

			// HTTP protocol should be available
			// (both Claude and Codex shims use http/protobuf)
			if !strings.Contains(content, "http:") {
				t.Error("HTTP protocol not configured for OTLP receiver")
			}
		})
	}
}

// TestCollectorConfig_LogsPipeline verifies that logs pipeline routes to ClickHouse.
// Both Claude Code and Codex telemetry flows through the same logs pipeline.
func TestCollectorConfig_LogsPipeline(t *testing.T) {
	for _, configPath := range findCollectorConfigs(t) {
		t.Run(filepath.Base(filepath.Dir(configPath)), func(t *testing.T) {
			content := readConfig(t, configPath)

			// Must have a logs pipeline section
			if !strings.Contains(content, "logs:") {
				t.Fatal("logs pipeline not found in service config")
			}

			// Logs pipeline must reference otlp receiver
			if !strings.Contains(content, "receivers: [otlp]") {
				t.Error("logs pipeline does not use otlp receiver")
			}

			// Logs pipeline must reference batch processor
			if !strings.Contains(content, "processors: [batch]") {
				t.Error("logs pipeline does not use batch processor")
			}
		})
	}
}

// TestCollectorConfig_ClickHouseExporter verifies ClickHouse exporter targets
// the correct table (claude_code_logs) which stores data from all sources.
// Codex data is routed to the same table and differentiated by ServiceName.
func TestCollectorConfig_ClickHouseExporter(t *testing.T) {
	for _, configPath := range findCollectorConfigs(t) {
		t.Run(filepath.Base(filepath.Dir(configPath)), func(t *testing.T) {
			content := readConfig(t, configPath)

			// The ClickHouse logs table must be claude_code_logs
			if !strings.Contains(content, "logs_table_name: claude_code_logs") {
				t.Error("ClickHouse exporter should use 'claude_code_logs' as logs_table_name")
			}
		})
	}
}

// TestCollectorConfig_UnifiedPipeline verifies that there is NO separate pipeline
// for Codex vs Claude. Both sources share the same pipeline (architectural symmetry).
// A transform/codex processor within the unified pipeline is allowed — it normalizes
// Codex attribute keys to the Zeude schema and is a no-op for Claude Code data.
func TestCollectorConfig_UnifiedPipeline(t *testing.T) {
	for _, configPath := range findCollectorConfigs(t) {
		t.Run(filepath.Base(filepath.Dir(configPath)), func(t *testing.T) {
			content := readConfig(t, configPath)

			// There should NOT be a separate codex-specific pipeline (e.g., "logs/codex:")
			// or a separate codex exporter. A transform processor within the unified
			// pipeline is fine — it keeps all data flowing through one pipeline.
			separatePipelinePatterns := []string{
				"logs/codex:",
				"traces/codex:",
				"metrics/codex:",
				"clickhouse/codex:",
			}
			for _, pattern := range separatePipelinePatterns {
				if strings.Contains(strings.ToLower(content), pattern) {
					t.Errorf("found separate codex pipeline %q - data should flow through unified pipeline", pattern)
				}
			}
		})
	}
}

// TestCollectorConfig_BatchProcessor verifies batch processor is configured
// to handle the combined throughput of both Claude and Codex data.
func TestCollectorConfig_BatchProcessor(t *testing.T) {
	for _, configPath := range findCollectorConfigs(t) {
		t.Run(filepath.Base(filepath.Dir(configPath)), func(t *testing.T) {
			content := readConfig(t, configPath)

			if !strings.Contains(content, "batch:") {
				t.Error("batch processor not found - required for efficient pipeline processing")
			}

			// Batch should have a timeout configured
			if !strings.Contains(content, "timeout:") {
				t.Error("batch processor missing timeout configuration")
			}

			// Batch should have send_batch_size configured
			if !strings.Contains(content, "send_batch_size:") {
				t.Error("batch processor missing send_batch_size configuration")
			}
		})
	}
}

// TestCollectorConfig_RetryOnFailure verifies that the ClickHouse exporter
// has retry configuration (important for reliability with increased data volume
// from supporting both Claude Code and Codex).
func TestCollectorConfig_RetryOnFailure(t *testing.T) {
	for _, configPath := range findCollectorConfigs(t) {
		t.Run(filepath.Base(filepath.Dir(configPath)), func(t *testing.T) {
			content := readConfig(t, configPath)

			if !strings.Contains(content, "retry_on_failure:") {
				t.Error("ClickHouse exporter missing retry_on_failure configuration")
			}
		})
	}
}
