// Package main provides the Zeude diagnostic tool.
// Run 'zeude doctor' to verify installation and connectivity.
package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/zeude/zeude/internal/config"
)

const (
	checkMark = "OK"
	crossMark = "FAIL"
	warnMark  = "WARN"
)

type checkResult struct {
	name    string
	status  string // "pass", "fail", "warn"
	message string
}

func main() {
	fmt.Println("Zeude Doctor")
	fmt.Println("============")
	fmt.Println()

	results := []checkResult{
		checkShimInstalled(),
		checkRealClaudePath(),
		checkPATHOrder(),
		checkCollectorEndpoint(),
		checkCollectorConnectivity(),
		checkClaudeVersion(),
	}

	// Print results
	passCount := 0
	failCount := 0
	warnCount := 0

	for _, r := range results {
		var mark string
		switch r.status {
		case "pass":
			mark = fmt.Sprintf("\033[32m[%s]\033[0m", checkMark)
			passCount++
		case "fail":
			mark = fmt.Sprintf("\033[31m[%s]\033[0m", crossMark)
			failCount++
		case "warn":
			mark = fmt.Sprintf("\033[33m[%s]\033[0m", warnMark)
			warnCount++
		}
		fmt.Printf("%s %s: %s\n", mark, r.name, r.message)
	}

	// Summary
	fmt.Println()
	fmt.Println("------------------")
	fmt.Printf("Results: %d passed, %d warnings, %d failed\n", passCount, warnCount, failCount)

	if failCount > 0 {
		fmt.Println()
		fmt.Println("Run 'zeude install' to fix issues.")
		os.Exit(1)
	}
}

func checkShimInstalled() checkResult {
	home, err := os.UserHomeDir()
	if err != nil {
		return checkResult{"Shim installed", "fail", "Cannot get home directory"}
	}

	shimPath := filepath.Join(home, ".zeude", "bin", "claude")
	if _, err := os.Stat(shimPath); os.IsNotExist(err) {
		return checkResult{"Shim installed", "fail", "Shim not found at ~/.zeude/bin/claude"}
	}

	return checkResult{"Shim installed", "pass", shimPath}
}

func checkRealClaudePath() checkResult {
	home, err := os.UserHomeDir()
	if err != nil {
		return checkResult{"Real claude path", "fail", "Cannot get home directory"}
	}

	pathFile := filepath.Join(home, ".zeude", "real_binary_path")
	data, err := os.ReadFile(pathFile)
	if err != nil {
		return checkResult{"Real claude path", "fail", "Path file not found at ~/.zeude/real_binary_path"}
	}

	path := strings.TrimSpace(string(data))
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return checkResult{"Real claude path", "fail", fmt.Sprintf("Binary not found: %s", path)}
	}

	return checkResult{"Real claude path", "pass", path}
}

func checkPATHOrder() checkResult {
	home, err := os.UserHomeDir()
	if err != nil {
		return checkResult{"PATH order", "fail", "Cannot get home directory"}
	}

	shimDir := filepath.Join(home, ".zeude", "bin")
	pathEnv := os.Getenv("PATH")
	paths := strings.Split(pathEnv, string(os.PathListSeparator))

	shimIndex := -1
	for i, p := range paths {
		absPath, _ := filepath.Abs(p)
		if absPath == shimDir {
			shimIndex = i
			break
		}
	}

	if shimIndex == -1 {
		return checkResult{"PATH order", "fail", "~/.zeude/bin not in PATH"}
	}

	if shimIndex == 0 {
		return checkResult{"PATH order", "pass", "Shim directory is first in PATH"}
	}

	return checkResult{"PATH order", "warn", fmt.Sprintf("Shim at position %d in PATH (should be first)", shimIndex+1)}
}

func checkCollectorEndpoint() checkResult {
	endpoint := config.GetCollectorEndpoint("")
	if endpoint == "" {
		return checkResult{"Collector endpoint", "warn", "Using default: " + config.DefaultCollectorEndpoint}
	}
	return checkResult{"Collector endpoint", "pass", endpoint}
}

func checkCollectorConnectivity() checkResult {
	endpoint := config.GetCollectorEndpoint(config.DefaultCollectorEndpoint)

	// Parse endpoint properly using shared config package
	host, port, _, err := config.ParseEndpoint(endpoint)
	if err != nil {
		return checkResult{"Collector connectivity", "fail", fmt.Sprintf("Invalid endpoint URL: %s", endpoint)}
	}

	grpcAddr := host + ":" + port

	// Try to connect with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Try gRPC port first
	conn, err := (&net.Dialer{}).DialContext(ctx, "tcp", grpcAddr)
	if err != nil {
		// Try HTTP health endpoint using proper URL conversion
		client := &http.Client{Timeout: 2 * time.Second}
		httpEndpoint := config.GetHTTPEndpoint(endpoint)
		resp, err := client.Get(httpEndpoint + "/health")
		if err != nil {
			return checkResult{"Collector connectivity", "warn", fmt.Sprintf("Cannot connect to %s (telemetry will be skipped)", grpcAddr)}
		}
		resp.Body.Close()
		return checkResult{"Collector connectivity", "pass", "HTTP endpoint responding"}
	}
	conn.Close()
	return checkResult{"Collector connectivity", "pass", "gRPC endpoint responding"}
}

func checkClaudeVersion() checkResult {
	home, err := os.UserHomeDir()
	if err != nil {
		return checkResult{"Claude version", "fail", "Cannot get home directory"}
	}

	pathFile := filepath.Join(home, ".zeude", "real_binary_path")
	data, err := os.ReadFile(pathFile)
	if err != nil {
		return checkResult{"Claude version", "warn", "Cannot determine (path file missing)"}
	}

	realClaude := strings.TrimSpace(string(data))
	cmd := exec.Command(realClaude, "--version")
	output, err := cmd.Output()
	if err != nil {
		return checkResult{"Claude version", "warn", "Cannot determine version"}
	}

	version := strings.TrimSpace(string(output))
	return checkResult{"Claude version", "pass", version}
}

