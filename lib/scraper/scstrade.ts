/**
 * SCSTrade Scraper
 * 
 * Helper functions to scrape data from scstrade.com
 */

/**
 * Fetch Face Value from SCSTrade Company Snapshot
 * 
 * @param symbol - Stock symbol (e.g., 'ARPL')
 * @returns Face value as number (e.g., 10.0) or null if not found
 */
export async function fetchFaceValue(symbol: string): Promise<number | null> {
  try {
    // Ensure symbol is uppercase
    const ticker = symbol.toUpperCase();
    const url = `https://scstrade.com/stockscreening/SS_CompanySnapShot.aspx?symbol=${ticker}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      }
    });

    if (!response.ok) {
      console.error(`[SCSTrade] Error fetching face value for ${ticker}: ${response.status}`);
      return null;
    }

    const html = await response.text();
    
    // Look for <span id="ContentPlaceHolder1_lbl_facevalue">10.00</span>
    const match = html.match(/id="ContentPlaceHolder1_lbl_facevalue"[^>]*>([\d.,]+)</);
    
    if (match && match[1]) {
      const valueStr = match[1].replace(/,/g, ''); // Remove commas if any
      const value = parseFloat(valueStr);
      if (!isNaN(value)) {
        return value;
      }
    }
    
    console.warn(`[SCSTrade] Face value not found in HTML for ${ticker}`);
    return null;

  } catch (error: any) {
    console.error(`[SCSTrade] Exception fetching face value for ${symbol}:`, error.message);
    return null;
  }
}

