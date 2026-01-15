
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
    created_at: string;
}

export default function EventsPage() {
    const [events, setEvents] = useState<Event[]>([]);
    const [eventTypes, setEventTypes] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [selectedType, setSelectedType] = useState<string>('all');
    const [selectedDate, setSelectedDate] = useState<string>('');

    const fetchEvents = useCallback(async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
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
    }, [selectedType, selectedDate]);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    const clearFilters = () => {
        setSelectedType('all');
        setSelectedDate('');
    };

    return (
        <>
            <SharedNavbar />
            <div className="container mx-auto p-6 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Market News & Events</h1>
                        <p className="text-muted-foreground">Real-time alerts based on market activity.</p>
                    </div>
                </div>

                <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                    <CardContent className="pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground">Event Type</label>
                                <Select value={selectedType} onValueChange={setSelectedType}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="All Events" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Events</SelectItem>
                                        {eventTypes.map(type => (
                                            <SelectItem key={type} value={type}>
                                                {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground">Date</label>
                                <div className="relative">
                                    <Input
                                        type="date"
                                        value={selectedDate}
                                        onChange={(e) => setSelectedDate(e.target.value)}
                                        className="pl-10"
                                    />
                                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                </div>
                            </div>

                            <div className="flex items-end">
                                {(selectedType !== 'all' || selectedDate) && (
                                    <Button variant="ghost" onClick={clearFilters} className="text-xs">
                                        <X className="h-4 w-4 mr-2" />
                                        Clear Filters
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid gap-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                        </div>
                    ) : events.length === 0 ? (
                        <Card>
                            <CardContent className="p-6 text-center text-muted-foreground">
                                No events found matching your criteria.
                            </CardContent>
                        </Card>
                    ) : (
                        events.map((event) => (
                            <Card key={event.id} className="overflow-hidden border-border/50 hover:border-primary/50 transition-colors">
                                <div className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                                    <div className="flex items-center gap-3 min-w-[200px]">
                                        <Badge variant="outline" className="font-mono bg-secondary/20">{event.symbol}</Badge>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-medium">
                                                {format(new Date(event.created_at), 'MMM dd, yyyy')}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground">
                                                {format(new Date(event.created_at), 'hh:mm aa')}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex-1">
                                        <h3 className="text-lg font-medium leading-tight mb-1">{event.headline}</h3>
                                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                            {event.event_type.replace(/_/g, ' ')}
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
