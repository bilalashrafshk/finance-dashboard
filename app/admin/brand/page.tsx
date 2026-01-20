'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, getAuthToken } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { AlertConfigEditor } from '../prompts/alert-config-editor';
import { getAlertConfigs } from '../prompts/actions';

export default function AdminBrandPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    // Global
    const [instructions, setInstructions] = useState('');
    const [examples, setExamples] = useState<{ text: string; type: 'short' | 'long' }[]>([]);
    const [newExample, setNewExample] = useState('');
    const [newExampleType, setNewExampleType] = useState<'short' | 'long'>('short');
    const [newExampleMode, setNewExampleMode] = useState<'tweet' | 'reply' | 'briefing'>('tweet');

    // Models
    const [model, setModel] = useState('gemini-2.0-flash');
    const [brainModel, setBrainModel] = useState('');
    const [handModel, setHandModel] = useState('');
    const [humanizerModel, setHumanizerModel] = useState('');

    // Tweet Mode
    const [tweetCoordinator, setTweetCoordinator] = useState('');
    const [tweetDrafter, setTweetDrafter] = useState('');
    const [tweetHumanizer, setTweetHumanizer] = useState('');
    const [tweetTools, setTweetTools] = useState<Record<string, boolean>>({});

    // Reply Mode
    const [replyCoordinator, setReplyCoordinator] = useState('');
    const [replyDrafter, setReplyDrafter] = useState('');
    const [replyHumanizer, setReplyHumanizer] = useState('');
    const [replyTools, setReplyTools] = useState<Record<string, boolean>>({});

    // Briefing Mode
    const [briefingCoordinator, setBriefingCoordinator] = useState('');
    const [briefingDrafter, setBriefingDrafter] = useState(''); // Maps to briefing_instructions
    const [briefingHumanizer, setBriefingHumanizer] = useState('');
    const [briefingTools, setBriefingTools] = useState<Record<string, boolean>>({});

    const allTools = [
        { id: 'getCompanyProfile', label: 'Company Profile', desc: 'Price, P/E, Sector, Valuation' },
        { id: 'getPriceHistoryMetrics', label: 'Price History', desc: '52w High/Low, History' },
        { id: 'getQuarterlyEarnings', label: 'Quarterly Earnings', desc: 'Last 8 Quarters EPS/Net Income' },
        { id: 'getAnnualEarnings', label: 'Annual Earnings', desc: 'Last 3 Years Profitability' },
        { id: 'getDividendInfo', label: 'Dividend Info', desc: 'Yield and Payment History' },
        { id: 'getMarketSummary', label: 'Market Heatmap', desc: 'Sector Performance & Top Movers' },
        { id: 'googleSearch', label: 'Google Search', desc: 'Real-time News & Macro' },
    ];

    // Alert Configs
    const [alertConfigs, setAlertConfigs] = useState<any[]>([]);

    useEffect(() => {
        if (!authLoading) {
            if (!user) {
                router.push("/auth/login");
            } else if (user.role !== "admin") {
                router.push("/dashboard");
            } else {
                fetchData();
            }
        }
    }, [user, authLoading, router]);

    const fetchData = async () => {
        const token = getAuthToken();

        // Parallel fetch for brand data and alert configs
        const [brandRes, configs] = await Promise.all([
            fetch('/api/admin/brand', { headers: { 'Authorization': `Bearer ${token}` } }),
            getAlertConfigs()
        ]);

        const data = await brandRes.json();
        setAlertConfigs(configs);

        // Global
        setInstructions(data.instructions || '');
        setExamples(data.examples || []);
        setModel(data.default_model || 'gemini-2.0-flash');
        setBrainModel(data.brain_model || '');
        setHandModel(data.hand_model || '');
        setHumanizerModel(data.humanizer_model || '');

        // Tweet (Fallbacks to legacy if new columns empty)
        setTweetCoordinator(data.tweet_coordinator_prompt || data.coordinator_instructions || '');
        setTweetDrafter(data.tweet_drafter_prompt || data.instructions || '');
        setTweetHumanizer(data.tweet_humanizer_prompt || data.humanizer_instructions || '');
        setTweetTools(data.tweet_tools || data.enabled_tools || {});

        // Reply
        setReplyCoordinator(data.reply_coordinator_prompt || data.coordinator_instructions || '');
        setReplyDrafter(data.reply_drafter_prompt || data.instructions || '');
        setReplyHumanizer(data.reply_humanizer_prompt || data.humanizer_instructions || '');
        setReplyTools(data.reply_tools || data.enabled_tools || {});

        // Briefing
        setBriefingCoordinator(data.briefing_coordinator_prompt || data.coordinator_instructions || '');
        setBriefingDrafter(data.briefing_instructions || ''); // briefing_instructions is the canonical drafter prompt for this mode
        setBriefingHumanizer(data.briefing_humanizer_prompt || '');
        setBriefingTools(data.briefing_tools || data.enabled_tools || {});

        setLoading(false);
    };

    const save = async () => {
        const token = getAuthToken();
        const payload = {
            // Global
            instructions,
            examples,
            default_model: model,
            brain_model: brainModel,
            hand_model: handModel,
            humanizer_model: humanizerModel,

            // Tweet
            tweet_coordinator_prompt: tweetCoordinator,
            tweet_drafter_prompt: tweetDrafter,
            tweet_humanizer_prompt: tweetHumanizer,
            tweet_tools: tweetTools,

            // Reply
            reply_coordinator_prompt: replyCoordinator,
            reply_drafter_prompt: replyDrafter,
            reply_humanizer_prompt: replyHumanizer,
            reply_tools: replyTools,

            // Briefing
            briefing_coordinator_prompt: briefingCoordinator,
            briefing_instructions: briefingDrafter, // Mapped back to legacy column
            briefing_humanizer_prompt: briefingHumanizer,
            briefing_tools: briefingTools,
        };

        const res = await fetch('/api/admin/brand', {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        if (res.ok) toast.success('Brand personality updated');
        else toast.error('Failed to update');
    };

    const addExample = () => {
        if (!newExample) return;
        setExamples([...examples, {
            text: newExample,
            type: newExampleType,
            mode: newExampleMode
        } as any]);
        setNewExample('');
    };

    const ToolSelector = ({ tools, setTools }: { tools: Record<string, boolean>, setTools: (t: Record<string, boolean>) => void }) => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {allTools.map(tool => (
                <div key={tool.id} className="flex items-start gap-3 p-3 bg-secondary/50 rounded-lg border border-border">
                    <input
                        type="checkbox"
                        id={`${tool.id}-${Math.random()}`} // unique id hack for accessibility if rendered multiple times
                        checked={tools[tool.id] !== false}
                        onChange={(e) => setTools({ ...tools, [tool.id]: e.target.checked })}
                        className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                        <label className="text-sm font-bold block">{tool.label}</label>
                        <p className="text-xs text-muted-foreground">{tool.desc}</p>
                    </div>
                </div>
            ))}
        </div>
    );

    if (loading) return <div className="p-8">Loading...</div>;

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold font-black tracking-tight flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/30">X</div>
                    Brand Identity & Mode Training
                </h1>
                <Button size="lg" className="bg-blue-600 hover:bg-blue-700 font-bold" onClick={save}>Save Changes</Button>
            </div>

            <Tabs defaultValue="global" className="w-full">
                <TabsList className="grid w-full grid-cols-4 lg:w-[600px] mb-8">
                    <TabsTrigger value="global">Global Identity</TabsTrigger>
                    <TabsTrigger value="tweet">New Tweet</TabsTrigger>
                    <TabsTrigger value="reply">Reply Mode</TabsTrigger>
                    <TabsTrigger value="briefing">News Briefing</TabsTrigger>
                </TabsList>

                {/* --- GLOBAL IDENTITY --- */}
                <TabsContent value="global" className="space-y-6">
                    <Card>
                        <CardHeader><CardTitle>Core System Persona</CardTitle></CardHeader>
                        <CardContent>
                            <Textarea
                                value={instructions}
                                onChange={(e) => setInstructions(e.target.value)}
                                className="h-64 font-mono text-sm leading-relaxed"
                                placeholder="Define the base persona (Voice, Tone, Style) used as a default..."
                            />
                        </CardContent>
                    </Card>

                    {/* Auto-Tweet Settings */}
                    <Card>
                        <CardHeader><CardTitle>Automation Settings</CardTitle></CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {['auto_tweet_ath', 'auto_tweet_52w', 'auto_tweet_vol'].map(key => {
                                    const config = alertConfigs.find(c => c.key === key);
                                    if (!config) return null;
                                    return (
                                        <div key={key} className="border rounded-xl p-6 bg-card/50 transition-all border-blue-500/10 bg-blue-500/5">
                                            <AlertConfigEditor config={config} />
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle>Style Examples (Few-Shot)</CardTitle>
                                <div className="flex gap-4 text-xs font-bold uppercase opacity-50">
                                    <span>Short: {examples.filter(e => e.type === 'short').length}</span>
                                    <span>Long: {examples.filter(e => e.type === 'long').length}</span>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-3">
                                {examples.map((ex, i) => (
                                    <div key={i} className="p-4 bg-secondary/30 border rounded-xl relative group hover:bg-secondary/50 transition-colors">
                                        <div className="flex gap-2 mb-2">
                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${ex.type === 'long' ? 'bg-purple-500/10 text-purple-600' : 'bg-blue-500/10 text-blue-600'}`}>
                                                {ex.type} Post
                                            </span>
                                            {(ex as any).mode && (
                                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${(ex as any).mode === 'reply' ? 'bg-orange-500/10 text-orange-600' : (ex as any).mode === 'briefing' ? 'bg-indigo-500/10 text-indigo-600' : 'bg-blue-500/10 text-blue-600'}`}>
                                                    {(ex as any).mode}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm font-medium leading-relaxed">"{ex.text}"</p>
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            className="absolute top-4 right-4 h-7 text-[10px] uppercase font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => setExamples(examples.filter((_, idx) => idx !== i))}
                                        >Remove</Button>
                                    </div>
                                ))}
                            </div>
                            <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-500/10 rounded-xl space-y-3">
                                <div className="flex gap-6 mb-2">
                                    <div className="flex gap-4">
                                        {['short', 'long'].map((t) => (
                                            <label key={t} className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="type"
                                                    checked={newExampleType === t}
                                                    onChange={() => setNewExampleType(t as any)}
                                                />
                                                <span className="text-xs font-bold uppercase">{t}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <div className="w-px h-4 bg-border self-center" />
                                    <div className="flex gap-4">
                                        {['tweet', 'reply', 'briefing'].map((m) => (
                                            <label key={m} className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="mode"
                                                    checked={newExampleMode === m}
                                                    onChange={() => setNewExampleMode(m as any)}
                                                />
                                                <span className="text-xs font-bold uppercase">{m}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Input
                                        value={newExample}
                                        onChange={(e) => setNewExample(e.target.value)}
                                        placeholder="Paste a high-performing tweet sample here..."
                                        className="bg-background"
                                    />
                                    <Button onClick={addExample} className="bg-blue-600 font-bold">Add Example</Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle>Model Selection</CardTitle></CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase text-muted-foreground">Default Model</label>
                                <Input value={model} onChange={(e) => setModel(e.target.value)} list="gemini-models" className="font-mono" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase text-blue-600">🧠 Brain (Planning)</label>
                                <Input value={brainModel} onChange={(e) => setBrainModel(e.target.value)} list="gemini-models" className="font-mono" placeholder="Default Override" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase text-orange-600">⚙️ Hand (Drafting)</label>
                                <Input value={handModel} onChange={(e) => setHandModel(e.target.value)} list="gemini-models" className="font-mono" placeholder="Default Override" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase text-green-600">✨ Humanizer (Style)</label>
                                <Input value={humanizerModel} onChange={(e) => setHumanizerModel(e.target.value)} list="gemini-models" className="font-mono" placeholder="Default Override" />
                            </div>
                            <datalist id="gemini-models">
                                <option value="gemini-2.0-flash" />
                                <option value="gemini-2.0-flash-lite" />
                                <option value="gemini-1.5-pro" />
                                <option value="gemini-2.0-pro-exp-02-05" />
                                <option value="gemini-2.0-flash-thinking-preview-01-21" />
                            </datalist>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* --- TWEET MODE --- */}
                <TabsContent value="tweet" className="space-y-6">
                    <Card className="border-blue-500/20 shadow-sm bg-blue-500/[0.02]">
                        <CardHeader><CardTitle className="text-blue-600">Broadcast Mode Configuration</CardTitle></CardHeader>
                        <CardContent className="space-y-8">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold flex items-center gap-2">🧠 Phase 1: Planning (Coordinator)</label>
                                    <Textarea
                                        value={tweetCoordinator}
                                        onChange={(e) => setTweetCoordinator(e.target.value)}
                                        className="h-48 font-mono text-xs bg-background/80"
                                        placeholder="Define how the AI plans the tweet..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold flex items-center gap-2">✍️ Phase 2: Drafting (Hand)</label>
                                    <Textarea
                                        value={tweetDrafter}
                                        onChange={(e) => setTweetDrafter(e.target.value)}
                                        className="h-48 font-mono text-xs bg-background/80"
                                        placeholder="Define how the AI drafts the content..."
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold flex items-center gap-2">✨ Phase 3: Humanization (Style)</label>
                                <Textarea
                                    value={tweetHumanizer}
                                    onChange={(e) => setTweetHumanizer(e.target.value)}
                                    className="h-32 font-mono text-xs bg-background/80"
                                    placeholder="Define refinement rules..."
                                />
                            </div>
                            <div className="pt-4 border-t">
                                <h3 className="text-sm font-bold mb-4">Enabled Tools (Broadcast Mode)</h3>
                                <ToolSelector tools={tweetTools} setTools={setTweetTools} />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* --- REPLY MODE --- */}
                <TabsContent value="reply" className="space-y-6">
                    <Card className="border-orange-500/20 shadow-sm bg-orange-500/[0.02]">
                        <CardHeader><CardTitle className="text-orange-600">Reply & Engage Mode Configuration</CardTitle></CardHeader>
                        <CardContent className="space-y-8">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold flex items-center gap-2">🧠 Phase 1: Planning (Coordinator)</label>
                                    <Textarea
                                        value={replyCoordinator}
                                        onChange={(e) => setReplyCoordinator(e.target.value)}
                                        className="h-48 font-mono text-xs bg-background/80"
                                        placeholder="Define how the AI analyzes the target tweet..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold flex items-center gap-2">✍️ Phase 2: Drafting (Hand)</label>
                                    <Textarea
                                        value={replyDrafter}
                                        onChange={(e) => setReplyDrafter(e.target.value)}
                                        className="h-48 font-mono text-xs bg-background/80"
                                        placeholder="Define how the AI formulates the reply..."
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold flex items-center gap-2">✨ Phase 3: Humanization (Style)</label>
                                <Textarea
                                    value={replyHumanizer}
                                    onChange={(e) => setReplyHumanizer(e.target.value)}
                                    className="h-32 font-mono text-xs bg-background/80"
                                    placeholder="Define reply tone rules..."
                                />
                            </div>
                            <div className="pt-4 border-t">
                                <h3 className="text-sm font-bold mb-4">Enabled Tools (Reply Mode)</h3>
                                <ToolSelector tools={replyTools} setTools={setReplyTools} />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* --- BRIEFING MODE --- */}
                <TabsContent value="briefing" className="space-y-6">
                    <Card className="border-indigo-500/20 shadow-sm bg-indigo-500/[0.02]">
                        <CardHeader><CardTitle className="text-indigo-600">News Briefing Mode Configuration</CardTitle></CardHeader>
                        <CardContent className="space-y-8">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold flex items-center gap-2">🧠 Phase 1: Planning (Coordinator)</label>
                                    <Textarea
                                        value={briefingCoordinator}
                                        onChange={(e) => setBriefingCoordinator(e.target.value)}
                                        className="h-48 font-mono text-xs bg-background/80"
                                        placeholder="Define how the AI plans the briefing..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold flex items-center gap-2">✍️ Phase 2: Drafting (Hand)</label>
                                    <Textarea
                                        value={briefingDrafter}
                                        onChange={(e) => setBriefingDrafter(e.target.value)}
                                        className="h-48 font-mono text-xs bg-background/80"
                                        placeholder="Define the structure of the news briefing..."
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold flex items-center gap-2">✨ Phase 3: Humanization (Style)</label>
                                <p className="text-xs text-muted-foreground mb-1">Optional for Briefings. Usually skipped to preserve bullets.</p>
                                <Textarea
                                    value={briefingHumanizer}
                                    onChange={(e) => setBriefingHumanizer(e.target.value)}
                                    className="h-32 font-mono text-xs bg-background/80"
                                    placeholder="Define refinement rules if needed..."
                                />
                            </div>
                            <div className="pt-4 border-t">
                                <h3 className="text-sm font-bold mb-4">Enabled Tools (Briefing Mode)</h3>
                                <ToolSelector tools={briefingTools} setTools={setBriefingTools} />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
