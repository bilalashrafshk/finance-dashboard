import { getPool } from './db';

/**
 * Valid placeholders for the market event prompt
 */
type PromptVariables = {
  symbol: string;
  eventType: string;
  intradayHigh: number;
  previousValue: number;
  closePrice?: number | null;
  currency: string;
  eventContext: string;
  closePriceContext: string;
};

const DEFAULT_PROMPT_SLUG = 'market-event-headline';

/**
 * Fetches the prompt template from the database or returns fallback.
 * Cached in-memory for 60 seconds to reduce DB load.
 */
let promptCache: { content: string; timestamp: number } | null = null;
const CACHE_TTL = 60 * 1000; // 60 seconds

async function getPromptTemplate(slug: string): Promise<string> {
  // Check cache
  const now = Date.now();
  if (promptCache && (now - promptCache.timestamp < CACHE_TTL)) {
    return promptCache.content;
  }

  try {
    const pool = getPool();
    // Use a simpler query if pool is available
    const { rows } = await pool.query('SELECT content FROM ai_prompts WHERE slug = $1 AND is_active = TRUE', [slug]);

    if (rows.length > 0) {
      const content = rows[0].content;
      promptCache = { content, timestamp: now };
      return content;
    }
  } catch (error) {
    console.error('Failed to fetch AI prompt from DB, using fallback.', error);
  }

  // Fallback (hardcoded original)
  return `You are a financial news AI. Write a concise, breaking-news style headline (max 10 words) for the following event.
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
    - AAPL touches intraday all-time high at $185`;
}

/**
 * Generates the fully formatted prompt string by replacing placeholders.
 */
export async function getEventHeadlinePrompt(
  symbol: string,
  eventType: string,
  intradayHigh: number,
  previousValue: number,
  closePrice: number | null = null,
  assetType: string = 'pk-equity'
): Promise<string> {
  const currency = assetType === 'pk-equity' ? 'Rs' : '$';
  const closedAtHigh = closePrice && Math.abs(closePrice - intradayHigh) < 0.01;
  const eventContext = closedAtHigh
    ? `The stock CLOSED at this record high (closing price equals high). Use "closes at" or "closed at" in headline.`
    : `This is an INTRADAY breakout (the high was touched during trading but close may be lower). Use "touches" or "hits intraday" in headline.`;

  const closePriceContext = closePrice ? `- Closing Price: ${currency} ${closePrice}` : '';

  const variables: PromptVariables = {
    symbol,
    eventType,
    intradayHigh,
    previousValue,
    closePrice,
    currency,
    eventContext,
    closePriceContext
  };

  const template = await getPromptTemplate(DEFAULT_PROMPT_SLUG);

  // Replace {{key}} with value
  const formatted = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    // @ts-ignore
    return variables[key] !== undefined ? String(variables[key]) : '';
  });

  return formatted;
}
