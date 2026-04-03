// Package main provides the Zeude shim for codex CLI (OpenAI Codex).
// This minimal wrapper injects telemetry environment variables,
// syncs skills from the Zeude dashboard, and executes the real codex binary.
// Only skills are synced (to both ~/.claude/skills/ and ~/.codex/skills/).
// MCP servers, hooks, and agents are NOT synced (Claude Code specific).
// org_id is left empty (no Collector lookup for Codex).
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/zeude/zeude/internal/autoupdate"
	"github.com/zeude/zeude/internal/config"
	"github.com/zeude/zeude/internal/identity"
	"github.com/zeude/zeude/internal/mcpconfig"
	"github.com/zeude/zeude/internal/otelenv"
	"github.com/zeude/zeude/internal/resolver"
)

// ANSI color codes
const (
	colorReset  = "\033[0m"
	colorBlue   = "\033[1;34m"
	colorGreen  = "\033[1;32m"
	colorYellow = "\033[1;33m"
	colorRed    = "\033[1;31m"
	colorGray   = "\033[0;90m"
)

func main() {
	// Handle --background-sync mode (spawned by previous shim invocation)
	if isBackgroundSyncMode() {
		mcpconfig.RunBackgroundSyncSkillsOnly()
		autoupdate.ForceCheckBinaryWithResult("codex")
		os.Exit(0)
	}

	// Check if running interactively (show progress only in interactive mode)
	interactive := isInteractive()

	// Helper to print status
	printStatus := func(msg string) {
		if interactive {
			fmt.Fprintf(os.Stderr, "%s[zeude]%s %s", colorBlue, colorReset, msg)
		}
	}
	printOK := func() {
		if interactive {
			fmt.Fprintf(os.Stderr, " %s✓%s\n", colorGreen, colorReset)
		}
	}
	printInfo := func(info string) {
		if interactive {
			fmt.Fprintf(os.Stderr, " %s%s%s\n", colorGray, info, colorReset)
		}
	}

	// 1. Fast sync: use cached user info for skills + config (no network on cache hit)
	// This syncs skills to both ~/.claude/skills/ and ~/.codex/skills/
	printStatus("Initializing...")
	syncResult, needsBackgroundSync := mcpconfig.FastSyncSkillsOnly()

	// 1.5. Start parallel initialization (update check + identity resolution)
	var updateResult autoupdate.UpdateResult
	var userIdentity identity.UserIdentity
	var wg sync.WaitGroup

	wg.Add(2)
	go func() {
		defer wg.Done()
		updateResult = autoupdate.CheckBinaryWithResult("codex")
	}()
	go func() {
		defer wg.Done()
		userIdentity = identity.Resolve()
	}()

	// 2. Find real codex binary (while HTTP requests are in progress)
	realCodex, err := resolver.FindRealBinaryByName("codex")
	if err != nil {
		fmt.Fprintf(os.Stderr, "zeude: cannot find real codex binary: %v\n", err)
		fmt.Fprintf(os.Stderr, "zeude: ensure codex is installed and in your PATH\n")
		fmt.Fprintf(os.Stderr, "zeude: or set the path in ~/.zeude/real_codex_path\n")
		os.Exit(1)
	}

	// 3. Wait for parallel tasks to complete
	wg.Wait()

	// 3.5. Re-exec if binary was updated (no symlink resolution for codex)
	if updateResult.Updated {
		execPath, err := os.Executable()
		if err == nil {
			fmt.Fprintf(os.Stderr, "\n")
			execBinary(execPath, os.Args, os.Environ())
			// If exec fails, continue with old binary
		}
	}

	// 4. Display results
	var statusParts []string

	// Update status
	if updateResult.Updated {
		statusParts = append(statusParts, fmt.Sprintf("%s↑%s%s", colorGreen, updateResult.NewVersion, colorGray))
	} else if updateResult.NewVersionAvailable {
		statusParts = append(statusParts, fmt.Sprintf("%supdate: %s%s", colorYellow, updateResult.NewVersion, colorGray))
	}

	// Sync status (skill count from FastSync)
	if syncResult.NoAgentKey {
		statusParts = append(statusParts, fmt.Sprintf("%sno agent key%s", colorYellow, colorGray))
	} else if syncResult.Success && syncResult.SkillCount > 0 {
		statusParts = append(statusParts, fmt.Sprintf("%d skills", syncResult.SkillCount))
	} else if !syncResult.Success && !syncResult.NoAgentKey {
		// Fall back to identity status if sync failed
		if userIdentity.NoAgentKey {
			statusParts = append(statusParts, fmt.Sprintf("%sno agent key%s", colorYellow, colorGray))
		} else if userIdentity.IsEmpty() {
			statusParts = append(statusParts, fmt.Sprintf("%sidentity fetch failed%s", colorRed, colorGray))
		}
	}

	// Print combined status
	if len(statusParts) > 0 {
		printInfo(strings.Join(statusParts, ", "))
	} else {
		printOK()
	}

	// 5. Show welcome message
	if interactive {
		showStartupBanner(userIdentity)
	}

	// 6. Inject telemetry environment variables
	// Use identity from sync result if available, fall back to standalone resolution
	injectTelemetryEnv(userIdentity)

	// 6.5. Inject OTEL endpoint into Codex config.toml.
	otelEndpoint := config.GetCollectorEndpoint(config.DefaultCollectorEndpoint)
	injectCodexOtelConfig(otelEndpoint)

	// 6.9. Spawn background sync BEFORE exec (it detaches from parent)
	if needsBackgroundSync {
		mcpconfig.BackgroundSync()
	}

	// 7. Exec real codex (replaces this process)
	if err := execBinary(realCodex, os.Args, os.Environ()); err != nil {
		fmt.Fprintf(os.Stderr, "zeude: failed to exec codex: %v\n", err)
		os.Exit(1)
	}
}

