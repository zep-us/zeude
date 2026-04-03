// Package resolver provides binary path resolution for the Zeude shim.
package resolver

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	// shimDirName is the directory where the shim binary is installed
	shimDirName = ".zeude/bin"
	// storedPathFile stores the path to the real claude binary
	storedPathFile = ".zeude/real_binary_path"
)

// ErrBinaryNotFound is returned when the real claude binary cannot be located.
var ErrBinaryNotFound = errors.New("real claude binary not found in PATH")

// FindRealBinary locates the original claude binary, avoiding the Zeude shim.
// Resolution order:
//  1. Stored path in ~/.zeude/real_binary_path (fastest)
//  2. Search PATH, excluding the shim directory
//  3. If PATH has a newer version than stored path, prefer PATH version
func FindRealBinary() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	shimDir := filepath.Join(home, shimDirName)

	// Try stored path first (set during installation)
	storedPathFilePath := filepath.Join(home, storedPathFile)
	storedBinary, storedErr := readStoredPath(storedPathFilePath)

	if storedErr == nil {
		repairedPath := storedBinary

		// Legacy installs may store a version-pinned path. Prefer a stable launcher
		// from PATH when available, then fallback to latest version in the same dir.
		if isVersionPinnedClaudePath(storedBinary) {
			if launcherPath, err := searchPATH("claude", shimDir); err == nil && !isVersionPinnedClaudePath(launcherPath) {
				repairedPath = launcherPath
			} else {
				repairedPath = repairVersionPinnedPath(storedBinary)
			}
		}

		if repairedPath != storedBinary {
			_ = writeStoredPath(storedPathFilePath, repairedPath)
		}
		return repairedPath, nil
	}

	// Fallback: search PATH, excluding our shim directory
	path, err := searchPATH("claude", shimDir)
	if err != nil {
		return "", err
	}

	// Save recovered path for faster future resolution (best effort).
	_ = writeStoredPath(storedPathFilePath, path)
	return path, nil
}

