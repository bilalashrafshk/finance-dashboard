import useSWR from 'swr';
// Simple fetcher for SWR
const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useMarketOverview() {
    const { data: kse100, error: kseError } = useSWR('/api/indices/price?symbol=KSE100', fetcher, { refreshInterval: 60000 });

    return {
        kse100: kse100?.price ? {
            value: kse100.price.toLocaleString(),
            change: kse100.change ? `${kse100.change > 0 ? '+' : ''}${kse100.change.toFixed(2)}%` : '0%',
            isUp: (kse100.change || 0) >= 0
        } : null,
        isLoading: !kse100 && !kseError,
        error: kseError
    }
}

export function usePortfolioStats() {
    const { data, error } = useSWR('/api/user/portfolio/history', fetcher);

    const portfolio = (data && data.history && data.history.length > 0) ? (() => {
        const history = data.history;
        const latest = history[history.length - 1];
        const previous = history.length > 1 ? history[history.length - 2] : null; // Compare with prev day

        // Use marketValue if available, else value
        const currentVal = latest.marketValue || latest.value || 0;
        const prevVal = previous ? (previous.marketValue || previous.value || 0) : currentVal;

        const changeValue = currentVal - prevVal;
        const changePercent = prevVal ? (changeValue / prevVal) * 100 : 0;

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

export function useTopMovers() {
    const { data, error } = useSWR('/api/dashboard/movers', fetcher, { refreshInterval: 60000 });

    return {
        movers: data?.success ? data.movers : [],
        isLoading: !data && !error
    }
}
