import React, { useState, useMemo } from 'react';
import {
    LayoutDashboard,
    PieChart as PieChartIcon,
    BarChart2,
    List,
    Filter,
    Search,
    Bell,
    User,
    ChevronRight,
    ArrowUpRight,
    ArrowDownRight,
    TrendingUp,
    Activity,
    DollarSign,
    Briefcase,
    Calendar,
    Layers,
    Maximize2,
    Menu,
    X,
    ChevronDown,
    Globe,
    Zap,
    CalendarDays,
    Clock,
    Download
} from 'lucide-react';
import {
    LineChart,
    Line,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Pie,
    Cell,
    Bar,
    BarChart,
    ComposedChart,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar,
    Legend,
    PieChart
} from 'recharts';

/**
 * MOCK DATA & CONSTANTS
 * ---------------------
 */

const COLORS = {
    primary: '#3b82f6', // Blue-500
    success: '#10b981', // Emerald-500
    danger: '#f43f5e',  // Rose-500
    warning: '#f59e0b', // Amber-500
    slate: '#64748b',   // Slate-500
    dark: '#0f172a',    // Slate-900
    card: '#1e293b',    // Slate-800
};

const PIE_DATA = [
    { name: 'Equities', value: 45, color: '#3b82f6' },
    { name: 'Commodities', value: 30, color: '#8b5cf6' },
    { name: 'Crypto', value: 25, color: '#f59e0b' },
];

const PERFORMANCE_DATA = [
    { date: 'Nov 11', value: 30000 },
    { date: 'Nov 15', value: 32000 },
    { date: 'Nov 19', value: 31500 },
    { date: 'Nov 23', value: 34000 },
    { date: 'Nov 27', value: 33800 },
    { date: 'Dec 01', value: 36000 },
    { date: 'Dec 05', value: 35500 },
    { date: 'Dec 10', value: 38400 },
];

const MARKET_CYCLE_DATA = [
    { phase: 'Accumulation', value: 20 },
    { phase: 'Markup', value: 60 },
    { phase: 'Distribution', value: 30 },
    { phase: 'Markdown', value: 10 },
];

const SECTOR_PERFORMANCE = [
    { name: 'Tech', value: 4.5 },
    { name: 'Cement', value: 2.3 },
    { name: 'Energy', value: 1.2 },
    { name: 'Banks', value: -0.5 },
    { name: 'Textile', value: -1.8 },
];

const UPCOMING_EVENTS = [
    { id: 1, event: 'CPI Inflation Data', date: 'Dec 12', impact: 'High' },
    { id: 2, event: 'Fed Interest Rate', date: 'Dec 14', impact: 'High' },
    { id: 3, event: 'Tech Earnings (AAPL)', date: 'Dec 15', impact: 'Medium' },
];

const TOP_GAINERS = [
    { symbol: 'TRG', change: '+7.5%', price: '85.4' },
    { symbol: 'SYS', change: '+5.2%', price: '420.1' },
    { symbol: 'AVN', change: '+4.8%', price: '65.2' },
];

