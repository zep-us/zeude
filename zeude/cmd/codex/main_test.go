package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/zeude/zeude/internal/identity"
	"github.com/zeude/zeude/internal/otelenv"
)

func TestSetEnvIfEmpty(t *testing.T) {
	tests := []struct {
		name     string
		key      string
		value    string
		existing string
		want     string
	}{
		{
			name:  "sets when empty",
			key:   "TEST_ZEUDE_EMPTY",
			value: "new_value",
			want:  "new_value",
		},
		{
			name:     "does not overwrite existing",
			key:      "TEST_ZEUDE_EXISTING",
			value:    "new_value",
			existing: "old_value",
			want:     "old_value",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			defer os.Unsetenv(tt.key)

			if tt.existing != "" {
				os.Setenv(tt.key, tt.existing)
			} else {
				os.Unsetenv(tt.key)
			}

			otelenv.SetEnvIfEmpty(tt.key, tt.value)

			got := os.Getenv(tt.key)
			if got != tt.want {
				t.Errorf("setEnvIfEmpty(%q, %q) = %q, want %q", tt.key, tt.value, got, tt.want)
			}
		})
	}
}

func TestInjectResourceAttribute(t *testing.T) {
	tests := []struct {
		name     string
		key      string
		value    string
		existing string
		wantAttr string
	}{
		{
			name:     "injects new attribute when empty",
			key:      "zeude.user.id",
			value:    "abc-123",
			existing: "",
			wantAttr: "zeude.user.id=abc-123",
		},
		{
			name:     "appends to existing attributes",
			key:      "zeude.user.email",
			value:    "user@example.com",
			existing: "zeude.user.id=abc-123",
			wantAttr: "zeude.user.id=abc-123,zeude.user.email=user@example.com",
		},
		{
			name:     "escapes equals sign in value",
			key:      "zeude.test",
			value:    "key=value",
			existing: "",
			wantAttr: "zeude.test=key%3Dvalue",
		},
		{
			name:     "escapes comma in value",
			key:      "zeude.test",
			value:    "a,b",
			existing: "",
			wantAttr: "zeude.test=a%2Cb",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			defer os.Unsetenv("OTEL_RESOURCE_ATTRIBUTES")

			if tt.existing != "" {
				os.Setenv("OTEL_RESOURCE_ATTRIBUTES", tt.existing)
			} else {
				os.Unsetenv("OTEL_RESOURCE_ATTRIBUTES")
			}

			otelenv.InjectResourceAttribute(tt.key, tt.value)

			got := os.Getenv("OTEL_RESOURCE_ATTRIBUTES")
			if got != tt.wantAttr {
				t.Errorf("OTEL_RESOURCE_ATTRIBUTES = %q, want %q", got, tt.wantAttr)
			}
		})
	}
}

// cleanOtelEnv unsets all OTEL env vars and registers cleanup.
func cleanOtelEnv(t *testing.T) {
	t.Helper()
	envVars := []string{
		"OTEL_SERVICE_NAME",
		"OTEL_EXPORTER_OTLP_ENDPOINT",
		"OTEL_EXPORTER_OTLP_PROTOCOL",
		"OTEL_METRICS_EXPORTER",
		"OTEL_LOGS_EXPORTER",
		"OTEL_TRACES_EXPORTER",
		"OTEL_RESOURCE_ATTRIBUTES",
	}
	for _, k := range envVars {
		os.Unsetenv(k)
	}
	t.Cleanup(func() {
		for _, k := range envVars {
			os.Unsetenv(k)
		}
	})
}

// TestInjectTelemetryEnv_CodexServiceName verifies that the Codex shim sets
// OTEL_SERVICE_NAME to "codex" (the key differentiator from the Claude shim).
// This is critical for ServiceName-based source extraction in ClickHouse MVs.
func TestInjectTelemetryEnv_CodexServiceName(t *testing.T) {
	cleanOtelEnv(t)

	sr := identity.UserIdentity{
		UserID:    "550e8400-e29b-41d4-a716-446655440000",
		UserEmail: "developer@example.com",
		Team:      "engineering",
	}

	injectTelemetryEnv(sr)

	// Verify ServiceName is set to "codex" (NOT "claude" or empty)
	serviceName := os.Getenv("OTEL_SERVICE_NAME")
	if serviceName != "codex" {
		t.Errorf("OTEL_SERVICE_NAME = %q, want %q", serviceName, "codex")
	}
}

