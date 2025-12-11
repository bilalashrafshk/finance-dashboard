"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import {
    Layers,
    TrendingUp,
    PieChart as PieChartIcon,
    Scale,
    Globe,
    Percent,
    DollarSign,
    Coins
} from 'lucide-react';
import { ChartCard, SectionHeader } from '@/components/modern/shared/ui-components';

export const DashboardView = () => {
    const router = useRouter();

    const handleNavigate = (path: string) => {
        router.push(path);
    };

    const chartCards = [
        {
            title: "Liquidity Map (Lipi)",
            category: "MACRO",
            description: "Net Buy/Sell activity heatmap by client type and sector.",
            icon: Layers,
            color: "text-blue-400",
            action: () => handleNavigate('/charts?chart=liquidity-map'),
            visual: (
                <div className="grid grid-cols-4 gap-1 w-full h-full p-2 opacity-60">
                    {[...Array(16)].map((_, i) => (
                        <div key={i} className={`rounded-[2px] ${i % 3 === 0 ? 'bg-emerald-500/40' : i % 5 === 0 ? 'bg-rose-500/40' : 'bg-slate-700/20'}`}></div>
                    ))}
                </div>
            )
        },
        {
            title: "KSE-100 Market Cycle",
            category: "TECHNICAL",
            description: "Identify accumulation, markup, and distribution phases.",
            icon: TrendingUp,
            color: "text-purple-400",
            action: () => handleNavigate('/charts'),
            visual: (
                <svg className="w-full h-full text-purple-500/40" viewBox="0 0 100 40">
                    <path d="M0 30 Q 25 35, 50 20 T 100 10" fill="none" stroke="currentColor" strokeWidth="2" />
                    <path d="M0 30 Q 25 35, 50 20 T 100 10 V 40 H 0 Z" fill="currentColor" opacity="0.2" />
                </svg>
            )
        },
        {
            title: "Sector Performance",
            category: "TECHNICAL",
            description: "Real-time relative strength analysis across industries.",
            icon: PieChartIcon,
            color: "text-emerald-400",
            action: () => handleNavigate('/charts'),
            visual: (
                <div className="flex flex-col justify-center gap-1.5 w-full px-4">
                    <div className="w-[80%] h-1.5 bg-emerald-500/40 rounded-full"></div>
                    <div className="w-[60%] h-1.5 bg-slate-600/40 rounded-full"></div>
                    <div className="w-[40%] h-1.5 bg-rose-500/40 rounded-full"></div>
                    <div className="w-[70%] h-1.5 bg-emerald-500/30 rounded-full"></div>
                </div>
            )
        },
        {
            title: "SBP Interest Rates",
            category: "MACRO",
            description: "Track policy rate changes and monetary stance.",
            icon: Scale,
            color: "text-amber-400",
            action: () => handleNavigate('/charts'),
            visual: (
                <svg className="w-full h-full text-amber-500/40 p-2" viewBox="0 0 100 50">
                    <polyline points="0,40 20,40 20,30 40,30 40,20 60,20 60,10 100,10" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
            )
        },
        {
            title: "Real GDP Growth",
            category: "MACRO",
            description: "Historical and projected economic growth data.",
            icon: Globe,
            color: "text-cyan-400",
            action: () => handleNavigate('/charts'),
            visual: (
                <div className="flex items-end justify-around w-full h-full p-3 gap-1">
                    {[30, 45, 35, 60, 75, 50, 65].map((h, i) => (
                        <div key={i} style={{ height: `${h}%` }} className="w-full bg-cyan-500/30 rounded-t-sm"></div>
                    ))}
                </div>
            )
        },
        {
            title: "CPI / Inflation",
            category: "MACRO",
            description: "National Consumer Price Index YoY trends.",
            icon: Percent,
            color: "text-rose-400",
            action: () => handleNavigate('/charts'),
            visual: (
                <svg className="w-full h-full text-rose-500/40 p-2" viewBox="0 0 100 50">
                    <path d="M0 40 L 20 35 L 40 20 L 60 25 L 80 10 L 100 5" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
            )
        },
        {
            title: "Remittances",
            category: "MACRO",
            description: "Monthly inflows vs historical average.",
            icon: DollarSign,
            color: "text-green-400",
            action: () => handleNavigate('/charts'),
            visual: (
                <div className="flex flex-col items-center justify-center h-full w-full gap-2">
                    <div className="w-8 h-8 rounded-full border-2 border-green-500/30 flex items-center justify-center">
                        <DollarSign className="w-4 h-4 text-green-500/50" />
                    </div>
                    <div className="w-16 h-1 bg-green-500/30 rounded-full"></div>
                </div>
            )
        },
        {
            title: "Exchange Rate",
            category: "MACRO",
            description: "PKR/USD parity and volatility analysis.",
            icon: Coins,
            color: "text-indigo-400",
            action: () => handleNavigate('/charts'),
            visual: (
                <svg className="w-full h-full text-indigo-500/40 p-2" viewBox="0 0 100 50">
                    <path d="M0 40 C 20 40, 20 10, 50 10 S 80 30, 100 20" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
                </svg>
            )
        }
    ];

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 p-6 md:p-8 max-w-7xl mx-auto">

            {/* Hero / Welcome */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-slate-800/60 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Market Analytics Hub</h1>
                    <p className="text-slate-400 mt-2 max-w-2xl">
                        Deep dive into Pakistan's equity market structure, macro-economic indicators, and liquidity flows.
                        Select a module to begin your analysis.
                    </p>
                </div>
            </div>

            {/* Grid Sections */}
            <div>
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Layers className="w-4 h-4" /> Market Structure & Technicals
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {chartCards.filter(c => c.category === 'TECHNICAL' || c.title.includes('Liquidity')).map((card, i) => (
                        <ChartCard
                            key={i}
                            {...card}
                            onClick={() => card.action?.()}
                        />
                    ))}
                </div>
            </div>

            <div>
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Globe className="w-4 h-4" /> Macro Economics
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {chartCards.filter(c => c.category === 'MACRO' && !c.title.includes('Liquidity')).map((card, i) => (
                        <ChartCard
                            key={i}
                            {...card}
                            onClick={() => card.action?.()}
                        />
                    ))}
                </div>
            </div>

        </div>
    );
};
