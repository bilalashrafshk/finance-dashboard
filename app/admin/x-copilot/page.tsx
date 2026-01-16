'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, getAuthToken } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Copy, Send, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function XCopilotPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [symbol, setSymbol] = useState('');
    const [notes, setNotes] = useState('');
    const [mode, setMode] = useState<'tweet' | 'reply'>('tweet');
    const [targetTweet, setTargetTweet] = useState('');
    const [draft, setDraft] = useState('');
    const [contextData, setContextData] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!authLoading) {
            if (!user) {
                router.push("/auth/login");
            } else if (user.role !== "admin") {
                router.push("/dashboard");
            }
        }
    }, [user, authLoading, router]);

    const generate = async () => {
        if (!symbol) {
            toast.error('Please enter a symbol (e.g. LUCK, BTC)');
            return;
        }
        setLoading(true);
        const token = getAuthToken();
        try {
            const res = await fetch('/api/admin/x-copilot/generate', {
                method: 'POST',
                body: JSON.stringify({ symbol, notes, mode, targetTweet }),
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await res.json();
            if (data.draft) {
                setDraft(data.draft);
                setContextData(data.contextData);
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

    if (authLoading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-black flex items-center gap-3 tracking-tighter">
                        <Sparkles className="text-blue-500 w-10 h-10" /> X-COPILOT
                    </h1>
                    <p className="text-muted-foreground mt-1">Generate data-backed drafts in your brand voice.</p>
                </div>
                <div className="flex p-1 bg-muted rounded-lg w-fit border border-border">
                    <button
                        onClick={() => setMode('tweet')}
                        className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${mode === 'tweet' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        New Tweet
                    </button>
                    <button
                        onClick={() => setMode('reply')}
                        className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${mode === 'reply' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        Reply Mode
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                {/* --- Left Column: Inputs --- */}
                <div className="xl:col-span-4 space-y-6">
                    <Card className="shadow-xl bg-card/50 backdrop-blur-sm border-blue-500/10">
                        <CardHeader><CardTitle className="text-sm uppercase tracking-widest opacity-50 font-black">1. Context Inputs</CardTitle></CardHeader>
                        <CardContent className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase text-muted-foreground">Asset Symbol</label>
                                <Input
                                    value={symbol}
                                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                                    placeholder="LUCK, SYS, BTC..."
                                    className="h-12 text-lg font-mono border-blue-500/20 focus:border-blue-500"
                                />
                            </div>

                            {mode === 'reply' && (
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase text-muted-foreground">Tweet to Reply to</label>
                                    <Textarea
                                        value={targetTweet}
                                        onChange={(e) => setTargetTweet(e.target.value)}
                                        className="h-32 text-sm leading-relaxed"
                                        placeholder="Paste the tweet content here..."
                                    />
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase text-muted-foreground">Your Thoughts / Signal</label>
                                <Textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="h-32 text-sm leading-relaxed"
                                    placeholder="What signal do you want to emphasize? (e.g. liquidity is rotating...)"
                                />
                            </div>

                            <Button
                                className="w-full h-14 text-lg font-black bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 gap-2"
                                onClick={generate}
                                disabled={loading}
                            >
                                {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                                {loading ? 'Synthesizing...' : `Generate ${mode === 'reply' ? 'Reply' : 'Tweet'}`}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* --- Data Stats Panel --- */}
                    {contextData && (
                        <Card className="bg-muted/30 border-dashed border-2">
                            <CardHeader><CardTitle className="text-sm uppercase tracking-widest opacity-50 font-black">Agent Findings</CardTitle></CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-3 bg-background rounded-lg border">
                                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Price vs 52wH</p>
                                        <p className="text-lg font-black text-blue-500">
                                            {contextData.price_context.current} / {contextData.price_context.five_two_week_high}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-background rounded-lg border">
                                        <p className="text-[10px] uppercase font-bold text-muted-foreground">P/E vs Sector</p>
                                        <p className="text-lg font-black text-orange-500">
                                            {contextData.valuation_context.company_pe.toFixed(1)}x / {contextData.valuation_context.sector_avg_pe.toFixed(1)}x
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-[10px] uppercase font-bold text-muted-foreground">Recent Earnings (EPS)</p>
                                    <div className="flex gap-2 overflow-x-auto pb-2">
                                        {contextData.earnings.quarterly.slice(0, 4).map((q: any, i: number) => (
                                            <div key={i} className="px-3 py-1 bg-background rounded border text-xs font-mono shrink-0">
                                                {q.eps > 0 ? '+' : ''}{q.eps.toFixed(2)}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/20">
                                    <p className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Dividend Yield</p>
                                    <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                                        {contextData.dividend_history.yield_at_time}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* --- Right Column: The Draft --- */}
                <div className="xl:col-span-8">
                    <Card className="shadow-2xl border-blue-500/20 bg-card overflow-hidden">
                        <div className="h-2 bg-gradient-to-r from-blue-600 to-cyan-500" />
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm uppercase tracking-widest opacity-50 font-black">2. Final Brand Output</CardTitle>
                            {draft && (
                                <span className={`text-xs font-bold px-2 py-1 rounded ${draft.length > 280 ? 'bg-red-500/10 text-red-500' : 'bg-muted'}`}>
                                    {draft.length} / 280
                                </span>
                            )}
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="p-8 bg-muted/20 rounded-2xl min-h-[300px] font-serif text-2xl leading-[1.6] border relative group">
                                {draft ? (
                                    <div className="whitespace-pre-wrap">{draft}</div>
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/30">
                                        <Sparkles className="w-12 h-12 mb-2 animate-pulse" />
                                        <p className="italic">Draft will materialize here...</p>
                                    </div>
                                )}
                            </div>

                            {draft && (
                                <div className="flex flex-col md:flex-row gap-4 pt-4">
                                    <Button variant="outline" className="h-14 flex-1 text-lg font-bold border-2 hover:bg-muted" onClick={copyToClipboard}>
                                        <Copy className="w-5 h-5 mr-3" /> Copy Text
                                    </Button>
                                    <Button className="h-14 flex-1 text-lg font-black bg-black hover:bg-zinc-900 text-white" onClick={openInX}>
                                        <Send className="w-5 h-5 mr-3 text-[#1DA1F2]" /> Post Draft to X
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-6 bg-card border rounded-xl">
                            <h4 className="font-bold mb-2">Macro Grounding</h4>
                            <p className="text-sm text-muted-foreground">The AI uses your database's long-term history to avoid short-term price noise.</p>
                        </div>
                        <div className="p-6 bg-card border rounded-xl">
                            <h4 className="font-bold mb-2">Zero Hype</h4>
                            <p className="text-sm text-muted-foreground">Guidelines strictly prohibit emojis, hashtags, and "to the moon" language.</p>
                        </div>
                        <div className="p-6 bg-card border rounded-xl">
                            <h4 className="font-bold mb-2">Contextual Memory</h4>
                            <p className="text-sm text-muted-foreground">It compares stock P/E against the broader sector to find true "relative value" signals.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
