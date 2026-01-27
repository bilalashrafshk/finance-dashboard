import { getPool } from '@/lib/db';

export interface EarningsData {
    period: string;
    period_end_date: string;
    eps: number;
    net_income: number;
}

export class AIContextService {
    private static formatPeriod(dateStr: string, type: string): string {
        const date = new Date(dateStr);
        const month = date.toLocaleString('default', { month: 'short' });
        const year = date.getFullYear();
        return `${year}-${month} (${type === 'annual' ? 'Annual' : 'Quarter'})`;
    }

    /**
     * Tool: Fetch basic company profile and current valuation metrics.
     */
    static async getCompanyProfile(symbol: string) {
        const pool = getPool();
        const upperSymbol = symbol.toUpperCase();
        const res = await pool.query(`
            WITH ranked_companies AS (
                SELECT symbol, RANK() OVER (ORDER BY market_cap DESC) as market_cap_rank
                FROM company_profiles 
                WHERE market_cap IS NOT NULL
            )
            SELECT cp.sector, sm.price, sm.dividend_yield, sm.pe_ratio, sm.sector_pe, sm.rsi_14, sm.ytd_return, rc.market_cap_rank
            FROM company_profiles cp
            LEFT JOIN screener_metrics sm ON cp.symbol = sm.symbol
            LEFT JOIN ranked_companies rc ON cp.symbol = rc.symbol
            WHERE cp.symbol = $1
        `, [upperSymbol]);

        if (res.rows.length === 0) return { error: 'Symbol not found' };
        return res.rows[0];
    }

    /**
     * Tool: Fetch 52-week high for technical context.
     */
    static async getPriceHistoryMetrics(symbol: string) {
        const pool = getPool();
        const upperSymbol = symbol.toUpperCase();
        const res = await pool.query(`
            SELECT MAX(high) as high_52w
            FROM historical_price_data
            WHERE symbol = $1 AND date >= NOW() - INTERVAL '1 year'
        `, [upperSymbol]);
        return res.rows[0] || { high_52w: 0 };
    }

    /**
     * Tool: Fetch quarterly earnings (last 8 quarters).
     */
    static async getQuarterlyEarnings(symbol: string) {
        const pool = getPool();
        const upperSymbol = symbol.toUpperCase();
        const res = await pool.query(`
            SELECT period_end_date, eps_diluted, eps_basic, net_income, period_type
            FROM financial_statements
            WHERE symbol = $1 AND period_type = 'quarterly'
            ORDER BY period_end_date DESC
            LIMIT 8
        `, [upperSymbol]);
        return res.rows.map((r: any) => ({
            period: this.formatPeriod(r.period_end_date, 'quarterly'),
            period_end_date: r.period_end_date,
            eps: r.eps_diluted ? parseFloat(r.eps_diluted) : (r.eps_basic ? parseFloat(r.eps_basic) : 0),
            net_income: r.net_income ? parseFloat(r.net_income) : 0
        }));
    }

    /**
     * Tool: Fetch annual earnings (last 3 years).
     */
    static async getAnnualEarnings(symbol: string) {
        const pool = getPool();
        const upperSymbol = symbol.toUpperCase();
        const res = await pool.query(`
            SELECT period_end_date, eps_diluted, eps_basic, net_income, period_type
            FROM financial_statements
            WHERE symbol = $1 AND period_type = 'annual'
            ORDER BY period_end_date DESC
            LIMIT 3
        `, [upperSymbol]);
        return res.rows.map((r: any) => ({
            period: this.formatPeriod(r.period_end_date, 'annual'),
            period_end_date: r.period_end_date,
            eps: r.eps_diluted ? parseFloat(r.eps_diluted) : (r.eps_basic ? parseFloat(r.eps_basic) : 0),
            net_income: r.net_income ? parseFloat(r.net_income) : 0
        }));
    }

    /**
     * Tool: Fetch latest dividend details.
     */
    static async getDividendInfo(symbol: string) {
        const pool = getPool();
        const upperSymbol = symbol.toUpperCase();
        const res = await pool.query(`
            SELECT date, dividend_amount
            FROM dividend_data
            WHERE symbol = $1
            ORDER BY date DESC
            LIMIT 1
        `, [upperSymbol]);
        return res.rows[0] || { status: 'No dividend data found' };
    }

    /**
     * Legacy support: maintained for backward compatibility.
     */
    /**
     * Helper to calculate percentage growth
     */
    private static calculateGrowth(current: number, previous: number): string | null {
        if (!previous || previous === 0) return null;
        const growth = ((current - previous) / Math.abs(previous)) * 100;
        return growth.toFixed(2) + '%';
    }

