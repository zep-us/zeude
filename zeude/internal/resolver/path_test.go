package resolver

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestFindRealBinary_UpgradesPinnedClaudeVersionPathToLatestVersion(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("path pattern in this test is unix-style")
	}

	home := t.TempDir()
	versionsDir := filepath.Join(home, ".local", "share", "claude", "versions")
	if err := os.MkdirAll(versionsDir, 0o755); err != nil {
		t.Fatalf("failed to create versions dir: %v", err)
	}

	oldPath := filepath.Join(versionsDir, "2.1.34")
	newPath := filepath.Join(versionsDir, "2.1.59")
	writeExecutable(t, oldPath)
	writeExecutable(t, newPath)

	zeudeDir := filepath.Join(home, ".zeude")
	if err := os.MkdirAll(zeudeDir, 0o755); err != nil {
		t.Fatalf("failed to create zeude dir: %v", err)
	}

	storedPathFile := filepath.Join(zeudeDir, "real_binary_path")
	if err := os.WriteFile(storedPathFile, []byte(oldPath), 0o644); err != nil {
		t.Fatalf("failed to write stored path: %v", err)
	}

	t.Setenv("HOME", home)
	// PATH is not used in this scenario; keep minimal deterministic value.
	t.Setenv("PATH", "/usr/bin")

	got, err := FindRealBinary()
	if err != nil {
		t.Fatalf("FindRealBinary returned error: %v", err)
	}

	if got != newPath {
		t.Fatalf("expected latest version path %q, got %q", newPath, got)
	}
}

func TestFindRealBinary_UsesStoredPathWhenNotPinned(t *testing.T) {
	home := t.TempDir()
	stableDir := filepath.Join(home, "bin")
	if err := os.MkdirAll(stableDir, 0o755); err != nil {
		t.Fatalf("failed to create stable dir: %v", err)
	}
	stablePath := filepath.Join(stableDir, "claude")
	writeExecutable(t, stablePath)

	zeudeDir := filepath.Join(home, ".zeude")
	if err := os.MkdirAll(zeudeDir, 0o755); err != nil {
		t.Fatalf("failed to create zeude dir: %v", err)
	}

	storedPathFile := filepath.Join(zeudeDir, "real_binary_path")
	if err := os.WriteFile(storedPathFile, []byte(stablePath), 0o644); err != nil {
		t.Fatalf("failed to write stored path: %v", err)
	}

	t.Setenv("HOME", home)
	t.Setenv("PATH", "/usr/bin")

	got, err := FindRealBinary()
	if err != nil {
		t.Fatalf("FindRealBinary returned error: %v", err)
	}

	if got != stablePath {
		t.Fatalf("expected stored stable path %q, got %q", stablePath, got)
	}
}

func TestFindRealBinary_PrefersStableLauncherOverPinnedVersionPath(t *testing.T) {
	home := t.TempDir()

	versionsDir := filepath.Join(home, ".local", "share", "claude", "versions")
	if err := os.MkdirAll(versionsDir, 0o755); err != nil {
		t.Fatalf("failed to create versions dir: %v", err)
	}

	pinnedPath := filepath.Join(versionsDir, "2.1.34")
	writeExecutable(t, pinnedPath)
	writeExecutable(t, filepath.Join(versionsDir, "2.1.59"))

	launcherDir := filepath.Join(home, "launcher")
	if err := os.MkdirAll(launcherDir, 0o755); err != nil {
		t.Fatalf("failed to create launcher dir: %v", err)
	}
	launcherPath := filepath.Join(launcherDir, "claude")
	writeExecutable(t, launcherPath)

	zeudeDir := filepath.Join(home, ".zeude")
	if err := os.MkdirAll(zeudeDir, 0o755); err != nil {
		t.Fatalf("failed to create zeude dir: %v", err)
	}
	storedPathFile := filepath.Join(zeudeDir, "real_binary_path")
	if err := os.WriteFile(storedPathFile, []byte(pinnedPath), 0o644); err != nil {
		t.Fatalf("failed to write stored path: %v", err)
	}

	t.Setenv("HOME", home)
	t.Setenv("PATH", launcherDir+string(os.PathListSeparator)+"/usr/bin")

	got, err := FindRealBinary()
	if err != nil {
		t.Fatalf("FindRealBinary returned error: %v", err)
	}
	if got != launcherPath {
		t.Fatalf("expected stable launcher path %q, got %q", launcherPath, got)
	}
}