const SEASONALITY_DATA = [
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

const HOLDINGS = [
    { id: 1, symbol: 'ETH/USDT', name: 'Ethereum', type: 'Crypto', qty: 8, price: 3362.09, dayChange: 48.57, dayChangePct: 1.47, pnl: -388.56, value: 26896.72 },
    { id: 2, symbol: 'AIRLINK', name: 'Air Link Comm', type: 'PK Equities', qty: 173, price: 175.32, dayChange: -1.31, dayChangePct: -0.74, pnl: 226.63, value: 30330.36 },
    { id: 3, symbol: 'LUCK', name: 'Lucky Cement', type: 'PK Equities', qty: 161, price: 485.92, dayChange: 9.66, dayChangePct: 2.07, pnl: 1784.66, value: 78233.12 },
    { id: 4, symbol: 'NBP', name: 'National Bank', type: 'PK Equities', qty: 138, price: 23.63, dayChange: -1.52, dayChangePct: -0.69, pnl: -209.76, value: 3260.94 },
    { id: 5, symbol: 'PTC', name: 'PTCL', type: 'PK Equities', qty: 2374, price: 48.00, dayChange: -1.57, dayChangePct: -3.17, pnl: -3727.18, value: 113952.00 },
];

const TRANSACTIONS = [
    { id: 1, date: 'Dec 10, 2025', type: 'BUY', asset: 'PK Equities', symbol: 'LUCK', amount: 14627.97, notes: 'Strategy Rebalance' },
    { id: 2, date: 'Dec 08, 2025', type: 'ADD', asset: 'Cash', symbol: 'PKR', amount: 22292.00, notes: 'Deposit' },
    { id: 3, date: 'Nov 27, 2025', type: 'BUY', asset: 'PK Equities', symbol: 'AIRLINK', amount: 5655.00, notes: 'Dip buy' },
];

const SCREENER_RESULTS = [
    { symbol: '786', name: '786 Investments', sector: 'Financials', price: 12.66, pe: 4.69, mcap: '189.52M' },
    { symbol: 'ADAMS', name: 'Adam Sugar Mills', sector: 'Food', price: 73.00, pe: 5.10, mcap: '1.2B' },
    { symbol: 'AGHA', name: 'Agha Steel', sector: 'Materials', price: 10.50, pe: -2.3, mcap: '8.4B' },
    { symbol: 'AICL', name: 'Adamjee Insurance', sector: 'Insurance', price: 38.01, pe: 6.09, mcap: '12.8B' },
];

const FINANCIALS_DATA = {
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

/**
 * REUSABLE COMPONENTS
 * -------------------
 */

const Card = ({ children, className = "", noPadding = false }) => (
    <div className={`bg-slate-800/50 backdrop-blur-md border border-slate-700/50 rounded-xl overflow-hidden shadow-sm ${className}`}>
        <div className={noPadding ? "" : "p-5"}>
            {children}
        </div>
    </div>
);

const Badge = ({ children, type = 'neutral', className = "" }) => {
    const styles = {
        neutral: 'bg-slate-700 text-slate-300',
        success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
        danger: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
        warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
        primary: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    };
    return (
        <span className={`px-2.5 py-0.5 rounded text-xs font-medium ${styles[type]} ${className}`}>
            {children}
        </span>
    );
};

const StatCard = ({ title, value, subtext, trend, trendValue, icon: Icon }) => (
    <Card>
        <div className="flex justify-between items-start mb-2">
            <span className="text-slate-400 text-sm font-medium">{title}</span>
            {Icon && <Icon className="w-4 h-4 text-slate-500" />}
        </div>
        <div className="flex items-baseline gap-2 mb-1">
            <h3 className="text-2xl font-bold text-white">{value}</h3>
        </div>
        <div className="flex items-center gap-2">
            {trend && (
                <span className={`flex items-center text-xs font-medium ${trend === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {trend === 'up' ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                    {trendValue}
                </span>
            )}
            {subtext && <span className="text-xs text-slate-500">{subtext}</span>}
        </div>
    </Card>
);

const SectionHeader = ({ title, subtitle, action }) => (
    <div className="flex justify-between items-end mb-6">
        <div>
            <h2 className="text-2xl font-bold text-white">{title}</h2>
            {subtitle && <p className="text-slate-400 text-sm mt-1">{subtitle}</p>}
        </div>
        {action}
    </div>
);

/**
 * PAGE VIEWS
 * ----------
 */

// 1. DASHBOARD VIEW
const DashboardView = ({ onNavigate }) => {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Top Ticker Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard
                    title="KSE-100"
                    value="78,461.32"
                    trend="up"
                    trendValue="+0.68%"
                    subtext="Market Open"
                    icon={Activity}
                />

                {/* Customized Portfolio Alpha Card */}
                <Card>
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-slate-400 text-sm font-medium">Portfolio Alpha</span>
                        <Briefcase className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="mb-2">
                        <h3 className="text-2xl font-bold text-white">$106,302</h3>
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">vs KSE-100</span>
                            <span className="text-emerald-400 font-medium">+12.4%</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">vs S&P 500</span>
                            <span className="text-emerald-400 font-medium">+5.2%</span>
                        </div>
                    </div>
                </Card>

                <StatCard
                    title="Global Markets (S&P)"
                    value="5,842.10"
                    trend="up"
                    trendValue="+0.12%"
                    subtext="Bullish Trend"
                    icon={Globe}
                />
                <StatCard
                    title="ETH Risk Meter"
                    value="42/100"
                    subtext="Neutral - Caution"
                    icon={Activity}
                    trend="down"
                    trendValue="-2 pts"
                />
            </div>

            {/* Main Chart Area (Hero) */}
            <Card className="min-h-[400px]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Activity className="w-5 h-5 text-blue-500" />
                        Market Intelligence Hub
                    </h3>
                    <div className="flex gap-2">
                        {['1D', '1W', '1M', '3M', '1Y'].map(tf => (
                            <button key={tf} className={`text-xs px-3 py-1 rounded-full ${tf === '1M' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                                {tf}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={PERFORMANCE_DATA}>
                            <defs>
                                <linearGradient id="colorValDashboard" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                            <XAxis
                                dataKey="date"
                                stroke="#94a3b8"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="#94a3b8"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(val) => `$${val / 1000}k`}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                                itemStyle={{ color: '#3b82f6' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="value"
                                stroke="#3b82f6"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorValDashboard)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            {/* Market Indicators Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <h4 className="text-sm font-medium text-slate-400 mb-4">Sector Rotation (Weekly)</h4>
                    <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={SECTOR_PERFORMANCE} layout="vertical">
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={80} tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
                                <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: '#1e293b', border: 'none' }} />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                    {SECTOR_PERFORMANCE.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.value > 0 ? '#10b981' : '#f43f5e'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                <Card>
                    <h4 className="text-sm font-medium text-slate-400 mb-4">Market Cycle Phase</h4>
                    <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={MARKET_CYCLE_DATA}>
                                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                    {MARKET_CYCLE_DATA.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={index === 1 ? '#8b5cf6' : '#334155'} />
                                    ))}
                                </Bar>
                                <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: '#1e293b', border: 'none' }} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="text-center mt-2">
                        <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Markup Phase</span>
                    </div>
                </Card>

                <Card>
                    <h4 className="text-sm font-medium text-slate-400 mb-4">Real Interest Rates</h4>
                    <div className="flex items-end gap-2 h-[200px] pb-2">
                        {[1, 3, 5, 2, 4, 6, 8, 5, 3].map((h, i) => (
                            <div key={i} className="flex-1 bg-gradient-to-t from-orange-500/20 to-orange-500 rounded-t-sm" style={{ height: `${h * 10}%` }}></div>
                        ))}
                    </div>
                    <div className="flex justify-between items-center mt-1">
                        <span className="text-xs text-slate-500">Real Rates</span>
                        <Badge type="success">Positive (+350bps)</Badge>
                    </div>
                </Card>
            </div>
        </div>
    );
};

// 2. PORTFOLIO VIEW
const PortfolioView = () => {
    const [activeTab, setActiveTab] = useState('overview');

    return (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <SectionHeader title="Portfolio Management" subtitle="Track assets, performance and transactions."
                action={
                    <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm">
                        <ArrowDownRight className="w-4 h-4" /> Add Transaction
                    </button>
                }
            />

            {/* Tabs */}
            <div className="flex border-b border-slate-700 mb-6 overflow-x-auto">
                {['overview', 'pkr_portfolio', 'usd_portfolio', 'transactions'].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-6 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === tab
                            ? 'border-blue-500 text-blue-400'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        {tab.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                    </button>
                ))}
            </div>

            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* Main Portfolio Value Chart (Moved here) */}
                    <Card>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                <Activity className="w-5 h-5 text-blue-500" />
                                Portfolio Performance
                            </h3>
                            <div className="flex gap-2">
                                {['1D', '1W', '1M', '3M', '1Y'].map(tf => (
                                    <button key={tf} className={`text-xs px-3 py-1 rounded-full ${tf === '1M' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                                        {tf}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={PERFORMANCE_DATA}>
                                    <defs>
                                        <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        stroke="#94a3b8"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        stroke="#94a3b8"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(val) => `$${val / 1000}k`}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                                        itemStyle={{ color: '#3b82f6' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="value"
                                        stroke="#3b82f6"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorVal)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    {/* Portfolio Allocation & Stats */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Card className="lg:col-span-1">
                            <h3 className="text-lg font-semibold text-white mb-4">Asset Allocation</h3>
                            <div className="h-[200px] w-full relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={PIE_DATA}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {PIE_DATA.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-xs text-slate-400">Total</span>
                                    <span className="text-xl font-bold text-white">100%</span>
                                </div>
                            </div>
                            <div className="mt-4 space-y-3">
                                {PIE_DATA.map((item) => (
                                    <div key={item.name} className="flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                                            <span className="text-slate-300">{item.name}</span>
                                        </div>
                                        <span className="font-semibold text-white">{item.value}%</span>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-t-4 border-t-blue-500">
                                <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Total Value</span>
                                <div className="text-3xl font-bold text-white mt-2">$106,302.28</div>
                                <div className="mt-2 flex items-center text-emerald-400 text-sm font-medium">
                                    <TrendingUp className="w-4 h-4 mr-1" /> +7.87% <span className="text-slate-500 ml-1">All time</span>
                                </div>
                            </Card>
                            <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-t-4 border-t-emerald-500">
                                <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Total Return</span>
                                <div className="text-3xl font-bold text-emerald-400 mt-2">$7,754.21</div>
                                <div className="mt-2 flex items-center text-emerald-400 text-sm font-medium">
                                    +7.87%
                                </div>
                            </Card>
                            <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-t-4 border-t-purple-500">
                                <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Today's PnL</span>
                                <div className="text-3xl font-bold text-emerald-400 mt-2">+$421.79</div>
                            </Card>
                            <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-t-4 border-t-amber-500">
                                <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Best Performer</span>
                                <div className="flex justify-between items-center mt-2">
                                    <div className="font-bold text-white text-lg">ETH/USDT</div>
                                    <Badge type="success">+44.05%</Badge>
                                </div>
                                <div className="text-emerald-400 text-sm mt-1">+$7,696.72</div>
                            </Card>
                        </div>
                    </div>

                    {/* Holdings Table */}
                    <Card noPadding>
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                            <h3 className="font-semibold text-white">Current Holdings</h3>
                            <button className="text-xs text-blue-400">View All</button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-900/50 text-slate-400 font-medium">
                                    <tr>
                                        <th className="px-5 py-3">Asset</th>
                                        <th className="px-5 py-3">Price</th>
                                        <th className="px-5 py-3">Qty</th>
                                        <th className="px-5 py-3">Total Value</th>
                                        <th className="px-5 py-3">Day Change</th>
                                        <th className="px-5 py-3 text-right">Day PnL</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700/50">
                                    {HOLDINGS.map((asset) => (
                                        <tr key={asset.id} className="hover:bg-slate-700/20 transition-colors group cursor-pointer">
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs
                            ${asset.type === 'Crypto' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                                        {asset.symbol.substring(0, 2)}
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold text-slate-200">{asset.symbol}</div>
                                                        <div className="text-xs text-slate-500">{asset.name}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 font-mono text-slate-300">
                                                {asset.symbol.includes('USDT') ? '$' : 'Rs.'}
                                                {asset.price.toLocaleString()}
                                            </td>
                                            <td className="px-5 py-4 text-slate-400">{asset.qty}</td>
                                            <td className="px-5 py-4 font-medium text-white">
                                                {asset.symbol.includes('USDT') ? '$' : 'Rs.'}
                                                {asset.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className={`flex flex-col ${asset.dayChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    <span className="font-medium">{asset.dayChange >= 0 ? '+' : ''}{asset.dayChange}</span>
                                                    <span className="text-xs opacity-75">{asset.dayChangePct}%</span>
                                                </div>
                                            </td>
                                            <td className={`px-5 py-4 text-right font-bold ${asset.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {asset.pnl >= 0 ? '+' : ''}{asset.pnl.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    {/* Performance Metrics */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card>
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="font-semibold text-white">Performance Metrics</h3>
                                <Badge type="primary">Live</Badge>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                                <div>
                                    <div className="text-slate-400 text-xs mb-1">CAGR</div>
                                    <div className="text-xl font-bold text-emerald-400">+820.87%</div>
                                </div>
                                <div>
                                    <div className="text-slate-400 text-xs mb-1">Max Drawdown</div>
                                    <div className="text-xl font-bold text-rose-400">99.69%</div>
                                </div>
                                <div>
                                    <div className="text-slate-400 text-xs mb-1">Volatility</div>
                                    <div className="text-xl font-bold text-blue-400">+267.29%</div>
                                </div>
                                <div>
                                    <div className="text-slate-400 text-xs mb-1">Sharpe Ratio</div>
                                    <div className="text-xl font-bold text-emerald-400">0.85</div>
                                </div>
                                <div>
                                    <div className="text-slate-400 text-xs mb-1">Beta</div>
                                    <div className="text-xl font-bold text-purple-400">62.69</div>
                                </div>
                            </div>
                        </Card>

                        <Card>
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="font-semibold text-white">Portfolio Highlights</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                                    <div className="text-xs text-emerald-300/70 mb-1">Best Day</div>
                                    <div className="text-lg font-bold text-emerald-400">+$1,323.20</div>
                                    <div className="text-xs text-slate-500">Jul 2, 2025</div>
                                </div>
                                <div className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/10">
                                    <div className="text-xs text-rose-300/70 mb-1">Worst Day</div>
                                    <div className="text-lg font-bold text-rose-400">-$886.08</div>
                                    <div className="text-xs text-slate-500">Jan 21, 2025</div>
                                </div>
                                <div className="p-3 rounded-lg bg-slate-700/20 border border-slate-700/50">
                                    <div className="text-xs text-slate-400 mb-1">Winning Days</div>
                                    <div className="text-lg font-bold text-white">43%</div>
                                </div>
                                <div className="p-3 rounded-lg bg-slate-700/20 border border-slate-700/50">
                                    <div className="text-xs text-slate-400 mb-1">Avg Daily Return</div>
                                    <div className="text-lg font-bold text-emerald-400">0.14%</div>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            )}

            {activeTab === 'transactions' && (
                <Card noPadding>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-900/50 text-slate-400 font-medium">
                                <tr>
                                    <th className="px-5 py-3">Date</th>
                                    <th className="px-5 py-3">Type</th>
                                    <th className="px-5 py-3">Asset</th>
                                    <th className="px-5 py-3">Symbol</th>
                                    <th className="px-5 py-3 text-right">Total Amount</th>
                                    <th className="px-5 py-3">Notes</th>
                                    <th className="px-5 py-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                                {TRANSACTIONS.map(tx => (
                                    <tr key={tx.id} className="hover:bg-slate-700/20">
                                        <td className="px-5 py-4 text-slate-300">{tx.date}</td>
                                        <td className="px-5 py-4">
                                            <Badge type={tx.type === 'BUY' || tx.type === 'ADD' ? 'success' : 'neutral'}>{tx.type}</Badge>
                                        </td>
                                        <td className="px-5 py-4 text-slate-400">{tx.asset}</td>
                                        <td className="px-5 py-4 font-medium text-white">{tx.symbol}</td>
                                        <td className={`px-5 py-4 text-right font-mono font-medium ${tx.type === 'BUY' || tx.type === 'ADD' ? 'text-emerald-400' : 'text-white'}`}>
                                            {tx.type === 'ADD' ? '+' : ''}{tx.amount.toLocaleString()}
                                        </td>
                                        <td className="px-5 py-4 text-slate-500 italic max-w-xs truncate">{tx.notes}</td>
                                        <td className="px-5 py-4 text-center">
                                            <button className="text-slate-400 hover:text-white"><List className="w-4 h-4" /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
};

// 3. SCREENER VIEW
const ScreenerView = ({ onSelectAsset }) => {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* ... existing code ... */}
            <SectionHeader title="Value Hunter Screener" subtitle="Find undervalued companies relative to their sector peers." />

            {/* Filters */}
            <Card>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="md:col-span-1">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Search</label>
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Search symbol, name..."
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Asset Class</label>
                        <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white flex justify-between items-center cursor-pointer">
                            <span>PK Equities</span>
                            <ChevronDown className="w-4 h-4 text-slate-500" />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Sector</label>
                        <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white flex justify-between items-center cursor-pointer">
                            <span>All Sectors</span>
                            <ChevronDown className="w-4 h-4 text-slate-500" />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Industry</label>
                        <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white flex justify-between items-center cursor-pointer">
                            <span>All Industries</span>
                            <ChevronDown className="w-4 h-4 text-slate-500" />
                        </div>
                    </div>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-700 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {['P/E Ratio', 'Relative P/E', 'Market Cap (PKR)', 'Price (PKR)'].map((label) => (
                        <div key={label}>
                            <label className="text-xs font-semibold text-slate-400 mb-2 block">{label}</label>
                            <div className="flex gap-2">
                                <input type="text" placeholder="Min" className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white" />
                                <input type="text" placeholder="Max" className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white" />
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            {/* Results Table */}
            <Card noPadding>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-900/50 text-slate-400 font-medium">
                            <tr>
                                <th className="px-5 py-3">Symbol</th>
                                <th className="px-5 py-3">Name</th>
                                <th className="px-5 py-3">Sector</th>
                                <th className="px-5 py-3">Price</th>
                                <th className="px-5 py-3">P/E</th>
                                <th className="px-5 py-3">Market Cap</th>
                                <th className="px-5 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {SCREENER_RESULTS.map((stock) => (
                                <tr key={stock.symbol} className="hover:bg-slate-700/20 group cursor-pointer" onClick={() => onSelectAsset(stock)}>
                                    <td className="px-5 py-4 font-bold text-blue-400">{stock.symbol}</td>
                                    <td className="px-5 py-4 text-white">{stock.name}</td>
                                    <td className="px-5 py-4 text-slate-400">
                                        <Badge>{stock.sector}</Badge>
                                    </td>
                                    <td className="px-5 py-4 text-emerald-400 font-mono">Rs. {stock.price}</td>
                                    <td className="px-5 py-4 text-slate-300">{stock.pe}</td>
                                    <td className="px-5 py-4 text-slate-300">{stock.mcap}</td>
                                    <td className="px-5 py-4 text-right">
                                        <button className="opacity-0 group-hover:opacity-100 bg-blue-600 hover:bg-blue-700 text-white p-1.5 rounded transition-all">
                                            <ArrowUpRight className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

// 4. CHARTS VIEW
const ChartsView = () => {
    return (
        <div className="flex flex-col lg:flex-row h-[calc(100vh-100px)] gap-6 animate-in fade-in zoom-in-95 duration-300">
            {/* Sidebar */}
            <Card className="w-full lg:w-64 flex-shrink-0" noPadding>
                <div className="p-4 border-b border-slate-700">
                    <h3 className="font-bold text-white">Categories</h3>
                </div>
                <div className="p-2 space-y-1">
                    {['PK Stocks', 'Crypto', 'US Stocks', 'Portfolio', 'Macros'].map((cat, i) => (
                        <button key={cat} className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-between group ${i === 0 ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
                            {cat}
                            <ChevronRight className={`w-4 h-4 ${i === 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`} />
                        </button>
                    ))}
                </div>
            </Card>

            {/* Main Chart Area */}
            <div className="flex-1 overflow-y-auto space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {['KSE100 Market Cycle', 'Market Heatmap', 'Advance-Decline Line', 'Sector Rotation', 'Interest Rate Parity'].map((chart) => (
                        <Card key={chart} className="group hover:ring-2 hover:ring-blue-500/50 transition-all cursor-pointer">
                            <div className="h-32 bg-slate-900/50 rounded mb-4 flex items-center justify-center relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <TrendingUp className="w-8 h-8 text-slate-600 group-hover:text-blue-500 transition-colors" />
                            </div>
                            <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors">{chart}</h3>
                            <p className="text-xs text-slate-500 mt-1">Real-time analysis...</p>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
};


// 5. ASSET DETAIL VIEW
const AssetDetailView = ({ asset, onBack }) => {
    const [detailTab, setDetailTab] = useState('Seasonality');
    const [financialsTab, setFinancialsTab] = useState('Overview');

    return (
        <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <button onClick={onBack} className="flex items-center text-slate-400 hover:text-white mb-4 transition-colors">
                <ChevronRight className="w-4 h-4 rotate-180 mr-1" /> Back to Screener
            </button>

            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">{asset.name}</h1>
                    <div className="flex items-center gap-3">
                        <span className="text-xl text-blue-400 font-mono">{asset.symbol}</span>
                        <Badge type="neutral">PK Equities</Badge>
                        <Badge type="neutral">{asset.sector}</Badge>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-3xl font-bold text-emerald-400">Rs. {asset.price}</div>
                    <div className="text-sm text-emerald-500 font-medium">+4.5% Today</div>
                </div>
            </div>

            {/* Detail Tabs */}
            <div className="border-b border-slate-700">
                {['Analytics', 'Financials', 'Dividends', 'Prices & Ratios', 'Seasonality'].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setDetailTab(tab)}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${detailTab === tab ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {detailTab === 'Seasonality' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                        <Card>
                            <h3 className="font-bold text-white mb-4">Monthly Seasonality</h3>
                            <p className="text-slate-400 text-sm mb-6">Average returns by month - helps detect recurring patterns.</p>

                            <div className="space-y-1">
                                {SEASONALITY_DATA.map((item) => (
                                    <div key={item.month} className="grid grid-cols-12 gap-4 items-center p-2 rounded hover:bg-slate-700/30">
                                        <div className="col-span-2 font-medium text-slate-300">{item.month}</div>
                                        <div className="col-span-8 relative h-6 bg-slate-900 rounded-full overflow-hidden">
                                            {/* Bar visualization centering on 0 */}
                                            <div
                                                className={`absolute top-0 bottom-0 ${item.avg >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                                style={{
                                                    left: item.avg >= 0 ? '50%' : `${50 - Math.abs(item.avg) * 3}%`,
                                                    width: `${Math.abs(item.avg) * 3}%`,
                                                    opacity: 0.8
                                                }}
                                            ></div>
                                            <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-slate-600"></div>
                                        </div>
                                        <div className={`col-span-2 text-right font-mono text-sm ${item.avg >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {item.avg > 0 ? '+' : ''}{item.avg}%
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>
                    <div className="space-y-6">
                        <Card>
                            <h4 className="text-slate-400 text-xs uppercase tracking-wider mb-4">Summary Stats</h4>
                            <div className="space-y-4">
                                <div className="flex justify-between border-b border-slate-700 pb-2">
                                    <span className="text-slate-300 text-sm">P/E Ratio</span>
                                    <span className="text-white font-mono">{asset.pe}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-700 pb-2">
                                    <span className="text-slate-300 text-sm">Market Cap</span>
                                    <span className="text-white font-mono">{asset.mcap}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-700 pb-2">
                                    <span className="text-slate-300 text-sm">Beta</span>
                                    <span className="text-white font-mono">1.12</span>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            )}

            {detailTab === 'Analytics' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard title="Current Price" value={`Rs ${asset.price}`} trend="up" trendValue="+2.1%" />
                    <StatCard title="P/E Ratio" value={asset.pe} subtext="Sector Avg: 6.2" />
                    <StatCard title="YTD Return" value="+48.59%" trend="up" trendValue="High" />
                    <StatCard title="1-Year CAGR" value="+75.35%" trend="up" trendValue="Alpha" />
                </div>
            )}

            {detailTab === 'Financials' && (
                <div className="space-y-6">
                    {/* Financials Sub-Tabs */}
                    <div className="flex space-x-2 bg-slate-900/50 p-1 rounded-lg w-fit">
                        {['Overview', 'Ratios', 'Detailed Statements'].map((subTab) => (
                            <button
                                key={subTab}
                                onClick={() => setFinancialsTab(subTab)}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${financialsTab === subTab
                                    ? 'bg-slate-700 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                    }`}
                            >
                                {subTab}
                            </button>
                        ))}
                    </div>

                    {financialsTab === 'Overview' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {FINANCIALS_DATA.overview.map((item, index) => (
                                <Card key={index} className="flex flex-col justify-center">
                                    <span className="text-slate-400 text-sm mb-1">{item.label}</span>
                                    <span className={`text-xl font-bold ${item.type === 'negative' ? 'text-rose-400' : 'text-white'}`}>
                                        {item.value}
                                    </span>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {detailTab === 'Dividends' && (
                <Card className="flex flex-col items-center justify-center min-h-[300px]">
                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-4">
                        <DollarSign className="w-6 h-6 text-slate-500" />
                    </div>
                    <p className="text-slate-400 font-medium">No dividend data available for this asset</p>
                </Card>
            )}
        </div>
    );
};

// 6. MAIN LAYOUT & APP
const App = () => {
    const [view, setView] = useState('dashboard'); // dashboard, charts, portfolio, list, screener
    const [selectedAsset, setSelectedAsset] = useState(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const handleAssetSelect = (asset) => {
        setSelectedAsset(asset);
        setView('assetDetail');
    };

    const renderView = () => {
        switch (view) {
            case 'dashboard': return <DashboardView onNavigate={setView} />;
            case 'portfolio': return <PortfolioView />;
            case 'charts': return <ChartsView />;
            case 'screener': return <ScreenerView onSelectAsset={handleAssetSelect} />;
            case 'assetDetail': return <AssetDetailView asset={selectedAsset || SCREENER_RESULTS[0]} onBack={() => setView('screener')} />;
            default: return <DashboardView onNavigate={setView} />;
        }
    };

    const NavItem = ({ id, label, icon: Icon }) => (
        <button
            onClick={() => { setView(id); setMobileMenuOpen(false); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${view === id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
        >
            <Icon className="w-4 h-4" />
            {label}
        </button>
    );

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
            {/* Top Navigation Bar */}
            <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    {/* Logo */}
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('dashboard')}>
                        <div className="bg-blue-600 p-1.5 rounded-lg">
                            <TrendingUp className="w-5 h-5 text-white" />
                        </div>
                        <div className="font-bold text-xl tracking-tight text-white hidden sm:block">
                            CONVICTION <span className="text-blue-500">PLAY</span>
                        </div>
                    </div>

                    {/* Desktop Nav */}
                    <nav className="hidden md:flex items-center gap-1">
                        <NavItem id="dashboard" label="Dashboard" icon={LayoutDashboard} />
                        <NavItem id="charts" label="Charts" icon={BarChart2} />
                        <NavItem id="portfolio" label="Portfolio" icon={PieChartIcon} />
                        <NavItem id="screener" label="Screener" icon={Filter} />
                    </nav>

                    {/* Right Actions */}
                    <div className="flex items-center gap-4">
                        {/* Search (Collapsed on mobile) */}
                        <div className="hidden lg:flex relative">
                            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Search..."
                                className="bg-slate-800 border-none rounded-full pl-9 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-blue-500 w-48 transition-all hover:bg-slate-700"
                            />
                        </div>

                        <button className="relative text-slate-400 hover:text-white transition-colors">
                            <Bell className="w-5 h-5" />
                            <span className="absolute top-0 right-0 w-2 h-2 bg-rose-500 rounded-full"></span>
                        </button>

                        <div className="flex items-center gap-2 pl-4 border-l border-slate-800">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white cursor-pointer hover:ring-2 hover:ring-offset-2 hover:ring-offset-slate-900 hover:ring-blue-500 transition-all">
                                B
                            </div>
                            <span className="text-sm font-medium text-white hidden sm:block">Bilal</span>
                        </div>

                        {/* Mobile Menu Button */}
                        <button className="md:hidden text-slate-400" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                            {mobileMenuOpen ? <X /> : <Menu />}
                        </button>
                    </div>
                </div>

                {/* Mobile Nav Dropdown */}
                {mobileMenuOpen && (
                    <div className="md:hidden border-t border-slate-800 bg-slate-900 p-4 space-y-2 animate-in slide-in-from-top-2">
                        <NavItem id="dashboard" label="Dashboard" icon={LayoutDashboard} />
                        <NavItem id="charts" label="Charts" icon={BarChart2} />
                        <NavItem id="portfolio" label="Portfolio" icon={PieChartIcon} />
                        <NavItem id="screener" label="Screener" icon={Filter} />
                    </div>
                )}
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 py-8 pb-20">
                {renderView()}
            </main>
        </div>
    );
};

export default App;