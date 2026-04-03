-- ============================================================
-- Integration Test: cost_usd Computation via pricing_model JOIN
-- ============================================================
-- Tests that the token_usage_hourly MV computes cost_usd by joining
-- with the pricing_model table using token counts, rather than
-- reading a pre-computed cost from LogAttributes.
--
-- Validates:
--   1. Claude model cost uses all 4 token types (input, output, cache_read, cache_creation)
--   2. OpenAI/Codex model cost uses 3 effective token types (input, output, cache_read)
--      (cache_creation_price = 0 for OpenAI, so the 4th term is always 0)
--   3. Unknown models produce cost_usd = 0 (LEFT JOIN returns NULL prices → 0)
--   4. Cost is computed at materialization time, not from LogAttributes['cost_usd']
--
-- Prerequisites:
--   - ClickHouse running with init.sql schema applied (migration 011+)
--   - token_usage_hourly MV with pricing_model JOIN
--   - pricing_model table populated with Claude and OpenAI models
--
-- Usage:
--   clickhouse-client --multiquery < cost_usd_pricing_join_test.sql
-- ============================================================

-- ============================================================
-- 0. Verify pricing_model has expected entries
-- ============================================================
SELECT '--- Pricing Model Verification ---' AS section;

SELECT
    CASE
        WHEN cnt >= 3 THEN concat('PASS: pricing_model has ', toString(cnt), ' OpenAI entries (o3/gpt-4.1)')
        ELSE concat('FAIL: Expected >=3 OpenAI entries (o3/gpt-4.1), got ', toString(cnt))
    END AS pricing_check
FROM (
    SELECT count() AS cnt
    FROM pricing_model
    WHERE model_id IN ('o3', 'gpt-4.1', 'gpt-4.1-mini')
);

SELECT
    CASE
        WHEN cnt >= 3 THEN concat('PASS: pricing_model has ', toString(cnt), ' Codex-era entries (gpt-5.x)')
        ELSE concat('FAIL: Expected >=3 Codex-era entries (gpt-5.x), got ', toString(cnt))
    END AS codex_pricing_check
FROM (
    SELECT count() AS cnt
    FROM pricing_model
    WHERE model_id IN ('gpt-5.3-codex', 'gpt-5.4', 'gpt-5.4-pro')
);

-- ============================================================
-- 1. Insert test events with KNOWN token counts
--    We intentionally set LogAttributes['cost_usd'] to '999.99'
--    to prove the MV ignores it and computes cost via JOIN instead.
-- ============================================================
SELECT '--- Inserting Test Events ---' AS section;

-- Test user UUID
-- Claude Code event: claude-sonnet-4-20250514
--   input=1000, output=500, cache_read=200, cache_creation=100
--   Expected cost:
--     input:          1000 * 3.00 / 1000000 = 0.003000
--     output:          500 * 15.00 / 1000000 = 0.007500
--     cache_read:      200 * 0.30 / 1000000  = 0.000060
--     cache_creation:  100 * 3.75 / 1000000  = 0.000375
--     TOTAL = 0.010935
INSERT INTO claude_code_logs (
    Timestamp, ServiceName, Body,
    ResourceAttributes, LogAttributes
) VALUES (
    now() - INTERVAL 10 MINUTE,
    'claude_code',
    'token_usage',
    {'zeude.user.id': 'test-cost-aaaa-aaaa-aaaa-aaaaaaaaaaaa'},
    {
        'user.id': 'test-cost-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'user.email': 'cost-test@example.com',
        'model': 'claude-sonnet-4-20250514',
        'input_tokens': '1000',
        'output_tokens': '500',
        'cache_read_tokens': '200',
        'cache_creation_tokens': '100',
        'cost_usd': '999.99',
        'duration_ms': '3000',
        'organization.id': 'org-cost-test',
        'mcp.server': ''
    }
);

