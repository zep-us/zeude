// Package config provides shared configuration utilities for Zeude.
package config

import (
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

const (
	// DefaultCollectorEndpoint is the default OTel collector gRPC endpoint.
	DefaultCollectorEndpoint = "https://your-otel-collector-url/"
	// DefaultDashboardURL is the default Zeude dashboard URL.
	DefaultDashboardURL = "https://your-dashboard-url"
	// DefaultHTTPPort is the default OTel collector HTTP port.
	DefaultHTTPPort = "4318"
	// DefaultGRPCPort is the default OTel collector gRPC port.
	DefaultGRPCPort = "4317"
)

// GetCollectorEndpoint returns the OTel collector endpoint.
// Priority: ZEUDE_ENDPOINT env > config file > defaultValue
func GetCollectorEndpoint(defaultValue string) string {
	// Check environment variable first
	if ep := os.Getenv("ZEUDE_ENDPOINT"); ep != "" {
		return ep
	}

	// Try to read from config file
	home, err := os.UserHomeDir()
	if err == nil {
		configPath := filepath.Join(home, ".zeude", "config")
		if data, err := os.ReadFile(configPath); err == nil {
			lines := strings.Split(string(data), "\n")
			for _, line := range lines {
				if strings.HasPrefix(line, "endpoint=") {
					value := strings.TrimPrefix(line, "endpoint=")
					return strings.TrimSpace(value) // Properly trim whitespace
				}
			}
		}
	}

	return defaultValue
}

// ParseEndpoint extracts host and port from an endpoint URL.
// Returns the host, port, and whether TLS should be used.
func ParseEndpoint(endpoint string) (host string, port string, useTLS bool, err error) {
	// Add scheme if missing for proper parsing
	if !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
		endpoint = "http://" + endpoint
	}

	u, err := url.Parse(endpoint)
	if err != nil {
		return "", "", false, err
	}

	host = u.Hostname()
	port = u.Port()
	useTLS = u.Scheme == "https"

	// Default port based on scheme
	if port == "" {
		if useTLS {
			port = "443"
		} else {
			port = DefaultGRPCPort
		}
	}

	return host, port, useTLS, nil
}

// GetHTTPEndpoint converts a gRPC endpoint to its HTTP equivalent.
// Properly handles URL parsing to avoid naive string replacement.
func GetHTTPEndpoint(grpcEndpoint string) string {
	host, port, _, err := ParseEndpoint(grpcEndpoint)
	if err != nil {
		// Fallback to default if parsing fails
		return "http://localhost:" + DefaultHTTPPort
	}

	// If it's the default gRPC port, use the default HTTP port
	if port == DefaultGRPCPort {
		port = DefaultHTTPPort
	}

	return "http://" + host + ":" + port
}