// isBackgroundSyncMode checks if we're invoked as a background sync subprocess.
func isBackgroundSyncMode() bool {
	for _, arg := range os.Args[1:] {
		if arg == "--background-sync" {
			return true
		}
	}
	return false
}

// isInteractive checks if we're running in an interactive terminal.
// Returns false if stdin is not a terminal or if non-interactive flags are used.
func isInteractive() bool {
	stat, err := os.Stdin.Stat()
	if err != nil {
		return false
	}
	if (stat.Mode() & os.ModeCharDevice) == 0 {
		return false // stdin is a pipe or file
	}

	// Check for non-interactive flags
	for _, arg := range os.Args[1:] {
		if arg == "-q" || arg == "--quiet" || arg == "-h" || arg == "--help" || arg == "--version" {
			return false
		}
	}

	return true
}

// showStartupBanner displays a welcome message for Codex users.
func showStartupBanner(userIdentity identity.UserIdentity) {
	// Extract username from email (part before @)
	userName := "there"
	if userIdentity.UserEmail != "" {
		parts := strings.Split(userIdentity.UserEmail, "@")
		if len(parts) > 0 && parts[0] != "" {
			userName = parts[0]
		}
	}

	// Version
	version := autoupdate.GetVersion()
	versionStr := ""
	if version != "dev" {
		versionStr = fmt.Sprintf(" %sv%s%s", colorGray, version, colorReset)
	}

	// Print welcome (note: codex mode)
	fmt.Fprintf(os.Stderr, "%s[zeude]%s Ready! Hi %s%s%s%s %s(codex)%s\n",
		colorBlue, colorReset, colorGreen, userName, colorReset, versionStr, colorGray, colorReset)

	// Show warning if agent key is not configured
	if userIdentity.NoAgentKey {
		fmt.Fprintf(os.Stderr, "%s[zeude]%s %s⚠ Run: echo 'agent_key=YOUR_KEY' > ~/.zeude/credentials%s\n",
			colorBlue, colorReset, colorYellow, colorReset)
	}
}

