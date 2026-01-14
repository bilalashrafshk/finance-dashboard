/**
 * Prompt template for generating breaking news headlines for market events.
 * 
 * @param symbol Stock Ticker (e.g. OGDC)
 * @param eventType Type of event (e.g. ATH, 52W_HIGH)
 * @param currentPrice Current price value (intraday high)
 * @param previousValue Previous record value
 * @param assetType Asset type for currency formatting (pk-equity uses Rs)
 * @returns Formatted prompt string
 */
export function getEventHeadlinePrompt(
  symbol: string,
  eventType: string,
  currentPrice: number,
  previousValue: number,
  assetType: string = 'pk-equity'
): string {
  // Use Rs for Pakistani stocks, $ for others
  const currency = assetType === 'pk-equity' ? 'Rs' : '$';

  return `
    You are a financial news AI. Write a concise, breaking-news style headline (max 10 words) for the following event.
    No preamble, no quotes, just the headline. Do NOT include time in the headline.
    IMPORTANT: This is an INTRADAY breakout (based on day's high, not closing price). Mention "intraday" in the headline.

    Event Details:
    - Symbol: ${symbol}
    - Type: ${eventType} (ATH = All Time High, 52W_HIGH = 52 Week High)
    - Intraday High: ${currency} ${currentPrice}
    - Previous Record: ${currency} ${previousValue}

    Examples:
    - OGDC hits intraday all-time high at Rs 304
    - PTC surges to intraday 52-week high at Rs 15.5
    - AAPL touches intraday all-time high at $185
  `;
}
