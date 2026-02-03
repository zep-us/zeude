package mcpconfig

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// packageJSON represents the structure of package.json for version extraction.
type packageJSON struct {
	Version string `json:"version"`
}

// InstallStatus represents the installation status of an MCP server.
type InstallStatus struct {
	ServerName string `json:"serverName"`
	Installed  bool   `json:"installed"`
	Version    string `json:"version,omitempty"`
}

// InstallStatusReport is the payload sent to the dashboard.
type InstallStatusReport struct {
	InstallStatus []InstallStatus `json:"installStatus"`
}

// CheckInstallStatus checks the installation status of MCP servers.
func CheckInstallStatus(servers map[string]MCPServer) []InstallStatus {
	results := make([]InstallStatus, 0, len(servers))

	for name, server := range servers {
		status := InstallStatus{
			ServerName: name,
			Installed:  false,
		}

		// Determine package type based on command
		switch server.Command {
		case "npx":
			status.Installed, status.Version = checkNpxPackage(server.Args)
		case "uvx":
			status.Installed, status.Version = checkUvxPackage(server.Args)
		case "node":
			// Direct node execution - check if script exists
			if len(server.Args) > 0 {
				status.Installed = checkFileExists(server.Args[0])
			}
		case "python", "python3":
			// Python package - check with pip
			status.Installed, status.Version = checkPythonPackage(server.Args)
		default:
			// Unknown command type - assume installed if command exists
			status.Installed = checkCommandExists(server.Command)
		}

		results = append(results, status)
	}

	return results
}

// checkNpxPackage checks if an npm package is installed globally.
// Args typically look like ["-y", "@package/name"] or ["@package/name"]
func checkNpxPackage(args []string) (bool, string) {
	// Extract package name from args
	packageName := ""
	for _, arg := range args {
		if strings.HasPrefix(arg, "@") || !strings.HasPrefix(arg, "-") {
			if !strings.HasPrefix(arg, "-") && arg != "" {
				packageName = arg
				break
			}
		}
	}

	if packageName == "" {
		return false, ""
	}

	// Try npm list -g first
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "npm", "list", "-g", "--depth=0", packageName)
	output, err := cmd.Output()
	if err != nil {
		logDebug("npm list failed for %s: %v", packageName, err)
		// Fallback: check if npx would download or use cached
		return checkNpxCache(packageName)
	}

	// Parse version from npm list output
	version := parseNpmListVersion(string(output), packageName)
	return version != "", version
}

// checkNpxCache checks if npx has the package cached by checking npm's cache directory.
// Note: npm cache ls was removed in npm v5, so we check if the package exists in the global node_modules.
func checkNpxCache(packageName string) (bool, string) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// Check if package exists in global node_modules (npm v5+ compatible)
	// This indicates the package is available for npx to use
	cmd := exec.CommandContext(ctx, "npm", "root", "-g")
	output, err := cmd.Output()
	if err != nil {
		logDebug("npm root -g failed: %v", err)
		return false, ""
	}

	globalPath := strings.TrimSpace(string(output))
	if globalPath == "" {
		return false, ""
	}

	// Check if the package directory exists in global node_modules
	pkgPath := globalPath + "/" + packageName
	if checkFileExists(pkgPath) {
		// Try to read package version from package.json using Go native JSON
		pkgJSONPath := pkgPath + "/package.json"
		if data, err := os.ReadFile(pkgJSONPath); err == nil {
			var pkg packageJSON
			if json.Unmarshal(data, &pkg) == nil && pkg.Version != "" {
				return true, pkg.Version
			}
		}
		return true, ""
	}

	return false, ""
}

// parseNpmListVersion extracts version from npm list output.
func parseNpmListVersion(output, packageName string) string {
	// npm list output format: "@scope/package@1.2.3"
	re := regexp.MustCompile(regexp.QuoteMeta(packageName) + `@([\d.]+)`)
	matches := re.FindStringSubmatch(output)
	if len(matches) > 1 {
		return matches[1]
	}
	return ""
}

// checkUvxPackage checks if a Python package is available via uvx.
func checkUvxPackage(args []string) (bool, string) {
	// Extract package name from args
	packageName := ""
	for _, arg := range args {
		if !strings.HasPrefix(arg, "-") && arg != "" {
			packageName = arg
			break
		}
	}

	if packageName == "" {
		return false, ""
	}

	// Check with uv pip show
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "uv", "pip", "show", packageName)
	output, err := cmd.Output()
	if err != nil {
		logDebug("uv pip show failed for %s: %v", packageName, err)
		return false, ""
	}

	// Parse version from pip show output
	version := parsePipShowVersion(string(output))
	return version != "", version
}

// checkPythonPackage checks if a Python package is installed.
func checkPythonPackage(args []string) (bool, string) {
	// Try to find a module name in args
	moduleName := ""
	for i, arg := range args {
		if arg == "-m" && i+1 < len(args) {
			moduleName = args[i+1]
			break
		}
	}

	if moduleName == "" {
		return false, ""
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "pip", "show", moduleName)
	output, err := cmd.Output()
	if err != nil {
		// Try pip3
		cmd = exec.CommandContext(ctx, "pip3", "show", moduleName)
		output, err = cmd.Output()
		if err != nil {
			return false, ""
		}
	}

	version := parsePipShowVersion(string(output))
	return version != "", version
}

// parsePipShowVersion extracts version from pip show output.
func parsePipShowVersion(output string) string {
	for _, line := range strings.Split(output, "\n") {
		if strings.HasPrefix(line, "Version:") {
			return strings.TrimSpace(strings.TrimPrefix(line, "Version:"))
		}
	}
	return ""
}

// checkFileExists checks if a file exists.
func checkFileExists(path string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "test", "-f", path)
	return cmd.Run() == nil
}

// checkCommandExists checks if a command is available in PATH.
func checkCommandExists(command string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "which", command)
	return cmd.Run() == nil
}

// reportStatusToAPI sends a JSON payload to the dashboard status API.
// This is a shared helper to avoid code duplication.
func reportStatusToAPI(agentKey string, payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal status: %w", err)
	}

	url := fmt.Sprintf("%s/api/status/_", getDashboardURL())

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "zeude-cli/1.0")
	req.Header.Set("Authorization", "Bearer "+agentKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send status: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("status report failed: %d", resp.StatusCode)
	}

	return nil
}

// ReportInstallStatus sends installation status to the dashboard.
func ReportInstallStatus(agentKey string, status []InstallStatus) error {
	if len(status) == 0 {
		return nil
	}
	report := InstallStatusReport{InstallStatus: status}
	if err := reportStatusToAPI(agentKey, report); err != nil {
		return err
	}
	logDebug("reported install status for %d servers", len(status))
	return nil
}

// HookInstallStatus represents the installation status of a hook.
type HookInstallStatus struct {
	HookID    string `json:"hookId"`
	Installed bool   `json:"installed"`
	Version   string `json:"version,omitempty"`
}

// HookInstallStatusReport is the payload sent to the dashboard for hooks.
type HookInstallStatusReport struct {
	HookInstallStatus []HookInstallStatus `json:"hookInstallStatus"`
}

// ReportHookInstallStatus sends hook installation status to the dashboard.
func ReportHookInstallStatus(agentKey string, status []HookInstallStatus) error {
	if len(status) == 0 {
		return nil
	}
	report := HookInstallStatusReport{HookInstallStatus: status}
	if err := reportStatusToAPI(agentKey, report); err != nil {
		return err
	}

	logDebug("reported install status for %d hooks", len(status))
	return nil
}
