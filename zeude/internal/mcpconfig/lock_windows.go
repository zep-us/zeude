//go:build windows

package mcpconfig

import (
	"fmt"
	"os"
	"time"
)

// acquireFileLock acquires an exclusive lock on the config file.
// [FIX #2] Windows-specific implementation using file creation as advisory lock.
// Windows doesn't have flock, so we use exclusive file creation.
func acquireFileLock() (*os.File, string, error) {
	lockPath, err := getLockPath()
	if err != nil {
		return nil, "", err
	}

	// Try to acquire exclusive lock with timeout
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		// Try to create lock file exclusively
		// O_CREATE|O_EXCL fails if file exists
		lock, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_RDWR, 0600)
		if err == nil {
			logDebug("acquired file lock (windows exclusive create)")
			return lock, lockPath, nil
		}

		// Check if lock file is stale (older than 1 minute)
		if info, statErr := os.Stat(lockPath); statErr == nil {
			if time.Since(info.ModTime()) > time.Minute {
				// Stale lock, remove it
				os.Remove(lockPath)
				logDebug("removed stale lock file")
				continue
			}
		}

		time.Sleep(50 * time.Millisecond)
	}

	return nil, "", fmt.Errorf("timeout waiting for file lock")
}

// releaseFileLock releases the file lock.
func releaseFileLock(lock *os.File) {
	if lock == nil {
		return
	}
	lock.Close()
	logDebug("released file lock")
}
