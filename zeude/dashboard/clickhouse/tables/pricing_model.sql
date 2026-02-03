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
    ('claude-opus-4-5-20251101', '2025-11-01', 15.00, 75.00, 1.50, 18.75);