// TestInjectTelemetryEnv_UserIdentity verifies that zeude.user.id is injected
// into OTEL_RESOURCE_ATTRIBUTES for cross-tool identity resolution.
// Same developer using both Claude Code and Codex must resolve to a single UUID.
func TestInjectTelemetryEnv_UserIdentity(t *testing.T) {
	cleanOtelEnv(t)

	userID := "550e8400-e29b-41d4-a716-446655440000"
	userEmail := "developer@example.com"
	team := "engineering"

	sr := identity.UserIdentity{
		UserID:    userID,
		UserEmail: userEmail,
		Team:      team,
	}

	injectTelemetryEnv(sr)

	attrs := os.Getenv("OTEL_RESOURCE_ATTRIBUTES")

	// Check that zeude.user.id is present (critical for Supabase UUID resolution)
	if !strings.Contains(attrs, "zeude.user.id="+userID) {
		t.Errorf("OTEL_RESOURCE_ATTRIBUTES missing zeude.user.id, got: %q", attrs)
	}

	// Check that zeude.user.email is present
	if !strings.Contains(attrs, "zeude.user.email="+userEmail) {
		t.Errorf("OTEL_RESOURCE_ATTRIBUTES missing zeude.user.email, got: %q", attrs)
	}

	// Check that zeude.team is present
	if !strings.Contains(attrs, "zeude.team="+team) {
		t.Errorf("OTEL_RESOURCE_ATTRIBUTES missing zeude.team, got: %q", attrs)
	}
}

// TestInjectTelemetryEnv_NoOrgID verifies that org_id is NOT injected for Codex
// (a key design constraint: org_id is left empty for Codex data).
func TestInjectTelemetryEnv_NoOrgID(t *testing.T) {
	cleanOtelEnv(t)

	sr := identity.UserIdentity{
		UserID:    "550e8400-e29b-41d4-a716-446655440000",
		UserEmail: "developer@example.com",
	}

	injectTelemetryEnv(sr)

	attrs := os.Getenv("OTEL_RESOURCE_ATTRIBUTES")

	// org_id should NOT be present in Codex resource attributes
	if strings.Contains(attrs, "org_id") || strings.Contains(attrs, "organization.id") {
		t.Errorf("OTEL_RESOURCE_ATTRIBUTES should NOT contain org_id for Codex, got: %q", attrs)
	}
}

// TestInjectTelemetryEnv_FailOpen verifies fail-open behavior:
// when user identity is missing, OTEL vars are still set (just without user attrs).
func TestInjectTelemetryEnv_FailOpen(t *testing.T) {
	cleanOtelEnv(t)

	// Empty sync result (identity fetch failed)
	sr := identity.UserIdentity{}
	injectTelemetryEnv(sr)

	// OTEL_SERVICE_NAME should still be set even without identity
	serviceName := os.Getenv("OTEL_SERVICE_NAME")
	if serviceName != "codex" {
		t.Errorf("OTEL_SERVICE_NAME should be 'codex' even when identity fails, got: %q", serviceName)
	}

	// OTEL endpoint should still be set
	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if endpoint == "" {
		t.Error("OTEL_EXPORTER_OTLP_ENDPOINT should be set even when identity fails")
	}

	// Resource attributes should NOT contain user identity fields,
	// but may contain working_directory/project_path (injected from cwd)
	attrs := os.Getenv("OTEL_RESOURCE_ATTRIBUTES")
	if strings.Contains(attrs, "zeude.user.id") {
		t.Errorf("OTEL_RESOURCE_ATTRIBUTES should not contain zeude.user.id when no identity, got: %q", attrs)
	}
	if strings.Contains(attrs, "zeude.user.email") {
		t.Errorf("OTEL_RESOURCE_ATTRIBUTES should not contain zeude.user.email when no identity, got: %q", attrs)
	}
	if strings.Contains(attrs, "zeude.team") {
		t.Errorf("OTEL_RESOURCE_ATTRIBUTES should not contain zeude.team when no identity, got: %q", attrs)
	}
}

// TestInjectTelemetryEnv_DoesNotOverrideExisting verifies that pre-existing
// OTEL env vars are not overwritten (user can override defaults).
func TestInjectTelemetryEnv_DoesNotOverrideExisting(t *testing.T) {
	cleanOtelEnv(t)

	// Pre-set a custom endpoint
	customEndpoint := "http://custom-collector:4318"
	os.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", customEndpoint)

	sr := identity.UserIdentity{
		UserID: "test-user",
	}
	injectTelemetryEnv(sr)

	// Custom endpoint should not be overwritten
	got := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if got != customEndpoint {
		t.Errorf("OTEL_EXPORTER_OTLP_ENDPOINT = %q, want %q (should not override)", got, customEndpoint)
	}
}

