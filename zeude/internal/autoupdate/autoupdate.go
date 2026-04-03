// Package autoupdate handles self-updating of zeude shim binaries.
// Supports updating any named binary (claude, codex, etc.) and companion
// installation of additional shims during background sync.
//
// Design: N=2 optimized (Claude + Codex), but generic enough for N>2.
// TODO: If a third shim is added, consider a manifest-driven updater.
package autoupdate

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

// Version is set at build time via -ldflags
var Version = "dev"

const (
	checkInterval       = 24 * time.Hour
	forceUpdateInterval = 12 * time.Hour // Force update if not updated in 12 hours
	updateTimeout       = 30 * time.Second
	defaultUpdateURL    = "https://cc.zep.works/releases"
)

// For testing: allow overriding the update URL and HOME directory.
var (
	updateURL = defaultUpdateURL
	homeDir   = "" // empty means use os.UserHomeDir()
)

// getHomeDir returns the home directory, using the override if set.
func getHomeDir() string {
	if homeDir != "" {
		return homeDir
	}
	h, err := os.UserHomeDir()
	if err != nil {
		return os.Getenv("HOME")
	}
	return h
}

// configDir returns ~/.zeude
func configDir() string {
	return filepath.Join(getHomeDir(), ".zeude")
}

// --- Per-binary state file helpers ---

// stateFilePath returns the path for a per-binary state file.
// For Claude, it also handles backward compatibility with unsuffixed legacy files.
func stateFilePath(baseName, binaryName string) string {
	suffixed := filepath.Join(configDir(), baseName+"_"+binaryName)
	if binaryName == "claude" {
		// Backward compat: if suffixed doesn't exist but unsuffixed does, migrate
		unsuffixed := filepath.Join(configDir(), baseName)
		if _, err := os.Stat(suffixed); os.IsNotExist(err) {
			if _, err := os.Stat(unsuffixed); err == nil {
				// Migrate: copy unsuffixed → suffixed
				if data, err := os.ReadFile(unsuffixed); err == nil {
					os.WriteFile(suffixed, data, 0600)
				}
				return suffixed
			}
		}
	}
	return suffixed
}

// --- Public API: Claude-specific (backward compatible) ---

// RequiresUpdate checks if an update is required (more than forceUpdateInterval since last successful update).
// Returns true if update is required, false otherwise.
// This reads the unsuffixed last_successful_update file for hook SQL compatibility.
func RequiresUpdate() bool {
	if Version == "dev" {
		return false
	}

	lastSuccessFile := filepath.Join(configDir(), "last_successful_update")

	info, err := os.Stat(lastSuccessFile)
	if err != nil {
		// File doesn't exist - first time user or never updated successfully
		// Be lenient: create the file and don't require update yet
		touchFile(lastSuccessFile)
		return false
	}

	return time.Since(info.ModTime()) > forceUpdateInterval
}

// TimeSinceLastUpdate returns how long since the last successful update.
// Reads the unsuffixed file for hook SQL compatibility.
func TimeSinceLastUpdate() time.Duration {
	lastSuccessFile := filepath.Join(configDir(), "last_successful_update")

	info, err := os.Stat(lastSuccessFile)
	if err != nil {
		return 0
	}

	return time.Since(info.ModTime())
}

// MarkUpdateSuccess marks the current time as last successful update.
// Dual-writes: unsuffixed (for hook SQL at 20260106000001) AND _claude suffixed.
func MarkUpdateSuccess() {
	dir := configDir()
	touchFile(filepath.Join(dir, "last_successful_update"))
	touchFile(filepath.Join(dir, "last_successful_update_claude"))
}

// markBinaryUpdateSuccess marks update success for a specific binary.
// For Claude: dual-writes (unsuffixed + suffixed) for hook SQL compatibility.
// For Codex: writes only the suffixed file.
func markBinaryUpdateSuccess(binaryName string) {
	dir := configDir()
	touchFile(filepath.Join(dir, "last_successful_update_"+binaryName))
	if binaryName == "claude" {
		// Also touch unsuffixed for hook SQL backward compatibility
		touchFile(filepath.Join(dir, "last_successful_update"))
	}
}

// UpdateResult contains the result of an update check.
type UpdateResult struct {
	Skipped             bool   // True if check was skipped (checked recently)
	NewVersionAvailable bool   // True if a new version is available
	NewVersion          string // The new version string
	Updated             bool   // True if update was successfully applied
	Error               error  // Error if check or update failed
}

// Check checks for updates and self-updates if a newer version is available.
// This is fail-open: any error is logged and execution continues.
// Deprecated: Use CheckWithResult for more detailed information.
func Check() {
	CheckWithResult()
}

