'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Copy, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export default function XCopilotPage() {
    const [symbol, setSymbol] = useState('');
    const [notes, setNotes] = useState('');
    const [draft, setDraft] = useState('');
    const [loading, setLoading] = useState(false);

    const generate = async () => {
        if (!symbol) {
            toast.error('Please enter a symbol (e.g. LUCK, BTC)');
            return;
        }
        setLoading(true);
        try {
            const res = await fetch('/api/admin/x-copilot/generate', {
                method: 'POST',
                body: JSON.stringify({ symbol, notes }),
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data.draft) {
                setDraft(data.draft);
            } else {
                toast.error('Generation failed');
            }
        } catch (e) {
            toast.error('API Error');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(draft);
        toast.success('Copied to clipboard');
    };

    const openInX = () => {
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(draft)}`;
        window.open(url, '_blank');
    };

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold flex items-center gap-2">
                <Sparkles className="text-blue-500" /> X-Copilot
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><CardTitle>1. Context & Inputs</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-sm font-medium">Asset Symbol</label>
                            <Input
                                value={symbol}
                                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                                placeholder="LUCK, SYS, BTC..."
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Extra Notes/Context</label>
                            <Textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="h-32"
                                placeholder="What's the main idea? (e.g. high volume surge, macro breakdown...)"
                            />
                        </div>
                        <Button
                            className="w-full"
                            onClick={generate}
                            disabled={loading}
                        >
                            {loading ? 'Analyzing...' : 'Generate Brand Draft'}
                        </Button>
                    </CardContent>
                </Card>

                <Card className="border-blue-500/30">
                    <CardHeader><CardTitle>2. The Draft</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="p-4 bg-muted rounded-xl min-h-[150px] font-serif text-lg leading-relaxed border ring-1 ring-border">
                            {draft || <span className="text-muted-foreground italic">Draft will appear here...</span>}
                        </div>

                        {draft && (
                            <div className="flex gap-2">
                                <Button variant="outline" className="flex-1" onClick={copyToClipboard}>
                                    <Copy className="w-4 h-4 mr-2" /> Copy
                                </Button>
                                <Button className="flex-1 bg-[#1DA1F2] hover:bg-[#1a8cd8] text-white" onClick={openInX}>
                                    <Send className="w-4 h-4 mr-2" /> Post on X
                                </Button>
                            </div>
                        )}
                        <p className="text-xs text-center text-muted-foreground italic">
                            Character count: {draft.length} / 280
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
