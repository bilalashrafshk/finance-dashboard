/**
 * Prompt template for generating breaking news headlines for market events.
 * 
 * @param symbol Stock Ticker (e.g. OGDC)
 * @param eventType Type of event (e.g. ATH, 52W_HIGH)
 * @param currentPrice Current price value
 * @param previousValue Previous record value
 * @returns Formatted prompt string
 */
export function getEventHeadlinePrompt(
    symbol: string,
    eventType: string,
    currentPrice: number,
    previousValue: number
): string {
    const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    return `
    You are a financial news AI. Write a concise, breaking-news style headline (max 10 words) for the following event.
    No preamble, no quotes, just the headline.

    Event Details:
    - Symbol: ${symbol}
    - Type: ${eventType} (ATH = All Time High, 52W_HIGH = 52 Week High)
    - Current Price: ${currentPrice}
    - Previous Record: ${previousValue}
    - Time: ${time}

    Examples:
    - OGDC hits all-time high in intraday trading
    - PTC surges to new 52-week high at 15.5
    - KSE100 crosses historical barrier
  `;
}
