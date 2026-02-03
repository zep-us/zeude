# Phase 0 Validation Results: Claude Code Native OTel Support

**Date:** 2025-12-19
**Claude Code Version:** 2.0.73
**Status:** ✅ VALIDATED

---

## Summary

**CONFIRMED:** Claude Code has native OpenTelemetry support.
**TEST RESULT:** Successfully captured telemetry data via OTel Collector.

---

## Captured Data Analysis

### Logs (3 records captured)

| Event | Key Attributes |
|-------|----------------|
| `claude_code.user_prompt` | prompt_length, prompt (REDACTED), session.id |
| `claude_code.api_request` | model, input_tokens, output_tokens, cost_usd, duration_ms |

### Metrics (2 metrics, 10 data points)

| Metric | Unit | Description |
|--------|------|-------------|
| `claude_code.cost.usage` | USD | Cost per model, per session |
| `claude_code.token.usage` | tokens | By type: input, output, cacheRead, cacheCreation |

### Common Attributes (All Events)

| Attribute | Example Value | Notes |
|-----------|---------------|-------|
| `user.id` | `4a1b3467...` | Hashed identifier |
| `user.email` | `jqyu.lee@gmail.com` | Plain email |
| `user.account_uuid` | `b6bc5cf7-...` | Anthropic account UUID |
| `organization.id` | `240bac80-...` | Org identifier |
| `session.id` | `2d68e5fd-...` | Session UUID |
| `terminal.type` | `WarpTerminal` | Terminal detection |
| `model` | `claude-opus-4-5-20251101` | Model used |

### Resource Attributes

```
service.name: claude-code
service.version: 2.0.73
host.arch: arm64
os.type: darwin
os.version: 25.1.0
```

### Data Richness Assessment

| Need | Native OTel Coverage | Status |
|------|---------------------|--------|
| Token usage tracking | ✅ input/output/cache | Perfect |
| Cost tracking (USD) | ✅ Per request | Perfect |
| User identification | ✅ email, user.id, org.id | Perfect |
| Session tracking | ✅ session.id | Perfect |
| Model usage | ✅ Per request | Perfect |
| API latency | ✅ duration_ms | Perfect |
| Terminal detection | ✅ terminal.type | Bonus! |
| Prompt content | ✅ REDACTED by default | Privacy-safe |

**Conclusion:** Native telemetry provides **100% of required data** and more!

---

## Discovered Environment Variables

### Core Telemetry Control
| Variable | Purpose |
|----------|---------|
| `CLAUDE_CODE_ENABLE_TELEMETRY` | Enable/disable telemetry (set to `1` to enable) |

### OTel Configuration
| Variable | Purpose |
|----------|---------|
| `CLAUDE_CODE_OTEL_FLUSH_TIMEOUT_MS` | Timeout for flushing telemetry data |
| `CLAUDE_CODE_OTEL_SHUTDOWN_TIMEOUT_MS` | Timeout for graceful shutdown |
| `CLAUDE_CODE_OTEL_HEADERS_HELPER_DEBOUNCE_MS` | Debounce for header helpers |

### Standard OTel Environment Variables (also supported)
| Variable | Example Value |
|----------|---------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `grpc` or `http` |
| `OTEL_METRICS_EXPORTER` | `otlp` |
| `OTEL_LOGS_EXPORTER` | `otlp` |
| `OTEL_TRACES_EXPORTER` | `otlp` |
| `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE` | `delta` (already set by Claude) |

---

## Internal OTel Infrastructure

Found in Claude Code source (minified):

```javascript
// OTel providers
meterProvider    // Metrics provider
tracerProvider   // Tracing provider
loggerProvider   // Logging provider

// Meters/Counters
meter            // General meter
sessionCounter   // Session tracking
locCounter       // Lines of code counter
prCounter        // Pull request counter
commitCounter    // Commit counter
costCounter      // Cost tracking
tokenCounter     // Token usage counter
activeTimeCounter // Active time tracking
```

This suggests Claude Code can emit:
- **Metrics:** Token usage, costs, session counts, LOC changes
- **Traces:** API calls, tool executions
- **Logs:** Session events, errors

---

## Validation Test Setup

### Start OTel Collector
```bash
cd neural-sync/phase0-validation
docker-compose up -d
```

### Run Test Session
```bash
# In a NEW terminal (not in an active Claude session)
CLAUDE_CODE_ENABLE_TELEMETRY=1 \
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 \
OTEL_EXPORTER_OTLP_PROTOCOL=grpc \
OTEL_METRICS_EXPORTER=otlp \
OTEL_LOGS_EXPORTER=otlp \
OTEL_TRACES_EXPORTER=otlp \
claude -p "What is 2+2?"
```

