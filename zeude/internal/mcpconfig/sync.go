// Package mcpconfig handles MCP server configuration synchronization.
// It fetches MCP configs from the Zeude dashboard and merges them into ~/.claude.json.
package mcpconfig

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/zeude/zeude/internal/config"
)

const (
	// ConfigFetchTimeout is the maximum time to wait for config fetch.
	ConfigFetchTimeout = 5 * time.Second
	// CacheFile is the cached config file name.
	CacheFile = "config-cache.json"
	// ManagedKeysFile tracks which MCP keys are managed by Zeude.
	ManagedKeysFile = "managed-keys.json"
	// ManagedHooksFile tracks which hook files are managed by Zeude.
	ManagedHooksFile = "managed-hooks.json"
	// CacheTTL defines how long cached config remains valid.
	// Reduced from 48h to 5min since we now use hash-based comparison.
	// TTL is now just a fallback - primary sync uses configVersion hash.
	CacheTTL = 5 * time.Minute
	// MaxResponseSize limits API response to prevent DoS (1MB).
	MaxResponseSize = 1 << 20
)

// debugLog controls whether debug logging is enabled.
var debugLog = os.Getenv("ZEUDE_DEBUG") == "1"

// envKeyRegex validates environment variable names.
// Must start with letter or underscore, followed by letters, digits, or underscores.
var envKeyRegex = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// isValidEnvKey checks if the key is a valid environment variable name.
func isValidEnvKey(key string) bool {
	return envKeyRegex.MatchString(key)
}

// escapeShellValue escapes special characters for use in double-quoted shell strings.
// Characters that need escaping inside double quotes: \, $, `, ", !
func escapeShellValue(s string) string {
	// Order matters: escape backslash first
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `$`, `\$`)
	s = strings.ReplaceAll(s, "`", "\\`")
	s = strings.ReplaceAll(s, `"`, `\"`)
	s = strings.ReplaceAll(s, `!`, `\!`)
	return s
}

// escapePythonValue escapes special characters for Python string literals (single-quoted).
func escapePythonValue(s string) string {
	// Order matters: escape backslash first
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `'`, `\'`)
	// Escape newlines to prevent SyntaxError in string literals
	s = strings.ReplaceAll(s, "\n", `\n`)
	s = strings.ReplaceAll(s, "\r", `\r`)
	return s
}

// escapeJSValue escapes special characters for JavaScript string literals (single-quoted).
func escapeJSValue(s string) string {
	// Order matters: escape backslash first
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `'`, `\'`)
	// Escape newlines and carriage returns
	s = strings.ReplaceAll(s, "\n", `\n`)
	s = strings.ReplaceAll(s, "\r", `\r`)
	// Escape Unicode line terminators (JS treats these as line breaks)
	s = strings.ReplaceAll(s, "\u2028", `\u2028`)
	s = strings.ReplaceAll(s, "\u2029", `\u2029`)
	return s
}

// logDebug logs a debug message if debug logging is enabled.
func logDebug(format string, args ...interface{}) {
	if debugLog {
		log.Printf("[zeude-sync] "+format, args...)
	}
}

// logError logs an error message.
func logError(format string, args ...interface{}) {
	log.Printf("[zeude-sync] ERROR: "+format, args...)
}

// AuthError represents an authentication/authorization failure.
type AuthError struct {
	StatusCode int
	Message    string
}

func (e *AuthError) Error() string {
	return fmt.Sprintf("auth error: %d - %s", e.StatusCode, e.Message)
}

// MCPServer represents an MCP server configuration.
type MCPServer struct {
	Command string            `json:"command"`
	Args    []string          `json:"args"`
	Env     map[string]string `json:"env,omitempty"`
}

// Hook represents a Claude Code hook configuration.
type Hook struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Event       string            `json:"event"`
	Description string            `json:"description,omitempty"`
	Script      string            `json:"script"`
	ScriptType  string            `json:"scriptType"`
	Env         map[string]string `json:"env,omitempty"`
}

// Skill represents a Claude Code slash command skill.
type Skill struct {
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Description string `json:"description,omitempty"`
	Content     string `json:"content"`
}

// ConfigHashes contains Merkle-tree style hashes for efficient sync.
type ConfigHashes struct {
	Root       string `json:"root"`
	MCPServers string `json:"mcpServers"`
	Skills     string `json:"skills"`
	Hooks      string `json:"hooks"`
}

// ConfigResponse is the response from the config API.
type ConfigResponse struct {
	MCPServers    map[string]MCPServer `json:"mcpServers"`
	Skills        []Skill              `json:"skills"`
	Hooks         []Hook               `json:"hooks"`
	Hashes        ConfigHashes         `json:"hashes"`        // Merkle-tree style hashes
	ConfigVersion string               `json:"configVersion"` // Root hash (replaces timestamp)
	ServerCount   int                  `json:"serverCount"`
	SkillCount    int                  `json:"skillCount"`
	HookCount     int                  `json:"hookCount"`
	UserID        string               `json:"userId,omitempty"`    // Supabase UUID
	UserEmail     string               `json:"userEmail,omitempty"`
	Team          string               `json:"team,omitempty"`
}

// CachedConfig wraps ConfigResponse with cache metadata.
type CachedConfig struct {
	Config    ConfigResponse `json:"config"`
	CachedAt  time.Time      `json:"cachedAt"`
	ExpiresAt time.Time      `json:"expiresAt"`
	Version   string         `json:"version"`
}

