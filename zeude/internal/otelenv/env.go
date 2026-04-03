// Package otelenv provides shared OTEL environment variable utilities
// used by the claude and codex shims to inject telemetry configuration.
package otelenv

import (
	"os"
	"strings"
)

// InjectResourceAttribute adds a key-value pair to OTEL_RESOURCE_ATTRIBUTES.
// Appends to existing attributes if present, otherwise creates new.
func InjectResourceAttribute(key, value string) {
	// Escape special characters in value (commas and equals signs)
	escapedValue := strings.ReplaceAll(value, "=", "%3D")
	escapedValue = strings.ReplaceAll(escapedValue, ",", "%2C")

	attr := key + "=" + escapedValue

	existing := os.Getenv("OTEL_RESOURCE_ATTRIBUTES")
	if existing == "" {
		os.Setenv("OTEL_RESOURCE_ATTRIBUTES", attr)
	} else {
		os.Setenv("OTEL_RESOURCE_ATTRIBUTES", existing+","+attr)
	}
}

// SetEnvIfEmpty sets an environment variable only if it's not already set.
// This allows users to override Zeude defaults.
func SetEnvIfEmpty(key, value string) {
	if os.Getenv(key) == "" {
		os.Setenv(key, value)
	}
}