    /**
     * Legacy support: maintained for backward compatibility.
     */
    /**
     * Legacy support: maintained for backward compatibility.
     */
    static async getContext(symbol: string) {
        const { fetchPKEquityPriceService } = await import('@/lib/prices/pk-equity-service');

        const [profile, history, quarterly, annual, dividend, latestPriceData] = await Promise.all([
            this.getCompanyProfile(symbol),
            this.getPriceHistoryMetrics(symbol),
            this.getQuarterlyEarnings(symbol),
            this.getAnnualEarnings(symbol),
            this.getDividendInfo(symbol),
            fetchPKEquityPriceService(symbol, false) // Fetch without forced refresh first
        ]);

        if ('error' in profile) throw new Error(profile.error);

        // Resolving the most current price:
        // Priority 1: fetchPKEquityPriceService (Real-time / Historical Data Service)
        // Priority 2: profile.price (Screener Metrics - might be stale)
        const currentPrice = latestPriceData && latestPriceData.price > 0
            ? latestPriceData.price
            : parseFloat(profile.price || 0);

        // --- Dynamic PE Calculation (Real-time) ---
        // Calculate TTM EPS from the last 4 available quarters
        // We use the already fetched 'quarterly' data which is sorted by date in the DB query usually, 
        // but we ensure sorting here just in case.
        const sortedQuarterly = [...quarterly].sort((a, b) => new Date(b.period_end_date || 0).getTime() - new Date(a.period_end_date || 0).getTime());

        let ttmEps = 0;
        if (sortedQuarterly.length > 0) {
            // Sum up to 4 recent quarters
            const last4 = sortedQuarterly.slice(0, 4);
            ttmEps = last4.reduce((sum, q) => sum + (q.eps || 0), 0);
        }

        let dynamicPe = parseFloat(profile.pe_ratio || 0); // Fallback to stale screener PE
        if (currentPrice > 0 && ttmEps > 0) {
            dynamicPe = parseFloat((currentPrice / ttmEps).toFixed(2));
        }

        // --- Growth Calculation Logic ---
        let growthContext = {
            note: "Growth metrics based on last available reported data in DB.",
            last_reported_period: sortedQuarterly.length > 0 ? sortedQuarterly[0].period : "N/A",
            last_reported_eps_qoq: "N/A",
            last_reported_eps_yoy: "N/A",
            last_reported_net_income_qoq: "N/A",
            last_reported_net_income_yoy: "N/A"
        };

        if (sortedQuarterly.length >= 1) {
            const currentQ = sortedQuarterly[0];

            // QoQ (Compare with index 1)
            if (sortedQuarterly.length >= 2) {
                const prevQ = sortedQuarterly[1];
                growthContext.last_reported_eps_qoq = this.calculateGrowth(currentQ.eps, prevQ.eps) || "N/A";
                growthContext.last_reported_net_income_qoq = this.calculateGrowth(currentQ.net_income, prevQ.net_income) || "N/A";
            }

            // YoY (Compare with index 4)
            if (sortedQuarterly.length >= 5) {
                const sameQLastYear = sortedQuarterly[4];
                growthContext.last_reported_eps_yoy = this.calculateGrowth(currentQ.eps, sameQLastYear.eps) || "N/A";
                growthContext.last_reported_net_income_yoy = this.calculateGrowth(currentQ.net_income, sameQLastYear.net_income) || "N/A";
            }
        }

        return {
            meta: {
                symbol: symbol.toUpperCase(),
                sector: profile.sector,
                current_date: new Date().toISOString().split('T')[0],
                market_cap_rank: profile.market_cap_rank ? parseInt(profile.market_cap_rank) : null
            },
            price_context: { current: currentPrice, five_two_week_high: parseFloat(history.high_52w || 0) },
            valuation_context: { company_pe: dynamicPe, sector_avg_pe: parseFloat(profile.sector_pe || 0) },
            growth_context: growthContext,
            momentum_context: {
                rsi_14: profile.rsi_14 ? parseFloat(profile.rsi_14) : null,
                ytd_return: profile.ytd_return ? parseFloat(profile.ytd_return) + '%' : null
            },
            earnings: { quarterly, annual },
            dividend_history: {
                status: dividend.date ? "Found" : "None",
                last_payment_date: dividend.date ? new Date(dividend.date).toISOString().split('T')[0] : null,
                last_payment_amount: parseFloat(dividend.dividend_amount || 0),
                yield_at_time: profile.dividend_yield ? `${parseFloat(profile.dividend_yield).toFixed(2)}%` : "0.00%"
            }
        };
    }