// injectTelemetryEnv sets OTel environment variables for Codex telemetry.
// Uses fail-open principle: only sets vars if not already configured.
// Injects Zeude user info as OTEL resource attributes so that Codex telemetry
// data can be correlated with Supabase user identities in ClickHouse.
//
// Key differences from Claude shim:
//   - ServiceName attribute set to "codex" for source identification in MVs
//   - org_id is intentionally left empty (no Collector lookup for Codex)
//   - Same zeude.user.id injection for cross-tool identity consistency
//
// Identity consistency guarantee: Both Claude Code and Codex shims resolve
// the user's Supabase UUID from the same agent_key in ~/.zeude/credentials.
// The identity package ensures the same canonical UUID is used regardless
// of which tool the developer is using.
func injectTelemetryEnv(userIdentity identity.UserIdentity) {
	// Configure OTel exporter endpoint (using shared config package)
	endpoint := config.GetCollectorEndpoint(config.DefaultCollectorEndpoint)
	otelenv.SetEnvIfEmpty("OTEL_EXPORTER_OTLP_ENDPOINT", endpoint)

	// Configure OTel protocol and exporters
	// Use http/protobuf for compatibility (same as claude shim)
	otelenv.SetEnvIfEmpty("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf")
	otelenv.SetEnvIfEmpty("OTEL_METRICS_EXPORTER", "otlp")
	otelenv.SetEnvIfEmpty("OTEL_LOGS_EXPORTER", "otlp")
	otelenv.SetEnvIfEmpty("OTEL_TRACES_EXPORTER", "otlp")

	// Set service name to "codex" for source identification in ClickHouse MVs.
	// This allows the ServiceName-based extraction to distinguish Codex vs Claude data.
	otelenv.SetEnvIfEmpty("OTEL_SERVICE_NAME", "codex")

	// Inject Zeude user identity as OTEL resource attributes.
	// This is the critical piece: ensures the same developer using both
	// Claude Code and Codex resolves to a single Supabase UUID.
	// The identity.Resolve() function guarantees the same UUID for the same
	// agent_key, regardless of which shim (claude or codex) calls it.
	if userIdentity.UserID != "" {
		otelenv.InjectResourceAttribute("zeude.user.id", userIdentity.UserID)
	}
	if userIdentity.UserEmail != "" {
		otelenv.InjectResourceAttribute("zeude.user.email", userIdentity.UserEmail)
	}
	if userIdentity.Team != "" {
		otelenv.InjectResourceAttribute("zeude.team", userIdentity.Team)
	}

	// Inject working directory as resource attribute.
	// Claude Code gets this via the prompt-logger hook; for Codex we inject
	// it from the shim so the Collector transform can map it into log attributes.
	if cwd, err := os.Getwd(); err == nil {
		otelenv.InjectResourceAttribute("zeude.working_directory", cwd)
		otelenv.InjectResourceAttribute("zeude.project_path", cwd)
	}

	// Note: org_id is intentionally NOT injected for Codex.
	// Per design constraints, org_id is left empty for Codex data.
}

// injectCodexOtelConfig modifies ~/.codex/config.toml to set the OTEL endpoint.
// Codex-rs reads its OTEL endpoint from config.toml rather than environment variables,
// so the shim must write the endpoint directly into the config file.
// Fails open: errors are logged but do not prevent codex from running.
func injectCodexOtelConfig(endpoint string) {
	home, err := os.UserHomeDir()
	if err != nil {
		fmt.Fprintf(os.Stderr, "zeude: warning: cannot get home dir for codex config: %v\n", err)
		return
	}

	configPath := filepath.Join(home, ".codex", "config.toml")

	// Ensure .codex directory exists
	if err := os.MkdirAll(filepath.Dir(configPath), 0700); err != nil {
		fmt.Fprintf(os.Stderr, "zeude: warning: cannot create .codex dir: %v\n", err)
		return
	}

	// Build endpoint with /v1/logs path (Codex expects the full path)
	fullEndpoint := strings.TrimRight(endpoint, "/") + "/v1/logs"

	// Read existing config
	data, err := os.ReadFile(configPath)
	if err != nil && !os.IsNotExist(err) {
		fmt.Fprintf(os.Stderr, "zeude: warning: cannot read codex config: %v\n", err)
		return
	}

	result := updateCodexConfig(string(data), fullEndpoint)

	// Skip write if unchanged
	if result == string(data) {
		return
	}

	// Preserve original file permissions
	perm := os.FileMode(0644)
	if info, err := os.Stat(configPath); err == nil {
		perm = info.Mode().Perm()
	}

	if err := writeFileAtomicSimple(configPath, []byte(result), perm); err != nil {
		fmt.Fprintf(os.Stderr, "zeude: warning: cannot write codex config: %v\n", err)
	}
}

