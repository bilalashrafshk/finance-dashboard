'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SharedNavbar } from '@/components/shared-navbar';

interface Event {
    id: number;
    symbol: string;
    event_type: string;
    headline: string;
    created_at: string;
}

export default function EventsPage() {
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);

    async function fetchEvents() {
        try {
            const res = await fetch('/api/events');
            const data = await res.json();
            if (data.events) {
                setEvents(data.events);
            }
        } catch (error) {
            console.error('Failed to fetch events', error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchEvents();
        // Poll every 30 seconds
        const interval = setInterval(fetchEvents, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <>
            <SharedNavbar />
            <div className="container mx-auto p-6 space-y-6">
                <h1 className="text-3xl font-bold tracking-tight">Market News & Events</h1>
                <p className="text-muted-foreground">Real-time alerts based on market activity.</p>

                <div className="grid gap-4">
                    {loading ? (
                        <Card>
                            <CardContent className="p-6">
                                <div className="flex items-center space-x-4">
                                    <div className="h-2 bg-slate-200 rounded w-24 animate-pulse"></div>
                                    <div className="h-2 bg-slate-200 rounded flex-1 animate-pulse"></div>
                                </div>
                            </CardContent>
                        </Card>
                    ) : events.length === 0 ? (
                        <Card>
                            <CardContent className="p-6 text-center text-muted-foreground">
                                No notable events detected today.
                            </CardContent>
                        </Card>
                    ) : (
                        events.map((event) => (
                            <Card key={event.id} className="overflow-hidden">
                                <div className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                                    <div className="flex items-center gap-3 min-w-[150px]">
                                        <Badge variant="outline" className="font-mono">{event.symbol}</Badge>
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                                            {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>

                                    <div className="flex-1">
                                        <h3 className="text-lg font-medium leading-none mb-1">{event.headline}</h3>
                                        <span className="text-xs text-muted-foreground capitalize bg-secondary/30 px-2 py-0.5 rounded">
                                            {event.event_type.replace('_', ' ')}
                                        </span>
                                    </div>
                                </div>
                            </Card>
                        ))
                    )}
                </div>
            </div>
        </>
    );
}
