// Package resolver provides binary path resolution for the Zeude shim.
package resolver

import (
	"errors"
	"os"
	"path/filepath"
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
func FindRealBinary() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	// Try stored path first (set during installation)
	storedPath := filepath.Join(home, storedPathFile)
	if path, err := readStoredPath(storedPath); err == nil {
		return path, nil
	}

	// Fallback: search PATH, excluding our shim directory
	shimDir := filepath.Join(home, shimDirName)
	return searchPATH("claude", shimDir)
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

	// Resolve symlinks to get the real path
	realPath, err := resolveSymlinks(path)
	if err != nil {
		return "", err
	}

	// Verify the binary exists and is executable
	if err := verifyExecutable(realPath); err != nil {
		return "", err
	}

	return realPath, nil
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

		candidate := filepath.Join(dir, name)

		// Resolve symlinks and verify
		realPath, err := resolveSymlinks(candidate)
		if err != nil {
			continue
		}

		if err := verifyExecutable(realPath); err == nil {
			return realPath, nil
		}
	}

	return "", ErrBinaryNotFound
}

// resolveSymlinks follows symlinks to get the real file path.
// Handles multiple levels of symlinks and relative symlink targets.
func resolveSymlinks(path string) (string, error) {
	// Use EvalSymlinks which handles all symlink resolution
	realPath, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", err
	}
	return realPath, nil
}

// verifyExecutable checks that a file exists and is executable.
func verifyExecutable(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}

	if info.IsDir() {
		return errors.New("path is a directory")
	}

	// Check if file is executable (owner, group, or other)
	mode := info.Mode()
	if mode&0111 == 0 {
		return errors.New("file is not executable")
	}

	return nil
}
