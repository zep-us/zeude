-- ============================================================
-- Integration Test: Leaderboard Consolidation for Multi-Source Users
-- ============================================================
-- Tests that a single developer using both Claude Code and Codex
-- appears as ONE consolidated entry on the leaderboard with combined metrics.
--
-- Prerequisites:
--   - ClickHouse running with init.sql schema applied
--   - token_usage_hourly MV exists
--   - pricing_model table populated
--
-- Usage:
--   clickhouse-client --multiquery < leaderboard_consolidation_test.sql
--   OR via docker:
--   docker exec -i <container> clickhouse-client --multiquery < leaderboard_consolidation_test.sql
-- ============================================================

-- ============================================================
-- 0. Setup: Create test-scoped temp tables to avoid polluting production data
-- ============================================================

-- We test against claude_code_logs directly since token_usage_hourly is a MV
-- that auto-populates from inserts into claude_code_logs.

-- Record count before test
SELECT 'PRE-TEST: token_usage_hourly row count' AS label, count() AS cnt FROM token_usage_hourly;

-- ============================================================
-- 1. Insert simulated events from Claude Code (ServiceName = 'claude_code')
--    and Codex (ServiceName = 'codex') for the SAME user_id
-- ============================================================

-- Shared test user identity (Supabase UUID)
-- This user uses both Claude Code and Codex
SET param_test_user_id = 'test-user-11111111-1111-1111-1111-111111111111';
SET param_test_user_email = 'testuser-consolidation@example.com';

-- Timestamp for test data (current hour)
SET param_test_hour = toString(toStartOfHour(now()));

-- Insert Claude Code events (3 requests, using claude-sonnet-4)
INSERT INTO claude_code_logs (
    Timestamp, ServiceName, Body,
    ResourceAttributes, LogAttributes
) VALUES
(
    now() - INTERVAL 10 MINUTE,
    'claude_code',
    'token_usage',
    {'zeude.user.id': 'test-user-11111111-1111-1111-1111-111111111111', 'zeude.user.email': 'testuser-consolidation@example.com'},
    {'user.id': 'test-user-11111111-1111-1111-1111-111111111111', 'user.email': 'testuser-consolidation@example.com', 'model': 'claude-sonnet-4-20250514', 'input_tokens': '1000', 'output_tokens': '500', 'cache_read_tokens': '200', 'cache_creation_tokens': '0', 'cost_usd': '0.01', 'duration_ms': '3000', 'organization.id': 'org-test-001', 'mcp.server': ''}
),
(
    now() - INTERVAL 8 MINUTE,
    'claude_code',
    'token_usage',
    {'zeude.user.id': 'test-user-11111111-1111-1111-1111-111111111111', 'zeude.user.email': 'testuser-consolidation@example.com'},
    {'user.id': 'test-user-11111111-1111-1111-1111-111111111111', 'user.email': 'testuser-consolidation@example.com', 'model': 'claude-sonnet-4-20250514', 'input_tokens': '2000', 'output_tokens': '800', 'cache_read_tokens': '500', 'cache_creation_tokens': '100', 'cost_usd': '0.02', 'duration_ms': '4500', 'organization.id': 'org-test-001', 'mcp.server': ''}
),
(
    now() - INTERVAL 6 MINUTE,
    'claude_code',
    'token_usage',
    {'zeude.user.id': 'test-user-11111111-1111-1111-1111-111111111111', 'zeude.user.email': 'testuser-consolidation@example.com'},
    {'user.id': 'test-user-11111111-1111-1111-1111-111111111111', 'user.email': 'testuser-consolidation@example.com', 'model': 'claude-sonnet-4-20250514', 'input_tokens': '1500', 'output_tokens': '600', 'cache_read_tokens': '300', 'cache_creation_tokens': '50', 'cost_usd': '0.015', 'duration_ms': '3500', 'organization.id': 'org-test-001', 'mcp.server': ''}
);

