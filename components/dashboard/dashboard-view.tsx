"use client";

import React, { useState } from 'react';
import {
    LineChart,
    Shield,
    Zap,
    Search,
    BarChart3,
    TrendingUp,
    Globe,
    Activity,
    PieChart,
    ChevronRight,
    ArrowUpRight,
    ArrowDownRight,
    Bell
} from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';

// --- Mock Data ---
const PORTFOLIO_DATA = [
    { name: 'KSE-100', value: '41,240', change: '+1.2%', isUp: true },
    { name: 'Portfolio', value: '₨ 2.4M', change: '+3.5%', isUp: true },
    { name: 'Open Pos', value: '8', change: '-1', isUp: false },
];

const WATCHLIST = [
    { sym: 'OGDC', price: '118.50', change: '+2.4%', vol: 'High' },
    { sym: 'TRG', price: '94.20', change: '-1.1%', vol: 'Med' },
    { sym: 'LUCK', price: '640.00', change: '+0.5%', vol: 'Low' },
    { sym: 'SYS', price: '420.15', change: '+1.8%', vol: 'High' },
];

const DashboardHeader = () => {
    const { user } = useAuth();

    return (
        <header className="h-20 bg-slate-950/80 backdrop-blur-sm border-b border-white/5 flex items-center justify-between px-8 sticky top-0 z-40">
            <div className="flex items-center gap-4 text-slate-400">
                <span className="text-sm">Last Updated: <span className="text-white font-mono">14:32 PKT</span></span>
            </div>

            <div className="flex items-center gap-6">
                <div className="relative hidden md:block">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input
                        type="text"
                        placeholder="Search ticker, company..."
                        className="bg-slate-900 border border-white/10 rounded-full pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 w-64 transition-all"
                    />
                </div>
                <button className="relative text-slate-400 hover:text-white transition-colors">
                    <Bell size={20} />
                    <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
                </button>
                <div className="h-8 w-px bg-white/10 mx-2"></div>
                {/* User profile is handled by SharedNavbar, but we can keep a minimal indicator or remove it if redundant. 
          The user wanted to keep the existing navbar, so this header acts as a sub-header/toolbar.
       */}
            </div>
        </header>
    )
};

const WidgetCard = ({ title, children, icon: Icon, action }: { title: string, children: React.ReactNode, icon: any, action?: string }) => (
    <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-colors group">
        <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-white group-hover:bg-blue-600 transition-all duration-300">
                    <Icon size={20} />
                </div>
                <h3 className="font-semibold text-white">{title}</h3>
            </div>
            {action && (
                <button className="text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1">
                    {action} <ChevronRight size={14} />
                </button>
            )}
        </div>
        {children}
    </div>
);

