// Package identity provides Supabase UUID lookup and resolution for Zeude shims.
//
// Both the Claude Code shim and Codex shim use this package to resolve the
// developer's canonical Supabase UUID from their agent_key. This ensures that
// a single developer using multiple tools (Claude Code + Codex) is always
// identified by the same UUID across all OTEL telemetry, ClickHouse MVs,
// and dashboard leaderboards.
//
// Resolution flow:
//  1. Read agent_key from ~/.zeude/credentials
//  2. Check local cache (~/.zeude/identity-cache.json) for valid identity
//  3. If cache miss/expired, call dashboard API to resolve agent_key → UUID
//  4. Cache the resolved identity locally
//  5. Return UserIdentity for OTEL resource attribute injection
//
// The package follows the fail-open principle: if resolution fails at any step,
// it returns a partial or empty identity rather than blocking the shim.
package identity

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/zeude/zeude/internal/config"
)

const (
	// IdentityCacheFile is the local cache file for resolved identity.
	IdentityCacheFile = "identity-cache.json"
	// IdentityCacheTTL defines how long cached identity remains valid.
	// Identity changes rarely, so a longer TTL is appropriate.
	IdentityCacheTTL = 1 * time.Hour
	// IdentityFetchTimeout is the maximum time to wait for identity resolution.
	IdentityFetchTimeout = 5 * time.Second
	// MaxResponseSize limits API response to prevent runaway reads.
	// The /api/config/_ endpoint returns identity + MCP servers + skills (~2MB),
	// so 4MB provides sufficient headroom. Internal tool, low DoS risk.
	MaxResponseSize = 4 * 1024 * 1024
)

// debugLog controls whether debug logging is enabled.
var debugLog = os.Getenv("ZEUDE_DEBUG") == "1"

// UserIdentity represents a resolved Zeude user identity.
// The UserID (Supabase UUID) is the canonical identifier used across all
// tools and dashboards. Email and Team are supplementary attributes.
type UserIdentity struct {
	// UserID is the Supabase UUID - the canonical cross-tool identifier.
	// This is injected as zeude.user.id in OTEL resource attributes.
	UserID string `json:"userId"`
	// UserEmail is the user's email address from Supabase.
	// Injected as zeude.user.email for display purposes.
	UserEmail string `json:"userEmail"`
	// Team is the user's team name (if any).
	// Injected as zeude.team for team-level aggregation.
	Team string `json:"team"`
	// NoAgentKey indicates no agent_key was found in credentials.
	NoAgentKey bool `json:"-"`
}

// IsEmpty returns true if no identity was resolved.
func (u *UserIdentity) IsEmpty() bool {
	return u.UserID == "" && u.UserEmail == ""
}

// cachedIdentity wraps UserIdentity with cache metadata.
type cachedIdentity struct {
	Identity  UserIdentity `json:"identity"`
	CachedAt  time.Time    `json:"cachedAt"`
	ExpiresAt time.Time    `json:"expiresAt"`
	AgentKey  string       `json:"agentKeyHash"` // First 8 chars for cache invalidation
}

// identityAPIResponse is the expected JSON response from the dashboard identity endpoint.
type identityAPIResponse struct {
	UserID    string `json:"userId"`
	UserEmail string `json:"userEmail"`
	Team      string `json:"team,omitempty"`
}

// Resolve looks up the developer's canonical Supabase UUID.
// It uses the agent_key from ~/.zeude/credentials to resolve the identity,
// first checking a local cache, then falling back to the dashboard API.
//
// This function is designed to be called from both the Claude Code and Codex shims.
// Both shims share the same ~/.zeude/credentials file, so they will always
// resolve to the same canonical UUID for the same developer.
//
// Follows fail-open principle: returns partial/empty identity on errors,
// never blocks or crashes the shim.
func Resolve() UserIdentity {
	agentKey := readAgentKey()
	if agentKey == "" {
		logDebug("no agent key configured, skipping identity resolution")
		return UserIdentity{NoAgentKey: true}
	}

	// Try local cache first
	if cached := loadCachedIdentity(agentKey); cached != nil {
		logDebug("using cached identity for user %s", cached.UserID)
		return *cached
	}

	// Cache miss or expired - fetch from dashboard API
	identity, err := fetchIdentity(agentKey)
	if err != nil {
		logDebug("identity fetch failed: %v", err)
		// Try expired cache as fallback (offline mode)
		if expired := loadExpiredCachedIdentity(agentKey); expired != nil {
			logDebug("using expired cache as fallback for user %s", expired.UserID)
			return *expired
		}
		return UserIdentity{}
	}

	// Cache the resolved identity
	cacheIdentity(agentKey, identity)
	logDebug("resolved identity: user=%s email=%s", identity.UserID, identity.UserEmail)

	return *identity
}

// readAgentKey reads the agent key from ZEUDE_AGENT_KEY env var or ~/.zeude/credentials.
// Environment variable takes priority (enables switch-local.sh without file replacement).
// Handles both "agent_key=VALUE" and bare value formats.
// Handles CRLF line endings for cross-platform compatibility.
func readAgentKey() string {
	// Environment variable takes priority (for local dev switching)
	if envKey := os.Getenv("ZEUDE_AGENT_KEY"); envKey != "" {
		logDebug("using agent_key from ZEUDE_AGENT_KEY env var")
		return envKey
	}

	home, err := os.UserHomeDir()
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

	content := strings.TrimSpace(string(data))
	// Handle CRLF line endings
	content = strings.ReplaceAll(content, "\r\n", "\n")

	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		// Look for agent_key prefix (handles both "agent_key=val" and "agent_key = val")
		if strings.HasPrefix(line, "agent_key") {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 && strings.TrimSpace(parts[0]) == "agent_key" {
				return strings.TrimSpace(parts[1])
			}
		}
	}

	logDebug("no agent_key found in credentials file")
	return ""
}

