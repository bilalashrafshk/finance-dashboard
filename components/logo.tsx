
import React from 'react';
import { TrendingUp } from 'lucide-react';

interface LogoProps {
    className?: string;
    isFooter?: boolean;
}

export const Logo = ({ className = "" }: LogoProps) => {
    return (
        <div className={`flex items-center gap-3 cursor-pointer group ${className}`}>
            <div className="relative">
                <div className="absolute inset-0 bg-blue-500 blur-lg opacity-20 group-hover:opacity-40 transition-opacity"></div>
                <div className="relative bg-gradient-to-br from-blue-600 to-cyan-500 p-2.5 rounded-xl shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-all duration-500 group-hover:scale-105">
                    <TrendingUp className="w-5 h-5 text-white" />
                </div>
            </div>
            <div className="font-bold text-xl tracking-tight text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-slate-400 transition-all">
                CONVICTION <span className="text-cyan-400">PAYS</span>
            </div>
        </div>
    );
};