// CheckWithResult checks for Claude updates and returns detailed result.
// Includes re-exec on successful update (Claude-specific behavior).
// Skips check if already checked within checkInterval (24h).
func CheckWithResult() UpdateResult {
	return checkWithResultClaude(false)
}

// ForceCheckWithResult always checks for Claude updates regardless of checkInterval.
// Use this in background sync to ensure updates are picked up promptly.
func ForceCheckWithResult() UpdateResult {
	return checkWithResultClaude(true)
}

// checkWithResultClaude is the Claude-specific update flow with re-exec.
// This preserves the exact existing behavior for the Claude shim.
func checkWithResultClaude(force bool) UpdateResult {
	result := UpdateResult{}

	// Always write current version for hook to read
	writeCurrentVersion()

	if Version == "dev" {
		result.Skipped = true
		return result
	}

	lastCheckFile := stateFilePath("last_update_check", "claude")

	// Skip if checked recently (within 24h), unless forced
	if !force && shouldSkip(lastCheckFile) {
		result.Skipped = true
		return result
	}

	// Check remote version
	remoteVersion, err := fetchRemoteVersion()
	if err != nil {
		result.Error = err
		return result
	}

	// Mark that we checked (regardless of result)
	updateLastCheckTime(lastCheckFile)

	result.NewVersion = remoteVersion

	// Compare versions
	if !isNewer(remoteVersion, Version) {
		// Already up to date - mark as successful
		MarkUpdateSuccess()
		return result
	}

	result.NewVersionAvailable = true

	// Perform update (Claude-specific: resolves symlinks internally)
	if err := performUpdate(); err != nil {
		result.Error = err
		return result
	}

	// Mark update as successful
	MarkUpdateSuccess()
	result.Updated = true

	// Re-exec with new binary immediately (Claude-specific)
	execPath, err := os.Executable()
	if err == nil {
		execPath, _ = filepath.EvalSymlinks(execPath)
		fmt.Fprintf(os.Stderr, "\n")
		syscall.Exec(execPath, os.Args, os.Environ())
		// If exec fails, continue with old binary
	}

	return result
}

// --- Public API: Generic binary update ---

// CheckBinaryWithResult checks for updates for any named binary.
// Unlike CheckWithResult, it does NOT re-exec — the caller handles re-exec.
// Uses per-binary state files to avoid cross-binary suppression.
func CheckBinaryWithResult(binaryName string) UpdateResult {
	return checkBinaryWithResult(binaryName, false)
}

// ForceCheckBinaryWithResult always checks for updates regardless of checkInterval.
func ForceCheckBinaryWithResult(binaryName string) UpdateResult {
	return checkBinaryWithResult(binaryName, true)
}

func checkBinaryWithResult(binaryName string, force bool) UpdateResult {
	result := UpdateResult{}

	// Write current version for hook to read
	writeCurrentVersion()

	if Version == "dev" {
		result.Skipped = true
		return result
	}

	lastCheckFile := stateFilePath("last_update_check", binaryName)

	if !force && shouldSkip(lastCheckFile) {
		result.Skipped = true
		return result
	}

	remoteVersion, err := fetchRemoteVersion()
	if err != nil {
		result.Error = err
		return result
	}

	updateLastCheckTime(lastCheckFile)

	result.NewVersion = remoteVersion

	if !isNewer(remoteVersion, Version) {
		markBinaryUpdateSuccess(binaryName)
		return result
	}

	result.NewVersionAvailable = true

	// Get current executable path (caller decides symlink resolution policy)
	execPath, err := os.Executable()
	if err != nil {
		result.Error = fmt.Errorf("failed to get executable path: %w", err)
		return result
	}

	if err := performUpdateForBinary(binaryName, execPath); err != nil {
		result.Error = err
		return result
	}

	markBinaryUpdateSuccess(binaryName)
	result.Updated = true

	// NOTE: No re-exec here. Caller (each shim's main) handles re-exec
	// because each shim has different symlink resolution and exec logic.

	return result
}

// InstallCompanionBinary downloads and installs a companion shim binary.
// Used by Claude's background sync to auto-install the Codex shim when
// Codex is detected in PATH but no shim exists at ~/.zeude/bin/{name}.
//
// Unlike self-update, this:
//   - Downloads to a fixed path (~/.zeude/bin/{name}), not os.Executable()
//   - Does NOT re-exec (companion binary is not the running process)
//   - Is fail-open: errors are returned but should never block the caller
func InstallCompanionBinary(binaryName string) error {
	if strings.ContainsAny(binaryName, "/\\") || binaryName == ".." || binaryName == "." || binaryName == "" {
		return fmt.Errorf("invalid binary name: %q", binaryName)
	}
	targetPath := filepath.Join(getHomeDir(), ".zeude", "bin", binaryName)
	return performUpdateForBinary(binaryName, targetPath)
}

