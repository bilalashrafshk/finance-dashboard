import React, { ReactNode } from 'react';
import { ArrowUpRight, ArrowDownRight, RefreshCcw } from 'lucide-react';

export const Card = ({ children, className = "", noPadding = false }: { children: ReactNode, className?: string, noPadding?: boolean }) => (
    <div className={`bg-slate-800/50 backdrop-blur-md border border-slate-700/50 rounded-xl overflow-hidden shadow-sm ${className}`}>
        <div className={noPadding ? "" : "p-5"}>
            {children}
        </div>
    </div>
);

type BadgeType = 'neutral' | 'success' | 'danger' | 'warning' | 'primary';

export const Badge = ({ children, type = 'neutral', className = "" }: { children: ReactNode, type?: BadgeType, className?: string }) => {
    const styles = {
        neutral: 'bg-slate-700 text-slate-300',
        success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
        danger: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
        warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
        primary: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    };
    return (
        <span className={`px-2.5 py-0.5 rounded text-xs font-medium border border-transparent ${styles[type]} ${className}`}>
            {children}
        </span>
    );
};

export const StatCard = ({ title, value, subtext, trend, trendValue, icon: Icon }: { title: string, value: string | number, subtext?: string, trend?: 'up' | 'down', trendValue?: string, icon?: any }) => (
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

export const SectionHeader = ({ title, subtitle, action }: { title: string, subtitle?: string, action?: ReactNode }) => (
    <div className="flex justify-between items-end mb-6">
        <div>
            <h2 className="text-2xl font-bold text-white">{title}</h2>
            {subtitle && <p className="text-slate-400 text-sm mt-1">{subtitle}</p>}
        </div>
        {action}
    </div>
);

export const ChartCard = ({ title, category, description, icon: Icon, color, onClick, visual }: { title: string, category: string, description: string, icon: any, color: string, onClick?: () => void, visual: ReactNode }) => (
    <div
        onClick={onClick}
        className="group relative overflow-hidden bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-xl p-5 hover:bg-slate-800/60 transition-all duration-300 cursor-pointer hover:shadow-xl hover:shadow-blue-900/10 hover:-translate-y-1"
    >
        <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity ${color}`}>
            <Icon className="w-24 h-24 -mr-4 -mt-4 transform rotate-12" />
        </div>

        <div className="relative z-10 flex flex-col h-full justify-between">
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <Badge type="neutral" className="bg-slate-700/50 text-slate-400 text-[10px] uppercase tracking-wider">{category}</Badge>
                </div>
                <h3 className="text-lg font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">{title}</h3>
                <p className="text-xs text-slate-400 line-clamp-2 mb-4 min-h-[2.5em]">{description}</p>
            </div>

            {/* Mini Visual Representation */}
            <div className="mb-4 h-24 w-full rounded-lg bg-slate-900/50 border border-slate-700/30 overflow-hidden flex items-center justify-center relative group-hover:border-slate-600/50 transition-colors">
                {visual}
            </div>

            <div className="flex items-center text-xs font-medium text-slate-500 group-hover:text-white transition-colors mt-auto">
                OPEN ANALYTICS <ArrowUpRight className="w-3 h-3 ml-1" />
            </div>
        </div>
    </div>
);
