
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { SharedNavbar } from '@/components/shared-navbar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CalendarIcon, X, ExternalLink, Zap, TrendingUp, BarChart3, Info } from 'lucide-react';
import { format } from 'date-fns';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";

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
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

    // Filters
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [selectedType, setSelectedType] = useState<string>('all');
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [selectedSymbol, setSelectedSymbol] = useState<string>('');
    const [selectedSentiment, setSelectedSentiment] = useState<string>('all');

    const fetchEvents = useCallback(async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            params.append('category', selectedCategory);
            if (selectedType && selectedType !== 'all') params.append('type', selectedType);
            if (selectedDate) params.append('date', selectedDate);
            if (selectedSymbol) params.append('symbol', selectedSymbol);
            if (selectedSentiment && selectedSentiment !== 'all') params.append('sentiment', selectedSentiment);

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
        setSelectedSymbol('');
        setSelectedSentiment('all');
        setSelectedCategory('all');
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
                            variant={selectedCategory === 'all' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setSelectedCategory('all')}
                            className={selectedCategory === 'all' ? 'bg-zinc-800 text-white' : 'text-zinc-400'}
                        >
                            All
                        </Button>
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
                    <div className="space-y-2 min-w-[150px]">
                        <label className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">Symbol</label>
                        <Input
                            placeholder="Search Symbol (e.g. PPL)"
                            value={selectedSymbol}
                            onChange={(e) => setSelectedSymbol(e.target.value)}
                            className="bg-zinc-900 border-zinc-800 text-white"
                        />
                    </div>

                    <div className="space-y-2 min-w-[150px]">
                        <label className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">Event Type</label>
                        <Select value={selectedType} onValueChange={setSelectedType}>
                            <SelectTrigger className="bg-zinc-900 border-zinc-800">
                                <SelectValue placeholder="All types" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                                <SelectItem value="all">All Types</SelectItem>
                                {eventTypes
                                    .filter(t => {
                                        if (selectedCategory === 'all') return true;
                                        return selectedCategory === 'fundamental' ? t === 'fundamental_alert' : t !== 'fundamental_alert';
                                    })
                                    .map(type => (
                                        <SelectItem key={type} value={type}>
                                            {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2 min-w-[150px]">
                        <label className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">Sentiment</label>
                        <Select value={selectedSentiment} onValueChange={setSelectedSentiment}>
                            <SelectTrigger className="bg-zinc-900 border-zinc-800">
                                <SelectValue placeholder="All Sentiments" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                                <SelectItem value="all">All Sentiments</SelectItem>
                                <SelectItem value="Bullish">Bullish</SelectItem>
                                <SelectItem value="Neutral">Neutral</SelectItem>
                                <SelectItem value="Bearish">Bearish</SelectItem>
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

                    {(selectedType !== 'all' || selectedDate || selectedSymbol || selectedSentiment !== 'all' || selectedCategory !== 'all') && (
                        <Button variant="ghost" onClick={clearFilters} className="text-zinc-500 h-10 hover:text-white">
                            <X className="h-4 w-4 mr-2" />
                            Clear
                        </Button>
                    )}
                </div>

                <div className="grid gap-4">
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
                                    <div
                                        key={event.id}
                                        onClick={() => setSelectedEvent(event)}
                                        className="group cursor-pointer relative bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-5 hover:bg-zinc-900/50 hover:border-zinc-700 transition-all duration-300"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="space-y-3 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline" className="bg-zinc-900 font-bold tracking-widest text-zinc-200 border-zinc-700 uppercase">
                                                        {event.symbol}
                                                    </Badge>
                                                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-tighter">
                                                        {meta.sector || meta.company || 'Market'}
                                                    </span>
                                                </div>
                                                <h2 className="text-xl md:text-2xl font-bold text-white leading-tight group-hover:text-zinc-200 transition-colors">
                                                    {analysis.headline.replace(/^[^\w\s]+/, '').trim()}
                                                </h2>
                                                <div className="flex items-center gap-3">
                                                    <div className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-widest ${sentimentColor}`}>
                                                        {sentiment}
                                                    </div>
                                                    <span className="text-[10px] text-zinc-600 font-medium">
                                                        {format(new Date(event.created_at), 'MMM dd • HH:mm')}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="hidden md:flex h-12 w-12 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/50 group-hover:bg-zinc-800 transition-colors">
                                                <Info className="h-5 w-5 text-zinc-500" />
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            // Technical Card
                            return (
                                <div key={event.id} className="bg-zinc-900/20 border border-zinc-800/50 rounded-xl p-4 flex items-center justify-between gap-4 hover:border-zinc-700 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                                            <Badge variant="outline" className="font-mono text-zinc-400 border-zinc-800">{event.symbol}</Badge>
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-zinc-200 text-sm md:text-base">{event.headline}</h3>
                                            <span className="text-[10px] text-zinc-600 uppercase tracking-widest leading-none block mt-1">{event.event_type.replace(/_/g, ' ')}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] text-zinc-600 font-mono">
                                            {format(new Date(event.created_at), 'MMM dd, HH:mm')}
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* DETAIL MODAL */}
            <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
                <DialogContent className="max-w-3xl bg-[#0a0a0a] border-zinc-800 text-white overflow-hidden p-0 gap-0">
                    {selectedEvent && (() => {
                        const meta = typeof selectedEvent.metadata === 'string' ? JSON.parse(selectedEvent.metadata) : selectedEvent.metadata;
                        const analysis = meta?.ai_analysis;
                        const sentiment = analysis?.sentiment || 'Neutral';
                        const sentimentColor = sentiment === 'Bullish' ? 'text-green-400 bg-green-400/10 border-green-400/20' :
                            sentiment === 'Bearish' ? 'text-red-400 bg-red-400/10 border-red-400/20' :
                                'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';

                        return (
                            <div className="max-h-[85vh] overflow-y-auto custom-scrollbar">
                                <div className="p-6 md:p-8 space-y-8">
                                    {/* Header Section */}
                                    <div className="space-y-4">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <Badge variant="outline" className="bg-zinc-900 px-3 py-1 text-lg font-black tracking-widest text-white border-zinc-800 rounded-lg">
                                                {selectedEvent.symbol}
                                            </Badge>
                                            <div className={`px-2 py-1 rounded border text-xs font-bold uppercase tracking-widest ${sentimentColor}`}>
                                                {sentiment}
                                            </div>
                                            <span className="text-zinc-500 font-medium tracking-tight">
                                                {format(new Date(selectedEvent.created_at), 'MMMM dd, yyyy • HH:mm')}
                                            </span>
                                        </div>

                                        <DialogHeader>
                                            <DialogTitle className="text-3xl md:text-4xl font-black leading-tight tracking-tight text-white mb-2">
                                                {analysis?.headline.replace(/^[^\w\s]+/, '').trim()}
                                            </DialogTitle>
                                            <DialogDescription className="text-zinc-400 font-medium text-lg leading-relaxed">
                                                {selectedEvent.description}
                                            </DialogDescription>
                                        </DialogHeader>
                                    </div>

                                    {/* Detailed Sections */}
                                    <div className="grid gap-6">
                                        {/* The Scoop */}
                                        <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-6 space-y-4">
                                            <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                                                <Zap className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                                The Intelligence Scoop
                                            </h3>
                                            <div className="grid gap-3">
                                                {analysis?.scoop.map((item: string, i: number) => (
                                                    <div key={i} className="flex gap-4 group">
                                                        <span className="text-zinc-700 group-hover:text-zinc-500 transition-colors mt-1">•</span>
                                                        <p className="text-zinc-300 font-medium leading-relaxed">{item}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Market Analysis Grid */}
                                        <div className="grid md:grid-cols-2 gap-4">
                                            <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-5 space-y-3">
                                                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                                                    <TrendingUp className="h-3 w-3 text-blue-400" />
                                                    Valuation Insight
                                                </h3>
                                                <p className="text-sm text-zinc-400 leading-relaxed font-medium italic">
                                                    "{analysis?.market_context?.valuation || 'Metric currently under review.'}"
                                                </p>
                                            </div>
                                            <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-5 space-y-3">
                                                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                                                    <BarChart3 className="h-3 w-3 text-purple-400" />
                                                    Momentum Pulse
                                                </h3>
                                                <p className="text-sm text-zinc-400 leading-relaxed font-medium italic">
                                                    "{analysis?.market_context?.momentum || 'Market depth pending update.'}"
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Footer */}
                                    <div className="pt-6 border-t border-zinc-800 flex items-center justify-between">
                                        <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                                            Source: PSX Corporate Filing Database
                                        </p>
                                        {meta.attachments?.length > 0 && (
                                            <Button
                                                asChild
                                                variant="outline"
                                                size="sm"
                                                className="bg-zinc-900 border-zinc-800 hover:bg-white hover:text-black transition-all font-bold"
                                            >
                                                <a href={meta.attachments[0]} target="_blank" rel="noopener noreferrer">
                                                    <ExternalLink className="h-3.5 w-3.5 mr-2" />
                                                    View Original Filing
                                                </a>
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </DialogContent>
            </Dialog>

        </div>
    );
}
