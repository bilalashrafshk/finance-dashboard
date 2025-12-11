export const PIE_DATA = [
    { name: 'Equities', value: 45, color: '#3b82f6' },
    { name: 'Commodities', value: 30, color: '#8b5cf6' },
    { name: 'Crypto', value: 25, color: '#f59e0b' },
];

export const PERFORMANCE_DATA = [
    { date: 'Nov 11', value: 30000 },
    { date: 'Nov 15', value: 32000 },
    { date: 'Nov 19', value: 31500 },
    { date: 'Nov 23', value: 34000 },
    { date: 'Nov 27', value: 33800 },
    { date: 'Dec 01', value: 36000 },
    { date: 'Dec 05', value: 35500 },
    { date: 'Dec 10', value: 38400 },
];

export const MARKET_CYCLE_DATA = [
    { phase: 'Accumulation', value: 20 },
    { phase: 'Markup', value: 60 },
    { phase: 'Distribution', value: 30 },
    { phase: 'Markdown', value: 10 },
];

export const SECTOR_PERFORMANCE = [
    { name: 'Tech', value: 4.5 },
    { name: 'Cement', value: 2.3 },
    { name: 'Energy', value: 1.2 },
    { name: 'Banks', value: -0.5 },
    { name: 'Textile', value: -1.8 },
];

export const SEASONALITY_DATA = [
    { month: 'Jan', avg: 4.07, obs: 7 },
    { month: 'Feb', avg: -2.16, obs: 7 },
    { month: 'Mar', avg: -3.00, obs: 6 },
    { month: 'Apr', avg: 1.58, obs: 5 },
    { month: 'May', avg: 1.81, obs: 7 },
    { month: 'Jun', avg: 4.55, obs: 7 },
    { month: 'Jul', avg: -5.92, obs: 7 },
    { month: 'Aug', avg: 2.95, obs: 7 },
    { month: 'Sep', avg: 8.88, obs: 7 },
    { month: 'Oct', avg: 10.78, obs: 8 },
    { month: 'Nov', avg: 4.36, obs: 8 },
    { month: 'Dec', avg: 5.71, obs: 7 },
];

export const HOLDINGS = [
    { id: 1, symbol: 'ETH/USDT', name: 'Ethereum', type: 'Crypto', qty: 8, price: 3362.09, dayChange: 48.57, dayChangePct: 1.47, pnl: -388.56, value: 26896.72 },
    { id: 2, symbol: 'AIRLINK', name: 'Air Link Comm', type: 'PK Equities', qty: 173, price: 175.32, dayChange: -1.31, dayChangePct: -0.74, pnl: 226.63, value: 30330.36 },
    { id: 3, symbol: 'LUCK', name: 'Lucky Cement', type: 'PK Equities', qty: 161, price: 485.92, dayChange: 9.66, dayChangePct: 2.07, pnl: 1784.66, value: 78233.12 },
    { id: 4, symbol: 'NBP', name: 'National Bank', type: 'PK Equities', qty: 138, price: 23.63, dayChange: -1.52, dayChangePct: -0.69, pnl: -209.76, value: 3260.94 },
    { id: 5, symbol: 'PTC', name: 'PTCL', type: 'PK Equities', qty: 2374, price: 48.00, dayChange: -1.57, dayChangePct: -3.17, pnl: -3727.18, value: 113952.00 },
];

export const TRANSACTIONS = [
    { id: 1, date: 'Dec 10, 2025', type: 'BUY', asset: 'PK Equities', symbol: 'LUCK', amount: 14627.97, notes: 'Strategy Rebalance' },
    { id: 2, date: 'Dec 08, 2025', type: 'ADD', asset: 'Cash', symbol: 'PKR', amount: 22292.00, notes: 'Deposit' },
    { id: 3, date: 'Nov 27, 2025', type: 'BUY', asset: 'PK Equities', symbol: 'AIRLINK', amount: 5655.00, notes: 'Dip buy' },
];

export const SCREENER_RESULTS = [
    { symbol: '786', name: '786 Investments', sector: 'Financials', price: 12.66, pe: 4.69, mcap: '189.52M' },
    { symbol: 'ADAMS', name: 'Adam Sugar Mills', sector: 'Food', price: 73.00, pe: 5.10, mcap: '1.2B' },
    { symbol: 'AGHA', name: 'Agha Steel', sector: 'Materials', price: 10.50, pe: -2.3, mcap: '8.4B' },
    { symbol: 'AICL', name: 'Adamjee Insurance', sector: 'Insurance', price: 38.01, pe: 6.09, mcap: '12.8B' },
];

export const FINANCIALS_DATA = {
    overview: [
        { label: 'Sector', value: 'Unknown', type: 'text' },
        { label: 'Market Cap', value: '189.07M', type: 'text' },
        { label: 'Shares Outstanding', value: '14.97M', type: 'text' },
        { label: 'Face Value', value: '10.00', type: 'number' },
        { label: 'Latest Revenue', value: '26.04M', type: 'number' },
        { label: 'Latest Net Income', value: '12.77M', type: 'number' },
        { label: 'EPS (Diluted)', value: '0.8500', type: 'number' },
        { label: 'Free Cash Flow', value: '-4.34M', type: 'negative' },
    ]
};
