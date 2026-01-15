
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SharedNavbar } from '@/components/shared-navbar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';

interface Event {
    id: number;
    symbol: string;
    event_type: string;
    headline: string;
    description: string;
    metadata: any;
    created_at: string;
}

export default function EventsPage() {
    const [events, setEvents] = useState<Event[]>([]);
    const [eventTypes, setEventTypes] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [selectedCategory, setSelectedCategory] = useState<string>('fundamental');
    const [selectedType, setSelectedType] = useState<string>('all');
    const [selectedDate, setSelectedDate] = useState<string>('');

    const fetchEvents = useCallback(async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            params.append('category', selectedCategory);
            if (selectedType && selectedType !== 'all') params.append('type', selectedType);
            if (selectedDate) params.append('date', selectedDate);

            const res = await fetch(`/api/events?${params.toString()}`);
            const data = await res.json();
            if (data.events) {
                setEvents(data.events);
            }
            if (data.eventTypes) {
                setEventTypes(data.eventTypes);
            }
        } catch (error) {
            console.error('Failed to fetch events', error);
        } finally {
            setLoading(false);
        }
    }, [selectedCategory, selectedType, selectedDate]);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    const clearFilters = () => {
        setSelectedType('all');
        setSelectedDate('');
    };

    return (
        <div className="min-h-screen bg-black text-white">
            <SharedNavbar />
            <div className="container mx-auto p-4 md:p-6 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-white">Market Intelligence</h1>
                        <p className="text-zinc-400">High-conviction alerts and technical breakouts.</p>
                    </div>

                    <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-zinc-800">
                        <Button
                            variant={selectedCategory === 'fundamental' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setSelectedCategory('fundamental')}
                            className={selectedCategory === 'fundamental' ? 'bg-zinc-800 text-white' : 'text-zinc-400'}
                        >
                            Fundamental
                        </Button>
                        <Button
                            variant={selectedCategory === 'technical' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setSelectedCategory('technical')}
                            className={selectedCategory === 'technical' ? 'bg-zinc-800 text-white' : 'text-zinc-400'}
                        >
                            Technical
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-4 items-end bg-zinc-900/30 p-4 rounded-xl border border-zinc-800/50">
                    <div className="space-y-2 min-w-[200px]">
                        <label className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">Event Type</label>
                        <Select value={selectedType} onValueChange={setSelectedType}>
                            <SelectTrigger className="bg-zinc-900 border-zinc-800">
                                <SelectValue placeholder="All types" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800">
                                <SelectItem value="all">All Types</SelectItem>
                                {eventTypes.filter(t => selectedCategory === 'fundamental' ? t === 'fundamental_alert' : t !== 'fundamental_alert').map(type => (
                                    <SelectItem key={type} value={type}>
                                        {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">Date</label>
                        <div className="relative">
                            <Input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="pl-10 bg-zinc-900 border-zinc-800 text-white"
                            />
                            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                        </div>
                    </div>

                    {(selectedType !== 'all' || selectedDate) && (
                        <Button variant="ghost" onClick={clearFilters} className="text-zinc-500 h-10 hover:text-white">
                            <X className="h-4 w-4 mr-2" />
                            Clear
                        </Button>
                    )}
                </div>

                <div className="grid gap-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-500 border-t-white"></div>
                        </div>
                    ) : events.length === 0 ? (
                        <div className="text-center py-20 bg-zinc-900/20 rounded-2xl border border-dashed border-zinc-800">
                            <p className="text-zinc-500">No events found for this selection.</p>
                        </div>
                    ) : (
                        events.map((event) => {
                            const isFundamental = event.event_type === 'fundamental_alert';
                            const meta = typeof event.metadata === 'string' ? JSON.parse(event.metadata) : event.metadata;
                            const analysis = meta?.ai_analysis;

                            if (isFundamental && analysis) {
                                const sentiment = analysis.sentiment || 'Neutral';
                                const sentimentColor = sentiment === 'Bullish' ? 'text-green-400 bg-green-400/10 border-green-400/20' :
                                    sentiment === 'Bearish' ? 'text-red-400 bg-red-400/10 border-red-400/20' :
                                        'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';

                                return (
                                    <div key={event.id} className="group relative bg-[#0a0a0a] border border-zinc-800/50 rounded-2xl overflow-hidden hover:border-zinc-700 transition-all duration-300">
                                        <div className={`absolute top-4 right-4 px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-tighter ${sentimentColor}`}>
                                            {sentiment}
                                        </div>

                                        <div className="p-5 md:p-6 space-y-4">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold text-white tracking-widest">{event.symbol}</span>
                                                    <span className="text-zinc-600">•</span>
                                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{meta.sector || meta.company || 'Market'}</span>
                                                </div>
                                                <h2 className="text-xl md:text-2xl font-bold text-white leading-tight group-hover:text-zinc-200 transition-colors">
                                                    {analysis.headline.replace(/^[^\w\s]+/, '').trim()}
                                                </h2>
                                            </div>

                                            <div className="space-y-2">
                                                {analysis.scoop.slice(0, 2).map((item: string, i: number) => (
                                                    <p key={i} className="text-sm text-zinc-400 font-medium leading-relaxed line-clamp-1">
                                                        • {item}
                                                    </p>
                                                ))}
                                            </div>

                                            <div className="pt-4 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-800/50">
                                                <div className="font-mono text-[10px] text-zinc-500 tracking-tighter flex items-center gap-3">
                                                    <span className="bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800/50">
                                                        VALUATION: <span className="text-zinc-300">{analysis.market_context?.valuation || 'N/A'}</span>
                                                    </span>
                                                    <span className="bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800/50">
                                                        MOMENTUM: <span className="text-zinc-300">{analysis.market_context?.momentum || 'N/A'}</span>
                                                    </span>
                                                    <span className="bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800/50">
                                                        PRICE: <span className="text-zinc-300">{analysis.market_context?.price || 'N/A'}</span>
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    {meta.attachments?.length > 0 && (
                                                        <a
                                                            href={meta.attachments[0]}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-[10px] font-bold text-zinc-400 hover:text-white transition-colors underline decoration-zinc-800 underline-offset-4"
                                                        >
                                                            OPEN FILING
                                                        </a>
                                                    )}
                                                    <span className="text-[10px] text-zinc-600 font-medium whitespace-nowrap">
                                                        {format(new Date(event.created_at), 'MMM dd • HH:mm')}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            // Technical Card (Fallthrough or explicit check)
                            return (
                                <div key={event.id} className="bg-[#0a0a0a] border border-zinc-800/50 rounded-xl p-4 md:p-5 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                                            <Badge variant="outline" className="font-mono text-zinc-300 border-zinc-700">{event.symbol}</Badge>
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-zinc-100">{event.headline}</h3>
                                            <span className="text-[10px] text-zinc-500 uppercase tracking-widest">{event.event_type.replace(/_/g, ' ')}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] text-zinc-500 font-mono">
                                            {format(new Date(event.created_at), 'MMM dd, HH:mm')}
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
