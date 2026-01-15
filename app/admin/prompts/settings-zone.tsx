'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

interface SettingsZoneProps {
    title: string;
    description?: string;
    icon: React.ReactNode;
    color: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}

export function SettingsZone({ title, description, icon, color, children, defaultOpen = false }: SettingsZoneProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className={`border rounded-2xl overflow-hidden transition-all duration-300 ${isOpen ? 'bg-card shadow-lg ring-1 ring-border' : 'bg-card/40 hover:bg-card/60 shadow-sm'}`}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-6 text-left group transition-colors"
            >
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${color} bg-opacity-10 transition-transform group-hover:scale-110`}>
                        <div className={color.replace('bg-', 'text-')}>
                            {icon}
                        </div>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold tracking-tight">{title}</h3>
                        {description && <p className="text-sm text-muted-foreground">{description}</p>}
                    </div>
                </div>
                <div className={`transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`}>
                    <ChevronRight className="w-6 h-6 text-muted-foreground" />
                </div>
            </button>

            <div className={`transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[2000px] opacity-100 border-t' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                <div className="p-8 space-y-8 bg-gradient-to-b from-transparent to-background/30">
                    {children}
                </div>
            </div>
        </div>
    );
}