-- Codex event: o3 model
--   input=2000, output=1000, cache_read=500, cache_creation=0
--   Expected cost (3 effective types since cache_creation_price=0):
--     input:       2000 * 2.00 / 1000000 = 0.004000
--     output:      1000 * 8.00 / 1000000 = 0.008000
--     cache_read:   500 * 0.50 / 1000000 = 0.000250
--     cache_creation: 0 * 0.00 / 1000000 = 0.000000
--     TOTAL = 0.012250
INSERT INTO claude_code_logs (
    Timestamp, ServiceName, Body,
    ResourceAttributes, LogAttributes
) VALUES (
    now() - INTERVAL 8 MINUTE,
    'codex',
    'token_usage',
    {'zeude.user.id': 'test-cost-aaaa-aaaa-aaaa-aaaaaaaaaaaa'},
    {
        'user.id': 'test-cost-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'user.email': 'cost-test@example.com',
        'model': 'o3',
        'input_tokens': '2000',
        'output_tokens': '1000',
        'cache_read_tokens': '500',
        'cache_creation_tokens': '0',
        'cost_usd': '999.99',
        'duration_ms': '2000',
        'organization.id': '',
        'mcp.server': ''
    }
);

-- Codex event: gpt-4.1-mini model
--   input=5000, output=2000, cache_read=1000, cache_creation=0
--   Expected cost:
--     input:       5000 * 0.40 / 1000000 = 0.002000
--     output:      2000 * 1.60 / 1000000 = 0.003200
--     cache_read:  1000 * 0.10 / 1000000 = 0.000100
--     TOTAL = 0.005300
INSERT INTO claude_code_logs (
    Timestamp, ServiceName, Body,
    ResourceAttributes, LogAttributes
) VALUES (
    now() - INTERVAL 6 MINUTE,
    'codex',
    'token_usage',
    {'zeude.user.id': 'test-cost-bbbb-bbbb-bbbb-bbbbbbbbbbbb'},
    {
        'user.id': 'test-cost-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'user.email': 'cost-test-b@example.com',
        'model': 'gpt-4.1-mini',
        'input_tokens': '5000',
        'output_tokens': '2000',
        'cache_read_tokens': '1000',
        'cache_creation_tokens': '0',
        'cost_usd': '999.99',
        'duration_ms': '1500',
        'organization.id': '',
        'mcp.server': ''
    }
);

-- Codex event: gpt-5.3-codex model (primary Codex workhorse)
--   input=3000, output=1500, cache_read=800, cache_creation=0
--   Expected cost:
--     input:       3000 * 1.75 / 1000000 = 0.005250
--     output:      1500 * 14.00 / 1000000 = 0.021000
--     cache_read:   800 * 0.175 / 1000000 = 0.000140
--     TOTAL = 0.026390
INSERT INTO claude_code_logs (
    Timestamp, ServiceName, Body,
    ResourceAttributes, LogAttributes
) VALUES (
    now() - INTERVAL 5 MINUTE,
    'codex',
    'token_usage',
    {'zeude.user.id': 'test-cost-dddd-dddd-dddd-dddddddddddd'},
    {
        'user.id': 'test-cost-dddd-dddd-dddd-dddddddddddd',
        'user.email': 'cost-test-d@example.com',
        'model': 'gpt-5.3-codex',
        'input_tokens': '3000',
        'output_tokens': '1500',
        'cache_read_tokens': '800',
        'cache_creation_tokens': '0',
        'cost_usd': '999.99',
        'duration_ms': '2500',
        'organization.id': '',
        'mcp.server': ''
    }
);

-- Codex event: gpt-5.4 model (newer OpenAI model)
--   input=2000, output=800, cache_read=400, cache_creation=0
--   Expected cost:
--     input:       2000 * 2.50 / 1000000 = 0.005000
--     output:       800 * 15.00 / 1000000 = 0.012000
--     cache_read:   400 * 0.25 / 1000000 = 0.000100
--     TOTAL = 0.017100
INSERT INTO claude_code_logs (
    Timestamp, ServiceName, Body,
    ResourceAttributes, LogAttributes
) VALUES (
    now() - INTERVAL 3 MINUTE,
    'codex',
    'token_usage',
    {'zeude.user.id': 'test-cost-eeee-eeee-eeee-eeeeeeeeeeee'},
    {
        'user.id': 'test-cost-eeee-eeee-eeee-eeeeeeeeeeee',
        'user.email': 'cost-test-e@example.com',
        'model': 'gpt-5.4',
        'input_tokens': '2000',
        'output_tokens': '800',
        'cache_read_tokens': '400',
        'cache_creation_tokens': '0',
        'cost_usd': '999.99',
        'duration_ms': '1800',
        'organization.id': '',
        'mcp.server': ''
    }
);

