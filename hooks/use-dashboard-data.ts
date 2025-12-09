import useSWR from 'swr';

// Simple fetcher for SWR
const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useMarketOverview() {
    const { data: kseData, error: kseError } = useSWR('/api/indices/price?symbol=KSE100', fetcher, { refreshInterval: 60000 });

    // Unified API often returns { symbol: 'KSE100', price: 1234, ... } OR { data: [], ... } if historical
    // The route /api/indices/price returns { symbol, price, date, source } usually.
    return {
        kse100: kseData?.price ? {
            value: kseData.price.toLocaleString(),
            // Ensure change is calculated or available. If not, use 0% or fetch generic stats.
            // Indices price route currently might NOT return 'change'. 
            // We might need to assume 0 or look for a 'change' field if added. 
            // For now, let's play safe.
            change: kseData.change ? `${kseData.change > 0 ? '+' : ''}${Number(kseData.change).toFixed(2)}%` : '--',
            isUp: (kseData.change || 0) >= 0
        } : null,
        isLoading: !kseData && !kseError,
        error: kseError
    }
}

// Fetches history. Defaults to PKR for now as per dashboard context.
export function usePortfolioStats() {
    const { data, error } = useSWR('/api/user/portfolio/history?currency=PKR', fetcher);

    const portfolio = (data && data.history && data.history.length > 0) ? (() => {
        const history = data.history;
        const latest = history[history.length - 1];
        // If history has only 1 item, previous is null
        const previous = history.length > 1 ? history[history.length - 2] : null;

        const currentVal = latest.marketValue || latest.value || 0;
        const prevVal = previous ? (previous.marketValue || previous.value || 0) : currentVal;

        // If prevVal is 0 (new portfolio), change is 0.
        const changeValue = currentVal - prevVal;
        const changePercent = prevVal > 0 ? (changeValue / prevVal) * 100 : 0;

        return {
            value: `₨ ${Math.round(currentVal).toLocaleString()}`,
            change: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
            isUp: changePercent >= 0
        };
    })() : null;

    return {
        portfolio,
        isLoading: !data && !error
    }
}

export function useOpenPositions() {
    const { data, error } = useSWR('/api/user/holdings', fetcher);
    // data should be { success: true, holdings: [...] }

    // Filter out 'cash' and zero quantity positions
    const activePositions = data?.holdings
        ? data.holdings.filter((h: any) => h.assetType !== 'cash' && h.quantity > 0)
        : [];

    return {
        count: activePositions.length,
        isLoading: !data && !error
    }
}

export function useTopMovers() {
    const { data, error } = useSWR('/api/dashboard/movers', fetcher, { refreshInterval: 60000 });

    return {
        movers: data?.success ? data.movers : [],
        isLoading: !data && !error
    }
}

export default {
    useMarketOverview,
    usePortfolioStats,
    useTopMovers,
    useOpenPositions
}
