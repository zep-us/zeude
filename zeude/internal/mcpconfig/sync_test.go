package mcpconfig

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// === validateFilePath Tests ===

func TestValidateFilePath_RejectsPathTraversal(t *testing.T) {
	baseDir := t.TempDir()

	cases := []struct {
		name string
		path string
	}{
		{"dot-dot slash", "../escape"},
		{"nested dot-dot", "subdir/../../escape"},
		{"dot-dot only", ".."},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := validateFilePath(tc.path, baseDir)
			if err == nil {
				t.Errorf("expected error for path %q, got nil", tc.path)
			}
		})
	}
}

func TestValidateFilePath_RejectsAbsolutePath(t *testing.T) {
	baseDir := t.TempDir()

	cases := []struct {
		name string
		path string
	}{
		{"etc passwd", "/etc/passwd"},
		{"absolute dir", "/tmp/evil"},
		{"root", "/"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := validateFilePath(tc.path, baseDir)
			if err == nil {
				t.Errorf("expected error for absolute path %q, got nil", tc.path)
			}
		})
	}
}

func TestValidateFilePath_AcceptsValidPath(t *testing.T) {
	baseDir := t.TempDir()

	cases := []struct {
		name     string
		path     string
		expected string
	}{
		{"simple file", "SKILL.md", filepath.Join(baseDir, "SKILL.md")},
		{"file with dash", "my-skill.md", filepath.Join(baseDir, "my-skill.md")},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			result, err := validateFilePath(tc.path, baseDir)
			if err != nil {
				t.Fatalf("unexpected error for path %q: %v", tc.path, err)
			}
			if result != tc.expected {
				t.Errorf("expected %q, got %q", tc.expected, result)
			}
		})
	}
}

func TestValidateFilePath_AcceptsNestedPath(t *testing.T) {
	baseDir := t.TempDir()

	cases := []struct {
		name     string
		path     string
		expected string
	}{
		{"one level deep", "subdir/file.md", filepath.Join(baseDir, "subdir", "file.md")},
		{"two levels deep", "a/b/file.txt", filepath.Join(baseDir, "a", "b", "file.txt")},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			result, err := validateFilePath(tc.path, baseDir)
			if err != nil {
				t.Fatalf("unexpected error for nested path %q: %v", tc.path, err)
			}
			if result != tc.expected {
				t.Errorf("expected %q, got %q", tc.expected, result)
			}
		})
	}
}

func TestValidateFilePath_RejectsSymlinkEscape(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlinks require special privileges on Windows")
	}

	baseDir := t.TempDir()
	outsideDir := t.TempDir()

	// Create a symlink inside baseDir pointing to outsideDir
	symlinkPath := filepath.Join(baseDir, "escape-link")
	if err := os.Symlink(outsideDir, symlinkPath); err != nil {
		t.Fatalf("failed to create symlink: %v", err)
	}

	// Attempting to write through the symlink should fail
	_, err := validateFilePath("escape-link/evil.txt", baseDir)
	if err == nil {
		t.Error("expected error for symlink escape, got nil")
	}
}

func TestValidateFilePath_AcceptsSymlinkWithinBase(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlinks require special privileges on Windows")
	}

	baseDir := t.TempDir()

	// Create a subdirectory and symlink within baseDir pointing to it
	subDir := filepath.Join(baseDir, "real-subdir")
	if err := os.MkdirAll(subDir, 0755); err != nil {
		t.Fatalf("failed to create subdir: %v", err)
	}
	symlinkPath := filepath.Join(baseDir, "link-subdir")
	if err := os.Symlink(subDir, symlinkPath); err != nil {
		t.Fatalf("failed to create symlink: %v", err)
	}

	// Symlink within baseDir pointing to another location within baseDir should succeed
	result, err := validateFilePath("link-subdir/file.md", baseDir)
	if err != nil {
		t.Fatalf("expected symlink within base to succeed, got error: %v", err)
	}
	expected := filepath.Join(baseDir, "link-subdir", "file.md")
	if result != expected {
		t.Errorf("expected %q, got %q", expected, result)
	}
}

// === writeFileIfChanged Tests ===

func TestWriteFileIfChanged_CreatesNewFile(t *testing.T) {
	dir := t.TempDir()
	filePath := filepath.Join(dir, "new-file.txt")
	content := []byte("hello world")

	written, err := writeFileIfChanged(filePath, content, 0644)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !written {
		t.Error("expected written=true for new file")
	}

	got, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("failed to read file: %v", err)
	}
	if string(got) != string(content) {
		t.Errorf("expected %q, got %q", content, got)
	}
}

func TestWriteFileIfChanged_SkipsUnchangedContent(t *testing.T) {
	dir := t.TempDir()
	filePath := filepath.Join(dir, "existing.txt")
	content := []byte("unchanged content")

	// Write the file first
	if err := os.WriteFile(filePath, content, 0644); err != nil {
		t.Fatalf("failed to write initial file: %v", err)
	}

	// Get mtime before call
	infoBefore, err := os.Stat(filePath)
	if err != nil {
		t.Fatalf("failed to stat file: %v", err)
	}

	// Small sleep to ensure mtime difference would be detectable
	time.Sleep(50 * time.Millisecond)

	// Write same content
	written, err := writeFileIfChanged(filePath, content, 0644)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if written {
		t.Error("expected written=false for unchanged content")
	}

	// Verify mtime was not modified
	infoAfter, err := os.Stat(filePath)
	if err != nil {
		t.Fatalf("failed to stat file after: %v", err)
	}
	if !infoBefore.ModTime().Equal(infoAfter.ModTime()) {
		t.Error("file mtime changed despite unchanged content")
	}
}

