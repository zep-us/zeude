// Package autoupdate handles self-updating of the zeude shim binary.
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
	defaultUpdateURL    = "https://your-dashboard-url/releases"
)

// RequiresUpdate checks if an update is required (more than forceUpdateInterval since last successful update).
// Returns true if update is required, false otherwise.
// This is used to enforce periodic updates.
func RequiresUpdate() bool {
	if Version == "dev" {
		return false
	}

	configDir := filepath.Join(os.Getenv("HOME"), ".zeude")
	lastSuccessFile := filepath.Join(configDir, "last_successful_update")

	info, err := os.Stat(lastSuccessFile)
	if err != nil {
		// File doesn't exist - first time user or never updated successfully
		// Be lenient: create the file and don't require update yet
		touchFile(lastSuccessFile)
		return false
	}

	return time.Since(info.ModTime()) > forceUpdateInterval
}

// TimeSinceLastUpdate returns how long since the last successful update
func TimeSinceLastUpdate() time.Duration {
	configDir := filepath.Join(os.Getenv("HOME"), ".zeude")
	lastSuccessFile := filepath.Join(configDir, "last_successful_update")

	info, err := os.Stat(lastSuccessFile)
	if err != nil {
		return 0
	}

	return time.Since(info.ModTime())
}

// MarkUpdateSuccess marks the current time as last successful update
func MarkUpdateSuccess() {
	configDir := filepath.Join(os.Getenv("HOME"), ".zeude")
	lastSuccessFile := filepath.Join(configDir, "last_successful_update")
	touchFile(lastSuccessFile)
}

// touchFile creates or updates the modification time of a file
func touchFile(path string) {
	// Ensure directory exists
	os.MkdirAll(filepath.Dir(path), 0755)
	f, err := os.Create(path)
	if err == nil {
		f.Close()
	}
}

// writeCurrentVersion writes the current version to ~/.zeude/current_version
// This allows the update checker hook to compare versions
func writeCurrentVersion() {
	configDir := filepath.Join(os.Getenv("HOME"), ".zeude")
	versionFile := filepath.Join(configDir, "current_version")

	// Ensure directory exists
	os.MkdirAll(configDir, 0755)

	// Write version
	os.WriteFile(versionFile, []byte(Version), 0644)
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

// CheckWithResult checks for updates and returns detailed result.
// Always checks on startup (no skip). This is fail-open: any error is returned but execution continues.
func CheckWithResult() UpdateResult {
	result := UpdateResult{}

	// Always write current version for hook to read
	writeCurrentVersion()

	if Version == "dev" {
		// Skip update check for development builds
		result.Skipped = true
		return result
	}

	// Check remote version
	remoteVersion, err := fetchRemoteVersion()
	if err != nil {
		result.Error = err
		return result
	}

	result.NewVersion = remoteVersion

	// Compare versions
	if !isNewer(remoteVersion, Version) {
		// Already up to date - mark as successful
		MarkUpdateSuccess()
		return result
	}

	result.NewVersionAvailable = true

	// Perform update
	if err := performUpdate(); err != nil {
		result.Error = err
		return result
	}

	// Mark update as successful
	MarkUpdateSuccess()
	result.Updated = true

	// Re-exec with new binary immediately
	execPath, err := os.Executable()
	if err == nil {
		execPath, _ = filepath.EvalSymlinks(execPath)
		fmt.Fprintf(os.Stderr, "\n")
		// Replace current process with new binary
		syscall.Exec(execPath, os.Args, os.Environ())
		// If exec fails, continue with old binary
	}

	return result
}

// shouldSkip returns true if we checked recently (within checkInterval)
func shouldSkip(lastCheckFile string) bool {
	info, err := os.Stat(lastCheckFile)
	if err != nil {
		return false // File doesn't exist, should check
	}
	return time.Since(info.ModTime()) < checkInterval
}

// updateLastCheckTime updates the last check timestamp file
func updateLastCheckTime(lastCheckFile string) {
	// Touch the file
	f, err := os.Create(lastCheckFile)
	if err == nil {
		f.Close()
	}
}

// fetchRemoteVersion fetches the latest version from the server
func fetchRemoteVersion() (string, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(defaultUpdateURL + "/version.txt")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("server returned %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(string(body)), nil
}

// isNewer returns true if remote version is newer than local
func isNewer(remote, local string) bool {
	// Strip 'v' prefix if present
	remote = strings.TrimPrefix(remote, "v")
	local = strings.TrimPrefix(local, "v")

	// Simple string comparison for semver (works for x.y.z format)
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

// performUpdate downloads and replaces the current binary
func performUpdate() error {
	// Determine platform
	platform := fmt.Sprintf("%s-%s", runtime.GOOS, runtime.GOARCH)
	binaryURL := fmt.Sprintf("%s/claude-%s", defaultUpdateURL, platform)

	// Get current executable path
	execPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}

	// Resolve symlinks
	execPath, err = filepath.EvalSymlinks(execPath)
	if err != nil {
		return fmt.Errorf("failed to resolve symlinks: %w", err)
	}

	// Download new binary to temp file
	client := &http.Client{Timeout: updateTimeout}
	resp, err := client.Get(binaryURL)
	if err != nil {
		return fmt.Errorf("failed to download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed with status %d", resp.StatusCode)
	}

	// Create temp file in same directory (for atomic rename)
	tmpFile, err := os.CreateTemp(filepath.Dir(execPath), "claude-update-*")
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
		return fmt.Errorf("failed to write update: %w", err)
	}

	// Make executable
	if err := os.Chmod(tmpPath, 0755); err != nil {
		return fmt.Errorf("failed to chmod: %w", err)
	}

	// Backup current binary
	backupPath := execPath + ".old"
	os.Remove(backupPath) // Remove old backup if exists
	if err := os.Rename(execPath, backupPath); err != nil {
		return fmt.Errorf("failed to backup current binary: %w", err)
	}

	// Move new binary into place
	if err := os.Rename(tmpPath, execPath); err != nil {
		// Try to restore backup
		os.Rename(backupPath, execPath)
		return fmt.Errorf("failed to install update: %w", err)
	}

	// Clean up backup (on success, old binary is no longer needed)
	os.Remove(backupPath)

	success = true
	return nil
}

// GetVersion returns the current version
func GetVersion() string {
	return Version
}
