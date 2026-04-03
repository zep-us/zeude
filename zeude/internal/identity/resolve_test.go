package identity

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestUserIdentityIsEmpty(t *testing.T) {
	tests := []struct {
		name     string
		identity UserIdentity
		want     bool
	}{
		{"empty identity", UserIdentity{}, true},
		{"only NoAgentKey", UserIdentity{NoAgentKey: true}, true},
		{"has UserID", UserIdentity{UserID: "abc-123"}, false},
		{"has UserEmail", UserIdentity{UserEmail: "test@example.com"}, false},
		{"has both", UserIdentity{UserID: "abc-123", UserEmail: "test@example.com"}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.identity.IsEmpty(); got != tt.want {
				t.Errorf("IsEmpty() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestAgentKeyPrefix(t *testing.T) {
	tests := []struct {
		key  string
		want string
	}{
		{"abcdefghijklmnop", "abcdefgh"},
		{"short", "short"},
		{"12345678", "12345678"},
		{"", ""},
	}
	for _, tt := range tests {
		if got := agentKeyPrefix(tt.key); got != tt.want {
			t.Errorf("agentKeyPrefix(%q) = %q, want %q", tt.key, got, tt.want)
		}
	}
}

func TestReadAgentKey(t *testing.T) {
	// Create a temp home dir
	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	zeudeDir := filepath.Join(tmpHome, ".zeude")
	os.MkdirAll(zeudeDir, 0755)

	tests := []struct {
		name    string
		content string
		want    string
	}{
		{"standard format", "agent_key=my-secret-key\n", "my-secret-key"},
		{"with whitespace", "  agent_key = my-secret-key  \n", "my-secret-key"},
		{"with CRLF", "agent_key=my-secret-key\r\n", "my-secret-key"},
		{"with comments", "# This is a comment\nagent_key=my-secret-key\n", "my-secret-key"},
		{"empty file", "", ""},
		{"no agent_key", "other_key=value\n", ""},
		{"multiple lines", "# config\nagent_key=the-key\nother=value\n", "the-key"},
	}

	credPath := filepath.Join(zeudeDir, "credentials")
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			os.WriteFile(credPath, []byte(tt.content), 0600)
			if got := readAgentKey(); got != tt.want {
				t.Errorf("readAgentKey() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestFetchIdentity(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		response   interface{}
		wantErr    bool
		wantID     string
	}{
		{
			name:       "successful resolution",
			statusCode: http.StatusOK,
			response: identityAPIResponse{
				UserID:    "550e8400-e29b-41d4-a716-446655440000",
				UserEmail: "dev@company.com",
				Team:      "engineering",
			},
			wantErr: false,
			wantID:  "550e8400-e29b-41d4-a716-446655440000",
		},
		{
			name:       "unauthorized",
			statusCode: http.StatusUnauthorized,
			response:   map[string]string{"error": "unauthorized"},
			wantErr:    true,
		},
		{
			name:       "forbidden",
			statusCode: http.StatusForbidden,
			response:   map[string]string{"error": "forbidden"},
			wantErr:    true,
		},
		{
			name:       "missing userId in response",
			statusCode: http.StatusOK,
			response:   map[string]string{"userEmail": "dev@company.com"},
			wantErr:    true,
		},
		{
			name:       "server error",
			statusCode: http.StatusInternalServerError,
			response:   map[string]string{"error": "internal"},
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				// Verify auth header
				auth := r.Header.Get("Authorization")
				if auth != "Bearer test-key" {
					t.Errorf("unexpected auth header: %s", auth)
				}

				w.WriteHeader(tt.statusCode)
				json.NewEncoder(w).Encode(tt.response)
			}))
			defer server.Close()

			// Override dashboard URL
			t.Setenv("ZEUDE_DASHBOARD_URL", server.URL)

			identity, err := fetchIdentity("test-key")
			if tt.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if identity.UserID != tt.wantID {
				t.Errorf("UserID = %q, want %q", identity.UserID, tt.wantID)
			}
		})
	}
}

func TestCacheRoundTrip(t *testing.T) {
	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	zeudeDir := filepath.Join(tmpHome, ".zeude")
	os.MkdirAll(zeudeDir, 0755)

	agentKey := "test-agent-key-12345"
	identity := &UserIdentity{
		UserID:    "550e8400-e29b-41d4-a716-446655440000",
		UserEmail: "dev@company.com",
		Team:      "engineering",
	}

	// Cache the identity
	cacheIdentity(agentKey, identity)

	// Verify cache file exists
	cachePath := filepath.Join(zeudeDir, IdentityCacheFile)
	if _, err := os.Stat(cachePath); os.IsNotExist(err) {
		t.Fatal("cache file not created")
	}

	// Load from cache
	loaded := loadCachedIdentity(agentKey)
	if loaded == nil {
		t.Fatal("loadCachedIdentity returned nil")
	}
	if loaded.UserID != identity.UserID {
		t.Errorf("UserID = %q, want %q", loaded.UserID, identity.UserID)
	}
	if loaded.UserEmail != identity.UserEmail {
		t.Errorf("UserEmail = %q, want %q", loaded.UserEmail, identity.UserEmail)
	}
	if loaded.Team != identity.Team {
		t.Errorf("Team = %q, want %q", loaded.Team, identity.Team)
	}
}

func TestCacheInvalidationOnKeyChange(t *testing.T) {
	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	zeudeDir := filepath.Join(tmpHome, ".zeude")
	os.MkdirAll(zeudeDir, 0755)

	identity := &UserIdentity{
		UserID:    "550e8400-e29b-41d4-a716-446655440000",
		UserEmail: "dev@company.com",
	}

	// Cache with key A
	cacheIdentity("AAAAAAAA-key-agent", identity)

	// Load with key B should fail (different prefix)
	loaded := loadCachedIdentity("BBBBBBBB-key-agent")
	if loaded != nil {
		t.Error("expected nil for different agent key, got identity")
	}

	// Load with key A should succeed
	loaded = loadCachedIdentity("AAAAAAAA-key-agent")
	if loaded == nil {
		t.Error("expected identity for matching agent key, got nil")
	}
}

func TestCacheExpiry(t *testing.T) {
	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	zeudeDir := filepath.Join(tmpHome, ".zeude")
	os.MkdirAll(zeudeDir, 0755)

	agentKey := "test-agent-key-12345"

	// Write an expired cache entry manually
	expired := cachedIdentity{
		Identity: UserIdentity{
			UserID:    "550e8400-e29b-41d4-a716-446655440000",
			UserEmail: "dev@company.com",
		},
		CachedAt:  time.Now().Add(-2 * time.Hour),
		ExpiresAt: time.Now().Add(-1 * time.Hour), // Expired 1 hour ago
		AgentKey:  agentKeyPrefix(agentKey),
	}
	data, _ := json.MarshalIndent(expired, "", "  ")
	cachePath := filepath.Join(zeudeDir, IdentityCacheFile)
	os.WriteFile(cachePath, data, 0600)

	// loadCachedIdentity should return nil (expired)
	loaded := loadCachedIdentity(agentKey)
	if loaded != nil {
		t.Error("expected nil for expired cache, got identity")
	}

	// loadExpiredCachedIdentity should still return the identity (offline fallback)
	loadedExpired := loadExpiredCachedIdentity(agentKey)
	if loadedExpired == nil {
		t.Fatal("expected identity from expired cache fallback, got nil")
	}
	if loadedExpired.UserID != expired.Identity.UserID {
		t.Errorf("UserID = %q, want %q", loadedExpired.UserID, expired.Identity.UserID)
	}
}

func TestCacheFilePermissions(t *testing.T) {
	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	zeudeDir := filepath.Join(tmpHome, ".zeude")
	os.MkdirAll(zeudeDir, 0755)

	identity := &UserIdentity{
		UserID:    "550e8400-e29b-41d4-a716-446655440000",
		UserEmail: "dev@company.com",
	}

	cacheIdentity("test-key-12345678", identity)

	cachePath := filepath.Join(zeudeDir, IdentityCacheFile)
	info, err := os.Stat(cachePath)
	if err != nil {
		t.Fatalf("failed to stat cache file: %v", err)
	}

	// Cache file should be 0600 (owner-only read/write) since it contains
	// a partial agent key hash
	perm := info.Mode().Perm()
	if perm != 0600 {
		t.Errorf("cache file permissions = %o, want 0600", perm)
	}
}

func TestGetDashboardURL(t *testing.T) {
	// With env override
	t.Setenv("ZEUDE_DASHBOARD_URL", "https://custom.example.com/")
	if got := getDashboardURL(); got != "https://custom.example.com" {
		t.Errorf("getDashboardURL() = %q, want %q", got, "https://custom.example.com")
	}

	// Without env (uses default)
	t.Setenv("ZEUDE_DASHBOARD_URL", "")
	got := getDashboardURL()
	if got == "" {
		t.Error("getDashboardURL() returned empty string")
	}
}