func TestWriteFileIfChanged_UpdatesChangedContent(t *testing.T) {
	dir := t.TempDir()
	filePath := filepath.Join(dir, "changing.txt")

	// Write initial content
	if err := os.WriteFile(filePath, []byte("old content"), 0644); err != nil {
		t.Fatalf("failed to write initial file: %v", err)
	}

	// Write different content
	newContent := []byte("new content")
	written, err := writeFileIfChanged(filePath, newContent, 0644)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !written {
		t.Error("expected written=true for changed content")
	}

	got, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("failed to read file: %v", err)
	}
	if string(got) != string(newContent) {
		t.Errorf("expected %q, got %q", newContent, got)
	}
}

// === loadManagedSkillsV2 Tests ===

func TestLoadManagedSkillsV2_V2Format(t *testing.T) {
	dir := t.TempDir()
	filePath := filepath.Join(dir, "managed_skills.json")

	v2Data := ManagedSkillsV2{
		Skills: map[string]ManagedSkillEntry{
			"my-skill": {
				Path:  "/home/user/.claude/skills/my-skill",
				Files: []string{"/home/user/.claude/skills/my-skill/SKILL.md", "/home/user/.claude/skills/my-skill/ref.md"},
			},
			"another": {
				Path:  "/home/user/.claude/commands/another.md",
				Files: []string{"/home/user/.claude/commands/another.md"},
			},
		},
		UpdatedAt: time.Now(),
	}

	data, err := json.MarshalIndent(v2Data, "", "  ")
	if err != nil {
		t.Fatalf("failed to marshal v2 data: %v", err)
	}
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		t.Fatalf("failed to write v2 file: %v", err)
	}

	result := loadManagedSkillsV2(filePath)

	if len(result.Skills) != 2 {
		t.Fatalf("expected 2 skills, got %d", len(result.Skills))
	}

	entry, ok := result.Skills["my-skill"]
	if !ok {
		t.Fatal("expected 'my-skill' entry")
	}
	if entry.Path != "/home/user/.claude/skills/my-skill" {
		t.Errorf("expected path '/home/user/.claude/skills/my-skill', got %q", entry.Path)
	}
	if len(entry.Files) != 2 {
		t.Errorf("expected 2 files, got %d", len(entry.Files))
	}
}

func TestLoadManagedSkillsV2_V1Migration(t *testing.T) {
	dir := t.TempDir()
	filePath := filepath.Join(dir, "managed_skills.json")

	// v1 format is a simple JSON array of file paths
	v1Data := []string{
		"/home/user/.claude/commands/skill-one.md",
		"/home/user/.claude/commands/skill-two.md",
	}

	data, err := json.Marshal(v1Data)
	if err != nil {
		t.Fatalf("failed to marshal v1 data: %v", err)
	}
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		t.Fatalf("failed to write v1 file: %v", err)
	}

	result := loadManagedSkillsV2(filePath)

	if len(result.Skills) != 2 {
		t.Fatalf("expected 2 skills after v1 migration, got %d", len(result.Skills))
	}

	// Check slug extraction: "skill-one.md" -> "skill-one"
	entry, ok := result.Skills["skill-one"]
	if !ok {
		t.Fatal("expected 'skill-one' entry after v1 migration")
	}
	if entry.Path != "/home/user/.claude/commands/skill-one.md" {
		t.Errorf("expected path '/home/user/.claude/commands/skill-one.md', got %q", entry.Path)
	}
	if len(entry.Files) != 1 || entry.Files[0] != "/home/user/.claude/commands/skill-one.md" {
		t.Errorf("unexpected files: %v", entry.Files)
	}
}

func TestLoadManagedSkillsV2_MissingFile(t *testing.T) {
	result := loadManagedSkillsV2("/nonexistent/path/managed_skills.json")

	if result == nil {
		t.Fatal("expected non-nil result for missing file")
	}
	if len(result.Skills) != 0 {
		t.Errorf("expected 0 skills for missing file, got %d", len(result.Skills))
	}
}

func TestLoadManagedSkillsV2_InvalidJSON(t *testing.T) {
	dir := t.TempDir()
	filePath := filepath.Join(dir, "managed_skills.json")

	if err := os.WriteFile(filePath, []byte("not valid json{{{"), 0644); err != nil {
		t.Fatalf("failed to write invalid JSON: %v", err)
	}

	result := loadManagedSkillsV2(filePath)

	if result == nil {
		t.Fatal("expected non-nil result for invalid JSON")
	}
	if len(result.Skills) != 0 {
		t.Errorf("expected 0 skills for invalid JSON, got %d", len(result.Skills))
	}
}

// === saveManagedSkillsV2 Tests ===

func TestSaveManagedSkillsV2_RoundTrip(t *testing.T) {
	dir := t.TempDir()
	filePath := filepath.Join(dir, "managed_skills.json")

	original := &ManagedSkillsV2{
		Skills: map[string]ManagedSkillEntry{
			"test-skill": {
				Path:  "/path/to/skill",
				Files: []string{"/path/to/skill/SKILL.md"},
			},
		},
		UpdatedAt: time.Now().Truncate(time.Second),
	}

	if err := saveManagedSkillsV2(filePath, original); err != nil {
		t.Fatalf("failed to save: %v", err)
	}

	loaded := loadManagedSkillsV2(filePath)
	if len(loaded.Skills) != 1 {
		t.Fatalf("expected 1 skill after round-trip, got %d", len(loaded.Skills))
	}

	entry, ok := loaded.Skills["test-skill"]
	if !ok {
		t.Fatal("expected 'test-skill' after round-trip")
	}
	if entry.Path != "/path/to/skill" {
		t.Errorf("path mismatch: expected '/path/to/skill', got %q", entry.Path)
	}
}

