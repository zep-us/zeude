-- Migration 010: Add OpenAI model pricing for Codex integration
-- Pricing sourced from LiteLLM community data (2026-03-16)
-- cache_creation_price_per_million is 0 as OpenAI does not charge for cache creation
--
-- Idempotency: ReplacingMergeTree deduplicates on (model_id, effective_date) during merge.
-- Re-running this migration inserts duplicate rows that are cleaned on next OPTIMIZE.
-- For explicit cleanup after re-run: OPTIMIZE TABLE pricing_model FINAL;

INSERT INTO pricing_model VALUES
    ('gpt-5.4', '2026-03-05', 2.50, 15.00, 0.25, 0.00),
    ('gpt-5.4-2026-03-05', '2026-03-05', 2.50, 15.00, 0.25, 0.00),
    ('gpt-5.4-pro', '2026-03-05', 30.00, 180.00, 3.00, 0.00),
    ('gpt-5.4-pro-2026-03-05', '2026-03-05', 30.00, 180.00, 3.00, 0.00),
    ('gpt-5.3-codex', '2025-12-11', 1.75, 14.00, 0.175, 0.00),
    ('gpt-5.3-codex-spark', '2025-12-11', 1.75, 14.00, 0.175, 0.00),
    ('gpt-5.3-chat-latest', '2025-12-11', 1.75, 14.00, 0.175, 0.00);

-- Deduplicate immediately (safe, idempotent)
OPTIMIZE TABLE pricing_model FINAL;
