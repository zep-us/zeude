package autoupdate

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestIsNewer(t *testing.T) {
	tests := []struct {
		remote, local string
		want          bool
	}{
		// Basic cases
		{"20260319.1000", "20260318.0900", true},
		{"20260318.0900", "20260319.1000", false},
		{"20260319.1000", "20260319.1000", false},

		// Different component lengths
		{"1.2.3", "1.2", true},
		{"1.2", "1.2.3", false},

		// With v prefix
		{"v2.0.0", "1.0.0", true},
		{"v1.0.0", "v2.0.0", false},

		// Same version
		{"1.0.0", "1.0.0", false},
		{"dev", "dev", false},

		// Edge cases
		{"", "", false},
		{"1", "0", true},
		{"0", "1", false},
	}

	for _, tt := range tests {
		got := isNewer(tt.remote, tt.local)
		if got != tt.want {
			t.Errorf("isNewer(%q, %q) = %v, want %v", tt.remote, tt.local, got, tt.want)
		}
	}
}

func TestBinaryURL(t *testing.T) {
	// Start a test HTTP server that records the request URL
	var requestedURL string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestedURL = r.URL.Path
		w.Write([]byte("fake-binary-content"))
	}))
	defer srv.Close()

	// Override updateURL for testing
	origURL := updateURL
	updateURL = srv.URL
	defer func() { updateURL = origURL }()

	tmpDir := t.TempDir()

	tests := []struct {
		binaryName string
		wantPrefix string
	}{
		{"claude", "/claude-"},
		{"codex", "/codex-"},
		{"zeude", "/zeude-"},
	}

	for _, tt := range tests {
		targetPath := filepath.Join(tmpDir, tt.binaryName)
		err := performUpdateForBinary(tt.binaryName, targetPath)
		if err != nil {
			t.Fatalf("performUpdateForBinary(%q) failed: %v", tt.binaryName, err)
		}

		if len(requestedURL) == 0 || requestedURL[:len(tt.wantPrefix)] != tt.wantPrefix {
			t.Errorf("performUpdateForBinary(%q) requested URL %q, want prefix %q",
				tt.binaryName, requestedURL, tt.wantPrefix)
		}

		// Verify binary was written
		if _, err := os.Stat(targetPath); os.IsNotExist(err) {
			t.Errorf("performUpdateForBinary(%q) did not create file at %s", tt.binaryName, targetPath)
		}

		// Verify executable permission
		info, _ := os.Stat(targetPath)
		if info.Mode()&0111 == 0 {
			t.Errorf("performUpdateForBinary(%q) created non-executable file", tt.binaryName)
		}
	}
}

func TestPerBinaryStateFiles(t *testing.T) {
	tmpDir := t.TempDir()

	// Override homeDir for testing
	origHome := homeDir
	homeDir = tmpDir
	defer func() { homeDir = origHome }()

	// Create ~/.zeude directory
	zeudeDir := filepath.Join(tmpDir, ".zeude")
	os.MkdirAll(zeudeDir, 0755)

	// Touch state file for claude
	claudeCheckFile := stateFilePath("last_update_check", "claude")
	touchFile(claudeCheckFile)

	// Verify codex state file is independent
	codexCheckFile := stateFilePath("last_update_check", "codex")
	if claudeCheckFile == codexCheckFile {
		t.Fatal("claude and codex state files should be different paths")
	}

	// Claude should skip (just checked)
	if !shouldSkip(claudeCheckFile) {
		t.Error("shouldSkip(claude) should return true after touchFile")
	}

	// Codex should NOT skip (never checked)
	if shouldSkip(codexCheckFile) {
		t.Error("shouldSkip(codex) should return false (file doesn't exist)")
	}

	// Verify MarkUpdateSuccess dual-writes for claude
	markBinaryUpdateSuccess("claude")
	unsuffixed := filepath.Join(zeudeDir, "last_successful_update")
	suffixed := filepath.Join(zeudeDir, "last_successful_update_claude")
	if _, err := os.Stat(unsuffixed); os.IsNotExist(err) {
		t.Error("markBinaryUpdateSuccess('claude') should touch unsuffixed file")
	}
	if _, err := os.Stat(suffixed); os.IsNotExist(err) {
		t.Error("markBinaryUpdateSuccess('claude') should touch suffixed file")
	}

	// Verify codex does NOT touch unsuffixed
	os.Remove(unsuffixed) // clean slate
	markBinaryUpdateSuccess("codex")
	codexSuffixed := filepath.Join(zeudeDir, "last_successful_update_codex")
	if _, err := os.Stat(codexSuffixed); os.IsNotExist(err) {
		t.Error("markBinaryUpdateSuccess('codex') should touch codex suffixed file")
	}
	if _, err := os.Stat(unsuffixed); err == nil {
		t.Error("markBinaryUpdateSuccess('codex') should NOT touch unsuffixed file")
	}
}