// === installSkills Tests ===

// setupFakeHome creates a fake home directory structure and sets HOME env var.
// Returns the fake home path. Caller should NOT clean up — t.TempDir() handles it.
func setupFakeHome(t *testing.T) string {
	t.Helper()
	fakeHome := t.TempDir()
	t.Setenv("HOME", fakeHome)

	// Create required directories
	zeudePath := filepath.Join(fakeHome, ".zeude")
	if err := os.MkdirAll(zeudePath, 0700); err != nil {
		t.Fatalf("failed to create .zeude dir: %v", err)
	}
	claudePath := filepath.Join(fakeHome, ".claude")
	if err := os.MkdirAll(claudePath, 0755); err != nil {
		t.Fatalf("failed to create .claude dir: %v", err)
	}
	commandsPath := filepath.Join(claudePath, "commands")
	if err := os.MkdirAll(commandsPath, 0755); err != nil {
		t.Fatalf("failed to create .claude/commands dir: %v", err)
	}
	skillsPath := filepath.Join(claudePath, "skills")
	if err := os.MkdirAll(skillsPath, 0755); err != nil {
		t.Fatalf("failed to create .claude/skills dir: %v", err)
	}

	return fakeHome
}

func TestInstallSkills_MultiFile(t *testing.T) {
	fakeHome := setupFakeHome(t)

	skills := []Skill{
		{
			Name: "Multi File Skill",
			Slug: "multi-skill",
			Files: map[string]string{
				"SKILL.md":     "# Main skill content",
				"reference.md": "# Reference doc",
				"config.yaml":  "key: value",
			},
		},
	}

	if err := installSkills(skills); err != nil {
		t.Fatalf("installSkills failed: %v", err)
	}

	skillDir := filepath.Join(fakeHome, ".claude", "skills", "multi-skill")

	// Verify all files were created
	for filename, expectedContent := range skills[0].Files {
		filePath := filepath.Join(skillDir, filename)
		got, err := os.ReadFile(filePath)
		if err != nil {
			t.Errorf("failed to read %s: %v", filename, err)
			continue
		}
		if string(got) != expectedContent {
			t.Errorf("file %s: expected %q, got %q", filename, expectedContent, string(got))
		}
	}

	// Verify managed skills file was written (v2 format)
	managedPath := filepath.Join(fakeHome, ".zeude", "managed_skills.json")
	managedData, err := os.ReadFile(managedPath)
	if err != nil {
		t.Fatalf("failed to read managed_skills.json: %v", err)
	}

	var managed ManagedSkillsV2
	if err := json.Unmarshal(managedData, &managed); err != nil {
		t.Fatalf("failed to unmarshal managed skills: %v", err)
	}
	entry, ok := managed.Skills["multi-skill"]
	if !ok {
		t.Fatal("expected 'multi-skill' in managed skills")
	}
	if entry.Path != skillDir {
		t.Errorf("expected path %q, got %q", skillDir, entry.Path)
	}
	if len(entry.Files) != 3 {
		t.Errorf("expected 3 files tracked, got %d", len(entry.Files))
	}
}

func TestInstallSkills_LegacySingleFile(t *testing.T) {
	fakeHome := setupFakeHome(t)

	skills := []Skill{
		{
			Name:        "Legacy Skill",
			Slug:        "legacy-skill",
			Description: "A legacy skill",
			Content:     "This is the skill content",
		},
	}

	if err := installSkills(skills); err != nil {
		t.Fatalf("installSkills failed: %v", err)
	}

	// Verify file was created in commands/ with YAML frontmatter
	skillPath := filepath.Join(fakeHome, ".claude", "commands", "legacy-skill.md")
	got, err := os.ReadFile(skillPath)
	if err != nil {
		t.Fatalf("failed to read skill file: %v", err)
	}

	content := string(got)
	if content != "---\nname: \"Legacy Skill\"\ndescription: \"A legacy skill\"\n---\n\nThis is the skill content" {
		t.Errorf("unexpected content:\n%s", content)
	}
}

func TestInstallSkills_SkipEmpty(t *testing.T) {
	fakeHome := setupFakeHome(t)

	skills := []Skill{
		{
			Name: "Empty Skill",
			Slug: "empty-skill",
			// No Content, no Files
		},
	}

	if err := installSkills(skills); err != nil {
		t.Fatalf("installSkills failed: %v", err)
	}

	// Verify no files were created
	commandsDir := filepath.Join(fakeHome, ".claude", "commands")
	entries, err := os.ReadDir(commandsDir)
	if err != nil {
		t.Fatalf("failed to read commands dir: %v", err)
	}

	for _, e := range entries {
		if e.Name() == "empty-skill.md" {
			t.Error("empty skill should not have been created")
		}
	}

	skillsDir := filepath.Join(fakeHome, ".claude", "skills")
	entries, err = os.ReadDir(skillsDir)
	if err != nil {
		t.Fatalf("failed to read skills dir: %v", err)
	}
	for _, e := range entries {
		if e.Name() == "empty-skill" {
			t.Error("empty skill directory should not have been created")
		}
	}
}

