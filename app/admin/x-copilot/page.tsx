'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, getAuthToken } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Copy, Send, Sparkles, Loader2, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAlertConfigs, updateAlertConfig } from '../prompts/actions';
import { Switch } from '@/components/ui/switch'; // Assuming shadcn switch exists, otherwise use button toggle

export default function XCopilotPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [symbol, setSymbol] = useState('');
    const [notes, setNotes] = useState('');
    const [mode, setMode] = useState<'tweet' | 'reply' | 'briefing'>('tweet');
    const [targetTweet, setTargetTweet] = useState('');
    const [draft, setDraft] = useState('');
    const [reasoningLog, setReasoningLog] = useState<any[]>([]);
    const [trace, setTrace] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    // ... existing ...
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [postFormat, setPostFormat] = useState<'short' | 'long'>('short');

    // Config State
    const [configs, setConfigs] = useState({
        auto_tweet_ath: false,
        auto_tweet_52w: false,
        auto_tweet_vol: false
    });

    useEffect(() => {
        if (user) {
            getAlertConfigs().then(rows => {
                const map: any = {};
                rows.forEach((r: any) => {
                    try { map[r.key] = JSON.parse(r.value); } catch (e) { map[r.key] = r.value }
                });
                setConfigs(prev => ({
                    ...prev,
                    auto_tweet_ath: map.auto_tweet_ath === true,
                    auto_tweet_52w: map.auto_tweet_52w === true,
                    auto_tweet_vol: map.auto_tweet_vol === true,
                }));
            });
        }
    }, [user]);

    const toggleConfig = async (key: string) => {
        const newVal = !configs[key as keyof typeof configs];
        setConfigs(prev => ({ ...prev, [key]: newVal })); // Optimistic update
        try {
            await updateAlertConfig(key, newVal);
            toast.success(`Updated ${key}`);
        } catch (e) {
            toast.error('Failed to update config');
            setConfigs(prev => ({ ...prev, [key]: !newVal })); // Revert
        }
    }

    // ... existing code ...

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            {/* Header ... */}

            {/* New Automation Settings Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-card/50 border-blue-500/10">
                    <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-widest opacity-70">Auto-Tweet ATH</CardTitle></CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <span className="text-sm">Enable for All-Time Highs</span>
                            <button
                                onClick={() => toggleConfig('auto_tweet_ath')}
                                className={`w-10 h-6 rounded-full transition-colors ${configs.auto_tweet_ath ? 'bg-blue-600' : 'bg-muted'}`}
                            >
                                <div className={`w-4 h-4 rounded-full bg-white transform transition-transform ml-1 ${configs.auto_tweet_ath ? 'translate-x-4' : ''}`} />
                            </button>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card/50 border-blue-500/10">
                    <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-widest opacity-70">Auto-Tweet 52W High</CardTitle></CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <span className="text-sm">Enable for 52-Week Highs</span>
                            <button
                                onClick={() => toggleConfig('auto_tweet_52w')}
                                className={`w-10 h-6 rounded-full transition-colors ${configs.auto_tweet_52w ? 'bg-blue-600' : 'bg-muted'}`}
                            >
                                <div className={`w-4 h-4 rounded-full bg-white transform transition-transform ml-1 ${configs.auto_tweet_52w ? 'translate-x-4' : ''}`} />
                            </button>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card/50 border-blue-500/10">
                    <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-widest opacity-70">Auto-Tweet Volume</CardTitle></CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <span className="text-sm">Enable for Volume Surges</span>
                            <button
                                onClick={() => toggleConfig('auto_tweet_vol')}
                                className={`w-10 h-6 rounded-full transition-colors ${configs.auto_tweet_vol ? 'bg-blue-600' : 'bg-muted'}`}
                            >
                                <div className={`w-4 h-4 rounded-full bg-white transform transition-transform ml-1 ${configs.auto_tweet_vol ? 'translate-x-4' : ''}`} />
                            </button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                {/* ... Left Column ... */}
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
                                <label className="text-xs font-bold uppercase text-muted-foreground italic">Post Length / Format</label>
                                <div className="grid grid-cols-2 gap-2 p-1 bg-muted/50 rounded-lg border">
                                    <button
                                        onClick={() => setPostFormat('short')}
                                        className={`py-2 text-xs font-black uppercase tracking-widest rounded-md transition-all ${postFormat === 'short' ? 'bg-blue-600 text-white shadow-lg' : 'text-muted-foreground hover:bg-muted'}`}
                                    >
                                        Small Post <span className="block text-[8px] opacity-60 font-medium">Standard Limit</span>
                                    </button>
                                    <button
                                        onClick={() => setPostFormat('long')}
                                        className={`py-2 text-xs font-black uppercase tracking-widest rounded-md transition-all ${postFormat === 'long' ? 'bg-purple-600 text-white shadow-lg' : 'text-muted-foreground hover:bg-muted'}`}
                                    >
                                        Long Post <span className="block text-[8px] opacity-60 font-medium">Detailed / Thread</span>
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase text-muted-foreground">Your Thoughts / Signal</label>
                                <Textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="h-32 text-sm leading-relaxed"
                                    placeholder="What signal do you want to emphasize? (e.g. liquidity is rotating...)"
                                />
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    className="flex-1 h-14 text-lg font-black bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 gap-2"
                                    onClick={generate}
                                    disabled={loading}
                                >
                                    {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                                    {loading ? 'Agent is Thinking...' : `Generate ${mode === 'reply' ? 'Reply' : 'Tweet'}`}
                                </Button>
                                <Button
                                    variant="outline"
                                    className={`h-14 px-4 ${showAdvanced ? 'bg-zinc-800 text-white' : ''}`}
                                    onClick={() => setShowAdvanced(!showAdvanced)}
                                    title="Show Raw Payload Payload"
                                >
                                    <Settings2 className="w-5 h-5" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* --- Agentic Reasoning Log --- */}
                    {reasoningLog.length > 0 && (
                        <Card className="bg-muted/30 border-dashed border-2 overflow-hidden">
                            <CardHeader className="bg-muted/50 py-3"><CardTitle className="text-[10px] uppercase tracking-[0.2em] opacity-70 font-black">Agentic Reasoning Log</CardTitle></CardHeader>
                            <CardContent className="p-0 max-h-[500px] overflow-y-auto">
                                <div className="divide-y divide-border/50">
                                    {reasoningLog.map((log, i) => (
                                        <div key={i} className="p-4 space-y-2 animate-in fade-in slide-in-from-top-1 duration-300">
                                            {log.type === 'thought' && (
                                                <div className={`flex gap-3 p-2 rounded-lg ${log.isRawThinking ? 'bg-amber-500/5 border border-amber-500/10' : ''}`}>
                                                    <div className={`w-6 h-6 rounded-full ${log.isRawThinking ? 'bg-amber-500/10' : 'bg-blue-500/10'} flex items-center justify-center shrink-0`}>
                                                        {log.isRawThinking ? <div className="w-1.5 h-1.5 bg-amber-500 animate-pulse rounded-full" /> : <Sparkles className="w-3 h-3 text-blue-500" />}
                                                    </div>
                                                    <p className={`text-xs italic leading-relaxed ${log.isRawThinking ? 'text-amber-700 dark:text-amber-200/70 font-mono text-[10px]' : 'text-muted-foreground'}`}>
                                                        {log.isRawThinking && <span className="block not-italic font-black text-[8px] uppercase tracking-widest opacity-50 mb-1">Raw thinking block</span>}
                                                        {log.content}
                                                    </p>
                                                </div>
                                            )}
                                            {log.type === 'tool_call' && (
                                                <div className="flex gap-3">
                                                    <div className="w-6 h-6 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                                                        <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-[10px] font-black uppercase text-orange-500 tracking-wider">Tool Call: {log.name}</p>
                                                        <pre className="text-[9px] font-mono bg-background p-2 rounded border opacity-70 truncate max-w-[200px]">
                                                            {JSON.stringify(log.args)}
                                                        </pre>
                                                    </div>
                                                </div>
                                            )}
                                            {log.type === 'tool_response' && (
                                                <div className="flex gap-3">
                                                    <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                                                        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-[10px] font-black uppercase text-emerald-500 tracking-wider">Tool Output Received</p>
                                                        <div className="max-h-[100px] overflow-y-auto w-full">
                                                            <pre className="text-[9px] font-mono bg-background/50 p-2 rounded border opacity-60">
                                                                {JSON.stringify(log.result, null, 2)}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
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
                                        {loading ? (
                                            <Loader2 className="w-12 h-12 mb-2 animate-spin text-blue-500" />
                                        ) : (
                                            <Sparkles className="w-12 h-12 mb-2" />
                                        )}
                                        <p className="italic">{loading ? 'Agent is synthesizing data...' : 'Draft will materialize here...'}</p>
                                    </div>
                                )}
                            </div>

                            {draft && (
                                <div className="flex flex-col md:flex-row gap-4 pt-4">
                                    <Button variant="outline" className="h-14 flex-1 text-lg font-bold border-2 hover:bg-muted" onClick={copyToClipboard}>
                                        <Copy className="w-5 h-5 mr-3" /> Copy Text
                                    </Button>
                                    <Button className="h-14 flex-1 text-lg font-black bg-black hover:bg-zinc-900 text-white" onClick={openInX}>
                                        <div className="w-5 h-5 mr-3 flex items-center justify-center bg-white rounded-full">
                                            <span className="text-black text-[10px]">X</span>
                                        </div> Post Draft to X
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-6 bg-card border rounded-xl flex gap-4">
                            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                                <Sparkles className="w-5 h-5 text-blue-500" />
                            </div>
                            <div>
                                <h4 className="font-bold mb-1">Agentic Reasoning</h4>
                                <p className="text-sm text-muted-foreground">The agent doesn't just "see" data—it decides which database tables to query based on your inputs.</p>
                            </div>
                        </div>
                        <div className="p-6 bg-card border rounded-xl flex gap-4">
                            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                                <Send className="w-5 h-5 text-emerald-500" />
                            </div>
                            <div>
                                <h4 className="font-bold mb-1">Granular Tool Use</h4>
                                <p className="text-sm text-muted-foreground">Prices, P/E, and Earnings are fetched as individual tools, allowing the AI to "drill down" where needed.</p>
                            </div>
                        </div>
                    </div>

                    {/* --- Advanced: Raw Payload Trace --- */}
                    {showAdvanced && trace && (
                        <Card className="mt-8 border-red-500/20 bg-black text-zinc-400 font-mono text-[10px] overflow-hidden">
                            <CardHeader className="bg-zinc-900 py-2 flex flex-row items-center justify-between">
                                <CardTitle className="text-[10px] uppercase tracking-widest font-black text-red-500">Raw AI Payload Trace (Advanced)</CardTitle>
                                <span className="text-[8px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded">WIRE-LEVEL DATA</span>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
                                <div>
                                    <p className="text-zinc-200 mb-1 border-b border-zinc-800 pb-1">System Instruction:</p>
                                    <pre className="whitespace-pre-wrap opacity-70 italic">{trace.systemInstruction}</pre>
                                </div>
                                <div>
                                    <p className="text-zinc-200 mb-1 border-b border-zinc-800 pb-1">Conversation History JSON:</p>
                                    <pre className="whitespace-pre-wrap">{JSON.stringify(trace.history, null, 2)}</pre>
                                </div>
                                <div>
                                    <p className="text-zinc-200 mb-1 border-b border-zinc-800 pb-1">Tools Config Sent:</p>
                                    <pre className="whitespace-pre-wrap">{JSON.stringify(trace.toolsSentToModel, null, 2)}</pre>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