func TestInstallCompanionBinary(t *testing.T) {
	// Start test server serving a fake binary
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("#!/bin/sh\necho companion"))
	}))
	defer srv.Close()

	origURL := updateURL
	updateURL = srv.URL
	defer func() { updateURL = origURL }()

	tmpDir := t.TempDir()
	origHome := homeDir
	homeDir = tmpDir
	defer func() { homeDir = origHome }()

	// Create ~/.zeude/bin directory
	binDir := filepath.Join(tmpDir, ".zeude", "bin")
	os.MkdirAll(binDir, 0755)

	// Install companion
	err := InstallCompanionBinary("codex")
	if err != nil {
		t.Fatalf("InstallCompanionBinary('codex') failed: %v", err)
	}

	// Verify file exists at correct path
	codexPath := filepath.Join(binDir, "codex")
	info, err := os.Stat(codexPath)
	if os.IsNotExist(err) {
		t.Fatal("InstallCompanionBinary did not create ~/.zeude/bin/codex")
	}

	// Verify executable
	if info.Mode()&0111 == 0 {
		t.Error("InstallCompanionBinary created non-executable file")
	}

	// Verify content
	data, _ := os.ReadFile(codexPath)
	if string(data) != "#!/bin/sh\necho companion" {
		t.Errorf("unexpected content: %q", string(data))
	}
}

func TestInstallCompanionBinary_CreatesDir(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("binary"))
	}))
	defer srv.Close()

	origURL := updateURL
	updateURL = srv.URL
	defer func() { updateURL = origURL }()

	tmpDir := t.TempDir()
	origHome := homeDir
	homeDir = tmpDir
	defer func() { homeDir = origHome }()

	// Do NOT pre-create ~/.zeude/bin — InstallCompanionBinary should create it
	err := InstallCompanionBinary("codex")
	if err != nil {
		t.Fatalf("InstallCompanionBinary should create missing dirs: %v", err)
	}

	codexPath := filepath.Join(tmpDir, ".zeude", "bin", "codex")
	if _, err := os.Stat(codexPath); os.IsNotExist(err) {
		t.Fatal("companion binary was not created")
	}
}

func TestBackwardCompatStateFiles(t *testing.T) {
	tmpDir := t.TempDir()

	origHome := homeDir
	homeDir = tmpDir
	defer func() { homeDir = origHome }()

	zeudeDir := filepath.Join(tmpDir, ".zeude")
	os.MkdirAll(zeudeDir, 0755)

	// Create old unsuffixed state file (legacy)
	unsuffixed := filepath.Join(zeudeDir, "last_update_check")
	os.WriteFile(unsuffixed, []byte("legacy"), 0600)

	// stateFilePath for claude should migrate from unsuffixed
	result := stateFilePath("last_update_check", "claude")
	expected := filepath.Join(zeudeDir, "last_update_check_claude")
	if result != expected {
		t.Errorf("stateFilePath returned %q, want %q", result, expected)
	}

	// Verify migration happened: suffixed file should exist
	if _, err := os.Stat(expected); os.IsNotExist(err) {
		t.Error("stateFilePath should have migrated unsuffixed → suffixed")
	}

	// Codex should NOT get the migrated file
	codexResult := stateFilePath("last_update_check", "codex")
	codexExpected := filepath.Join(zeudeDir, "last_update_check_codex")
	if codexResult != codexExpected {
		t.Errorf("stateFilePath for codex returned %q, want %q", codexResult, codexExpected)
	}
}

func TestCheckBinaryWithResult_DevVersion(t *testing.T) {
	// Version is "dev" by default in tests
	result := CheckBinaryWithResult("codex")
	if !result.Skipped {
		t.Error("CheckBinaryWithResult should skip for dev version")
	}
}

func TestCheckBinaryWithResult_RecentlyChecked(t *testing.T) {
	tmpDir := t.TempDir()
	origHome := homeDir
	homeDir = tmpDir
	defer func() { homeDir = origHome }()

	// Temporarily set a non-dev version
	origVersion := Version
	Version = "20260318.0900"
	defer func() { Version = origVersion }()

	// Start a version server
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("20260318.0900")) // same version
	}))
	defer srv.Close()

	origURL := updateURL
	updateURL = srv.URL
	defer func() { updateURL = origURL }()

	zeudeDir := filepath.Join(tmpDir, ".zeude")
	os.MkdirAll(zeudeDir, 0755)

	// First check should not be skipped
	result := CheckBinaryWithResult("codex")
	if result.Skipped {
		t.Error("first check should not be skipped")
	}

	// Second check should be skipped (just checked)
	result = CheckBinaryWithResult("codex")
	if !result.Skipped {
		t.Error("second check should be skipped (checked recently)")
	}
}

func TestShouldSkip_Timing(t *testing.T) {
	tmpDir := t.TempDir()
	checkFile := filepath.Join(tmpDir, "check")

	// File doesn't exist → should not skip
	if shouldSkip(checkFile) {
		t.Error("shouldSkip should return false for non-existent file")
	}

	// Touch file → should skip (just checked)
	touchFile(checkFile)
	if !shouldSkip(checkFile) {
		t.Error("shouldSkip should return true for recently touched file")
	}

	// Set mtime to 25 hours ago → should not skip
	oldTime := time.Now().Add(-25 * time.Hour)
	os.Chtimes(checkFile, oldTime, oldTime)
	if shouldSkip(checkFile) {
		t.Error("shouldSkip should return false for file older than checkInterval")
	}
}
