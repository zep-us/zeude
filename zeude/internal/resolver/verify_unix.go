//go:build !windows

package resolver

import (
	"errors"
	"os"
	"path/filepath"
)

// verifyExecutable checks that a file exists and has executable permission bits.
func verifyExecutable(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return errors.New("path is a directory")
	}
	if info.Mode()&0111 == 0 {
		return errors.New("file is not executable")
	}
	return nil
}

// executableCandidates returns candidate paths for an executable name.
// On Unix, the name itself is the only candidate.
func executableCandidates(dir, name string) []string {
	return []string{filepath.Join(dir, name)}
}
