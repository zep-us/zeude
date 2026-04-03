// Package main provides the Zeude shim for claude CLI.
// This minimal wrapper injects telemetry environment variables,
// syncs MCP configuration, and executes the real claude binary.
//
// Performance: Uses FastSync (cached user info) for <100ms startup.
// Full sync runs in a detached background process.
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/zeude/zeude/internal/autoupdate"
	"github.com/zeude/zeude/internal/config"
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
		mcpconfig.RunBackgroundSync()
		autoupdate.ForceCheckWithResult()
		// Companion install: auto-install codex shim if codex is in PATH but shim is missing.
		// Fail-open: errors are logged but never block the background sync.
		installCompanionCodexShim()
		os.Exit(0)
	}

	// Check if running interactively (show progress only in interactive mode)
	interactive := isInteractive()

	// Helper to print status
	printInfo := func(info string) {
		if interactive {
			fmt.Fprintf(os.Stderr, "%s[zeude]%s %s%s%s\n", colorBlue, colorReset, colorGray, info, colorReset)
		}
	}

	// 1. Fast sync: use cached user info (no network), or fall back to full sync on first run
	syncResult, needsBackgroundSync := mcpconfig.FastSync()

	// 2. Find real claude binary
	realClaude, err := resolver.FindRealBinary()
	if err != nil {
		fmt.Fprintf(os.Stderr, "zeude: %v\n", err)
		os.Exit(1)
	}

	// 3. Display status
	var statusParts []string

	if syncResult.NoAgentKey {
		statusParts = append(statusParts, fmt.Sprintf("%sno agent key%s", colorYellow, colorGray))
	} else if syncResult.Success {
		if syncResult.FromCache {
			statusParts = append(statusParts, "cached")
		}
		if syncResult.HookCount > 0 {
			statusParts = append(statusParts, fmt.Sprintf("%d hooks", syncResult.HookCount))
		}
		if syncResult.SkillCount > 0 {
			statusParts = append(statusParts, fmt.Sprintf("%d skills", syncResult.SkillCount))
		}
		if syncResult.ServerCount > 0 {
			statusParts = append(statusParts, fmt.Sprintf("%d servers", syncResult.ServerCount))
		}
	} else if !syncResult.NoAgentKey {
		statusParts = append(statusParts, fmt.Sprintf("%ssync failed%s", colorRed, colorGray))
	}

	if len(statusParts) > 0 {
		printInfo(strings.Join(statusParts, ", "))
	}

	// 4. Show welcome message
	if interactive {
		showStartupBanner(syncResult)
	}

	// 5. Inject telemetry environment variables (only if not already set)
	injectTelemetryEnv(syncResult)

	// 6. Spawn background sync BEFORE exec (it detaches from parent)
	if needsBackgroundSync {
		mcpconfig.BackgroundSync()
	}

	// 7. Exec real claude (replaces this process - no PTY needed!)
	if err := execBinary(realClaude, os.Args, os.Environ()); err != nil {
		fmt.Fprintf(os.Stderr, "zeude: failed to exec claude: %v\n", err)
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

// isInteractive checks if we're running in an interactive terminal
// Returns false if stdin is not a terminal or if -p/--print flag is used
func isInteractive() bool {
	// Check if stdin is a terminal (character device)
	stat, err := os.Stdin.Stat()
	if err != nil {
		return false
	}
	if (stat.Mode() & os.ModeCharDevice) == 0 {
		return false // stdin is a pipe or file
	}

	// Check for -p or --print flags (non-interactive mode)
	for _, arg := range os.Args[1:] {
		if arg == "-p" || arg == "--print" || arg == "-h" || arg == "--help" || arg == "--version" {
			return false
		}
	}

	return true
}


// showStartupBanner displays a welcome message
func showStartupBanner(syncResult mcpconfig.SyncResult) {
	// Extract username from email (part before @)
	userName := "there"
	if syncResult.UserEmail != "" {
		parts := strings.Split(syncResult.UserEmail, "@")
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

	// Print welcome
	fmt.Fprintf(os.Stderr, "%s[zeude]%s Ready! Hi %s%s%s%s\n", colorBlue, colorReset, colorGreen, userName, colorReset, versionStr)

	// Show warning if agent key is not configured
	if syncResult.NoAgentKey {
		fmt.Fprintf(os.Stderr, "%s[zeude]%s %s⚠ Run: echo 'agent_key=YOUR_KEY' > ~/.zeude/credentials%s\n",
			colorBlue, colorReset, colorYellow, colorReset)
	}
}

// injectTelemetryEnv sets OTel environment variables for Claude's native telemetry.
// Uses fail-open principle: only sets vars if not already configured.
// Also injects Zeude user info as OTEL resource attributes for Bedrock users
// who don't have email in their native telemetry.
func injectTelemetryEnv(syncResult mcpconfig.SyncResult) {
	// Enable Claude Code telemetry
	otelenv.SetEnvIfEmpty("CLAUDE_CODE_ENABLE_TELEMETRY", "1")

	// Configure OTel exporter endpoint (using shared config package)
	endpoint := config.GetCollectorEndpoint(config.DefaultCollectorEndpoint)
	otelenv.SetEnvIfEmpty("OTEL_EXPORTER_OTLP_ENDPOINT", endpoint)

	// Configure OTel protocol and exporters
	// Use http/protobuf instead of grpc for better compatibility
	otelenv.SetEnvIfEmpty("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf")
	otelenv.SetEnvIfEmpty("OTEL_METRICS_EXPORTER", "otlp")
	otelenv.SetEnvIfEmpty("OTEL_LOGS_EXPORTER", "otlp")
	otelenv.SetEnvIfEmpty("OTEL_TRACES_EXPORTER", "otlp")

	// Inject Zeude user info as OTEL resource attributes
	// This helps identify Bedrock users who don't have email in native telemetry
	// and allows matching ClickHouse data with Supabase users
	if syncResult.UserID != "" {
		otelenv.InjectResourceAttribute("zeude.user.id", syncResult.UserID)
	}
	if syncResult.UserEmail != "" {
		otelenv.InjectResourceAttribute("zeude.user.email", syncResult.UserEmail)
	}
	if syncResult.Team != "" {
		otelenv.InjectResourceAttribute("zeude.team", syncResult.Team)
	}
}

// installCompanionCodexShim auto-installs the codex shim if codex is in PATH
// but no shim exists at ~/.zeude/bin/codex. Called during background sync.
// Also repairs corrupted codex shims (caused by a bug where the Claude-specific
// autoupdate in the codex background sync overwrote the codex binary with claude).
// Fail-open: errors are logged but never block Claude's operation.
func installCompanionCodexShim() {
	// Check if real codex exists in PATH (not our shim)
	if _, err := resolver.FindRealBinaryByName("codex"); err != nil {
		return // Codex not installed, nothing to do
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return
	}

	shimPath := filepath.Join(home, ".zeude", "bin", "codex")
	needsInstall := false

	if _, err := os.Stat(shimPath); os.IsNotExist(err) {
		// Codex shim missing — needs install
		needsInstall = true
	} else if isCorruptedCodexShim(home) {
		// Codex shim exists but is corrupted (identical to claude binary)
		needsInstall = true
		fmt.Fprintf(os.Stderr, "[zeude:background] codex shim corrupted, repairing...\n")
	}

	if !needsInstall {
		return
	}

	if err := autoupdate.InstallCompanionBinary("codex"); err != nil {
		fmt.Fprintf(os.Stderr, "[zeude:background] codex companion install failed: %v\n", err)
		return
	}

	// Store real codex path for the resolver
	if realCodex, err := resolver.FindRealBinaryByName("codex"); err == nil {
		storedPath := filepath.Join(home, ".zeude", "real_codex_path")
		os.WriteFile(storedPath, []byte(realCodex), 0600)
	}
}

// isCorruptedCodexShim detects whether ~/.zeude/bin/codex has been overwritten
// with the claude binary. This happened due to a bug where the codex shim's
// background sync called the Claude-specific autoupdate function, which
// downloaded the claude binary and wrote it to the codex path.
// Detection: if codex and claude binaries have identical file sizes, the codex
// shim is almost certainly corrupted (they are built from different Go packages).
//
// TEMPORARY: This function exists to repair installations corrupted by the bug
// fixed in cmd/codex/main.go (ForceCheckWithResult → ForceCheckBinaryWithResult).
// Once all users have updated (estimate: 2 weeks after deploy), this function
// and the corruption check in installCompanionCodexShim can be removed,
// reverting to the original "if file exists, skip" logic.
func isCorruptedCodexShim(home string) bool {
	claudePath := filepath.Join(home, ".zeude", "bin", "claude")
	codexPath := filepath.Join(home, ".zeude", "bin", "codex")

	claudeInfo, err := os.Stat(claudePath)
	if err != nil {
		return false
	}
	codexInfo, err := os.Stat(codexPath)
	if err != nil {
		return false
	}

	return claudeInfo.Size() == codexInfo.Size()
}