// FindRealBinaryByName locates the original binary for a given tool name (e.g. "codex"),
// avoiding the Zeude shim. Resolution order:
//  1. Stored path in ~/.zeude/real_{name}_path (with self-reference guard)
//  2. Search PATH, excluding the shim directory
func FindRealBinaryByName(name string) (string, error) {
	if strings.ContainsAny(name, "/\\") || name == ".." || name == "." || name == "" {
		return "", fmt.Errorf("invalid binary name: %q", name)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	shimDir := filepath.Join(home, shimDirName)

	// Try stored path first (set during installation)
	storedPathFile := filepath.Join(home, ".zeude", "real_"+name+"_path")
	if path, err := readStoredPath(storedPathFile); err == nil {
		if !isShimBinary(path, shimDir) {
			return path, nil
		}
		// Self-referencing stored path — delete corrupted cache and fall through
		_ = os.Remove(storedPathFile)
	}

	// Fallback: search PATH, excluding our shim directory
	return searchPATH(name, shimDir)
}

// isShimBinary checks if the given binary path resolves to a location
// inside the shim directory. Tries full symlink resolution first (catches
// file-level symlinks), then falls back to parent directory comparison
// (handles non-existent files where only the directory can be resolved).
func isShimBinary(binaryPath, shimDir string) bool {
	resolvedShimDir, err := filepath.EvalSymlinks(shimDir)
	if err != nil {
		resolvedShimDir = shimDir
	}
	absShim, _ := filepath.Abs(resolvedShimDir)

	// Try full path resolution (handles file-level symlinks)
	if resolved, err := filepath.EvalSymlinks(binaryPath); err == nil {
		absDir, _ := filepath.Abs(filepath.Dir(resolved))
		if absDir == absShim || strings.HasPrefix(absDir, absShim+string(os.PathSeparator)) {
			return true
		}
	}

	// Fall back to parent directory resolution (handles non-existent files)
	binaryDir := filepath.Dir(binaryPath)
	resolvedDir, err := filepath.EvalSymlinks(binaryDir)
	if err != nil {
		resolvedDir = binaryDir
	}
	absDir, _ := filepath.Abs(resolvedDir)
	return absDir == absShim || strings.HasPrefix(absDir, absShim+string(os.PathSeparator))
}

// readStoredPath reads and validates the stored binary path.
func readStoredPath(storedPath string) (string, error) {
	data, err := os.ReadFile(storedPath)
	if err != nil {
		return "", err
	}

	path := strings.TrimSpace(string(data))
	if path == "" {
		return "", errors.New("stored path is empty")
	}

	// Verify the binary exists and is executable
	if err := verifyExecutable(path); err != nil {
		return "", err
	}

	return path, nil
}

// searchPATH searches the PATH environment variable for the named binary,
// excluding the specified directory to avoid finding our own shim.
func searchPATH(name, excludeDir string) (string, error) {
	pathEnv := os.Getenv("PATH")
	if pathEnv == "" {
		return "", ErrBinaryNotFound
	}

	// Normalize the exclude directory for comparison
	excludeDir, _ = filepath.Abs(excludeDir)

	paths := strings.Split(pathEnv, string(os.PathListSeparator))
	for _, dir := range paths {
		// Skip empty entries
		if dir == "" {
			continue
		}

		// Normalize for comparison
		absDir, err := filepath.Abs(dir)
		if err != nil {
			continue
		}

		// Skip our shim directory
		if absDir == excludeDir {
			continue
		}

		// Try all executable candidates for this directory.
		// On Unix this is just the name; on Windows it includes .cmd/.exe/.bat extensions.
		for _, candidate := range executableCandidates(absDir, name) {
			if err := verifyExecutable(candidate); err == nil {
				return candidate, nil
			}
		}
	}

	return "", ErrBinaryNotFound
}

// writeStoredPath writes the resolved real claude path to ~/.zeude/real_binary_path.
func writeStoredPath(storedPath, path string) error {
	if err := os.MkdirAll(filepath.Dir(storedPath), 0700); err != nil {
		return err
	}
	return os.WriteFile(storedPath, []byte(path), 0600)
}

// repairVersionPinnedPath repairs legacy stored paths that directly point to
// versioned Claude binaries (e.g. ~/.local/share/claude/versions/2.1.34).
// It picks the latest executable in the same versions directory.
func repairVersionPinnedPath(path string) string {
	if !isVersionPinnedClaudePath(path) {
		return path
	}

	latest, err := findLatestVersionBinary(path)
	if err != nil || latest == "" {
		return path // fail-open
	}

	return latest
}

func isVersionPinnedClaudePath(path string) bool {
	versionsDir := filepath.Base(filepath.Dir(path))
	claudeDir := filepath.Base(filepath.Dir(filepath.Dir(path)))
	return strings.EqualFold(versionsDir, "versions") && strings.EqualFold(claudeDir, "claude")
}

func findLatestVersionBinary(path string) (string, error) {
	versionsDir := filepath.Dir(path)
	entries, err := os.ReadDir(versionsDir)
	if err != nil {
		return "", err
	}

	bestName := ""
	bestPath := ""

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		candidatePath := filepath.Join(versionsDir, entry.Name())
		if err := verifyExecutable(candidatePath); err != nil {
			continue
		}

		if bestPath == "" || compareVersionNames(entry.Name(), bestName) > 0 {
			bestName = entry.Name()
			bestPath = candidatePath
		}
	}

	if bestPath == "" {
		return "", errors.New("no executable claude versions found")
	}

	return bestPath, nil
}

func compareVersionNames(a, b string) int {
	aParts := extractNumericParts(a)
	bParts := extractNumericParts(b)

	// Prefer names that contain parseable numeric version parts.
	if len(aParts) > 0 && len(bParts) == 0 {
		return 1
	}
	if len(aParts) == 0 && len(bParts) > 0 {
		return -1
	}

	maxLen := len(aParts)
	if len(bParts) > maxLen {
		maxLen = len(bParts)
	}

	for i := 0; i < maxLen; i++ {
		aVal := 0
		bVal := 0
		if i < len(aParts) {
			aVal = aParts[i]
		}
		if i < len(bParts) {
			bVal = bParts[i]
		}

		if aVal > bVal {
			return 1
		}
		if aVal < bVal {
			return -1
		}
	}

	// Final fallback for equal numeric parts.
	return strings.Compare(a, b)
}

func extractNumericParts(version string) []int {
	fields := strings.FieldsFunc(strings.TrimPrefix(strings.ToLower(version), "v"), func(r rune) bool {
		return r < '0' || r > '9'
	})

	parts := make([]int, 0, len(fields))
	for _, field := range fields {
		if field == "" {
			continue
		}
		n, err := strconv.Atoi(field)
		if err != nil {
			continue
		}
		parts = append(parts, n)
	}

	return parts
}