func TestInstallSkills_StaleFileCleanup(t *testing.T) {
	fakeHome := setupFakeHome(t)

	// First install: multi-file skill with 3 files
	skills := []Skill{
		{
			Name: "Evolving Skill",
			Slug: "evolving",
			Files: map[string]string{
				"SKILL.md":      "# Main",
				"old-ref.md":    "# Old reference",
				"another-old.md": "# Another old file",
			},
		},
	}

	if err := installSkills(skills); err != nil {
		t.Fatalf("first installSkills failed: %v", err)
	}

	// Verify old files exist
	skillDir := filepath.Join(fakeHome, ".claude", "skills", "evolving")
	oldRefPath := filepath.Join(skillDir, "old-ref.md")
	anotherOldPath := filepath.Join(skillDir, "another-old.md")

	if _, err := os.Stat(oldRefPath); err != nil {
		t.Fatalf("old-ref.md should exist after first install: %v", err)
	}
	if _, err := os.Stat(anotherOldPath); err != nil {
		t.Fatalf("another-old.md should exist after first install: %v", err)
	}

	// Second install: skill now only has 2 files (old-ref.md and another-old.md removed)
	skills[0].Files = map[string]string{
		"SKILL.md":   "# Updated main",
		"new-ref.md": "# New reference",
	}

	if err := installSkills(skills); err != nil {
		t.Fatalf("second installSkills failed: %v", err)
	}

	// Verify stale files were removed
	if _, err := os.Stat(oldRefPath); !os.IsNotExist(err) {
		t.Error("old-ref.md should have been removed as stale")
	}
	if _, err := os.Stat(anotherOldPath); !os.IsNotExist(err) {
		t.Error("another-old.md should have been removed as stale")
	}

	// Verify new files exist
	newRefPath := filepath.Join(skillDir, "new-ref.md")
	if _, err := os.Stat(newRefPath); err != nil {
		t.Error("new-ref.md should exist after second install")
	}
}

func TestInstallSkills_LegacyMigration(t *testing.T) {
	fakeHome := setupFakeHome(t)

	commandsDir := filepath.Join(fakeHome, ".claude", "commands")

	// Pre-create a legacy skill file in commands/
	legacyPath := filepath.Join(commandsDir, "migrating-skill.md")
	if err := os.WriteFile(legacyPath, []byte("# Old legacy content"), 0644); err != nil {
		t.Fatalf("failed to write legacy file: %v", err)
	}

	// Now install the same skill as multi-file
	skills := []Skill{
		{
			Name: "Migrating Skill",
			Slug: "migrating-skill",
			Files: map[string]string{
				"SKILL.md": "# New multi-file content",
			},
		},
	}

	if err := installSkills(skills); err != nil {
		t.Fatalf("installSkills failed: %v", err)
	}

	// Verify legacy file was removed
	if _, err := os.Stat(legacyPath); !os.IsNotExist(err) {
		t.Error("legacy file should have been removed after migration to multi-file")
	}

	// Verify new multi-file skill exists
	newSkillPath := filepath.Join(fakeHome, ".claude", "skills", "migrating-skill", "SKILL.md")
	got, err := os.ReadFile(newSkillPath)
	if err != nil {
		t.Fatalf("failed to read new skill file: %v", err)
	}
	if string(got) != "# New multi-file content" {
		t.Errorf("unexpected content: %q", string(got))
	}
}

func TestInstallSkills_CountsBySkillNotFile(t *testing.T) {
	fakeHome := setupFakeHome(t)
	_ = fakeHome

	// Install a multi-file skill with 5 files — installSkills should count it as 1 skill
	// (This tests AC-10/AC-66: installedCount increments per skill, not per file)
	skills := []Skill{
		{
			Name: "Big Skill",
			Slug: "big-skill",
			Files: map[string]string{
				"SKILL.md": "# Main",
				"ref1.md":  "# Ref 1",
				"ref2.md":  "# Ref 2",
				"ref3.md":  "# Ref 3",
				"ref4.md":  "# Ref 4",
			},
		},
	}

	if err := installSkills(skills); err != nil {
		t.Fatalf("installSkills failed: %v", err)
	}

	// Verify all files exist
	skillDir := filepath.Join(fakeHome, ".claude", "skills", "big-skill")
	for filename := range skills[0].Files {
		filePath := filepath.Join(skillDir, filename)
		if _, err := os.Stat(filePath); err != nil {
			t.Errorf("expected file %s to exist: %v", filename, err)
		}
	}

	// Verify managed skills tracks 1 skill entry (not 5 files as separate entries)
	managedPath := filepath.Join(fakeHome, ".zeude", "managed_skills.json")
	data, err := os.ReadFile(managedPath)
	if err != nil {
		t.Fatalf("failed to read managed_skills.json: %v", err)
	}
	var managed ManagedSkillsV2
	if err := json.Unmarshal(data, &managed); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if len(managed.Skills) != 1 {
		t.Errorf("expected 1 managed skill entry, got %d", len(managed.Skills))
	}
}

func TestInstallSkills_DeletesRemovedSkill(t *testing.T) {
	fakeHome := setupFakeHome(t)

	// First install: two skills
	skills := []Skill{
		{
			Name:    "Keep Skill",
			Slug:    "keep-skill",
			Content: "keep me",
		},
		{
			Name:    "Remove Skill",
			Slug:    "remove-skill",
			Content: "remove me",
		},
	}

	if err := installSkills(skills); err != nil {
		t.Fatalf("first installSkills failed: %v", err)
	}

	removePath := filepath.Join(fakeHome, ".claude", "commands", "remove-skill.md")
	if _, err := os.Stat(removePath); err != nil {
		t.Fatalf("remove-skill.md should exist after first install: %v", err)
	}

	// Second install: only one skill
	skills = []Skill{
		{
			Name:    "Keep Skill",
			Slug:    "keep-skill",
			Content: "keep me",
		},
	}

	if err := installSkills(skills); err != nil {
		t.Fatalf("second installSkills failed: %v", err)
	}

	// Verify removed skill was deleted
	if _, err := os.Stat(removePath); !os.IsNotExist(err) {
		t.Error("remove-skill.md should have been deleted")
	}

	// Verify kept skill still exists
	keepPath := filepath.Join(fakeHome, ".claude", "commands", "keep-skill.md")
	if _, err := os.Stat(keepPath); err != nil {
		t.Error("keep-skill.md should still exist")
	}
}

