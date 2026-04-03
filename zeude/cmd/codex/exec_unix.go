//go:build !windows

package main

import "syscall"

// execBinary replaces the current process with the given binary (Unix execve).
func execBinary(path string, args []string, env []string) error {
	return syscall.Exec(path, args, env)
}
