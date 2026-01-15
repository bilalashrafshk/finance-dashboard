INSERT INTO alert_configs (key, value, description)
VALUES (
    'ai_context_payload',
    '{"meta": {"symbol": "KEL", "sector": "Power Generation", "current_date": "2026-01-15"}, "price_context": {"current": 4.5, "52_week_high": 6.2}, "dividend_history": {"status": "Irregular", "last_payment_date": "2022-06-30", "last_payment_amount": 1.5, "yield_at_time": "15%"}, "earnings_trend": [{"period": "2025-Sep (Quarter)", "eps": 0.5}, {"period": "2025-Jun (Annual)", "eps": -2.1}, {"period": "2024-Sep (Quarter)", "eps": 0.2}]}'::jsonb,
    'Structure of the JSON payload sent to the AI for Context. Edit this to change the template.'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