func TestInstallSkills_SkipsEmptySlug(t *testing.T) {
	setupFakeHome(t)

	skills := []Skill{
		{
			Name:    "No Slug Skill",
			Slug:    "",
			Content: "some content",
		},
	}

	// Should not error, just skip
	if err := installSkills(skills); err != nil {
		t.Fatalf("installSkills failed: %v", err)
	}
}

func TestInstallSkills_PathValidationOnMultiFile(t *testing.T) {
	fakeHome := setupFakeHome(t)

	skills := []Skill{
		{
			Name: "Evil Skill",
			Slug: "evil-skill",
			Files: map[string]string{
				"SKILL.md":        "# Good file",
				"../../../etc/pw": "# Should be rejected",
			},
		},
	}

	// installSkills should not error overall, but the evil file should be skipped
	if err := installSkills(skills); err != nil {
		t.Fatalf("installSkills failed: %v", err)
	}

	// Good file should exist
	goodPath := filepath.Join(fakeHome, ".claude", "skills", "evil-skill", "SKILL.md")
	if _, err := os.Stat(goodPath); err != nil {
		t.Error("SKILL.md should have been written")
	}

	// Evil file should NOT exist anywhere
	evilPath := filepath.Join(fakeHome, ".claude", "skills", "evil-skill", "..", "..", "..", "etc", "pw")
	if _, err := os.Stat(evilPath); err == nil {
		t.Error("path traversal file should not have been written")
	}
}

// === installAgents Tests ===

func TestInstallAgents_CreatesFiles(t *testing.T) {
	fakeHome := setupFakeHome(t)

	agents := []Agent{
		{
			Name:        "Test Agent",
			Description: "A test agent",
			Files: map[string]string{
				"test-agent.md": "# Test Agent\n\nAgent instructions here.",
			},
		},
	}

	if err := installAgents(agents); err != nil {
		t.Fatalf("installAgents failed: %v", err)
	}

	// Verify agent file was created
	agentPath := filepath.Join(fakeHome, ".claude", "agents", "test-agent.md")
	got, err := os.ReadFile(agentPath)
	if err != nil {
		t.Fatalf("failed to read agent file: %v", err)
	}
	if string(got) != "# Test Agent\n\nAgent instructions here." {
		t.Errorf("unexpected content: %q", string(got))
	}

	// Verify agents directory was created
	agentsDir := filepath.Join(fakeHome, ".claude", "agents")
	info, err := os.Stat(agentsDir)
	if err != nil {
		t.Fatalf("agents dir should exist: %v", err)
	}
	if !info.IsDir() {
		t.Error("agents should be a directory")
	}
}

func TestInstallAgents_MultipleFiles(t *testing.T) {
	fakeHome := setupFakeHome(t)

	agents := []Agent{
		{
			Name: "Multi Agent",
			Files: map[string]string{
				"agent-a.md": "# Agent A",
				"agent-b.md": "# Agent B",
			},
		},
	}

	if err := installAgents(agents); err != nil {
		t.Fatalf("installAgents failed: %v", err)
	}

	agentsDir := filepath.Join(fakeHome, ".claude", "agents")
	for filename, expectedContent := range agents[0].Files {
		filePath := filepath.Join(agentsDir, filename)
		got, err := os.ReadFile(filePath)
		if err != nil {
			t.Errorf("failed to read %s: %v", filename, err)
			continue
		}
		if string(got) != expectedContent {
			t.Errorf("file %s: expected %q, got %q", filename, expectedContent, string(got))
		}
	}
}

func TestInstallAgents_ValidatesFilePaths(t *testing.T) {
	fakeHome := setupFakeHome(t)

	agents := []Agent{
		{
			Name: "Evil Agent",
			Files: map[string]string{
				"good-agent.md":          "# Good",
				"../../etc/evil-agent.md": "# Evil",
			},
		},
	}

	if err := installAgents(agents); err != nil {
		t.Fatalf("installAgents failed: %v", err)
	}

	// Good file should exist
	goodPath := filepath.Join(fakeHome, ".claude", "agents", "good-agent.md")
	if _, err := os.Stat(goodPath); err != nil {
		t.Error("good-agent.md should have been written")
	}

	// Evil file should NOT exist
	evilPath := filepath.Join(fakeHome, "etc", "evil-agent.md")
	if _, err := os.Stat(evilPath); err == nil {
		t.Error("evil agent file should not have been written via path traversal")
	}
}

