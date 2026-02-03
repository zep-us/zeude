// Package main provides the Zeude shim for claude CLI.
// This minimal wrapper injects telemetry environment variables,
// syncs MCP configuration, and executes the real claude binary.
package main

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"syscall"

	"github.com/zeude/zeude/internal/autoupdate"
	"github.com/zeude/zeude/internal/config"
	"github.com/zeude/zeude/internal/mcpconfig"
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

	// 1. Start parallel initialization (update check + config sync)
	printStatus("Initializing...")

	var updateResult autoupdate.UpdateResult
	var syncResult mcpconfig.SyncResult
	var wg sync.WaitGroup

	wg.Add(2)
	go func() {
		defer wg.Done()
		updateResult = autoupdate.CheckWithResult()
	}()
	go func() {
		defer wg.Done()
		syncResult = mcpconfig.Sync()
	}()

	// 2. Find real claude binary (while HTTP requests are in progress)
	realClaude, err := resolver.FindRealBinary()
	if err != nil {
		fmt.Fprintf(os.Stderr, "zeude: %v\n", err)
		os.Exit(1)
	}

	// 3. Wait for parallel tasks to complete
	wg.Wait()

	// 4. Display results
	// Build status parts
	var statusParts []string

	// Update status
	if updateResult.Updated {
		statusParts = append(statusParts, fmt.Sprintf("%s↑%s%s", colorGreen, updateResult.NewVersion, colorGray))
	} else if updateResult.NewVersionAvailable {
		statusParts = append(statusParts, fmt.Sprintf("%supdate: %s%s", colorYellow, updateResult.NewVersion, colorGray))
	}

	// Sync status
	if syncResult.NoAgentKey {
		statusParts = append(statusParts, fmt.Sprintf("%sno agent key%s", colorYellow, colorGray))
	} else if syncResult.Success {
		if syncResult.HookCount > 0 {
			statusParts = append(statusParts, fmt.Sprintf("%d hooks", syncResult.HookCount))
		}
		if syncResult.SkillCount > 0 {
			statusParts = append(statusParts, fmt.Sprintf("%d skills", syncResult.SkillCount))
		}
		if syncResult.ServerCount > 0 {
			statusParts = append(statusParts, fmt.Sprintf("%d servers", syncResult.ServerCount))
		}
		if syncResult.FromCache {
			statusParts = append(statusParts, "cached")
		}
	} else if !syncResult.NoAgentKey {
		statusParts = append(statusParts, fmt.Sprintf("%ssync failed%s", colorRed, colorGray))
	}

	// Print combined status
	if len(statusParts) > 0 {
		printInfo(strings.Join(statusParts, ", "))
	} else {
		printOK()
	}

	// 5. Show welcome message
	if interactive {
		showStartupBanner(syncResult)
	}

	// 6. Inject telemetry environment variables (only if not already set)
	injectTelemetryEnv(syncResult)

	// 7. Exec real claude (replaces this process - no PTY needed!)
	err = syscall.Exec(realClaude, os.Args, os.Environ())
	if err != nil {
		fmt.Fprintf(os.Stderr, "zeude: failed to exec claude: %v\n", err)
		os.Exit(1)
	}
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
	setEnvIfEmpty("CLAUDE_CODE_ENABLE_TELEMETRY", "1")

	// Configure OTel exporter endpoint (using shared config package)
	endpoint := config.GetCollectorEndpoint(config.DefaultCollectorEndpoint)
	setEnvIfEmpty("OTEL_EXPORTER_OTLP_ENDPOINT", endpoint)

	// Configure OTel protocol and exporters
	// Use http/protobuf instead of grpc for better compatibility
	setEnvIfEmpty("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf")
	setEnvIfEmpty("OTEL_METRICS_EXPORTER", "otlp")
	setEnvIfEmpty("OTEL_LOGS_EXPORTER", "otlp")
	setEnvIfEmpty("OTEL_TRACES_EXPORTER", "otlp")

	// Inject Zeude user info as OTEL resource attributes
	// This helps identify Bedrock users who don't have email in native telemetry
	// and allows matching ClickHouse data with Supabase users
	if syncResult.UserID != "" {
		injectResourceAttribute("zeude.user.id", syncResult.UserID)
	}
	if syncResult.UserEmail != "" {
		injectResourceAttribute("zeude.user.email", syncResult.UserEmail)
	}
	if syncResult.Team != "" {
		injectResourceAttribute("zeude.team", syncResult.Team)
	}
}

// injectResourceAttribute adds a key-value pair to OTEL_RESOURCE_ATTRIBUTES.
// Appends to existing attributes if present, otherwise creates new.
func injectResourceAttribute(key, value string) {
	// Escape special characters in value (commas and equals signs)
	escapedValue := strings.ReplaceAll(value, "=", "%3D")
	escapedValue = strings.ReplaceAll(escapedValue, ",", "%2C")

	attr := key + "=" + escapedValue

	existing := os.Getenv("OTEL_RESOURCE_ATTRIBUTES")
	if existing == "" {
		os.Setenv("OTEL_RESOURCE_ATTRIBUTES", attr)
	} else {
		os.Setenv("OTEL_RESOURCE_ATTRIBUTES", existing+","+attr)
	}
}

// setEnvIfEmpty sets an environment variable only if it's not already set.
// This allows users to override Zeude defaults.
func setEnvIfEmpty(key, value string) {
	if os.Getenv(key) == "" {
		os.Setenv(key, value)
	}
}