    /**
     * Tool: Fetch market summary (indices and heatmap top performes).
     */
    /**
     * Tool: Fetch market summary (indices and heatmap top performes).
     * @param date - YYYY-MM-DD
     * @param detailed - If true, returns deeper data for report generation
     * @param filter_sector - Optional: Return data ONLY for this sector
     * @param filter_symbols - Optional: Return data ONLY for these symbols (comma separated)
     * @param timeframe - Optional: '1D', '1W', '1M', 'YTD' (defaults to '1D')
     */
    static async getMarketSummary(date?: string, detailed: boolean = false, filter_sector?: string, filter_symbols?: string, timeframe: string = '1D') {
        // Dynamic import to avoid circular dep issues if any, though likely safe
        const { MarketHeatmapService } = await import('@/lib/market/heatmap-service');

        const targetDate = date || await MarketHeatmapService.getLatestMarketDate();
        // If filters are present, we might want a higher limit to ensure we catch the relevant stocks
        // or rely on post-fetch filtering. For now, fetch 100 to be safe.
        const limit = detailed || filter_sector || filter_symbols ? 200 : 100;
        const data = await MarketHeatmapService.getHeatmapData(targetDate, limit, timeframe);

        // Filter Logic
        let filteredStocks = data.stocks;
        let filteredSectors = data.sectors;

        if (filter_sector) {
            filteredStocks = filteredStocks.filter(s => s.sector?.toLowerCase().includes(filter_sector.toLowerCase()));
            filteredSectors = filteredSectors.filter(s => s.name.toLowerCase().includes(filter_sector.toLowerCase()));
        }

        if (filter_symbols) {
            const symbols = filter_symbols.split(',').map(s => s.trim().toUpperCase());
            filteredStocks = filteredStocks.filter(s => symbols.includes(s.symbol));
            // Keep all sectors or just relevant one? Usually if specific stocks are asked, we might still want their sector ctx.
            // But let's filter sectors to only those containing these stocks for purity.
            const relevantSectors = new Set(filteredStocks.map(s => s.sector));
            filteredSectors = filteredSectors.filter(s => relevantSectors.has(s.name));
        }

        // Summarize for AI to save tokens
        const kse100 = data.indices.find(i => i.name === 'KSE-100');

        // Group top movers (from the filtered set)
        const gainers = filteredStocks.filter(s => (s.changePercent || 0) > 0);
        const losers = filteredStocks.filter(s => (s.changePercent || 0) < 0).reverse();

        if (detailed || filter_sector || filter_symbols) {
            return {
                meta: {
                    date: targetDate,
                    timeframe: timeframe,
                    filter_applied: filter_sector ? `Sector: ${filter_sector}` : (filter_symbols ? `Symbols: ${filter_symbols}` : 'None')
                },
                market_status: kse100 ? {
                    index: 'KSE-100',
                    price: kse100.price,
                    change: kse100.change,
                    change_percent: kse100.changePercent,
                    trend: kse100.change > 0 ? 'BULLISH' : 'BEARISH'
                } : 'Index data unavailable',
                // Sector Breakdown
                sectors_performance: filteredSectors.map(s => ({
                    name: s.name,
                    change_percent: s.change.toFixed(2) + '%',
                    trend: s.change > 0 ? 'Positive' : 'Negative'
                })),
                // Stock Lists
                stocks: filteredStocks.map(s => ({
                    symbol: s.symbol,
                    price: s.price,
                    change_percent: s.changePercent?.toFixed(2) + '%',
                    sector: s.sector
                })),
                message: "Filtered market data provided."
            };
        }

        // Summary Mode (No filters, detailed=false)
        return {
            date: targetDate,
            timeframe: timeframe,
            market_status: kse100 ? {
                index: 'KSE-100',
                price: kse100.price,
                change: kse100.change,
                change_percent: kse100.changePercent,
                trend: kse100.change > 0 ? 'BULLISH' : 'BEARISH'
            } : 'Index data unavailable',
            sectors: data.sectors.slice(0, 5).map(s => `${s.name}: ${s.change.toFixed(2)}%`),
            top_gainers: gainers.slice(0, 5).map(s => `${s.symbol} (${s.changePercent?.toFixed(2)}%)`),
            top_losers: losers.slice(0, 5).map(s => `${s.symbol} (${s.changePercent?.toFixed(2)}%)`)
        };
    }

}