func TestInstallAgents_DeletesRemovedAgents(t *testing.T) {
	fakeHome := setupFakeHome(t)

	// First install: two agents
	agents := []Agent{
		{
			Name:  "Keep Agent",
			Files: map[string]string{"keep-agent.md": "# Keep"},
		},
		{
			Name:  "Remove Agent",
			Files: map[string]string{"remove-agent.md": "# Remove"},
		},
	}

	if err := installAgents(agents); err != nil {
		t.Fatalf("first installAgents failed: %v", err)
	}

	removePath := filepath.Join(fakeHome, ".claude", "agents", "remove-agent.md")
	if _, err := os.Stat(removePath); err != nil {
		t.Fatalf("remove-agent.md should exist after first install: %v", err)
	}

	// Second install: only "Keep Agent"
	agents = []Agent{
		{
			Name:  "Keep Agent",
			Files: map[string]string{"keep-agent.md": "# Keep"},
		},
	}

	if err := installAgents(agents); err != nil {
		t.Fatalf("second installAgents failed: %v", err)
	}

	// Verify removed agent was deleted
	if _, err := os.Stat(removePath); !os.IsNotExist(err) {
		t.Error("remove-agent.md should have been deleted")
	}

	// Verify kept agent still exists
	keepPath := filepath.Join(fakeHome, ".claude", "agents", "keep-agent.md")
	if _, err := os.Stat(keepPath); err != nil {
		t.Error("keep-agent.md should still exist")
	}
}

func TestInstallAgents_PreservesUserFiles(t *testing.T) {
	fakeHome := setupFakeHome(t)

	agentsDir := filepath.Join(fakeHome, ".claude", "agents")
	if err := os.MkdirAll(agentsDir, 0755); err != nil {
		t.Fatalf("failed to create agents dir: %v", err)
	}

	// Pre-create a user-managed agent file (not tracked by Zeude)
	userAgentPath := filepath.Join(agentsDir, "user-custom-agent.md")
	if err := os.WriteFile(userAgentPath, []byte("# User's custom agent"), 0644); err != nil {
		t.Fatalf("failed to write user agent file: %v", err)
	}

	// Install managed agents
	agents := []Agent{
		{
			Name:  "Managed Agent",
			Files: map[string]string{"managed-agent.md": "# Managed"},
		},
	}

	if err := installAgents(agents); err != nil {
		t.Fatalf("installAgents failed: %v", err)
	}

	// User's custom agent file should still exist
	if _, err := os.Stat(userAgentPath); err != nil {
		t.Error("user-custom-agent.md should be preserved (not managed by Zeude)")
	}

	got, err := os.ReadFile(userAgentPath)
	if err != nil {
		t.Fatalf("failed to read user agent: %v", err)
	}
	if string(got) != "# User's custom agent" {
		t.Errorf("user agent content was modified: %q", string(got))
	}
}

func TestInstallAgents_SkipsEmptyNameOrFiles(t *testing.T) {
	setupFakeHome(t)

	agents := []Agent{
		{
			Name:  "",
			Files: map[string]string{"no-name.md": "# No name"},
		},
		{
			Name:  "No Files",
			Files: map[string]string{},
		},
		{
			Name:  "Nil Files",
			Files: nil,
		},
	}

	// Should not error, just skip
	if err := installAgents(agents); err != nil {
		t.Fatalf("installAgents failed: %v", err)
	}
}

func TestInstallAgents_WriteFileIfChanged(t *testing.T) {
	fakeHome := setupFakeHome(t)

	agents := []Agent{
		{
			Name:  "Stable Agent",
			Files: map[string]string{"stable-agent.md": "# Stable content"},
		},
	}

	// First install
	if err := installAgents(agents); err != nil {
		t.Fatalf("first installAgents failed: %v", err)
	}

	agentPath := filepath.Join(fakeHome, ".claude", "agents", "stable-agent.md")
	infoBefore, err := os.Stat(agentPath)
	if err != nil {
		t.Fatalf("failed to stat agent file: %v", err)
	}

	// Small delay to detect mtime changes
	time.Sleep(50 * time.Millisecond)

	// Second install with same content
	if err := installAgents(agents); err != nil {
		t.Fatalf("second installAgents failed: %v", err)
	}

	infoAfter, err := os.Stat(agentPath)
	if err != nil {
		t.Fatalf("failed to stat agent file after: %v", err)
	}

	if !infoBefore.ModTime().Equal(infoAfter.ModTime()) {
		t.Error("agent file mtime changed despite unchanged content — writeFileIfChanged optimization not working")
	}
}

func TestInstallAgents_SavesManagedAgentsList(t *testing.T) {
	fakeHome := setupFakeHome(t)

	agents := []Agent{
		{
			Name:  "Agent One",
			Files: map[string]string{"agent-one.md": "# One"},
		},
		{
			Name:  "Agent Two",
			Files: map[string]string{"agent-two.md": "# Two"},
		},
	}

	if err := installAgents(agents); err != nil {
		t.Fatalf("installAgents failed: %v", err)
	}

	// Verify managed-agents.json was written
	managedPath := filepath.Join(fakeHome, ".zeude", ManagedAgentsFile)
	data, err := os.ReadFile(managedPath)
	if err != nil {
		t.Fatalf("failed to read managed agents file: %v", err)
	}

	var managed ManagedAgents
	if err := json.Unmarshal(data, &managed); err != nil {
		t.Fatalf("failed to unmarshal managed agents: %v", err)
	}

	if len(managed.Agents) != 2 {
		t.Errorf("expected 2 managed agents, got %d", len(managed.Agents))
	}

	// Verify both paths are tracked
	agentsDir := filepath.Join(fakeHome, ".claude", "agents")
	expectedPaths := map[string]bool{
		filepath.Join(agentsDir, "agent-one.md"): false,
		filepath.Join(agentsDir, "agent-two.md"): false,
	}
	for _, p := range managed.Agents {
		if _, ok := expectedPaths[p]; ok {
			expectedPaths[p] = true
		}
	}
	for p, found := range expectedPaths {
		if !found {
			t.Errorf("expected path %q in managed agents list", p)
		}
	}
}

// === Constants Tests ===

// === Sync Order Tests (AC-66/AC-106) ===

