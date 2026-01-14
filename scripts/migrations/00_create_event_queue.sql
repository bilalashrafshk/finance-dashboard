
CREATE TABLE IF NOT EXISTS event_queue (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    event_type VARCHAR(20) NOT NULL, -- 'ATH' or '52W_HIGH'
    trigger_value DECIMAL(20, 4) NOT NULL,
    previous_value DECIMAL(20, 4) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING', 'PROCESSING', 'FAILED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_event_queue_status ON event_queue(status);
CREATE INDEX IF NOT EXISTS idx_event_queue_symbol ON event_queue(symbol);