// --- Internal implementation ---

// performUpdate downloads and replaces the Claude binary (legacy, symlink-resolving).
// Kept for backward compatibility with checkWithResultClaude.
func performUpdate() error {
	execPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}

	// Claude-specific: resolve symlinks
	execPath, err = filepath.EvalSymlinks(execPath)
	if err != nil {
		return fmt.Errorf("failed to resolve symlinks: %w", err)
	}

	return performUpdateForBinary("claude", execPath)
}

// performUpdateForBinary downloads and atomically replaces a named binary.
// binaryName determines the download URL ({updateURL}/{binaryName}-{platform}).
// targetPath is the local filesystem path to write the binary to.
func performUpdateForBinary(binaryName, targetPath string) error {
	platform := fmt.Sprintf("%s-%s", runtime.GOOS, runtime.GOARCH)
	binaryURL := fmt.Sprintf("%s/%s-%s", updateURL, binaryName, platform)

	// Ensure target directory exists (for companion installs where dir may not exist)
	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return fmt.Errorf("failed to create target directory: %w", err)
	}

	// Download new binary
	client := &http.Client{Timeout: updateTimeout}
	resp, err := client.Get(binaryURL)
	if err != nil {
		return fmt.Errorf("failed to download %s: %w", binaryName, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download %s failed with status %d", binaryName, resp.StatusCode)
	}

	// Create temp file in same directory (for atomic rename)
	tmpFile, err := os.CreateTemp(filepath.Dir(targetPath), binaryName+"-update-*")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	tmpPath := tmpFile.Name()

	// Clean up temp file on failure
	success := false
	defer func() {
		if !success {
			os.Remove(tmpPath)
		}
	}()

	// Copy downloaded content
	_, err = io.Copy(tmpFile, resp.Body)
	tmpFile.Close()
	if err != nil {
		return fmt.Errorf("failed to write update for %s: %w", binaryName, err)
	}

	// Make executable
	if err := os.Chmod(tmpPath, 0755); err != nil {
		return fmt.Errorf("failed to chmod %s: %w", binaryName, err)
	}

	// Backup current binary (if it exists)
	backupPath := targetPath + ".old"
	os.Remove(backupPath)
	if _, err := os.Stat(targetPath); err == nil {
		if err := os.Rename(targetPath, backupPath); err != nil {
			return fmt.Errorf("failed to backup current %s binary: %w", binaryName, err)
		}
	}

	// Move new binary into place
	if err := os.Rename(tmpPath, targetPath); err != nil {
		// Try to restore backup
		os.Rename(backupPath, targetPath)
		return fmt.Errorf("failed to install %s update: %w", binaryName, err)
	}

	// Clean up backup
	os.Remove(backupPath)

	success = true
	return nil
}

// --- Shared helpers ---

func touchFile(path string) {
	os.MkdirAll(filepath.Dir(path), 0755)
	f, err := os.Create(path)
	if err == nil {
		f.Close()
	}
}

// writeCurrentVersion writes the current version to ~/.zeude/current_version
// This allows the update checker hook to compare versions.
func writeCurrentVersion() {
	dir := configDir()
	os.MkdirAll(dir, 0755)
	os.WriteFile(filepath.Join(dir, "current_version"), []byte(Version), 0600)
}

func shouldSkip(lastCheckFile string) bool {
	info, err := os.Stat(lastCheckFile)
	if err != nil {
		return false
	}
	return time.Since(info.ModTime()) < checkInterval
}

func updateLastCheckTime(lastCheckFile string) {
	touchFile(lastCheckFile)
}

func fetchRemoteVersion() (string, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(updateURL + "/version.txt")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("server returned %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 256))
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(string(body)), nil
}

// isNewer returns true if remote version is newer than local.
// Uses string comparison per component — works for YYYYMMDD.HHMM format.
func isNewer(remote, local string) bool {
	remote = strings.TrimPrefix(remote, "v")
	local = strings.TrimPrefix(local, "v")

	remoteParts := strings.Split(remote, ".")
	localParts := strings.Split(local, ".")

	for i := 0; i < len(remoteParts) && i < len(localParts); i++ {
		if remoteParts[i] > localParts[i] {
			return true
		}
		if remoteParts[i] < localParts[i] {
			return false
		}
	}

	return len(remoteParts) > len(localParts)
}

// GetVersion returns the current version
func GetVersion() string {
	return Version
}
