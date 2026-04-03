-- Pricing model table for cost calculation
-- Stores model-specific pricing (per million tokens)

CREATE TABLE IF NOT EXISTS pricing_model (
    model_id String,
    effective_date Date,
    input_price_per_million Float64,
    output_price_per_million Float64,
    cache_read_price_per_million Float64,
    cache_creation_price_per_million Float64
) ENGINE = ReplacingMergeTree()
ORDER BY (model_id, effective_date);

-- Initial pricing data (as of 2025)
INSERT INTO pricing_model VALUES
    -- Claude 3.5 Sonnet
    ('claude-3-5-sonnet-20241022', '2024-10-22', 3.00, 15.00, 0.30, 3.75),
    ('claude-sonnet-4-20250514', '2025-05-14', 3.00, 15.00, 0.30, 3.75),

    -- Claude 3.5 Haiku
    ('claude-3-5-haiku-20241022', '2024-10-22', 0.80, 4.00, 0.08, 1.00),

    -- Claude 3 Opus
    ('claude-3-opus-20240229', '2024-02-29', 15.00, 75.00, 1.50, 18.75),
    ('claude-opus-4-20250514', '2025-05-14', 15.00, 75.00, 1.50, 18.75),

    -- Claude 4 Opus (hypothetical future)
    ('claude-opus-4-5-20251101', '2025-11-01', 15.00, 75.00, 1.50, 18.75),

    -- OpenAI o3
    ('o3', '2025-04-16', 2.00, 8.00, 0.50, 0.00),

    -- OpenAI GPT-4.1
    ('gpt-4.1', '2025-04-14', 2.00, 8.00, 0.50, 0.00),

    -- OpenAI GPT-4.1 Mini
    ('gpt-4.1-mini', '2025-04-14', 0.40, 1.60, 0.10, 0.00),

    -- GPT-5.4 family
    ('gpt-5.4', '2026-03-05', 2.50, 15.00, 0.25, 0.00),
    ('gpt-5.4-2026-03-05', '2026-03-05', 2.50, 15.00, 0.25, 0.00),
    ('gpt-5.4-pro', '2026-03-05', 30.00, 180.00, 3.00, 0.00),
    ('gpt-5.4-pro-2026-03-05', '2026-03-05', 30.00, 180.00, 3.00, 0.00),

    -- GPT-5.3 Codex family
    ('gpt-5.3-codex', '2025-12-11', 1.75, 14.00, 0.175, 0.00),
    ('gpt-5.3-codex-spark', '2025-12-11', 1.75, 14.00, 0.175, 0.00),
    ('gpt-5.3-chat-latest', '2025-12-11', 1.75, 14.00, 0.175, 0.00);