// TestSync_CallOrder_MCP_Hooks_Skills_Agents_SkillRules verifies that Sync()
// calls its sub-functions in the required order:
// MCP (mergeClaudeConfig) → Hooks (installHooks) → Skills (installSkills) → Agents (installAgents) → SkillRules (syncSkillRules).
//
// This is a source-level ordering test: it reads sync.go and asserts that the
// function calls appear in the expected sequential order by line position.
func TestSync_CallOrder_MCP_Hooks_Skills_Agents_SkillRules(t *testing.T) {
	// Read the sync.go source file to inspect call ordering.
	// We use runtime.Caller to locate the test file, then derive sync.go's path.
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("failed to get current file path via runtime.Caller")
	}
	syncGoPath := filepath.Join(filepath.Dir(thisFile), "sync.go")

	src, err := os.ReadFile(syncGoPath)
	if err != nil {
		t.Fatalf("failed to read sync.go: %v", err)
	}
	source := string(src)

	// We need to find these calls within the Sync() function body.
	// First, locate the start of the Sync() function.
	syncFuncMarker := "func Sync() SyncResult {"
	syncStart := strings.Index(source, syncFuncMarker)
	if syncStart == -1 {
		t.Fatal("could not find 'func Sync() SyncResult {' in sync.go")
	}

	// Extract the Sync() function body (from its declaration to the end of file is fine,
	// since we only care about relative ordering of calls within it).
	syncBody := source[syncStart:]

	// Define the expected call order with their identifying substrings.
	// Each entry is a substring that uniquely identifies the call within Sync().
	orderedCalls := []struct {
		label   string
		pattern string
	}{
		{"MCP (mergeClaudeConfig)", "mergeClaudeConfig(config.MCPServers)"},
		{"Hooks (installHooks)", "installHooks("},
		{"Skills (installSkills)", "installSkills(config.Skills)"},
		{"Agents (installAgents)", "installAgents(config.Agents)"},
		{"SkillRules (syncSkillRules)", "syncSkillRules("},
	}

	prevPos := -1
	prevLabel := ""
	for _, call := range orderedCalls {
		pos := strings.Index(syncBody, call.pattern)
		if pos == -1 {
			t.Fatalf("call %q (pattern: %q) not found in Sync() body", call.label, call.pattern)
		}
		if prevPos >= 0 && pos <= prevPos {
			t.Errorf("ordering violation: %q (pos %d) must come after %q (pos %d)",
				call.label, pos, prevLabel, prevPos)
		}
		prevPos = pos
		prevLabel = call.label
	}
}

func TestConstants(t *testing.T) {
	t.Run("CacheTTL is 5 minutes", func(t *testing.T) {
		expected := 5 * time.Minute
		if CacheTTL != expected {
			t.Errorf("CacheTTL: expected %v, got %v", expected, CacheTTL)
		}
	})

	t.Run("ManagedAgentsFile uses string format", func(t *testing.T) {
		if ManagedAgentsFile != "managed-agents.json" {
			t.Errorf("expected 'managed-agents.json', got %q", ManagedAgentsFile)
		}
		// Verify ManagedAgents struct uses []string (compile-time check via instantiation)
		ma := ManagedAgents{
			Agents: []string{"a", "b"},
		}
		if len(ma.Agents) != 2 {
			t.Error("ManagedAgents.Agents should accept []string")
		}
	})
}

// === Frontmatter Tests ===

func TestExtractBody(t *testing.T) {
	cases := []struct {
		name     string
		content  string
		expected string
	}{
		{"with frontmatter", "---\nname: x\n---\n\n# Body", "# Body"},
		{"without frontmatter", "# Just body", "# Just body"},
		{"empty", "", ""},
		{"only opening ---", "---\nno closing", "---\nno closing"},
		{"frontmatter with Korean", "---\nname: zeude\n---\n\n스킬 본문", "스킬 본문"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := extractBody(tc.content)
			if got != tc.expected {
				t.Errorf("extractBody: got %q, want %q", got, tc.expected)
			}
		})
	}
}

func TestEnsureSkillFrontmatter(t *testing.T) {
	t.Run("rebuilds frontmatter from name and description", func(t *testing.T) {
		original := "---\nname: old-name\ndescription: old desc\n---\n\n# Skill Body"
		result := ensureSkillFrontmatter("new-name", "new desc", original)

		if !strings.HasPrefix(result, "---\n") {
			t.Error("result should start with ---")
		}
		if !strings.Contains(result, `"new-name"`) {
			t.Error("result should use the provided name")
		}
		if !strings.Contains(result, `"new desc"`) {
			t.Error("result should use the provided description")
		}
		if !strings.Contains(result, "# Skill Body") {
			t.Error("result should preserve the body")
		}
	})

	t.Run("body-only content gets frontmatter prepended", func(t *testing.T) {
		bodyOnly := "# Skill Body\nThis has no frontmatter."
		result := ensureSkillFrontmatter("my-skill", "A cool skill", bodyOnly)

		if !strings.HasPrefix(result, "---\n") {
			t.Error("result should start with ---")
		}
		if !strings.Contains(result, bodyOnly) {
			t.Error("result should contain the original body")
		}
	})

	t.Run("Korean name and description are properly quoted", func(t *testing.T) {
		result := ensureSkillFrontmatter("젭-스킬", "ZEP 서비스: 대시보드 열기", "스킬 본문")

		if !strings.HasPrefix(result, "---\n") {
			t.Error("result should have frontmatter")
		}
		if !strings.Contains(result, "스킬 본문") {
			t.Error("result should contain original body")
		}
	})

	t.Run("empty description omits description field", func(t *testing.T) {
		result := ensureSkillFrontmatter("test", "", "body")
		if strings.Contains(result, "description:") {
			t.Error("empty description should not produce description field")
		}
	})

	t.Run("broken YAML frontmatter is replaced — unescaped colon", func(t *testing.T) {
		broken := "---\nname: create-github-issues\ndescription: BMM 에픽. 인자: [--dry-run]\n---\n\n# Body"
		result := ensureSkillFrontmatter("create-github-issues", "BMM 에픽. 인자: [--dry-run]", broken)

		if !strings.HasPrefix(result, "---\n") {
			t.Error("result should have frontmatter")
		}
		if !strings.Contains(result, "# Body") {
			t.Error("result should preserve the original body")
		}
	})

	t.Run("broken YAML frontmatter is replaced — unmatched quotes", func(t *testing.T) {
		broken := "---\nname: pm-skill\ndescription: \"Analyze. Triggers: 요청\", \"백로그\"\n---\n\n# PM Body"
		result := ensureSkillFrontmatter("pm-skill", "Analyze feature requests", broken)

		if !strings.HasPrefix(result, "---\n") {
			t.Error("result should have frontmatter")
		}
		if !strings.Contains(result, "# PM Body") {
			t.Error("result should preserve the original body")
		}
	})
}