-- Unknown model event (should produce cost_usd = 0 via LEFT JOIN)
INSERT INTO claude_code_logs (
    Timestamp, ServiceName, Body,
    ResourceAttributes, LogAttributes
) VALUES (
    now() - INTERVAL 4 MINUTE,
    'codex',
    'token_usage',
    {'zeude.user.id': 'test-cost-cccc-cccc-cccc-cccccccccccc'},
    {
        'user.id': 'test-cost-cccc-cccc-cccc-cccccccccccc',
        'user.email': 'cost-test-c@example.com',
        'model': 'unknown-model-xyz',
        'input_tokens': '1000',
        'output_tokens': '500',
        'cache_read_tokens': '200',
        'cache_creation_tokens': '0',
        'cost_usd': '999.99',
        'duration_ms': '1000',
        'organization.id': '',
        'mcp.server': ''
    }
);

-- ============================================================
-- 2. ASSERTION: Claude model cost uses all 4 token types
-- ============================================================
SELECT '--- ASSERTION: Claude Model Cost (4 token types) ---' AS section;

SELECT
    CASE
        WHEN abs(total_cost - 0.010935) < 0.0001
        THEN 'PASS: Claude cost_usd = ' || toString(round(total_cost, 6)) || ' (expected ~0.010935)'
        ELSE 'FAIL: Claude cost_usd = ' || toString(round(total_cost, 6)) || ' (expected ~0.010935)'
    END AS claude_cost_test
FROM (
    SELECT sum(cost_usd) AS total_cost
    FROM token_usage_hourly
    WHERE user_id = 'test-cost-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND source = 'claude'
      AND hour >= now() - INTERVAL 1 DAY
);

-- ============================================================
-- 3. ASSERTION: Codex/o3 cost uses 3 effective token types
--    (cache_creation_price = 0 for OpenAI)
-- ============================================================
SELECT '--- ASSERTION: Codex/o3 Cost (3 effective token types) ---' AS section;

SELECT
    CASE
        WHEN abs(total_cost - 0.012250) < 0.0001
        THEN 'PASS: Codex/o3 cost_usd = ' || toString(round(total_cost, 6)) || ' (expected ~0.012250)'
        ELSE 'FAIL: Codex/o3 cost_usd = ' || toString(round(total_cost, 6)) || ' (expected ~0.012250)'
    END AS codex_o3_cost_test
FROM (
    SELECT sum(cost_usd) AS total_cost
    FROM token_usage_hourly
    WHERE user_id = 'test-cost-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND source = 'codex'
      AND hour >= now() - INTERVAL 1 DAY
);

-- ============================================================
-- 4. ASSERTION: gpt-4.1-mini cost correct
-- ============================================================
SELECT '--- ASSERTION: Codex/gpt-4.1-mini Cost ---' AS section;

SELECT
    CASE
        WHEN abs(total_cost - 0.005300) < 0.0001
        THEN 'PASS: gpt-4.1-mini cost_usd = ' || toString(round(total_cost, 6)) || ' (expected ~0.005300)'
        ELSE 'FAIL: gpt-4.1-mini cost_usd = ' || toString(round(total_cost, 6)) || ' (expected ~0.005300)'
    END AS gpt41mini_cost_test
FROM (
    SELECT sum(cost_usd) AS total_cost
    FROM token_usage_hourly
    WHERE user_id = 'test-cost-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND hour >= now() - INTERVAL 1 DAY
);

-- ============================================================
-- 5. ASSERTION: Unknown model produces cost_usd = 0
--    LEFT JOIN with no match → NULL prices → multiplication yields 0
-- ============================================================
SELECT '--- ASSERTION: Unknown Model Cost = 0 ---' AS section;

SELECT
    CASE
        WHEN abs(total_cost) < 0.0001
        THEN 'PASS: Unknown model cost_usd = ' || toString(round(total_cost, 6)) || ' (expected 0)'
        ELSE 'FAIL: Unknown model cost_usd = ' || toString(round(total_cost, 6)) || ' (expected 0)'
    END AS unknown_model_cost_test
FROM (
    SELECT sum(cost_usd) AS total_cost
    FROM token_usage_hourly
    WHERE user_id = 'test-cost-cccc-cccc-cccc-cccccccccccc'
      AND hour >= now() - INTERVAL 1 DAY
);

-- ============================================================
-- 5b. ASSERTION: gpt-5.3-codex cost correct (primary Codex model)
-- ============================================================
SELECT '--- ASSERTION: Codex/gpt-5.3-codex Cost ---' AS section;