// fetchIdentity calls the dashboard API to resolve agent_key → UserIdentity.
// Uses the same config endpoint as mcpconfig.Sync() but only extracts identity fields.
// This avoids needing a separate identity-only API endpoint.
func fetchIdentity(agentKey string) (*UserIdentity, error) {
	ctx, cancel := context.WithTimeout(context.Background(), IdentityFetchTimeout)
	defer cancel()

	dashboardURL := getDashboardURL()
	url := fmt.Sprintf("%s/api/config/_", dashboardURL)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", "zeude-cli/1.0")
	req.Header.Set("Authorization", "Bearer "+agentKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("authentication failed (HTTP %d): agent key may be invalid or revoked", resp.StatusCode)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected HTTP status: %d", resp.StatusCode)
	}

	// Limit response size
	limitedReader := io.LimitReader(resp.Body, MaxResponseSize)
	body, err := io.ReadAll(limitedReader)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Parse the config response - we only need identity fields
	var apiResp identityAPIResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if apiResp.UserID == "" {
		return nil, fmt.Errorf("API response missing userId")
	}

	return &UserIdentity{
		UserID:    apiResp.UserID,
		UserEmail: apiResp.UserEmail,
		Team:      apiResp.Team,
	}, nil
}

// agentKeyPrefix returns first 8 chars of agent key for cache invalidation.
// If a user changes their agent_key, the cache is automatically invalidated.
func agentKeyPrefix(agentKey string) string {
	if len(agentKey) >= 8 {
		return agentKey[:8]
	}
	return agentKey
}

// loadCachedIdentity loads a valid (non-expired) cached identity.
// Returns nil if cache doesn't exist, is expired, or is for a different agent key.
func loadCachedIdentity(agentKey string) *UserIdentity {
	cached := loadCacheFile()
	if cached == nil {
		return nil
	}

	// Check agent key matches (cache invalidation on key change)
	if cached.AgentKey != agentKeyPrefix(agentKey) {
		logDebug("cached identity is for a different agent key, ignoring")
		return nil
	}

	// Check expiry
	if time.Now().After(cached.ExpiresAt) {
		logDebug("cached identity expired at %s", cached.ExpiresAt)
		return nil
	}

	return &cached.Identity
}

// loadExpiredCachedIdentity loads a cached identity even if expired.
// Used as fallback when the API is unreachable (offline mode).
func loadExpiredCachedIdentity(agentKey string) *UserIdentity {
	cached := loadCacheFile()
	if cached == nil {
		return nil
	}

	// Still check agent key matches
	if cached.AgentKey != agentKeyPrefix(agentKey) {
		return nil
	}

	return &cached.Identity
}

// loadCacheFile reads and parses the identity cache file.
func loadCacheFile() *cachedIdentity {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}

	cachePath := filepath.Join(home, ".zeude", IdentityCacheFile)
	data, err := os.ReadFile(cachePath)
	if err != nil {
		return nil
	}

	var cached cachedIdentity
	if err := json.Unmarshal(data, &cached); err != nil {
		logDebug("failed to parse identity cache: %v", err)
		return nil
	}

	return &cached
}

// cacheIdentity saves the resolved identity to the local cache.
func cacheIdentity(agentKey string, identity *UserIdentity) {
	home, err := os.UserHomeDir()
	if err != nil {
		logDebug("failed to get home dir for caching: %v", err)
		return
	}

	now := time.Now()
	cached := cachedIdentity{
		Identity:  *identity,
		CachedAt:  now,
		ExpiresAt: now.Add(IdentityCacheTTL),
		AgentKey:  agentKeyPrefix(agentKey),
	}

	data, err := json.MarshalIndent(cached, "", "  ")
	if err != nil {
		logDebug("failed to marshal identity cache: %v", err)
		return
	}

	cachePath := filepath.Join(home, ".zeude", IdentityCacheFile)

	// Write atomically via temp file to avoid partial writes
	tmpPath := cachePath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0600); err != nil {
		logDebug("failed to write identity cache: %v", err)
		return
	}
	if err := os.Rename(tmpPath, cachePath); err != nil {
		logDebug("failed to rename identity cache: %v", err)
		os.Remove(tmpPath) // Cleanup temp file on failure
		return
	}

	logDebug("cached identity for user %s (expires %s)", identity.UserID, cached.ExpiresAt)
}

// getDashboardURL returns the dashboard URL from env or default.
func getDashboardURL() string {
	if url := os.Getenv("ZEUDE_DASHBOARD_URL"); url != "" {
		return strings.TrimSuffix(url, "/")
	}
	return config.DefaultDashboardURL
}

// logDebug logs a debug message if ZEUDE_DEBUG=1.
func logDebug(format string, args ...interface{}) {
	if debugLog {
		fmt.Fprintf(os.Stderr, "[zeude:identity] "+format+"\n", args...)
	}
}