func TestWriteSkillsToTarget_FrontmatterRepair(t *testing.T) {
	targetDir := t.TempDir()
	managedFile := filepath.Join(t.TempDir(), "managed.json")

	// Simulate a migrated legacy skill: files["SKILL.md"] has body-only content
	skills := []Skill{
		{
			Name:        "legacy-skill",
			Slug:        "legacy-skill",
			Description: "A migrated skill",
			Files: map[string]string{
				"SKILL.md": "# Legacy Body\nThis was migrated from content column.",
			},
		},
	}

	err := writeSkillsToTarget(skills, skillTarget{
		skillsDir:   targetDir,
		managedFile: managedFile,
	})
	if err != nil {
		t.Fatalf("writeSkillsToTarget failed: %v", err)
	}

	// Verify SKILL.md was written with frontmatter
	skillPath := filepath.Join(targetDir, "legacy-skill", "SKILL.md")
	data, err := os.ReadFile(skillPath)
	if err != nil {
		t.Fatalf("failed to read SKILL.md: %v", err)
	}

	content := string(data)
	if !strings.HasPrefix(content, "---\n") {
		t.Errorf("SKILL.md should have frontmatter after repair, got:\n%s", content[:min(len(content), 200)])
	}
	if !strings.Contains(content, "# Legacy Body") {
		t.Error("SKILL.md should contain original body")
	}
}

func TestWriteSkillsToTarget_RebuildsFrontmatterPreservesBody(t *testing.T) {
	targetDir := t.TempDir()
	managedFile := filepath.Join(t.TempDir(), "managed.json")

	skills := []Skill{
		{
			Name:        "proper-skill",
			Slug:        "proper-skill",
			Description: "Already has frontmatter",
			Files: map[string]string{
				"SKILL.md": "---\nname: proper-skill\ndescription: Already has frontmatter\n---\n\n# Body\nAll good.",
			},
		},
	}

	err := writeSkillsToTarget(skills, skillTarget{
		skillsDir:   targetDir,
		managedFile: managedFile,
	})
	if err != nil {
		t.Fatalf("writeSkillsToTarget failed: %v", err)
	}

	skillPath := filepath.Join(targetDir, "proper-skill", "SKILL.md")
	data, err := os.ReadFile(skillPath)
	if err != nil {
		t.Fatalf("failed to read SKILL.md: %v", err)
	}

	content := string(data)
	// Frontmatter is rebuilt from skill.Name/Description (always quoted)
	if !strings.HasPrefix(content, "---\n") {
		t.Error("should have frontmatter")
	}
	if !strings.Contains(content, `"proper-skill"`) {
		t.Error("name should be quoted via yamlQuoteValue")
	}
	// Body is preserved exactly
	if !strings.Contains(content, "# Body\nAll good.") {
		t.Error("body should be preserved")
	}
}

func TestWriteSkillsToTarget_RepairsNestedSkillFrontmatterForCodex(t *testing.T) {
	targetDir := t.TempDir()
	managedFile := filepath.Join(t.TempDir(), "managed.json")

	skills := []Skill{
		{
			Name:        "figma-connect-helper",
			Slug:        "figma-connect-helper",
			Description: "Figma helper",
			Files: map[string]string{
				"figma-connect-helper/SKILL.md": "---\nname: figma-connect-helper\ndescription: broken\nt\n---\n\n# Nested Body",
			},
		},
	}

	err := writeSkillsToTarget(skills, skillTarget{
		skillsDir:   targetDir,
		managedFile: managedFile,
	})
	if err != nil {
		t.Fatalf("writeSkillsToTarget failed: %v", err)
	}

	skillPath := filepath.Join(targetDir, "figma-connect-helper", "figma-connect-helper", "SKILL.md")
	data, err := os.ReadFile(skillPath)
	if err != nil {
		t.Fatalf("failed to read nested SKILL.md: %v", err)
	}

	content := string(data)
	if !strings.HasPrefix(content, "---\n") {
		t.Error("nested SKILL.md should have frontmatter after repair")
	}
	if !strings.Contains(content, `"figma-connect-helper"`) {
		t.Error("nested SKILL.md should be rebuilt from canonical name")
	}
	if !strings.Contains(content, "# Nested Body") {
		t.Error("nested SKILL.md should preserve original body")
	}
}
