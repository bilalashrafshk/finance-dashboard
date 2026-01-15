-- AI Prompts Migration
INSERT INTO ai_prompts (slug, description, prompt_text)
VALUES 
(
    'fundamental-events',
    'AI Prompt for Fundamental Events (Financial Results, Management Changes, Dividends)',
    'You are an expert financial analyst. Analyze the following PSX announcement in the context of the company''s fundamental data. Focus on whether this event is a catalyst for value creation or a risk. Prioritize EPS growth and role-specific management changes (CEO/CFO).'
),
(
    'technical-events',
    'AI Prompt for Technical Events (Price Action, Volume)',
    'Analyze the following technical events and price action. Focus on trend continuation, reversals, and volume spikes.'
)
ON CONFLICT (slug) DO UPDATE SET 
    description = EXCLUDED.description,
    prompt_text = EXCLUDED.prompt_text;

-- Alert Configs Migration
INSERT INTO alert_configs (key, value, description)
VALUES 
(
    'ai_context_payload',
    '{
  "meta": {
    "symbol": "SYMBOL",
    "sector": "SECTOR",
    "current_date": "YYYY-MM-DD"
  },
  "price_context": {
    "current": 0.0,
    "five_two_week_high": 0.0
  },
  "valuation_context": {
    "company_pe": 0.0,
    "sector_avg_pe": 0.0
  },
  "earnings": {
    "quarterly": [
      { "period": "YYYY-QQ", "eps": 0.0, "net_income": 0 }
    ],
    "annual": [
      { "period": "YYYY-Annual", "eps": 0.0, "net_income": 0 }
    ]
  },
  "dividend_history": {
    "status": "None",
    "last_payment_date": null,
    "last_payment_amount": 0.0,
    "yield_at_time": "0.00%"
  }
}'::jsonb,
    'Structure of the JSON payload sent to the AI for Context.'
),
(
    'ai_context_instructions',
    '"Prioritize EPS trends for valuation; use Net Income for magnitude. Compare Quarterly to Quarterly only. Quarterly results should NOT be compared to Annual results."'::jsonb,
    'Reasoning rules for the AI when interpreting company context.'
),
(
    'priority_keywords',
    '["Financial Results", "Board Meeting", "Material Information", "Dividend", "Bonus", "Right Shares", "Appointment of CEO", "Appointment of Chief Executive", "Appointment of Chairman", "Appointment of CFO", "Appointment of Chief Financial Officer", "Change of CEO", "Change of Chief Executive", "Change of CFO", "Change of Chief Financial Officer"]'::jsonb,
    'Keywords that trigger a priority alert.'
),
(
    'ignore_keywords',
    '["Daily Dividend", "Subscription Status", "Unclaimed Dividends", "Loss of Share Certificate", "Transmission of Annual Report", "Notice of Annual General Meeting", "Corrigendum", "Change of Share Registrar"]'::jsonb,
    'Keywords that should be ignored to reduce noise.'
)
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    description = EXCLUDED.description;