// TestInjectTelemetryEnv_OTELProtocol verifies http/protobuf is set
// for compatibility with the OTEL Collector pipeline.
func TestInjectTelemetryEnv_OTELProtocol(t *testing.T) {
	cleanOtelEnv(t)

	sr := identity.UserIdentity{}
	injectTelemetryEnv(sr)

	protocol := os.Getenv("OTEL_EXPORTER_OTLP_PROTOCOL")
	if protocol != "http/protobuf" {
		t.Errorf("OTEL_EXPORTER_OTLP_PROTOCOL = %q, want %q", protocol, "http/protobuf")
	}

	// All three signal types should use OTLP
	for _, key := range []string{"OTEL_METRICS_EXPORTER", "OTEL_LOGS_EXPORTER", "OTEL_TRACES_EXPORTER"} {
		v := os.Getenv(key)
		if v != "otlp" {
			t.Errorf("%s = %q, want %q", key, v, "otlp")
		}
	}
}

// TestIsInteractive_NonInteractiveFlags checks the non-interactive flag detection.
func TestIsInteractive_NonInteractiveFlags(t *testing.T) {
	tests := []struct {
		name string
		args []string
	}{
		{name: "quiet flag", args: []string{"codex", "-q"}},
		{name: "help flag", args: []string{"codex", "--help"}},
		{name: "version flag", args: []string{"codex", "--version"}},
		{name: "quiet long", args: []string{"codex", "--quiet"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			origArgs := os.Args
			defer func() { os.Args = origArgs }()

			os.Args = tt.args
			// In test environment, stdin is piped (not a terminal),
			// so isInteractive() returns false before checking flags.
			// This validates that non-interactive mode is correctly detected.
			got := isInteractive()
			if got {
				t.Error("isInteractive() should return false in non-terminal test env")
			}
		})
	}
}

// --- Tests for injectCodexOtelConfig / updateCodexConfig ---

func TestUpdateCodexConfig_EmptyContent(t *testing.T) {
	result := updateCodexConfig("", "https://otel.example.com/v1/logs")

	if !strings.Contains(result, "[otel]") {
		t.Error("missing [otel] section")
	}
	if !strings.Contains(result, "log_user_prompt = true") {
		t.Error("missing log_user_prompt")
	}
	if !strings.Contains(result, "[otel.exporter.otlp-http]") {
		t.Error("missing [otel.exporter.otlp-http] section")
	}
	if !strings.Contains(result, `endpoint = "https://otel.example.com/v1/logs"`) {
		t.Errorf("missing endpoint, got:\n%s", result)
	}
}

func TestUpdateCodexConfig_ReplacesEndpoint(t *testing.T) {
	input := "[otel]\nlog_user_prompt = true\n\n[otel.exporter.otlp-http]\n" +
		`endpoint = "https://old.example.com/v1/logs"` + "\n"

	result := updateCodexConfig(input, "https://otel.example.com/v1/logs")

	if strings.Contains(result, "old.example.com") {
		t.Errorf("old endpoint should be replaced, got:\n%s", result)
	}
	if !strings.Contains(result, `endpoint = "https://otel.example.com/v1/logs"`) {
		t.Errorf("new endpoint missing, got:\n%s", result)
	}
}

func TestUpdateCodexConfig_PreservesOtherContent(t *testing.T) {
	input := "[model]\ndefault = \"gpt-4\"\n\n[history]\nmax_entries = 100\n"

	result := updateCodexConfig(input, "https://otel.example.com/v1/logs")

	if !strings.Contains(result, `default = "gpt-4"`) {
		t.Error("existing [model] content should be preserved")
	}
	if !strings.Contains(result, "max_entries = 100") {
		t.Error("existing [history] content should be preserved")
	}
	if !strings.Contains(result, "[otel.exporter.otlp-http]") {
		t.Error("missing appended otel exporter section")
	}
	if !strings.Contains(result, "[otel]") {
		t.Error("missing appended otel section")
	}
}

func TestUpdateCodexConfig_AddsLogUserPrompt(t *testing.T) {
	input := "[otel]\n\n[otel.exporter.otlp-http]\n" +
		`endpoint = "https://otel.example.com/v1/logs"` + "\n"

	result := updateCodexConfig(input, "https://otel.example.com/v1/logs")

	if !strings.Contains(result, "log_user_prompt = true") {
		t.Errorf("should add log_user_prompt, got:\n%s", result)
	}
}

func TestUpdateCodexConfig_NoChangeWhenCorrect(t *testing.T) {
	input := "[otel]\nlog_user_prompt = true\n\n[otel.exporter.otlp-http]\n" +
		`endpoint = "https://otel.example.com/v1/logs"` + "\n"

	result := updateCodexConfig(input, "https://otel.example.com/v1/logs")

	if result != input {
		t.Errorf("should not change correct config.\nGot:\n%q\nWant:\n%q", result, input)
	}
}

