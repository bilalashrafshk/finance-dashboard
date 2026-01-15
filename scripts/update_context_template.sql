UPDATE alert_configs 
SET value = '{
  "meta": {
    "symbol": "SYMBOL",
    "sector": "SECTOR",
    "current_date": "YYYY-MM-DD"
  },
  "price_context": {
    "current": 0.0,
    "52_week_high": 0.0
  },
  "earnings": {
    "instruction": "Prioritize EPS trends for valuation; use Net Income for magnitude. Compare Quarterly to Quarterly only. Quarterly results should NOT be compared to Annual results.",
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
}'::jsonb 
WHERE key = 'ai_context_payload';
