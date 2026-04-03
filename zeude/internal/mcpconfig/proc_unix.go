//go:build !windows

package mcpconfig

import (
	"os/exec"
	"syscall"
)

// setSysProcAttrDetach detaches the child process from the parent's process group.
func setSysProcAttrDetach(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}
