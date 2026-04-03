package oteltest

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// findInitSQL locates the ClickHouse init.sql file.
func findInitSQL(t *testing.T) string {
	t.Helper()
	root := findRepoRoot(t)
	path := filepath.Join(root, "dashboard", "clickhouse", "init.sql")
	if _, err := os.Stat(path); err != nil {
		t.Skipf("init.sql not found at %s", path)
	}
	return path
}

// TestClickHouseSchema_ServiceNameColumn verifies that claude_code_logs has a
// ServiceName column which is used to differentiate Codex vs Claude data.
func TestClickHouseSchema_ServiceNameColumn(t *testing.T) {
	path := findInitSQL(t)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	content := string(data)

	if !strings.Contains(content, "ServiceName") {
		t.Error("claude_code_logs must have ServiceName column for source identification")
	}
}

// TestClickHouseSchema_OrderByServiceName verifies that the claude_code_logs table
// ORDER BY clause includes ServiceName for efficient filtering by source.
func TestClickHouseSchema_OrderByServiceName(t *testing.T) {
	path := findInitSQL(t)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	content := string(data)

	// The ORDER BY for claude_code_logs should include ServiceName
	if !strings.Contains(content, "ORDER BY (ServiceName") {
		t.Error("claude_code_logs should ORDER BY ServiceName for efficient source-based queries")
	}
}

// TestClickHouseSchema_PricingModelOpenAI verifies that OpenAI models are present
// in the pricing_model table for cost_usd calculation via MV JOIN.
func TestClickHouseSchema_PricingModelOpenAI(t *testing.T) {
	path := findInitSQL(t)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	content := string(data)

	// Must have OpenAI models for Codex cost calculation
	requiredModels := []string{"o3", "gpt-4.1", "gpt-4.1-mini"}
	for _, model := range requiredModels {
		if !strings.Contains(content, "'"+model+"'") {
			t.Errorf("pricing_model missing OpenAI model %q - required for Codex cost calculation", model)
		}
	}

	// Must also still have Claude models (no regression)
	claudeModels := []string{"claude-3-5-sonnet-20241022", "claude-sonnet-4-20250514"}
	for _, model := range claudeModels {
		if !strings.Contains(content, "'"+model+"'") {
			t.Errorf("pricing_model missing Claude model %q - regression check", model)
		}
	}
}

// TestClickHouseSchema_PricingModelHasCacheColumns verifies that pricing_model
// includes all 4 price columns needed for accurate cost calculation.
func TestClickHouseSchema_PricingModelHasCacheColumns(t *testing.T) {
	path := findInitSQL(t)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	content := string(data)

	requiredColumns := []string{
		"input_price_per_million",
		"output_price_per_million",
		"cache_read_price_per_million",
		"cache_creation_price_per_million",
	}
	for _, col := range requiredColumns {
		if !strings.Contains(content, col) {
			t.Errorf("pricing_model missing column %q", col)
		}
	}
}

// TestClickHouseSchema_TokenUsageHourlyMV verifies that the token_usage_hourly
// materialized view can aggregate both Claude and Codex data from claude_code_logs.
func TestClickHouseSchema_TokenUsageHourlyMV(t *testing.T) {
	path := findInitSQL(t)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	content := string(data)

	// token_usage_hourly MV must select FROM claude_code_logs (shared table)
	if !strings.Contains(content, "FROM claude_code_logs") {
		t.Error("token_usage_hourly should select FROM claude_code_logs (shared table for all sources)")
	}

	// MV should aggregate token columns
	for _, col := range []string{"input_tokens", "output_tokens", "cache_read_tokens"} {
		if !strings.Contains(content, col) {
			t.Errorf("token_usage_hourly missing aggregation for %q", col)
		}
	}
}

// TestClickHouseSchema_SourceColumn verifies that token_usage_hourly MV
// includes a source column derived from ServiceName for filtering/comparison.
func TestClickHouseSchema_SourceColumn(t *testing.T) {
	path := findInitSQL(t)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	content := string(data)

	// token_usage_hourly must have source in ORDER BY
	if !strings.Contains(content, "source, model_id, mcp_server, hour)") {
		t.Error("token_usage_hourly ORDER BY must include source column")
	}

	// Must extract source from ServiceName using multiIf
	if !strings.Contains(content, "multiIf(") {
		t.Error("token_usage_hourly should use multiIf() to extract source from ServiceName")
	}

	// Must map codex ServiceName to 'codex' and default to 'claude'
	if !strings.Contains(content, "'claude'") {
		t.Error("token_usage_hourly source mapping must include 'claude' as default")
	}
	if !strings.Contains(content, "'codex'") {
		t.Error("token_usage_hourly source mapping must include 'codex'")
	}
}

// TestClickHouseSchema_EfficiencyMetricsHasSource verifies that efficiency_metrics_daily
// includes the source column for per-tool efficiency comparison.
func TestClickHouseSchema_EfficiencyMetricsHasSource(t *testing.T) {
	path := findInitSQL(t)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	content := string(data)

	// Find the efficiency_metrics_daily definition
	idx := strings.Index(content, "efficiency_metrics_daily")
	if idx == -1 {
		t.Fatal("efficiency_metrics_daily view not found in init.sql")
	}
	viewContent := content[idx:]

	// Must GROUP BY source
	if !strings.Contains(viewContent, "source") {
		t.Error("efficiency_metrics_daily must include source column for per-tool comparison")
	}
}

// TestClickHouseSchema_FrustrationAnalysisNoSourceBranch verifies that
// frustration_analysis does NOT have source-based branching (per design constraint).
func TestClickHouseSchema_FrustrationAnalysisNoSourceBranch(t *testing.T) {
	path := findInitSQL(t)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	content := string(data)

	// Extract the frustration_analysis view definition
	idx := strings.Index(content, "frustration_analysis")
	if idx == -1 {
		t.Skip("frustration_analysis view not found")
	}

	// The frustration view should NOT branch on source/ServiceName
	// (design constraint: frustration patterns applied uniformly)
	viewContent := content[idx:]
	if endIdx := strings.Index(viewContent, "CREATE "); endIdx > 0 {
		viewContent = viewContent[:endIdx]
	}

	if strings.Contains(viewContent, "ServiceName = 'codex'") ||
		strings.Contains(viewContent, "ServiceName = 'claude'") ||
		strings.Contains(viewContent, "source = 'codex'") {
		t.Error("frustration_analysis should NOT have source-based branching (patterns applied uniformly)")
	}
}