export const DashboardView = () => {
    return (
        <div className="transition-all duration-300 bg-slate-950 min-h-screen">
            <DashboardHeader />

            <main className="p-8 max-w-[1600px] mx-auto space-y-8">
                {/* Welcome & Stats Row */}
                <div>
                    <h2 className="text-2xl font-bold text-white mb-6">Market Overview</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {PORTFOLIO_DATA.map((stat, i) => (
                            <div key={i} className="bg-gradient-to-br from-slate-900 to-slate-900/50 border border-white/5 p-6 rounded-2xl relative overflow-hidden group">
                                <div className="absolute right-0 top-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl -mr-10 -mt-10 transition-opacity group-hover:opacity-100 opacity-50"></div>
                                <div className="relative z-10">
                                    <div className="text-slate-400 text-sm font-medium mb-1">{stat.name}</div>
                                    <div className="flex items-end gap-3">
                                        <div className="text-3xl font-bold text-white tracking-tight">{stat.value}</div>
                                        <div className={`flex items-center text-sm font-semibold mb-1 ${stat.isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {stat.isUp ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                                            {stat.change}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Main Widgets Area */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Risk Widget */}
                    <WidgetCard title="ETH Risk Meter" icon={Activity} action="Details">
                        <div className="space-y-4">
                            <div className="relative h-32 flex flex-col items-center justify-center">
                                {/* Semi-circle gauge simulation using borders */}
                                <div className="w-48 h-24 border-8 border-slate-800 rounded-t-full border-b-0 relative overflow-hidden">
                                    <div className="absolute inset-0 bg-[conic-gradient(from_180deg_at_50%_100%,#ef4444_0deg,#eab308_90deg,#10b981_180deg)] opacity-20"></div>
                                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-24 bg-slate-950 origin-bottom rotate-[-45deg] transition-transform duration-1000 ease-out z-10">
                                        <div className="w-4 h-4 rounded-full bg-white absolute top-0 -left-1.5 shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>
                                    </div>
                                </div>
                                <div className="absolute bottom-0 text-center">
                                    <div className="text-2xl font-bold text-white">42/100</div>
                                    <div className="text-xs text-yellow-500 font-medium uppercase tracking-wide">Neutral - Caution</div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-2">
                                <div className="bg-slate-950 rounded-lg p-3 text-center border border-white/5">
                                    <div className="text-xs text-slate-500">Vol (30d)</div>
                                    <div className="text-white font-mono">4.2%</div>
                                </div>
                                <div className="bg-slate-950 rounded-lg p-3 text-center border border-white/5">
                                    <div className="text-xs text-slate-500">Sharpe</div>
                                    <div className="text-white font-mono">1.8</div>
                                </div>
                            </div>
                        </div>
                    </WidgetCard>

                    {/* Portfolio Summary */}
                    <WidgetCard title="Portfolio Allocation" icon={PieChart} action="Manage">
                        <div className="flex items-center gap-6 h-full pb-2">
                            <div className="relative w-32 h-32 rounded-full border-[6px] border-slate-800 flex items-center justify-center">
                                {/* CSS Conic Gradient for Donut Chart */}
                                <div className="absolute inset-0 rounded-full" style={{ background: 'conic-gradient(#3b82f6 0% 45%, #10b981 45% 75%, #f43f5e 75% 100%)', maskImage: 'radial-gradient(transparent 55%, black 56%)', WebkitMaskImage: 'radial-gradient(transparent 55%, black 56%)' }}></div>
                                <div className="text-center z-10">
                                    <div className="text-xs text-slate-500">Total</div>
                                    <div className="text-sm font-bold text-white">100%</div>
                                </div>
                            </div>
                            <div className="space-y-3 flex-1">
                                {[
                                    { l: 'Equities', c: 'bg-blue-500', v: '45%' },
                                    { l: 'Commodities', c: 'bg-emerald-500', v: '30%' },
                                    { l: 'Crypto', c: 'bg-rose-500', v: '25%' }
                                ].map((item) => (
                                    <div key={item.l} className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2 text-slate-300">
                                            <div className={`w-2 h-2 rounded-full ${item.c}`}></div>
                                            {item.l}
                                        </div>
                                        <div className="font-mono text-slate-400">{item.v}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </WidgetCard>

                    {/* Screener / Watchlist */}
                    <WidgetCard title="Top Movers" icon={TrendingUp} action="Full Screener">
                        <div className="space-y-1 -mx-2">
                            {WATCHLIST.map((stock) => (
                                <div key={stock.sym} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group/item">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 group-hover/item:text-white group-hover/item:bg-blue-600 transition-colors">
                                            {stock.sym.substring(0, 1)}
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-white">{stock.sym}</div>
                                            <div className="text-xs text-slate-500">Vol: {stock.vol}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-mono text-white">{stock.price}</div>
                                        <div className={`text-xs font-medium ${stock.change.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {stock.change}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </WidgetCard>

                </div>

                {/* Market Intelligence / Charts Section */}
                <div className="bg-slate-900/30 border border-white/5 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <BarChart3 size={18} className="text-slate-400" /> Market Intelligence Hub
                        </h3>
                        <button className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
                            View All Analytics <ChevronRight size={14} />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Chart Card 1: Asset Prices in USD */}
                        <div className="bg-slate-950 border border-white/5 rounded-xl p-5 hover:border-blue-500/30 transition-all cursor-pointer group hover:shadow-xl hover:shadow-blue-500/5">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                                        <Globe size={16} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-white">KSE-100 in USD</div>
                                        <div className="text-xs text-slate-500">Real Valuation</div>
                                    </div>
                                </div>
                            </div>
                            <div className="h-32 w-full bg-gradient-to-b from-emerald-500/5 to-transparent rounded-lg border border-white/5 relative overflow-hidden flex items-end px-2">
                                {/* Mock Dual Line Chart */}
                                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 50">
                                    {/* PKR Line (Faint) */}
                                    <path d="M0,40 Q20,35 40,20 T100,10" fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="4,4" />
                                    {/* USD Line (Main) */}
                                    <path d="M0,25 Q20,30 40,40 T100,35" fill="none" stroke="#10b981" strokeWidth="2" />
                                    {/* Area under USD */}
                                    <path d="M0,25 Q20,30 40,40 T100,35 V50 H0 Z" fill="url(#gradientUSD)" className="opacity-20" />
                                    <defs>
                                        <linearGradient id="gradientUSD" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#10b981" />
                                            <stop offset="100%" stopColor="transparent" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                            </div>
                            <div className="mt-4 flex justify-between text-xs items-center border-t border-white/5 pt-3">
                                <span className="text-slate-500">vs All Time High</span>
                                <span className="text-rose-400 font-bold bg-rose-500/10 px-2 py-1 rounded">-45% (USD Terms)</span>
                            </div>
                        </div>

                        {/* Chart Card 2: Market Cycles */}
                        <div className="bg-slate-950 border border-white/5 rounded-xl p-5 hover:border-blue-500/30 transition-all cursor-pointer group hover:shadow-xl hover:shadow-blue-500/5">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                                        <Zap size={16} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-white">Market Cycles</div>
                                        <div className="text-xs text-slate-500">Wyckoff Phase</div>
                                    </div>
                                </div>
                            </div>
                            <div className="h-32 relative flex items-center justify-center bg-slate-900/50 rounded-lg border border-white/5 overflow-hidden">
                                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent"></div>
                                <svg className="w-full h-full absolute inset-0 text-purple-500/30" preserveAspectRatio="none" viewBox="0 0 100 100">
                                    <path d="M0,80 Q25,20 50,50 T100,20" fill="none" stroke="currentColor" strokeWidth="2" />
                                </svg>

                                <div className="w-full h-full flex items-center justify-center relative">
                                    <div className="absolute left-[70%] top-[35%] h-3 w-3 rounded-full bg-purple-500 shadow-[0_0_15px_#a855f7] animate-pulse"></div>
                                </div>

                                <div className="absolute bottom-2 text-[9px] text-slate-500 w-full flex justify-between px-4 font-mono uppercase tracking-widest">
                                    <span>Accumulation</span>
                                    <span>Distribution</span>
                                </div>
                            </div>
                            <div className="mt-4 flex justify-between text-xs items-center border-t border-white/5 pt-3">
                                <span className="text-slate-500">Current Phase</span>
                                <span className="text-purple-400 font-bold bg-purple-500/10 px-2 py-1 rounded">Markup (Late)</span>
                            </div>
                        </div>

                        {/* Chart Card 3: Interest Rates */}
                        <div className="bg-slate-950 border border-white/5 rounded-xl p-5 hover:border-blue-500/30 transition-all cursor-pointer group hover:shadow-xl hover:shadow-blue-500/5">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                                        <TrendingUp size={16} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-white">Interest Rates</div>
                                        <div className="text-xs text-slate-500">Policy Rate vs CPI</div>
                                    </div>
                                </div>
                            </div>
                            <div className="h-32 w-full bg-slate-900/50 rounded-lg border border-white/5 relative flex items-end justify-between px-4 pb-2 pt-8 gap-2">
                                {/* Step Chart visualization for Rates */}
                                {[15, 16, 17, 21, 22, 22, 22, 20.5, 19, 17.5].map((h, i) => (
                                    <div key={i} className="flex-1 bg-orange-500/20 group-hover:bg-orange-500/40 transition-colors rounded-t-sm relative group/bar" style={{ height: `${(h / 25) * 100}%` }}>
                                        {i === 9 && <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-orange-400 font-bold bg-slate-900 px-1 rounded border border-orange-500/20">17.5%</div>}
                                    </div>
                                ))}
                                {/* CPI Line overlay */}
                                <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
                                    <path d="M5,80 L15,75 L25,70 L35,50 L45,40 L55,35 L65,40 L75,50 L85,60 L95,70" fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="2,2" />
                                </svg>
                            </div>
                            <div className="mt-4 flex justify-between text-xs items-center border-t border-white/5 pt-3">
                                <span className="text-slate-500">Real Rates</span>
                                <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-1 rounded">Positive (+350bps)</span>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};
