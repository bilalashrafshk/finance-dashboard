import { getPool } from '@/lib/db';

export interface EarningsData {
    period: string;
    eps: number;
    net_income: number;
}

export interface AIContextPayload {
    meta: {
        symbol: string;
        sector: string;
        current_date: string;
    };
    price_context: {
        current: number;
        five_two_week_high: number;
    };
    valuation_context: {
        company_pe: number;
        sector_avg_pe: number;
    };
    earnings: {
        quarterly: EarningsData[];
        annual: EarningsData[];
    };
    dividend_history: {
        status: string;
        last_payment_date: string | null;
        last_payment_amount: number;
        yield_at_time: string;
    };
}

export class AIContextService {
    private static formatPeriod(dateStr: string, type: string): string {
        const date = new Date(dateStr);
        const month = date.toLocaleString('default', { month: 'short' });
        const year = date.getFullYear();
        return `${year}-${month} (${type === 'annual' ? 'Annual' : 'Quarter'})`;
    }

    static async getContext(symbol: string): Promise<AIContextPayload> {
        const pool = getPool();
        const upperSymbol = symbol.toUpperCase();

        // 1. Meta & Price & Dividends from Screener
        const profileRes = await pool.query(`
            SELECT cp.sector, sm.price, sm.dividend_yield, sm.pe_ratio, sm.sector_pe
            FROM company_profiles cp
            LEFT JOIN screener_metrics sm ON cp.symbol = sm.symbol
            WHERE cp.symbol = $1
        `, [upperSymbol]);

        const profile = profileRes.rows[0];
        if (!profile) {
            throw new Error(`Symbol ${upperSymbol} not found`);
        }

        // 2. 52 Week High
        const highRes = await pool.query(`
            SELECT MAX(high) as high_52w
            FROM historical_price_data
            WHERE symbol = $1 AND date >= NOW() - INTERVAL '1 year'
        `, [upperSymbol]);
        const high52 = highRes.rows[0]?.high_52w || 0;

        // 3. Earnings - Quarterly
        const quarterlyRes = await pool.query(`
            SELECT period_end_date, eps_diluted, eps_basic, net_income, period_type
            FROM financial_statements
            WHERE symbol = $1 AND period_type = 'quarterly'
            ORDER BY period_end_date DESC
            LIMIT 4
        `, [upperSymbol]);

        // 4. Earnings - Annual
        const annualRes = await pool.query(`
            SELECT period_end_date, eps_diluted, eps_basic, net_income, period_type
            FROM financial_statements
            WHERE symbol = $1 AND period_type = 'annual'
            ORDER BY period_end_date DESC
            LIMIT 3
        `, [upperSymbol]);

        // 5. Dividend History
        const divRes = await pool.query(`
            SELECT date, dividend_amount
            FROM dividend_data
            WHERE symbol = $1
            ORDER BY date DESC
            LIMIT 1
        `, [upperSymbol]);
        const lastDiv = divRes.rows[0];

        return {
            meta: {
                symbol: upperSymbol,
                sector: profile.sector || 'Unknown',
                current_date: new Date().toISOString().split('T')[0]
            },
            price_context: {
                current: parseFloat(profile.price || 0),
                five_two_week_high: parseFloat(high52 || 0)
            },
            valuation_context: {
                company_pe: parseFloat(profile.pe_ratio || 0),
                sector_avg_pe: parseFloat(profile.sector_pe || 0)
            },
            earnings: {
                quarterly: quarterlyRes.rows.map((r: any) => ({
                    period: this.formatPeriod(r.period_end_date, 'quarterly'),
                    eps: r.eps_diluted ? parseFloat(r.eps_diluted) : (r.eps_basic ? parseFloat(r.eps_basic) : 0),
                    net_income: r.net_income ? parseFloat(r.net_income) : 0
                })),
                annual: annualRes.rows.map((r: any) => ({
                    period: this.formatPeriod(r.period_end_date, 'annual'),
                    eps: r.eps_diluted ? parseFloat(r.eps_diluted) : (r.eps_basic ? parseFloat(r.eps_basic) : 0),
                    net_income: r.net_income ? parseFloat(r.net_income) : 0
                }))
            },
            dividend_history: {
                status: (lastDiv) ? "Irregular" : "None",
                last_payment_date: lastDiv?.date ? new Date(lastDiv.date).toISOString().split('T')[0] : null,
                last_payment_amount: lastDiv?.dividend_amount ? parseFloat(lastDiv.dividend_amount) : 0,
                yield_at_time: profile.dividend_yield ? `${parseFloat(profile.dividend_yield).toFixed(2)}%` : "0.00%"
            }
        };
    }
}