// ManagedKeys tracks which MCP server keys are managed by Zeude.
type ManagedKeys struct {
	Keys      []string  `json:"keys"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// ManagedHooks tracks which hook files are managed by Zeude.
type ManagedHooks struct {
	Hooks     []string  `json:"hooks"` // file paths
	UpdatedAt time.Time `json:"updatedAt"`
}

// getHomeDir returns the user's home directory or error.
// [FIX #9] Properly handle UserHomeDir errors.
func getHomeDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}
	if home == "" {
		return "", errors.New("home directory is empty")
	}
	return home, nil
}

// getAgentKey reads the agent key from ~/.zeude/credentials.
// [FIX #6] Handle CRLF line endings.
func getAgentKey() string {
	home, err := getHomeDir()
	if err != nil {
		logDebug("failed to get home dir: %v", err)
		return ""
	}

	credPath := filepath.Join(home, ".zeude", "credentials")
	data, err := os.ReadFile(credPath)
	if err != nil {
		logDebug("failed to read credentials: %v", err)
		return ""
	}

	// Parse credentials file (format: agent_key=zd_xxx)
	// [FIX #6] Handle both LF and CRLF line endings
	content := strings.ReplaceAll(string(data), "\r\n", "\n")
	content = strings.ReplaceAll(content, "\r", "\n")
	lines := strings.Split(content, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "agent_key=") {
			return strings.TrimSpace(strings.TrimPrefix(line, "agent_key="))
		}
		// Also handle "agent_key = value" format
		if strings.HasPrefix(line, "agent_key") {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1])
			}
		}
	}

	logDebug("no agent_key found in credentials file")
	return ""
}

// getDashboardURL returns the dashboard URL from env or default.
func getDashboardURL() string {
	if url := os.Getenv("ZEUDE_DASHBOARD_URL"); url != "" {
		return strings.TrimSuffix(url, "/")
	}
	return config.DefaultDashboardURL
}

// ErrNotModified indicates the config hasn't changed (304 response).
var ErrNotModified = errors.New("config not modified")

// fetchConfig fetches MCP config from the dashboard API.
// If cachedVersion is provided, sends If-None-Match header for conditional request.
// Returns ErrNotModified if server returns 304 (config unchanged).
// [FIX #7] Limits response size to prevent DoS.
func fetchConfig(agentKey string, cachedVersion string) (*ConfigResponse, error) {
	ctx, cancel := context.WithTimeout(context.Background(), ConfigFetchTimeout)
	defer cancel()

	url := fmt.Sprintf("%s/api/config/_", getDashboardURL())

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		logDebug("failed to create request: %v", err)
		return nil, err
	}

	req.Header.Set("User-Agent", "zeude-cli/1.0")
	req.Header.Set("Authorization", "Bearer "+agentKey)

	// Send If-None-Match header for conditional request (ETag support)
	if cachedVersion != "" {
		req.Header.Set("If-None-Match", cachedVersion)
		logDebug("fetching config with If-None-Match: %s", cachedVersion)
	} else {
		logDebug("fetching config from %s", url)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		logDebug("request failed: %v", err)
		return nil, err
	}
	defer resp.Body.Close()

	// Handle 304 Not Modified - config unchanged, use cache
	if resp.StatusCode == http.StatusNotModified {
		logDebug("server returned 304 Not Modified - config unchanged")
		return nil, ErrNotModified
	}

	// Differentiate auth errors from other errors
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		logError("authentication failed: %d", resp.StatusCode)
		return nil, &AuthError{
			StatusCode: resp.StatusCode,
			Message:    "access denied or revoked",
		}
	}

	if resp.StatusCode != http.StatusOK {
		logDebug("unexpected status code: %d", resp.StatusCode)
		return nil, fmt.Errorf("config fetch failed: %d", resp.StatusCode)
	}

	// [FIX #7] Limit response size to prevent DoS
	limitedReader := io.LimitReader(resp.Body, MaxResponseSize)
	body, err := io.ReadAll(limitedReader)
	if err != nil {
		logDebug("failed to read response body: %v", err)
		return nil, err
	}

	var config ConfigResponse
	if err := json.Unmarshal(body, &config); err != nil {
		logDebug("failed to parse response: %v", err)
		return nil, err
	}

	logDebug("fetched %d MCP servers (version: %s)", config.ServerCount, config.ConfigVersion)
	return &config, nil
}

// getZeudePath returns the path to ~/.zeude directory.
func getZeudePath() (string, error) {
	home, err := getHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".zeude"), nil
}

// getCachePath returns the path to the config cache file.
func getCachePath() (string, error) {
	zeudePath, err := getZeudePath()
	if err != nil {
		return "", err
	}
	return filepath.Join(zeudePath, CacheFile), nil
}

// getManagedKeysPath returns the path to the managed keys file.
func getManagedKeysPath() (string, error) {
	zeudePath, err := getZeudePath()
	if err != nil {
		return "", err
	}
	return filepath.Join(zeudePath, ManagedKeysFile), nil
}

// getManagedHooksPath returns the path to the managed hooks file.
func getManagedHooksPath() (string, error) {
	zeudePath, err := getZeudePath()
	if err != nil {
		return "", err
	}
	return filepath.Join(zeudePath, ManagedHooksFile), nil
}

// ensureZeudeDir creates ~/.zeude directory with proper permissions.
func ensureZeudeDir() error {
	zeudePath, err := getZeudePath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(zeudePath, 0700); err != nil {
		logError("failed to create .zeude directory: %v", err)
		return err
	}
	return os.Chmod(zeudePath, 0700)
}

// loadCachedConfig loads the cached config from disk.
// Returns (config, isExpired). Even expired cache can be used as fallback for offline mode.
func loadCachedConfig() (*CachedConfig, bool) {
	cachePath, err := getCachePath()
	if err != nil {
		logDebug("failed to get cache path: %v", err)
		return nil, false
	}

	data, err := os.ReadFile(cachePath)
	if err != nil {
		logDebug("no cache file: %v", err)
		return nil, false
	}

	var cached CachedConfig
	if err := json.Unmarshal(data, &cached); err != nil {
		logDebug("failed to parse cache: %v", err)
		return nil, false
	}

	// Check if cache has expired (TTL is freshness indicator, not hard cutoff)
	isExpired := time.Now().After(cached.ExpiresAt)
	if isExpired {
		logDebug("cache expired at %v (will use as fallback if needed)", cached.ExpiresAt)
	} else {
		logDebug("loaded cached config (version: %s, expires: %v)", cached.Version, cached.ExpiresAt)
	}

	return &cached, isExpired
}

// isCacheValid checks if cached config matches server version using hash comparison.
// Returns true if cache is valid and no sync needed.
func isCacheValid(cached *CachedConfig, serverVersion string) bool {
	if cached == nil || serverVersion == "" {
		return false
	}
	// Compare root hash (configVersion is now the root hash)
	if cached.Version == serverVersion {
		logDebug("cache valid: version %s matches server", serverVersion)
		return true
	}
	logDebug("cache invalid: local %s != server %s", cached.Version, serverVersion)
	return false
}

// writeFileAtomic writes data to a file atomically using temp file + rename.
// [FIX #4] Uses 0600 permissions.
// [FIX #5] Uses os.CreateTemp for secure temp files.
// [FIX #13] Handles cross-filesystem with fallback copy.
func writeFileAtomic(targetPath string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(targetPath)

	// Create temp file in the same directory for atomic rename
	tmpFile, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	tmpPath := tmpFile.Name()

	// Ensure cleanup on failure
	success := false
	defer func() {
		if !success {
			os.Remove(tmpPath)
		}
	}()

	// Write data with proper permissions
	if err := tmpFile.Chmod(perm); err != nil {
		tmpFile.Close()
		return fmt.Errorf("failed to set temp file permissions: %w", err)
	}

	if _, err := tmpFile.Write(data); err != nil {
		tmpFile.Close()
		return fmt.Errorf("failed to write temp file: %w", err)
	}

	if err := tmpFile.Sync(); err != nil {
		tmpFile.Close()
		return fmt.Errorf("failed to sync temp file: %w", err)
	}

	if err := tmpFile.Close(); err != nil {
		return fmt.Errorf("failed to close temp file: %w", err)
	}

	// Atomic rename
	if err := os.Rename(tmpPath, targetPath); err != nil {
		// [FIX #13] Fallback to copy if rename fails (cross-filesystem)
		logDebug("rename failed, trying copy: %v", err)
		if copyErr := copyFile(tmpPath, targetPath, perm); copyErr != nil {
			return fmt.Errorf("failed to rename or copy: rename=%v, copy=%v", err, copyErr)
		}
		os.Remove(tmpPath)
	}

	success = true
	return nil
}

// copyFile copies a file with specified permissions.
func copyFile(src, dst string, perm os.FileMode) error {
	srcData, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, srcData, perm)
}

// writeFileIfChanged writes data to file only if content has changed.
// Returns (written bool, error). written=false means file was unchanged.
func writeFileIfChanged(targetPath string, data []byte, perm os.FileMode) (bool, error) {
	// Check if file exists and has same content
	existing, err := os.ReadFile(targetPath)
	if err == nil {
		// File exists - compare content directly (faster than hashing)
		if bytes.Equal(existing, data) {
			logDebug("file unchanged, skipping: %s", targetPath)
			return false, nil
		}
	}
	// File doesn't exist or content changed - write it
	if err := writeFileAtomic(targetPath, data, perm); err != nil {
		return false, err
	}
	return true, nil
}

// saveCachedConfig saves the config to cache with TTL.
func saveCachedConfig(config *ConfigResponse) error {
	if config == nil {
		return nil
	}

	if err := ensureZeudeDir(); err != nil {
		return err
	}

	cached := CachedConfig{
		Config:    *config,
		CachedAt:  time.Now(),
		ExpiresAt: time.Now().Add(CacheTTL),
		Version:   config.ConfigVersion,
	}

	data, err := json.MarshalIndent(cached, "", "  ")
	if err != nil {
		logError("failed to marshal cache: %v", err)
		return err
	}

	cachePath, err := getCachePath()
	if err != nil {
		return err
	}

	if err := writeFileAtomic(cachePath, data, 0600); err != nil {
		logError("failed to write cache: %v", err)
		return err
	}

	logDebug("saved cache (expires: %v)", cached.ExpiresAt)
	return nil
}

// clearCache removes the cached config (used on auth errors).
func clearCache() {
	cachePath, err := getCachePath()
	if err != nil {
		return
	}
	if err := os.Remove(cachePath); err != nil && !os.IsNotExist(err) {
		logError("failed to clear cache: %v", err)
	} else {
		logDebug("cache cleared")
	}

	managedKeysPath, err := getManagedKeysPath()
	if err != nil {
		return
	}
	if err := os.Remove(managedKeysPath); err != nil && !os.IsNotExist(err) {
		logError("failed to clear managed keys: %v", err)
	}

	managedHooksPath, err := getManagedHooksPath()
	if err != nil {
		return
	}
	if err := os.Remove(managedHooksPath); err != nil && !os.IsNotExist(err) {
		logError("failed to clear managed hooks: %v", err)
	}
}

// loadManagedKeys loads the list of previously synced MCP keys.
func loadManagedKeys() []string {
	managedPath, err := getManagedKeysPath()
	if err != nil {
		return nil
	}

	data, err := os.ReadFile(managedPath)
	if err != nil {
		return nil
	}

	var managed ManagedKeys
	if err := json.Unmarshal(data, &managed); err != nil {
		return nil
	}

	return managed.Keys
}

// saveManagedKeys saves the list of currently synced MCP keys.
func saveManagedKeys(keys []string) error {
	if err := ensureZeudeDir(); err != nil {
		return err
	}

	managed := ManagedKeys{
		Keys:      keys,
		UpdatedAt: time.Now(),
	}

	data, err := json.MarshalIndent(managed, "", "  ")
	if err != nil {
		return err
	}

	managedPath, err := getManagedKeysPath()
	if err != nil {
		return err
	}

	return writeFileAtomic(managedPath, data, 0600)
}

// loadManagedHooks loads the list of previously synced hook file paths.
func loadManagedHooks() []string {
	managedPath, err := getManagedHooksPath()
	if err != nil {
		return nil
	}

	data, err := os.ReadFile(managedPath)
	if err != nil {
		return nil
	}

	var managed ManagedHooks
	if err := json.Unmarshal(data, &managed); err != nil {
		return nil
	}

	return managed.Hooks
}

// saveManagedHooks saves the list of currently synced hook file paths.
func saveManagedHooks(hooks []string) error {
	if err := ensureZeudeDir(); err != nil {
		return err
	}

	managed := ManagedHooks{
		Hooks:     hooks,
		UpdatedAt: time.Now(),
	}

	data, err := json.MarshalIndent(managed, "", "  ")
	if err != nil {
		return err
	}

	managedPath, err := getManagedHooksPath()
	if err != nil {
		return err
	}

	return writeFileAtomic(managedPath, data, 0600)
}

// getClaudeConfigPath returns the path to ~/.claude.json.
func getClaudeConfigPath() (string, error) {
	home, err := getHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".claude.json"), nil
}

// getLockPath returns the path to the lock file.
func getLockPath() (string, error) {
	configPath, err := getClaudeConfigPath()
	if err != nil {
		return "", err
	}
	return configPath + ".lock", nil
}

// readClaudeConfig reads and parses ~/.claude.json.
// [FIX #11] Validates mcpServers type.
func readClaudeConfig() (map[string]interface{}, error) {
	configPath, err := getClaudeConfigPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]interface{}{}, nil
		}
		return nil, err
	}

	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("invalid JSON in claude.json: %w", err)
	}

	// [FIX #11] Validate mcpServers is a map if it exists
	if mcpServers, exists := config["mcpServers"]; exists {
		if _, ok := mcpServers.(map[string]interface{}); !ok {
			logError("mcpServers is not a map, will be overwritten")
			// Don't return error, just log and continue
			// This allows recovery from corrupted state
		}
	}

	return config, nil
}

// writeClaudeConfig writes the config back to ~/.claude.json.
func writeClaudeConfig(config map[string]interface{}) error {
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}

	configPath, err := getClaudeConfigPath()
	if err != nil {
		return err
	}

	// [FIX #4] Use 0600 permissions for security
	return writeFileAtomic(configPath, data, 0600)
}

// contains checks if a string slice contains a value.
func contains(slice []string, val string) bool {
	for _, s := range slice {
		if s == val {
			return true
		}
	}
	return false
}

// mergeClaudeConfig merges server MCP configs into ~/.claude.json.
// [FIX #3] Write config first, then managed keys.
// [FIX #10] Clean up lock file after use.
func mergeClaudeConfig(serverMCPs map[string]MCPServer) error {
	// Acquire file lock
	lock, lockPath, err := acquireFileLock()
	if err != nil {
		logError("failed to acquire lock: %v", err)
		return err
	}
	// [FIX #10] Clean up lock file after use
	defer func() {
		releaseFileLock(lock)
		if lockPath != "" {
			os.Remove(lockPath)
		}
	}()

	config, err := readClaudeConfig()
	if err != nil {
		logError("failed to read claude config: %v", err)
		return err
	}

	// Get or create mcpServers section
	var existingMCPs map[string]interface{}
	if mcpServers, ok := config["mcpServers"].(map[string]interface{}); ok {
		existingMCPs = mcpServers
	} else {
		existingMCPs = map[string]interface{}{}
	}

	// Load previously managed keys
	oldManagedKeys := loadManagedKeys()
	newManagedKeys := make([]string, 0, len(serverMCPs))

	// Update or add server MCPs
	for key, server := range serverMCPs {
		mcpConfig := map[string]interface{}{
			"command": server.Command,
			"args":    server.Args,
		}
		if len(server.Env) > 0 {
			mcpConfig["env"] = server.Env
		}
		existingMCPs[key] = mcpConfig
		newManagedKeys = append(newManagedKeys, key)
	}

	// Remove servers that were previously managed but no longer exist
	removedCount := 0
	for _, oldKey := range oldManagedKeys {
		if !contains(newManagedKeys, oldKey) {
			delete(existingMCPs, oldKey)
			removedCount++
			logDebug("removed deleted server: %s", oldKey)
		}
	}

	if removedCount > 0 {
		logDebug("removed %d deleted servers", removedCount)
	}

	config["mcpServers"] = existingMCPs

	// [FIX #3] Write config FIRST, then managed keys
	if err := writeClaudeConfig(config); err != nil {
		logError("failed to write claude config: %v", err)
		return err
	}

	// Only save managed keys AFTER config write succeeds
	if err := saveManagedKeys(newManagedKeys); err != nil {
		logError("failed to save managed keys: %v", err)
		// Non-fatal: config is already written
	}

	logDebug("merged %d servers into claude.json", len(serverMCPs))
	return nil
}

// getClaudeHooksDir returns the path to ~/.claude/hooks directory.
func getClaudeHooksDir() (string, error) {
	home, err := getHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".claude", "hooks"), nil
}

// getClaudeSettingsPath returns the path to ~/.claude/settings.json.
func getClaudeSettingsPath() (string, error) {
	home, err := getHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".claude", "settings.json"), nil
}

// sanitizeFilename removes special characters from filename.
func sanitizeFilename(name string) string {
	// Replace spaces and special chars with dashes
	result := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return '-'
	}, name)
	return strings.ToLower(result)
}

// readClaudeSettings reads ~/.claude/settings.json.
func readClaudeSettings() (map[string]interface{}, error) {
	settingsPath, err := getClaudeSettingsPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]interface{}{}, nil
		}
		return nil, err
	}

	var settings map[string]interface{}
	if err := json.Unmarshal(data, &settings); err != nil {
		return nil, fmt.Errorf("invalid JSON in settings.json: %w", err)
	}

	return settings, nil
}

// writeClaudeSettings writes ~/.claude/settings.json.
func writeClaudeSettings(settings map[string]interface{}) error {
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}

	settingsPath, err := getClaudeSettingsPath()
	if err != nil {
		return err
	}

	// Ensure .claude directory exists
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0700); err != nil {
		return err
	}

	return writeFileAtomic(settingsPath, data, 0600)
}

// installHooks installs hooks to ~/.claude/hooks/{event}/ and registers in settings.json.
// Injects environment variables from user config into hook scripts.
// Also tracks and removes deleted hooks.
// Returns list of installed hook IDs for status reporting.
func installHooks(hooks []Hook, agentKey, dashboardURL, userEmail, team string) ([]string, error) {
	hooksDir, err := getClaudeHooksDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get hooks dir: %w", err)
	}

	// Load previously managed hooks
	oldManagedHooks := loadManagedHooks()
	newManagedHooks := make([]string, 0, len(hooks))

	// Track successfully installed hook IDs for status reporting
	installedHookIDs := make([]string, 0, len(hooks))

	// Track installed hooks for settings.json registration
	installedHooks := make(map[string][]string) // event -> []scriptPaths

	installedCount := 0
	for _, hook := range hooks {
		// Create event directory: ~/.claude/hooks/{event}/
		eventDir := filepath.Join(hooksDir, hook.Event)
		if err := os.MkdirAll(eventDir, 0755); err != nil {
			logError("failed to create hook dir %s: %v", eventDir, err)
			continue
		}

		// Determine file extension based on script type
		ext := ".sh"
		shebang := "#!/bin/bash"
		switch hook.ScriptType {
		case "python":
			ext = ".py"
			shebang = "#!/usr/bin/env python3"
		case "node":
			ext = ".js"
			shebang = "#!/usr/bin/env node"
		}

		// Build script with injected environment variables
		var scriptBuilder strings.Builder
		scriptBuilder.WriteString(shebang + "\n")
		scriptBuilder.WriteString("# Auto-generated by Zeude - DO NOT EDIT\n")
		scriptBuilder.WriteString("# Hook: " + hook.Name + "\n")
		scriptBuilder.WriteString("# Event: " + hook.Event + "\n\n")

		// Inject environment variables with proper escaping based on script type
		scriptBuilder.WriteString("# Zeude environment variables\n")

		switch hook.ScriptType {
		case "python":
			// Python: use os.environ with single-quoted strings
			scriptBuilder.WriteString("import os\n")
			scriptBuilder.WriteString("import sys\n")
			scriptBuilder.WriteString(fmt.Sprintf("os.environ['ZEUDE_API_URL'] = '%s'\n", escapePythonValue(dashboardURL)))
			scriptBuilder.WriteString(fmt.Sprintf("os.environ['ZEUDE_AGENT_KEY'] = '%s'\n", escapePythonValue(agentKey)))
			scriptBuilder.WriteString(fmt.Sprintf("os.environ['ZEUDE_USER_EMAIL'] = '%s'\n", escapePythonValue(userEmail)))
			scriptBuilder.WriteString(fmt.Sprintf("os.environ['ZEUDE_TEAM'] = '%s'\n", escapePythonValue(team)))
			// Check if agent key is set (exit code 2 = blocking exit for Claude Code hooks)
			scriptBuilder.WriteString("if not os.environ.get('ZEUDE_AGENT_KEY'):\n")
			scriptBuilder.WriteString("    print('Error: ZEUDE_AGENT_KEY is not configured. Please run zeude setup.', file=sys.stderr)\n")
			scriptBuilder.WriteString("    sys.exit(2)\n")

			// Add any additional env vars from hook config
			for key, value := range hook.Env {
				// Skip empty values and already-set vars
				if value == "" || strings.HasPrefix(key, "ZEUDE_") {
					continue
				}
				// Validate environment variable key
				if !isValidEnvKey(key) {
					logDebug("skipping invalid env key: %s", key)
					continue
				}
				scriptBuilder.WriteString(fmt.Sprintf("os.environ['%s'] = '%s'\n", key, escapePythonValue(value)))
			}

		case "node":
			// JavaScript: use process.env with single-quoted strings
			scriptBuilder.WriteString(fmt.Sprintf("process.env.ZEUDE_API_URL = '%s';\n", escapeJSValue(dashboardURL)))
			scriptBuilder.WriteString(fmt.Sprintf("process.env.ZEUDE_AGENT_KEY = '%s';\n", escapeJSValue(agentKey)))
			scriptBuilder.WriteString(fmt.Sprintf("process.env.ZEUDE_USER_EMAIL = '%s';\n", escapeJSValue(userEmail)))
			scriptBuilder.WriteString(fmt.Sprintf("process.env.ZEUDE_TEAM = '%s';\n", escapeJSValue(team)))
			// Check if agent key is set (exit code 2 = blocking exit for Claude Code hooks)
			scriptBuilder.WriteString("if (!process.env.ZEUDE_AGENT_KEY) {\n")
			scriptBuilder.WriteString("  console.error('Error: ZEUDE_AGENT_KEY is not configured. Please run zeude setup.');\n")
			scriptBuilder.WriteString("  process.exit(2);\n")
			scriptBuilder.WriteString("}\n")

			// Add any additional env vars from hook config
			for key, value := range hook.Env {
				// Skip empty values and already-set vars
				if value == "" || strings.HasPrefix(key, "ZEUDE_") {
					continue
				}
				// Validate environment variable key
				if !isValidEnvKey(key) {
					logDebug("skipping invalid env key: %s", key)
					continue
				}
				scriptBuilder.WriteString(fmt.Sprintf("process.env.%s = '%s';\n", key, escapeJSValue(value)))
			}

		default:
			// Shell (bash): use export with double-quoted strings and proper escaping
			scriptBuilder.WriteString(fmt.Sprintf("export ZEUDE_API_URL=\"%s\"\n", escapeShellValue(dashboardURL)))
			scriptBuilder.WriteString(fmt.Sprintf("export ZEUDE_AGENT_KEY=\"%s\"\n", escapeShellValue(agentKey)))
			scriptBuilder.WriteString(fmt.Sprintf("export ZEUDE_USER_EMAIL=\"%s\"\n", escapeShellValue(userEmail)))
			scriptBuilder.WriteString(fmt.Sprintf("export ZEUDE_TEAM=\"%s\"\n", escapeShellValue(team)))
			// Check if agent key is set (exit code 2 = blocking exit for Claude Code hooks)
			scriptBuilder.WriteString("if [ -z \"$ZEUDE_AGENT_KEY\" ]; then\n")
			scriptBuilder.WriteString("  echo \"Error: ZEUDE_AGENT_KEY is not configured. Please run zeude setup.\" >&2\n")
			scriptBuilder.WriteString("  exit 2\n")
			scriptBuilder.WriteString("fi\n")

			// Add any additional env vars from hook config
			for key, value := range hook.Env {
				// Skip empty values and already-set vars
				if value == "" || strings.HasPrefix(key, "ZEUDE_") {
					continue
				}
				// Validate environment variable key
				if !isValidEnvKey(key) {
					logDebug("skipping invalid env key: %s", key)
					continue
				}
				scriptBuilder.WriteString(fmt.Sprintf("export %s=\"%s\"\n", key, escapeShellValue(value)))
			}
		}
		scriptBuilder.WriteString("\n")

		// Append the original script (without its shebang if present)
		script := hook.Script
		if strings.HasPrefix(script, "#!") {
			// Remove original shebang line
			if idx := strings.Index(script, "\n"); idx != -1 {
				script = script[idx+1:]
			}
		}
		scriptBuilder.WriteString(script)

		// Write hook file (only if content changed)
		filename := sanitizeFilename(hook.Name) + ext
		hookPath := filepath.Join(eventDir, filename)

		written, err := writeFileIfChanged(hookPath, []byte(scriptBuilder.String()), 0755)
		if err != nil {
			logError("failed to write hook %s: %v", hookPath, err)
			continue
		}

		// Track for settings.json
		installedHooks[hook.Event] = append(installedHooks[hook.Event], hookPath)

		// Track for managed hooks
		newManagedHooks = append(newManagedHooks, hookPath)

		// Track hook ID for status reporting
		installedHookIDs = append(installedHookIDs, hook.ID)

		if written {
			installedCount++
			logDebug("installed hook: %s -> %s", hook.Name, hookPath)
		} else {
			logDebug("hook unchanged: %s", hook.Name)
		}
	}

	// Remove hooks that were previously managed but no longer exist
	deletedHooks := make([]string, 0)
	for _, oldHook := range oldManagedHooks {
		if !contains(newManagedHooks, oldHook) {
			// Delete the hook file
			if err := os.Remove(oldHook); err != nil {
				if !os.IsNotExist(err) {
					logError("failed to remove deleted hook %s: %v", oldHook, err)
				}
			} else {
				logDebug("removed deleted hook: %s", oldHook)
			}
			deletedHooks = append(deletedHooks, oldHook)
		}
	}

	if len(deletedHooks) > 0 {
		logDebug("removed %d deleted hooks", len(deletedHooks))
	}

	// Register hooks in ~/.claude/settings.json (also removes deleted hooks)
	if err := registerHooksInSettings(installedHooks, deletedHooks); err != nil {
		logError("failed to register hooks in settings: %v", err)
		// Non-fatal: scripts are still installed
	}

	// Save managed hooks AFTER successful installation
	if err := saveManagedHooks(newManagedHooks); err != nil {
		logError("failed to save managed hooks: %v", err)
		// Non-fatal: hooks are already installed
	}

	logDebug("installed %d/%d hooks", installedCount, len(hooks))
	return installedHookIDs, nil
}

// registerHooksInSettings adds Zeude hooks to ~/.claude/settings.json and removes deleted hooks.
func registerHooksInSettings(installedHooks map[string][]string, deletedHooks []string) error {
	settings, err := readClaudeSettings()
	if err != nil {
		return fmt.Errorf("failed to read settings: %w", err)
	}

	// Get or create hooks section
	hooksSection, ok := settings["hooks"].(map[string]interface{})
	if !ok {
		hooksSection = make(map[string]interface{})
	}

	// Build set of deleted hook paths for quick lookup
	deletedSet := make(map[string]bool, len(deletedHooks))
	for _, path := range deletedHooks {
		deletedSet[path] = true
	}

	// Build set of all new hook paths
	newHookPaths := make(map[string]bool)
	for _, paths := range installedHooks {
		for _, path := range paths {
			newHookPaths[path] = true
		}
	}

	// Process all event types in settings to remove deleted hooks
	for event := range hooksSection {
		existing, ok := hooksSection[event].([]interface{})
		if !ok {
			continue
		}

		var eventHooks []interface{}
		for _, h := range existing {
			hookMap, ok := h.(map[string]interface{})
			if !ok {
				eventHooks = append(eventHooks, h)
				continue
			}
			// Check if this is a Zeude hook by looking at the command
			innerHooks, ok := hookMap["hooks"].([]interface{})
			if !ok || len(innerHooks) == 0 {
				eventHooks = append(eventHooks, h)
				continue
			}
			firstHook, ok := innerHooks[0].(map[string]interface{})
			if !ok {
				eventHooks = append(eventHooks, h)
				continue
			}
			cmd, _ := firstHook["command"].(string)
			// Skip if it's a Zeude hook (contains .claude/hooks/)
			if strings.Contains(cmd, ".claude/hooks/") {
				// Skip deleted hooks or hooks that will be re-added
				if deletedSet[cmd] || newHookPaths[cmd] {
					continue
				}
			}
			eventHooks = append(eventHooks, h)
		}
		hooksSection[event] = eventHooks
	}

	// For each event type, add new Zeude hooks
	for event, scriptPaths := range installedHooks {
		// Get existing hooks for this event (non-Zeude hooks already filtered above)
		var eventHooks []interface{}
		if existing, ok := hooksSection[event].([]interface{}); ok {
			eventHooks = existing
		}

		// Add Zeude hooks
		for _, scriptPath := range scriptPaths {
			zeudeHook := map[string]interface{}{
				"hooks": []interface{}{
					map[string]interface{}{
						"type":    "command",
						"command": scriptPath,
					},
				},
			}
			eventHooks = append(eventHooks, zeudeHook)
		}

		hooksSection[event] = eventHooks
	}

	settings["hooks"] = hooksSection

	if err := writeClaudeSettings(settings); err != nil {
		return fmt.Errorf("failed to write settings: %w", err)
	}

	logDebug("registered hooks in settings.json")
	return nil
}

// installSkills installs skills to ~/.claude/commands/ as markdown files.
// Returns error if installation fails.
func installSkills(skills []Skill) error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get home dir: %w", err)
	}

	commandsDir := filepath.Join(homeDir, ".claude", "commands")

	// Create commands directory if needed
	if err := os.MkdirAll(commandsDir, 0755); err != nil {
		return fmt.Errorf("failed to create commands dir: %w", err)
	}

	// Load previously managed skills
	managedSkillsFile := filepath.Join(homeDir, ".zeude", "managed_skills.json")
	oldManagedSkills := loadManagedSkills(managedSkillsFile)
	newManagedSkills := make([]string, 0, len(skills))

	installedCount := 0

	for _, skill := range skills {
		// Skip if no slug or content
		if skill.Slug == "" || skill.Content == "" {
			logDebug("skipping skill with empty slug or content: %s", skill.Name)
			continue
		}

		// Build skill file content with frontmatter
		var content strings.Builder
		content.WriteString("---\n")
		content.WriteString(fmt.Sprintf("name: %s\n", skill.Name))
		if skill.Description != "" {
			content.WriteString(fmt.Sprintf("description: %s\n", skill.Description))
		}
		content.WriteString("---\n\n")
		content.WriteString(skill.Content)

		// Write skill file (only if content changed)
		filename := sanitizeFilename(skill.Slug) + ".md"
		skillPath := filepath.Join(commandsDir, filename)

		written, err := writeFileIfChanged(skillPath, []byte(content.String()), 0644)
		if err != nil {
			logError("failed to write skill %s: %v", skillPath, err)
			continue
		}

		newManagedSkills = append(newManagedSkills, skillPath)
		if written {
			installedCount++
			logDebug("installed skill: %s -> %s", skill.Name, skillPath)
		} else {
			logDebug("skill unchanged: %s", skill.Name)
		}
	}

	// Remove skills that were previously managed but no longer exist
	deletedCount := 0
	for _, oldSkill := range oldManagedSkills {
		if !contains(newManagedSkills, oldSkill) {
			if err := os.Remove(oldSkill); err != nil {
				if !os.IsNotExist(err) {
					logError("failed to remove deleted skill %s: %v", oldSkill, err)
				}
			} else {
				logDebug("removed deleted skill: %s", oldSkill)
				deletedCount++
			}
		}
	}

	// Save new managed skills list
	if err := saveManagedSkills(managedSkillsFile, newManagedSkills); err != nil {
		logError("failed to save managed skills: %v", err)
	}

	if installedCount > 0 || deletedCount > 0 {
		logDebug("skills: %d installed, %d deleted", installedCount, deletedCount)
	}

	return nil
}

// loadManagedSkills loads the list of managed skill paths.
func loadManagedSkills(path string) []string {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	var skills []string
	if err := json.Unmarshal(data, &skills); err != nil {
		return nil
	}

	return skills
}

// saveManagedSkills saves the list of managed skill paths.
func saveManagedSkills(path string, skills []string) error {
	data, err := json.Marshal(skills)
	if err != nil {
		return err
	}

	return writeFileAtomic(path, data, 0644)
}

// syncSkillRules fetches skill-rules.json from dashboard API and saves to ~/.claude/skill-rules.json.
// This file is used by the Skill Hint hook for fast local keyword matching.
func syncSkillRules(agentKey string) error {
	ctx, cancel := context.WithTimeout(context.Background(), ConfigFetchTimeout)
	defer cancel()

	url := fmt.Sprintf("%s/api/skill-rules", getDashboardURL())

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", "zeude-cli/1.0")
	req.Header.Set("Authorization", "Bearer "+agentKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("skill-rules fetch failed: %d", resp.StatusCode)
	}

	// Limit response size
	limitedReader := io.LimitReader(resp.Body, MaxResponseSize)
	data, err := io.ReadAll(limitedReader)
	if err != nil {
		return fmt.Errorf("failed to read response: %w", err)
	}

	// Validate JSON
	var rules map[string]interface{}
	if err := json.Unmarshal(data, &rules); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}

	// Write to ~/.claude/skill-rules.json
	home, err := getHomeDir()
	if err != nil {
		return err
	}

	claudeDir := filepath.Join(home, ".claude")
	if err := os.MkdirAll(claudeDir, 0755); err != nil {
		return fmt.Errorf("failed to create .claude dir: %w", err)
	}

	rulesPath := filepath.Join(claudeDir, "skill-rules.json")
	written, err := writeFileIfChanged(rulesPath, data, 0644)
	if err != nil {
		return fmt.Errorf("failed to write skill-rules: %w", err)
	}

	if written {
		logDebug("synced skill-rules.json (%d rules)", len(rules))
	} else {
		logDebug("skill-rules.json unchanged")
	}

	return nil
}

// SyncResult contains user information from the sync process.
// Used to inject user attributes into OTEL telemetry and display status.
type SyncResult struct {
	UserID      string // Supabase UUID - used to match ClickHouse data with Supabase
	UserEmail   string
	Team        string
	Success     bool
	ServerCount int
	SkillCount  int
	HookCount   int
	FromCache   bool
	NoAgentKey  bool // True when agent key is not configured
}

// Sync fetches and merges MCP configuration.
// Returns SyncResult with user info for OTEL injection.
// Uses Merkle-tree style hash comparison for efficient sync.
// [FIX #1] Always call merge even with empty server list.
// [FIX #8] Use errors.As for error type checking.
// [FIX #14] Use WaitGroup to ensure goroutine completes before exit.
func Sync() SyncResult {
	agentKey := getAgentKey()
	if agentKey == "" {
		logDebug("no agent key configured, skipping sync")
		return SyncResult{NoAgentKey: true}
	}

	// Load cached config first for ETag comparison
	// Even expired cache can be used as fallback for offline mode
	cachedConfig, cacheExpired := loadCachedConfig()

	fromCache := false
	var config *ConfigResponse

	// Get cached version for If-None-Match header (ETag)
	cachedVersion := ""
	if cachedConfig != nil {
		cachedVersion = cachedConfig.Version
	}

	serverConfig, err := fetchConfig(agentKey, cachedVersion)
	if err != nil {
		// Handle 304 Not Modified - config unchanged, use cached config
		// Still run merge/install to repair local drift (e.g., user deleted ~/.claude.json)
		// writeFileIfChanged uses bytes.Equal, so no actual I/O if files are intact
		if errors.Is(err, ErrNotModified) {
			logDebug("config unchanged (304), using cached config for local sync")
			if cachedConfig != nil {
				config = &cachedConfig.Config
				fromCache = true
				// Fall through to merge/install to ensure local files are correct
			} else {
				// 304 but no cache - shouldn't happen, but handle gracefully
				logDebug("304 received but no cache available")
				return SyncResult{}
			}
		} else if authErr := (*AuthError)(nil); errors.As(err, &authErr) {
			// [FIX #8] Use errors.As() for wrapped errors
			logError("access revoked (HTTP %d), clearing cache", authErr.StatusCode)
			clearCache()
			return SyncResult{}
		} else {
			// Network error - try cached config (even if expired for offline mode)
			logDebug("fetch failed, trying cache: %v", err)
			if cachedConfig == nil {
				logDebug("no cache available, skipping sync")
				return SyncResult{}
			}
			config = &cachedConfig.Config
			if cacheExpired {
				logDebug("using expired cached config (offline mode)")
			} else {
				logDebug("using cached config")
			}
			fromCache = true
		}
	} else {
		// Config changed - use new config from server
		config = serverConfig
		logDebug("config updated (old: %s, new: %s)",
			func() string {
				if cachedConfig != nil {
					return cachedConfig.Version
				}
				return "none"
			}(),
			serverConfig.ConfigVersion)

		if err := saveCachedConfig(config); err != nil {
			logError("failed to save cache: %v", err)
		}
	}

	// Build result with user info for OTEL injection and status display
	result := SyncResult{
		UserID:      config.UserID,
		UserEmail:   config.UserEmail,
		Team:        config.Team,
		Success:     true,
		ServerCount: len(config.MCPServers),
		SkillCount:  len(config.Skills),
		HookCount:   len(config.Hooks),
		FromCache:   fromCache,
	}

	// [FIX #1] ALWAYS call merge, even with empty server list
	// This ensures deleted servers are properly cleaned up
	if config.MCPServers == nil {
		config.MCPServers = map[string]MCPServer{}
	}

	if err := mergeClaudeConfig(config.MCPServers); err != nil {
		logError("merge failed: %v", err)
		return result // Still return user info even if merge fails
	}

	// Install hooks to ~/.claude/hooks/{event}/
	// Always call installHooks even with empty hook list to clean up deleted hooks
	if config.Hooks == nil {
		config.Hooks = []Hook{}
	}
	dashboardURL := getDashboardURL()
	installedHookIDs, err := installHooks(config.Hooks, agentKey, dashboardURL, config.UserEmail, config.Team)
	if err != nil {
		logError("hook install failed: %v", err)
		// Non-fatal: continue with sync
	}

	// Install skills to ~/.claude/commands/
	// Always call installSkills even with empty list to clean up deleted skills
	if config.Skills == nil {
		config.Skills = []Skill{}
	}
	if err := installSkills(config.Skills); err != nil {
		logError("skill install failed: %v", err)
		// Non-fatal: continue with sync
	}

	// Sync skill-rules.json for Skill Hint hook
	if err := syncSkillRules(agentKey); err != nil {
		logDebug("skill-rules sync failed: %v", err)
		// Non-fatal: hook will work without rules (just no hints)
	}

	logDebug("sync complete: %d servers, %d hooks, %d skills", len(config.MCPServers), len(config.Hooks), len(config.Skills))

	// Report hook install status
	if len(installedHookIDs) > 0 {
		hookStatus := make([]HookInstallStatus, 0, len(installedHookIDs))
		for _, hookID := range installedHookIDs {
			hookStatus = append(hookStatus, HookInstallStatus{
				HookID:    hookID,
				Installed: true,
			})
		}
		if err := ReportHookInstallStatus(agentKey, hookStatus); err != nil {
			logDebug("failed to report hook install status: %v", err)
		}
	}

	// Check and report installation status
	// [FIX #14] Use WaitGroup to ensure this completes before process exits
	if len(config.MCPServers) > 0 {
		var wg sync.WaitGroup
		wg.Add(1)

		go func() {
			defer wg.Done()
			installStatus := CheckInstallStatus(config.MCPServers)
			if err := ReportInstallStatus(agentKey, installStatus); err != nil {
				logDebug("failed to report install status: %v", err)
			}
		}()

		// Wait for status reporting to complete (with timeout)
		done := make(chan struct{})
		go func() {
			wg.Wait()
			close(done)
		}()

		select {
		case <-done:
			logDebug("install status reporting completed")
		case <-time.After(2 * time.Second):
			logDebug("install status reporting timed out - proceeding")
		}
	}

	return result
}
