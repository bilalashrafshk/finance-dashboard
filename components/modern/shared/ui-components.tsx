import React, { ReactNode } from 'react';
import { ArrowUpRight, ArrowDownRight, RefreshCcw } from 'lucide-react';

export const Card = ({ children, className = "", noPadding = false }: { children: ReactNode, className?: string, noPadding?: boolean }) => (
    <div className={`bg-card backdrop-blur-md border border-border rounded-xl overflow-hidden shadow-sm ${className}`}>
        <div className={noPadding ? "" : "p-5"}>
            {children}
        </div>
    </div>
);

type BadgeType = 'neutral' | 'success' | 'danger' | 'warning' | 'primary';

export const Badge = ({ children, type = 'neutral', className = "" }: { children: ReactNode, type?: BadgeType, className?: string }) => {
    const styles = {
        neutral: 'bg-muted text-muted-foreground',
        success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
        danger: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20',
        warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
        primary: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
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
            <span className="text-muted-foreground text-sm font-medium">{title}</span>
            {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="flex items-baseline gap-2 mb-1">
            <h3 className="text-2xl font-bold text-foreground">{value}</h3>
        </div>
        <div className="flex items-center gap-2">
            {trend && (
                <span className={`flex items-center text-xs font-medium ${trend === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {trend === 'up' ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                    {trendValue}
                </span>
            )}
            {subtext && <span className="text-xs text-muted-foreground">{subtext}</span>}
        </div>
    </Card>
);

export const SectionHeader = ({ title, subtitle, action }: { title: string, subtitle?: string, action?: ReactNode }) => (
    <div className="flex justify-between items-end mb-6">
        <div>
            <h2 className="text-2xl font-bold text-foreground">{title}</h2>
            {subtitle && <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>}
        </div>
        {action}
    </div>
);

export const ChartCard = ({ title, category, description, icon: Icon, color, onClick, visual }: { title: string, category: string, description: string, icon: any, color: string, onClick?: () => void, visual: ReactNode }) => (
    <div
        onClick={onClick}
        className="group relative overflow-hidden bg-card/80 backdrop-blur-sm border border-border rounded-xl p-5 hover:bg-accent/60 transition-all duration-300 cursor-pointer hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1"
    >
        <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity ${color}`}>
            <Icon className="w-24 h-24 -mr-4 -mt-4 transform rotate-12" />
        </div>

        <div className="relative z-10 flex flex-col h-full justify-between">
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <Badge type="neutral" className="bg-muted text-muted-foreground text-[10px] uppercase tracking-wider">{category}</Badge>
                </div>
                <h3 className="text-lg font-bold text-foreground mb-1 group-hover:text-primary transition-colors">{title}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-4 min-h-[2.5em]">{description}</p>
            </div>

            {/* Mini Visual Representation */}
            <div className="mb-4 h-24 w-full rounded-lg bg-muted/50 border border-border overflow-hidden flex items-center justify-center relative group-hover:border-border/80 transition-colors">
                {visual}
            </div>

            <div className="flex items-center text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors mt-auto">
                OPEN ANALYTICS <ArrowUpRight className="w-3 h-3 ml-1" />
            </div>
        </div>
    </div>
);