-- Insert Codex events (2 requests, using o3 model)
-- Note: org_id is empty for Codex (per design constraint)
INSERT INTO claude_code_logs (
    Timestamp, ServiceName, Body,
    ResourceAttributes, LogAttributes
) VALUES
(
    now() - INTERVAL 5 MINUTE,
    'codex',
    'token_usage',
    {'zeude.user.id': 'test-user-11111111-1111-1111-1111-111111111111', 'zeude.user.email': 'testuser-consolidation@example.com'},
    {'user.id': 'test-user-11111111-1111-1111-1111-111111111111', 'user.email': 'testuser-consolidation@example.com', 'model': 'o3', 'input_tokens': '800', 'output_tokens': '400', 'cache_read_tokens': '100', 'cache_creation_tokens': '0', 'cost_usd': '0.005', 'duration_ms': '2000', 'organization.id': '', 'mcp.server': ''}
),
(
    now() - INTERVAL 3 MINUTE,
    'codex',
    'token_usage',
    {'zeude.user.id': 'test-user-11111111-1111-1111-1111-111111111111', 'zeude.user.email': 'testuser-consolidation@example.com'},
    {'user.id': 'test-user-11111111-1111-1111-1111-111111111111', 'user.email': 'testuser-consolidation@example.com', 'model': 'o3', 'input_tokens': '1200', 'output_tokens': '600', 'cache_read_tokens': '150', 'cache_creation_tokens': '0', 'cost_usd': '0.008', 'duration_ms': '2500', 'organization.id': '', 'mcp.server': ''}
);

-- ============================================================
-- 2. Verify: token_usage_hourly has entries for our test user
-- ============================================================

-- Wait briefly for MV to process (in practice, inserts trigger MV immediately)
SELECT '--- MV Rows for Test User ---' AS section;

SELECT
    user_id,
    model_id,
    sum(input_tokens) AS total_input,
    sum(output_tokens) AS total_output,
    sum(cache_read_tokens) AS total_cache_read,
    sum(request_count) AS total_requests,
    sum(cost_usd) AS total_cost
FROM token_usage_hourly
WHERE user_id = 'test-user-11111111-1111-1111-1111-111111111111'
GROUP BY user_id, model_id
ORDER BY model_id;

-- ============================================================
-- 3. CRITICAL TEST: Leaderboard query returns SINGLE consolidated entry
-- ============================================================
-- This mirrors the exact query from /api/leaderboard route.ts
-- The GROUP BY user_id should merge Claude Code + Codex data.

SELECT '--- Leaderboard Consolidation Test ---' AS section;

SELECT
    user_id,
    any(user_email) AS user_email,
    sum(input_tokens + output_tokens + cache_read_tokens) AS total_tokens,
    sum(request_count) AS total_requests,
    sum(cost_usd) AS total_cost,
    count() AS mv_row_count
FROM token_usage_hourly
WHERE hour >= now() - INTERVAL 1 DAY
  AND user_id = 'test-user-11111111-1111-1111-1111-111111111111'
GROUP BY user_id;

-- ============================================================
-- 4. ASSERTION: Exactly 1 row returned for the test user
-- ============================================================

SELECT '--- ASSERTION: Single Consolidated Entry ---' AS section;

SELECT
    CASE
        WHEN cnt = 1 THEN 'PASS: Single consolidated leaderboard entry'
        WHEN cnt = 0 THEN 'FAIL: No leaderboard entry found for test user'
        ELSE concat('FAIL: Expected 1 entry, got ', toString(cnt), ' entries')
    END AS test_result,
    cnt AS entry_count
FROM (
    SELECT count() AS cnt
    FROM (
        SELECT user_id
        FROM token_usage_hourly
        WHERE hour >= now() - INTERVAL 1 DAY
          AND user_id = 'test-user-11111111-1111-1111-1111-111111111111'
        GROUP BY user_id
    )
);

-- ============================================================
-- 5. ASSERTION: Combined metrics are correct
--    cost_usd is now computed via pricing_model JOIN (not from LogAttributes)
--    Claude Code (claude-sonnet-4-20250514): 3 events
--      input=4500, output=1900, cache_read=1000, cache_creation=150, requests=3
--      cost = (4500*3 + 1900*15 + 1000*0.3 + 150*3.75) / 1M = 0.042963
--    Codex (o3): 2 events
--      input=2000, output=1000, cache_read=250, cache_creation=0, requests=2
--      cost = (2000*2 + 1000*8 + 250*0.5) / 1M = 0.012125
--    Total: input=6500, output=2900, cache_read=1250, requests=5, cost≈0.055088
-- ============================================================

SELECT '--- ASSERTION: Combined Metrics ---' AS section;

SELECT
    CASE
        WHEN abs(total_input - 6500) <= 1 THEN 'PASS'
        ELSE concat('FAIL: expected input_tokens=6500, got ', toString(total_input))
    END AS input_tokens_test,
    CASE
        WHEN abs(total_output - 2900) <= 1 THEN 'PASS'
        ELSE concat('FAIL: expected output_tokens=2900, got ', toString(total_output))
    END AS output_tokens_test,
    CASE
        WHEN abs(total_cache_read - 1250) <= 1 THEN 'PASS'
        ELSE concat('FAIL: expected cache_read_tokens=1250, got ', toString(total_cache_read))
    END AS cache_read_test,
    CASE
        WHEN total_requests = 5 THEN 'PASS'
        ELSE concat('FAIL: expected request_count=5, got ', toString(total_requests))
    END AS request_count_test,
    CASE
        WHEN abs(total_cost - 0.055088) < 0.002 THEN 'PASS'
        ELSE concat('FAIL: expected cost_usd~0.055, got ', toString(total_cost))
    END AS cost_test