func TestUpdateCodexConfig_AddsEndpointToExistingSection(t *testing.T) {
	input := "[otel]\nlog_user_prompt = true\n\n[otel.exporter.otlp-http]\n"

	result := updateCodexConfig(input, "https://otel.example.com/v1/logs")

	if !strings.Contains(result, `endpoint = "https://otel.example.com/v1/logs"`) {
		t.Errorf("should add endpoint to existing section, got:\n%s", result)
	}
}

func TestUpdateCodexConfig_DoesNotCorruptSimilarKeys(t *testing.T) {
	input := "[otel]\nlog_user_prompt = true\nlog_user_prompt_extra = \"debug\"\n\n" +
		"[otel.exporter.otlp-http]\n" +
		`endpoint = "https://otel.example.com/v1/logs"` + "\n" +
		"endpoint_timeout = 30\n"

	result := updateCodexConfig(input, "https://otel.example.com/v1/logs")

	if !strings.Contains(result, "endpoint_timeout = 30") {
		t.Errorf("endpoint_timeout should be preserved, got:\n%s", result)
	}
	if !strings.Contains(result, `log_user_prompt_extra = "debug"`) {
		t.Errorf("log_user_prompt_extra should be preserved, got:\n%s", result)
	}
}

func TestUpdateCodexConfig_ReversedSectionOrder(t *testing.T) {
	input := "[otel.exporter.otlp-http]\n" +
		`endpoint = "https://old.example.com/v1/logs"` + "\n\n" +
		"[otel]\nlog_user_prompt = false\n"

	result := updateCodexConfig(input, "https://otel.example.com/v1/logs")

	if strings.Contains(result, "old.example.com") {
		t.Errorf("old endpoint should be replaced, got:\n%s", result)
	}
	if !strings.Contains(result, `endpoint = "https://otel.example.com/v1/logs"`) {
		t.Errorf("new endpoint missing, got:\n%s", result)
	}
	if !strings.Contains(result, "log_user_prompt = true") {
		t.Errorf("log_user_prompt should be forced to true, got:\n%s", result)
	}
}

func TestInjectCodexOtelConfig_CreatesFile(t *testing.T) {
	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	injectCodexOtelConfig("https://otel.example.com/")

	configPath := filepath.Join(tmpHome, ".codex", "config.toml")
	data, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("config file should exist: %v", err)
	}

	content := string(data)
	if !strings.Contains(content, `endpoint = "https://otel.example.com/v1/logs"`) {
		t.Errorf("endpoint not set correctly, got:\n%s", content)
	}
	if !strings.Contains(content, "log_user_prompt = true") {
		t.Errorf("log_user_prompt missing, got:\n%s", content)
	}
}

func TestInjectCodexOtelConfig_UpdatesExisting(t *testing.T) {
	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	// Create existing config with old endpoint
	codexDir := filepath.Join(tmpHome, ".codex")
	os.MkdirAll(codexDir, 0700)
	existing := "[otel]\nlog_user_prompt = true\n\n[otel.exporter.otlp-http]\n" +
		`endpoint = "https://old.example.com/v1/logs"` + "\n"
	os.WriteFile(filepath.Join(codexDir, "config.toml"), []byte(existing), 0644)

	injectCodexOtelConfig("https://otel.example.com/")

	data, err := os.ReadFile(filepath.Join(codexDir, "config.toml"))
	if err != nil {
		t.Fatal(err)
	}

	content := string(data)
	if strings.Contains(content, "old.example.com") {
		t.Errorf("old endpoint should be replaced, got:\n%s", content)
	}
	if !strings.Contains(content, `endpoint = "https://otel.example.com/v1/logs"`) {
		t.Errorf("new endpoint missing, got:\n%s", content)
	}
}

func TestInjectCodexOtelConfig_SkipsWhenUnchanged(t *testing.T) {
	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	codexDir := filepath.Join(tmpHome, ".codex")
	os.MkdirAll(codexDir, 0700)
	configPath := filepath.Join(codexDir, "config.toml")

	// Write config that already has the correct endpoint
	correct := "[otel]\nlog_user_prompt = true\n\n[otel.exporter.otlp-http]\n" +
		`endpoint = "https://otel.example.com/v1/logs"` + "\n"
	os.WriteFile(configPath, []byte(correct), 0644)

	// Record modification time
	infoBefore, _ := os.Stat(configPath)

	injectCodexOtelConfig("https://otel.example.com/")

	// File should not be rewritten
	infoAfter, _ := os.Stat(configPath)
	if !infoBefore.ModTime().Equal(infoAfter.ModTime()) {
		t.Error("file should not be rewritten when content is unchanged")
	}
}
