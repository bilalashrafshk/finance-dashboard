CREATE TABLE IF NOT EXISTS alert_configs (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed defaults
INSERT INTO alert_configs (key, value, description) VALUES
('mc_threshold_rank', '100', 'Market Cap Rank threshold for "Disclosure of Interest" alerts'),
('priority_keywords', '["Financial Results", "Board Meeting", "Material Information", "Dividend", "Bonus", "Right Shares"]', 'Keywords that trigger immediate AI processing'),
('ignore_keywords', '["Loss of Share Certificate", "Transmission of Annual Report", "Notice of Annual General Meeting", "Corrigendum", "Credit of Final Cash Dividend", "Change of Share Registrar"]', 'Keywords to automatically discard as noise')
ON CONFLICT (key) DO NOTHING;