// tomlKey extracts the key name from a TOML key-value line.
// Returns empty string if the line is not a key-value pair.
// e.g., `endpoint = "..."` → "endpoint", `endpoint_timeout = 30` → "endpoint_timeout"
func tomlKey(line string) string {
	parts := strings.SplitN(line, "=", 2)
	if len(parts) != 2 {
		return ""
	}
	return strings.TrimSpace(parts[0])
}

// updateCodexConfig updates TOML content to set the OTEL endpoint and log_user_prompt.
// Pure function for testability — takes content string, returns updated content.
func updateCodexConfig(content, endpoint string) string {
	lines := strings.Split(content, "\n")

	var result []string
	currentSection := ""
	foundEndpoint := false
	foundLogUserPrompt := false
	foundOtelSection := false
	foundExporterSection := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		// Detect TOML section headers
		if strings.HasPrefix(trimmed, "[") && strings.HasSuffix(trimmed, "]") {
			// Inject missing keys before leaving the current section
			if currentSection == "[otel]" && !foundLogUserPrompt {
				result = append(result, "log_user_prompt = true")
			}
			if currentSection == "[otel.exporter.otlp-http]" && !foundEndpoint {
				result = append(result, fmt.Sprintf(`endpoint = "%s"`, endpoint))
				foundEndpoint = true
			}

			currentSection = trimmed
			if trimmed == "[otel]" {
				foundOtelSection = true
			} else if trimmed == "[otel.exporter.otlp-http]" {
				foundExporterSection = true
			}
		}

		// Replace endpoint value in [otel.exporter.otlp-http]
		// Use exact key matching to avoid corrupting keys like endpoint_timeout
		if currentSection == "[otel.exporter.otlp-http]" && tomlKey(trimmed) == "endpoint" {
			result = append(result, fmt.Sprintf(`endpoint = "%s"`, endpoint))
			foundEndpoint = true
			continue
		}

		// Ensure log_user_prompt = true in [otel] section
		if currentSection == "[otel]" && tomlKey(trimmed) == "log_user_prompt" {
			result = append(result, "log_user_prompt = true")
			foundLogUserPrompt = true
			continue
		}

		result = append(result, line)
	}

	// Handle last section (file may end without a new section header)
	if currentSection == "[otel]" && !foundLogUserPrompt {
		result = append(result, "log_user_prompt = true")
	}
	if currentSection == "[otel.exporter.otlp-http]" && !foundEndpoint {
		result = append(result, fmt.Sprintf(`endpoint = "%s"`, endpoint))
	}

	text := strings.Join(result, "\n")

	// Append missing sections
	if !foundOtelSection {
		if text != "" {
			text = strings.TrimRight(text, "\n") + "\n\n"
		}
		text += "[otel]\nlog_user_prompt = true\n"
	}

	if !foundExporterSection {
		text = strings.TrimRight(text, "\n") + "\n\n"
		text += "[otel.exporter.otlp-http]\n" + fmt.Sprintf(`endpoint = "%s"`, endpoint) + "\n" + `protocol = "binary"` + "\n"
	}

	return text
}

// writeFileAtomicSimple writes data to a file atomically using temp file + rename.
// Simplified version of the pattern used in mcpconfig/sync.go.
func writeFileAtomicSimple(targetPath string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(targetPath)
	tmpFile, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	tmpPath := tmpFile.Name()

	success := false
	defer func() {
		if !success {
			os.Remove(tmpPath)
		}
	}()

	if err := tmpFile.Chmod(perm); err != nil {
		tmpFile.Close()
		return err
	}
	if _, err := tmpFile.Write(data); err != nil {
		tmpFile.Close()
		return err
	}
	if err := tmpFile.Sync(); err != nil {
		tmpFile.Close()
		return err
	}
	if err := tmpFile.Close(); err != nil {
		return err
	}

	if err := os.Rename(tmpPath, targetPath); err != nil {
		return err
	}
	success = true
	return nil
}

