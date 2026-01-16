-- Add Webhook Configs to alert_configs
INSERT INTO alert_configs (key, value, description)
VALUES 
(
    'fundamental_webhook_url',
    '""'::jsonb,
    'Discord Webhook URL for Fundamental Alerts (Financial Results, Management Changes, etc.)'
),
(
    'technical_webhook_url',
    '""'::jsonb,
    'Discord Webhook URL for Technical Alerts (ATH, 52W High, Volume spikes)'
)
ON CONFLICT (key) DO NOTHING;