func writeExecutable(t *testing.T, path string) {
	t.Helper()
	if err := os.WriteFile(path, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("failed to create executable %s: %v", path, err)
	}
}

// TestFindRealBinaryByName_SkipsShimDir verifies that FindRealBinaryByName
// skips the ~/.zeude/bin directory when searching PATH, preventing shim recursion.
func TestFindRealBinaryByName_SkipsShimDir(t *testing.T) {
	// Create a temporary directory structure simulating the PATH
	tmpDir := t.TempDir()
	shimDir := filepath.Join(tmpDir, ".zeude", "bin")
	realDir := filepath.Join(tmpDir, "real-bin")

	if err := os.MkdirAll(shimDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(realDir, 0755); err != nil {
		t.Fatal(err)
	}

	// Create a fake shim binary in the shim directory
	shimBin := filepath.Join(shimDir, "codex")
	if err := os.WriteFile(shimBin, []byte("#!/bin/sh\n# shim"), 0755); err != nil {
		t.Fatal(err)
	}

	// Create a fake real binary in the real directory
	realBin := filepath.Join(realDir, "codex")
	if err := os.WriteFile(realBin, []byte("#!/bin/sh\n# real"), 0755); err != nil {
		t.Fatal(err)
	}

	// searchPATH should skip shimDir and find the real binary
	found, err := searchPATH("codex", shimDir)
	if err != nil {
		// searchPATH uses the real PATH env, so it may not find our temp dirs.
		// Set PATH to include our dirs.
		origPath := os.Getenv("PATH")
		defer os.Setenv("PATH", origPath)
		os.Setenv("PATH", shimDir+string(os.PathListSeparator)+realDir)

		found, err = searchPATH("codex", shimDir)
		if err != nil {
			t.Fatalf("searchPATH failed: %v", err)
		}
	}

	// The found binary should be from realDir, not shimDir
	if filepath.Dir(found) == shimDir {
		t.Errorf("searchPATH returned shim binary %q, should skip shimDir", found)
	}
}

// TestSearchPATH_EmptyPath verifies behavior when PATH is empty.
func TestSearchPATH_EmptyPath(t *testing.T) {
	origPath := os.Getenv("PATH")
	defer os.Setenv("PATH", origPath)

	os.Setenv("PATH", "")
	_, err := searchPATH("codex", "/nonexistent")
	if err != ErrBinaryNotFound {
		t.Errorf("expected ErrBinaryNotFound, got: %v", err)
	}
}

// TestSearchPATH_FindsCorrectBinary verifies that searchPATH finds the
// binary by name and resolves it to an executable.
func TestSearchPATH_FindsCorrectBinary(t *testing.T) {
	tmpDir := t.TempDir()
	binDir := filepath.Join(tmpDir, "bin")
	if err := os.MkdirAll(binDir, 0755); err != nil {
		t.Fatal(err)
	}

	// Create a test binary
	testBin := filepath.Join(binDir, "test-codex")
	if err := os.WriteFile(testBin, []byte("#!/bin/sh\necho test"), 0755); err != nil {
		t.Fatal(err)
	}

	origPath := os.Getenv("PATH")
	defer os.Setenv("PATH", origPath)
	os.Setenv("PATH", binDir)

	found, err := searchPATH("test-codex", "/nonexistent-shim-dir")
	if err != nil {
		t.Fatalf("searchPATH failed: %v", err)
	}

	if filepath.Base(found) != "test-codex" {
		t.Errorf("found %q, expected test-codex binary", found)
	}
}

// TestVerifyExecutable checks the executable verification logic.
func TestVerifyExecutable(t *testing.T) {
	tmpDir := t.TempDir()

	// Non-executable file
	nonExec := filepath.Join(tmpDir, "noexec")
	if err := os.WriteFile(nonExec, []byte("data"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := verifyExecutable(nonExec); err == nil {
		t.Error("verifyExecutable should fail for non-executable file")
	}

	// Executable file
	exec := filepath.Join(tmpDir, "exec")
	if err := os.WriteFile(exec, []byte("#!/bin/sh"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := verifyExecutable(exec); err != nil {
		t.Errorf("verifyExecutable should pass for executable file: %v", err)
	}

	// Directory
	if err := verifyExecutable(tmpDir); err == nil {
		t.Error("verifyExecutable should fail for directory")
	}

	// Non-existent
	if err := verifyExecutable(filepath.Join(tmpDir, "nonexistent")); err == nil {
		t.Error("verifyExecutable should fail for non-existent path")
	}
}

// TestReadStoredPath validates the stored path resolution mechanism.
func TestReadStoredPath(t *testing.T) {
	tmpDir := t.TempDir()

	// Create a valid executable for the stored path to point to
	realBin := filepath.Join(tmpDir, "real-codex")
	if err := os.WriteFile(realBin, []byte("#!/bin/sh\necho real"), 0755); err != nil {
		t.Fatal(err)
	}

	// Create a stored path file pointing to the real binary
	storedFile := filepath.Join(tmpDir, "stored-path")
	if err := os.WriteFile(storedFile, []byte(realBin+"\n"), 0644); err != nil {
		t.Fatal(err)
	}

	got, err := readStoredPath(storedFile)
	if err != nil {
		t.Fatalf("readStoredPath failed: %v", err)
	}
	if got != realBin {
		t.Errorf("readStoredPath = %q, want %q", got, realBin)
	}
}

// TestReadStoredPath_Empty verifies that an empty stored path is rejected.
func TestReadStoredPath_Empty(t *testing.T) {
	tmpDir := t.TempDir()
	storedFile := filepath.Join(tmpDir, "empty-path")
	if err := os.WriteFile(storedFile, []byte(""), 0644); err != nil {
		t.Fatal(err)
	}

	_, err := readStoredPath(storedFile)
	if err == nil {
		t.Error("readStoredPath should fail for empty stored path")
	}
}

func TestIsShimBinary(t *testing.T) {
	tmpDir := t.TempDir()
	shimDir := filepath.Join(tmpDir, ".zeude", "bin")
	os.MkdirAll(shimDir, 0755)

	tests := []struct {
		name     string
		path     string
		shimDir  string
		want     bool
	}{
		{"shim binary", filepath.Join(shimDir, "codex"), shimDir, true},
		{"real binary", filepath.Join(tmpDir, "real", "codex"), shimDir, false},
		{"different dir", "/usr/local/bin/codex", shimDir, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isShimBinary(tt.path, tt.shimDir)
			if got != tt.want {
				t.Errorf("isShimBinary(%q, %q) = %v, want %v", tt.path, tt.shimDir, got, tt.want)
			}
		})
	}
}

func TestIsShimBinary_Symlink(t *testing.T) {
	tmpDir := t.TempDir()
	shimDir := filepath.Join(tmpDir, ".zeude", "bin")
	os.MkdirAll(shimDir, 0755)

	// Create a real binary in shimDir
	shimBin := filepath.Join(shimDir, "codex")
	writeExecutable(t, shimBin)

	// Create a symlink to shimDir binary from another location
	linkDir := filepath.Join(tmpDir, "linked")
	os.MkdirAll(linkDir, 0755)
	linkPath := filepath.Join(linkDir, "codex")
	if err := os.Symlink(shimBin, linkPath); err != nil {
		t.Skip("symlinks not supported")
	}

	// Symlink to shim should be detected
	if !isShimBinary(linkPath, shimDir) {
		t.Error("symlink to shim binary should be detected as shim")
	}
}

func TestFindRealBinaryByName_SelfHealCorruptedStoredPath(t *testing.T) {
	tmpDir := t.TempDir()
	shimDir := filepath.Join(tmpDir, ".zeude", "bin")
	realDir := filepath.Join(tmpDir, "real-bin")
	os.MkdirAll(shimDir, 0755)
	os.MkdirAll(realDir, 0755)

	// Create shim and real binaries
	writeExecutable(t, filepath.Join(shimDir, "codex"))
	writeExecutable(t, filepath.Join(realDir, "codex"))

	// Write corrupted stored path pointing to shim
	storedPathFile := filepath.Join(tmpDir, ".zeude", "real_codex_path")
	os.WriteFile(storedPathFile, []byte(filepath.Join(shimDir, "codex")), 0600)

	// Override HOME and PATH for the test
	t.Setenv("HOME", tmpDir)
	t.Setenv("PATH", shimDir+string(os.PathListSeparator)+realDir)

	path, err := FindRealBinaryByName("codex")
	if err != nil {
		t.Fatalf("FindRealBinaryByName failed: %v", err)
	}

	// Should return real binary, not shim
	if filepath.Dir(path) == shimDir {
		t.Errorf("returned shim path %q, expected real binary", path)
	}

	// Corrupted stored path file should be deleted (self-healing)
	if _, err := os.Stat(storedPathFile); !os.IsNotExist(err) {
		t.Error("corrupted stored path file should be deleted for self-healing")
	}
}