SELECT
    CASE
        WHEN abs(total_cost - 0.026390) < 0.001
        THEN 'PASS: gpt-5.3-codex cost_usd = ' || toString(round(total_cost, 6)) || ' (expected ~0.026390)'
        ELSE 'FAIL: gpt-5.3-codex cost_usd = ' || toString(round(total_cost, 6)) || ' (expected ~0.026390)'
    END AS gpt53codex_cost_test
FROM (
    SELECT sum(cost_usd) AS total_cost
    FROM token_usage_hourly
    WHERE user_id = 'test-cost-dddd-dddd-dddd-dddddddddddd'
      AND hour >= now() - INTERVAL 1 DAY
);

-- ============================================================
-- 5c. ASSERTION: gpt-5.4 cost correct (newer OpenAI model)
-- ============================================================
SELECT '--- ASSERTION: Codex/gpt-5.4 Cost ---' AS section;

SELECT
    CASE
        WHEN abs(total_cost - 0.017100) < 0.001
        THEN 'PASS: gpt-5.4 cost_usd = ' || toString(round(total_cost, 6)) || ' (expected ~0.017100)'
        ELSE 'FAIL: gpt-5.4 cost_usd = ' || toString(round(total_cost, 6)) || ' (expected ~0.017100)'
    END AS gpt54_cost_test
FROM (
    SELECT sum(cost_usd) AS total_cost
    FROM token_usage_hourly
    WHERE user_id = 'test-cost-eeee-eeee-eeee-eeeeeeeeeeee'
      AND hour >= now() - INTERVAL 1 DAY
);

-- ============================================================
-- 6. ASSERTION: cost_usd is NOT from LogAttributes
--    We set LogAttributes['cost_usd'] = '999.99' for all events.
--    If the MV were still using LogAttributes, total cost would be ~3999.96
--    (4 events × 999.99). The actual cost should be << 1.0.
-- ============================================================
SELECT '--- ASSERTION: Cost NOT from LogAttributes ---' AS section;

SELECT
    CASE
        WHEN total_cost < 1.0
        THEN 'PASS: cost_usd is computed via pricing_model JOIN (total=' || toString(round(total_cost, 6)) || ', not from LogAttributes 999.99)'
        ELSE 'FAIL: cost_usd appears to come from LogAttributes (total=' || toString(round(total_cost, 6)) || ', expected < 1.0)'
    END AS not_from_logattr_test
FROM (
    SELECT sum(cost_usd) AS total_cost
    FROM token_usage_hourly
    WHERE user_id IN (
        'test-cost-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'test-cost-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'test-cost-cccc-cccc-cccc-cccccccccccc',
        'test-cost-dddd-dddd-dddd-dddddddddddd',
        'test-cost-eeee-eeee-eeee-eeeeeeeeeeee'
    )
    AND hour >= now() - INTERVAL 1 DAY
);

-- ============================================================
-- 7. ASSERTION: Combined cost for multi-source user is correct
--    User aaaa uses both Claude Code and Codex
--    Claude cost: 0.010935, Codex/o3 cost: 0.012250
--    Combined: 0.023185
-- ============================================================
SELECT '--- ASSERTION: Multi-Source Combined Cost ---' AS section;

SELECT
    CASE
        WHEN abs(total_cost - 0.023185) < 0.001
        THEN 'PASS: Combined cost = ' || toString(round(total_cost, 6)) || ' (expected ~0.023185)'
        ELSE 'FAIL: Combined cost = ' || toString(round(total_cost, 6)) || ' (expected ~0.023185)'
    END AS combined_cost_test
FROM (
    SELECT sum(cost_usd) AS total_cost
    FROM token_usage_hourly
    WHERE user_id = 'test-cost-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND hour >= now() - INTERVAL 1 DAY
);

-- ============================================================
-- 8. Cleanup: Remove test data
-- ============================================================
SELECT '--- Cleanup ---' AS section;

ALTER TABLE claude_code_logs DELETE
WHERE ResourceAttributes['zeude.user.id'] IN (
    'test-cost-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'test-cost-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'test-cost-cccc-cccc-cccc-cccccccccccc',
    'test-cost-dddd-dddd-dddd-dddddddddddd',
    'test-cost-eeee-eeee-eeee-eeeeeeeeeeee'
);

SELECT 'ALL COST_USD PRICING JOIN TESTS COMPLETE' AS status;
