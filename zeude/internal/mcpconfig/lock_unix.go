//go:build unix || darwin || linux

package mcpconfig

import (
	"fmt"
	"os"
	"syscall"
	"time"
)

// acquireFileLock acquires an exclusive lock on the config file.
// [FIX #2] Unix-specific implementation using flock.
func acquireFileLock() (*os.File, string, error) {
	lockPath, err := getLockPath()
	if err != nil {
		return nil, "", err
	}

	lock, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, "", fmt.Errorf("failed to open lock file: %w", err)
	}

	// Try to acquire exclusive lock with timeout
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		err = syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
		if err == nil {
			logDebug("acquired file lock (unix flock)")
			return lock, lockPath, nil
		}
		time.Sleep(50 * time.Millisecond)
	}

	lock.Close()
	return nil, "", fmt.Errorf("timeout waiting for file lock")
}

// releaseFileLock releases the file lock.
func releaseFileLock(lock *os.File) {
	if lock == nil {
		return
	}
	syscall.Flock(int(lock.Fd()), syscall.LOCK_UN)
	lock.Close()
	logDebug("released file lock")
}