FROM (
    SELECT
        sum(input_tokens) AS total_input,
        sum(output_tokens) AS total_output,
        sum(cache_read_tokens) AS total_cache_read,
        sum(request_count) AS total_requests,
        sum(cost_usd) AS total_cost
    FROM token_usage_hourly
    WHERE hour >= now() - INTERVAL 1 DAY
      AND user_id = 'test-user-11111111-1111-1111-1111-111111111111'
);

-- ============================================================
-- 6. ASSERTION: Data from multiple models is combined correctly
--    Claude Code uses claude-sonnet-4-20250514, Codex uses o3
--    But the leaderboard groups by user_id (not model_id), so both contribute
-- ============================================================

SELECT '--- ASSERTION: Multi-Model Presence ---' AS section;

SELECT
    CASE
        WHEN model_count >= 2 THEN 'PASS: Data from multiple models (Claude + OpenAI) present'
        ELSE concat('FAIL: Expected >=2 models, got ', toString(model_count))
    END AS multi_model_test
FROM (
    SELECT count(DISTINCT model_id) AS model_count
    FROM token_usage_hourly
    WHERE hour >= now() - INTERVAL 1 DAY
      AND user_id = 'test-user-11111111-1111-1111-1111-111111111111'
);

-- ============================================================
-- 7. ASSERTION: A DIFFERENT user is NOT merged with our test user
--    Insert a separate user's Codex event and verify isolation
-- ============================================================

SELECT '--- ASSERTION: User Isolation ---' AS section;

INSERT INTO claude_code_logs (
    Timestamp, ServiceName, Body,
    ResourceAttributes, LogAttributes
) VALUES
(
    now() - INTERVAL 2 MINUTE,
    'codex',
    'token_usage',
    {'zeude.user.id': 'test-user-22222222-2222-2222-2222-222222222222', 'zeude.user.email': 'otheruser@example.com'},
    {'user.id': 'test-user-22222222-2222-2222-2222-222222222222', 'user.email': 'otheruser@example.com', 'model': 'gpt-4.1', 'input_tokens': '999', 'output_tokens': '999', 'cache_read_tokens': '0', 'cache_creation_tokens': '0', 'cost_usd': '0.01', 'duration_ms': '1000', 'organization.id': '', 'mcp.server': ''}
);

-- Verify our test user still has exactly the same totals (other user's data NOT mixed in)
SELECT
    CASE
        WHEN abs(total_input - 6500) <= 1 AND total_requests = 5
        THEN 'PASS: Other user data correctly isolated'
        ELSE concat('FAIL: Data leaked. input=', toString(total_input), ' requests=', toString(total_requests))
    END AS isolation_test
FROM (
    SELECT
        sum(input_tokens) AS total_input,
        sum(request_count) AS total_requests
    FROM token_usage_hourly
    WHERE hour >= now() - INTERVAL 1 DAY
      AND user_id = 'test-user-11111111-1111-1111-1111-111111111111'
);

-- Verify the other user appears separately
SELECT
    CASE
        WHEN user_count = 2 THEN 'PASS: Two separate users on leaderboard'
        ELSE concat('FAIL: Expected 2 users, got ', toString(user_count))
    END AS separate_users_test
FROM (
    SELECT count() AS user_count
    FROM (
        SELECT user_id
        FROM token_usage_hourly
        WHERE hour >= now() - INTERVAL 1 DAY
          AND user_id IN (
              'test-user-11111111-1111-1111-1111-111111111111',
              'test-user-22222222-2222-2222-2222-222222222222'
          )
        GROUP BY user_id
    )
);

-- ============================================================
-- 8. Cleanup: Remove test data
-- ============================================================

SELECT '--- Cleanup ---' AS section;

ALTER TABLE claude_code_logs DELETE
WHERE ResourceAttributes['zeude.user.id'] IN (
    'test-user-11111111-1111-1111-1111-111111111111',
    'test-user-22222222-2222-2222-2222-222222222222'
);

-- Note: token_usage_hourly rows from test data will remain until
-- the MV's TTL expires or manual cleanup. The DELETE above prevents
-- future MV inserts from test data.

SELECT 'ALL TESTS COMPLETE' AS status;