### Check Results
```bash
# View collector logs
docker-compose logs -f otel-collector

# Check output file
cat output/otel-data.json | jq .
```

---

## Next Steps

1. **Run manual test** - Execute the test commands above in a new terminal
2. **Analyze captured data** - Document what metrics/traces/logs are emitted
3. **Identify gaps** - Determine if native telemetry covers our use cases
4. **Fallback planning** - If native telemetry insufficient, design PTY wrapper capture

---

## Architecture Implications

If native OTel works well, we can simplify Neural Sync Phase 1:

### Original Architecture (PTY Wrapper)
```
User → Go PTY Wrapper → Claude → stdout
           ↓
    Telemetry (I/O capture)
           ↓
     OTel Collector → ClickHouse
```

### Simplified Architecture (Native OTel)
```
User → Claude (with CLAUDE_CODE_ENABLE_TELEMETRY=1)
           ↓
    Native OTel Metrics/Traces
           ↓
     OTel Collector → ClickHouse
```

**Benefits:**
- No PTY complexity (no SIGWINCH, signal forwarding, etc.)
- No TUI fidelity concerns
- Less code = fewer bugs
- Wrapper only needed for:
  - Environment variable injection
  - Config fetch from admin server
  - Agent key validation

---

## Task 0.2: Fallback Strategy

Since native OTel works, our fallback strategy is simplified:

### Primary Path (Native OTel)
```
User → Minimal Shim (env injection) → Claude (CLAUDE_CODE_ENABLE_TELEMETRY=1)
                                           ↓
                                    Native OTel → Collector → ClickHouse
```

### Fallback Scenarios

| Scenario | Detection | Fallback Action |
|----------|-----------|-----------------|
| OTel Collector unavailable | Connection timeout | Continue without telemetry (fail-open) |
| Native OTel disabled by user | `CLAUDE_CODE_ENABLE_TELEMETRY=0` | Log warning, continue without telemetry |
| ClickHouse down | Collector queue fills | Collector buffers, then drops oldest |

### Fail-Open Principle

**Critical:** User experience NEVER degrades due to telemetry failures.

```go
// Minimal Shim pseudo-code
func main() {
    // 1. Set telemetry env vars
    os.Setenv("CLAUDE_CODE_ENABLE_TELEMETRY", "1")
    os.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", serverURL)
    os.Setenv("OTEL_METRICS_EXPORTER", "otlp")
    os.Setenv("OTEL_LOGS_EXPORTER", "otlp")
    os.Setenv("OTEL_TRACES_EXPORTER", "otlp")

    // 2. Find real claude binary
    realClaude := findRealBinary()

    // 3. Exec (replace process) - no PTY needed!
    syscall.Exec(realClaude, os.Args, os.Environ())
}
```

### What We DON'T Need (Thanks to Native OTel)

| Originally Planned | Status |
|--------------------|--------|
| PTY wrapper with creack/pty | ❌ Not needed |
| SIGWINCH handling | ❌ Not needed |
| Raw mode terminal management | ❌ Not needed |
| I/O tee for telemetry capture | ❌ Not needed |
| TUI fidelity testing | ❌ Not needed |

### What We STILL Need

| Component | Purpose |
|-----------|---------|
| Minimal shim binary | Inject env vars, resolve real claude |
| Install script | PATH prepend, store real binary path |
| OTel Collector + ClickHouse | Data pipeline |
| Uninstall script | Clean removal |

---

## Revised Phase 1 Scope

Based on validation results, Phase 1 is significantly simplified:

### Original Tasks (6 tasks, 23+ subtasks)
- ~~Task 1: Go PTY Wrapper Core~~ → **Replaced with minimal shim**
- Task 2: Binary Resolution → **Keep (simplified)**
- ~~Task 3: Async Telemetry Client~~ → **Not needed (native OTel)**
- ~~Task 4: Fail-Open Entry Point~~ → **Simplified to syscall.Exec**
- Task 5: Infrastructure → **Keep**
- Task 6: Installation Script → **Keep**

### Revised Tasks (4 tasks, ~12 subtasks)

| Task | Description | Subtasks |
|------|-------------|----------|
| 1 | Minimal Shim (env injection + exec) | 3 |
| 2 | Binary Resolution | 3 |
| 3 | Infrastructure (Docker Compose) | 3 |
| 4 | Installation Script | 3 |

**Estimated reduction:** ~50% less code, ~60% fewer subtasks

---

## Conclusion

Native OTel validation succeeded. Recommend proceeding with simplified architecture:
- **No PTY wrapper needed**
- **Use syscall.Exec instead of PTY spawn**
- **Claude handles all telemetry internally**
- **Shim only injects environment variables**
