import { getPool } from '@/lib/db';

export interface EarningsData {
    period: string;
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
            SELECT cp.sector, sm.price, sm.dividend_yield, sm.pe_ratio, sm.sector_pe
            FROM company_profiles cp
            LEFT JOIN screener_metrics sm ON cp.symbol = sm.symbol
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
    static async getContext(symbol: string) {
        const profile = await this.getCompanyProfile(symbol);
        const history = await this.getPriceHistoryMetrics(symbol);
        const quarterly = await this.getQuarterlyEarnings(symbol);
        const annual = await this.getAnnualEarnings(symbol);
        const dividend = await this.getDividendInfo(symbol);

        if ('error' in profile) throw new Error(profile.error);

        return {
            meta: { symbol: symbol.toUpperCase(), sector: profile.sector, current_date: new Date().toISOString().split('T')[0] },
            price_context: { current: parseFloat(profile.price || 0), five_two_week_high: parseFloat(history.high_52w || 0) },
            valuation_context: { company_pe: parseFloat(profile.pe_ratio || 0), sector_avg_pe: parseFloat(profile.sector_pe || 0) },
            earnings: { quarterly, annual },
            dividend_history: {
                status: dividend.date ? "Found" : "None",
                last_payment_date: dividend.date ? new Date(dividend.date).toISOString().split('T')[0] : null,
                last_payment_amount: parseFloat(dividend.dividend_amount || 0),
                yield_at_time: profile.dividend_yield ? `${parseFloat(profile.dividend_yield).toFixed(2)}%` : "0.00%"
            }
        };
    }
}
