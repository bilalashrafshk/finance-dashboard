/**
 * Prompt template for generating breaking news headlines for market events.
 * 
 * @param symbol Stock Ticker (e.g. OGDC)
 * @param eventType Type of event (e.g. ATH, 52W_HIGH)
 * @param intradayHigh The intraday high that triggered the event
 * @param previousValue Previous record value
 * @param closePrice The closing/current price
 * @param assetType Asset type for currency formatting (pk-equity uses Rs)
 * @returns Formatted prompt string
 */
export function getEventHeadlinePrompt(
  symbol: string,
  eventType: string,
  intradayHigh: number,
  previousValue: number,
  closePrice: number | null = null,
  assetType: string = 'pk-equity'
): string {
  // Use Rs for Pakistani stocks, $ for others
  const currency = assetType === 'pk-equity' ? 'Rs' : '$';

  // Determine if stock closed at the high (closed at ATH) or just touched it intraday
  const closedAtHigh = closePrice && Math.abs(closePrice - intradayHigh) < 0.01;
  const eventContext = closedAtHigh
    ? `The stock CLOSED at this record high (closing price equals high). Use "closes at" or "closed at" in headline.`
    : `This is an INTRADAY breakout (the high was touched during trading but close may be lower). Use "touches" or "hits intraday" in headline.`;

  return `
    You are a financial news AI. Write a concise, breaking-news style headline (max 10 words) for the following event.
    No preamble, no quotes, just the headline. Do NOT include time in the headline.

    Event Details:
    - Symbol: ${symbol}
    - Type: ${eventType} (ATH = All Time High, 52W_HIGH = 52 Week High)
    - Intraday High: ${currency} ${intradayHigh}
    - Previous Record: ${currency} ${previousValue}
    ${closePrice ? `- Closing Price: ${currency} ${closePrice}` : ''}

    ${eventContext}

    Examples:
    - OGDC closes at all-time high of Rs 304
    - PTC hits intraday 52-week high at Rs 15.5
    - AAPL touches intraday all-time high at $185
  `;
}
