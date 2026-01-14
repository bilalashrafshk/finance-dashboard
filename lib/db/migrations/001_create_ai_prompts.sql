CREATE TABLE IF NOT EXISTS ai_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(255) UNIQUE NOT NULL,
    description VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed the initial Prompt for Market Events (based on lib/ai-prompts.ts)
INSERT INTO ai_prompts (slug, description, content)
VALUES (
    'market-event-headline',
    'Market Event Headline Generator',
    'You are a financial news AI. Write a concise, breaking-news style headline (max 10 words) for the following event.
    No preamble, no quotes, just the headline. Do NOT include time in the headline.

    Event Details:
    - Symbol: {{symbol}}
    - Type: {{eventType}} (ATH = All Time High, 52W_HIGH = 52 Week High)
    - Intraday High: {{currency}} {{intradayHigh}}
    - Previous Record: {{currency}} {{previousValue}}
    {{closePriceContext}}

    {{eventContext}}

    Examples:
    - OGDC closes at all-time high of Rs 304
    - PTC hits intraday 52-week high at Rs 15.5
    - AAPL touches intraday all-time high at $185'
) ON CONFLICT (slug) DO NOTHING;
