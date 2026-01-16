'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, getAuthToken } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function AdminBrandPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [instructions, setInstructions] = useState('');
    const [examples, setExamples] = useState<{ text: string; type: 'short' | 'long' }[]>([]);
    const [newExample, setNewExample] = useState('');
    const [newExampleType, setNewExampleType] = useState<'short' | 'long'>('short');
    const [model, setModel] = useState('gemini-2.0-flash');
    const [enabledTools, setEnabledTools] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);

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

    const fetchData = () => {
        const token = getAuthToken();
        fetch('/api/admin/brand', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                setInstructions(data.instructions);
                setExamples(data.examples || []);
                setModel(data.default_model);
                setEnabledTools(data.enabled_tools || {});
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    const save = async () => {
        const token = getAuthToken();
        const res = await fetch('/api/admin/brand', {
            method: 'POST',
            body: JSON.stringify({ instructions, examples, default_model: model, enabled_tools: enabledTools }),
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
        setExamples([...examples, { text: newExample, type: newExampleType }]);
        setNewExample('');
    };

    if (loading) return <div className="p-8">Loading...</div>;

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold font-black tracking-tight flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/30">X</div>
                Brand Identity Training
            </h1>

            <Card>
                <CardHeader><CardTitle>1. System Instructions & Persona</CardTitle></CardHeader>
                <CardContent>
                    <Textarea
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        className="h-64 font-mono text-sm leading-relaxed"
                        placeholder="Define how the AI should think and write..."
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>2. Style Examples (Few-Shot)</CardTitle>
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
                        <div className="flex gap-4 mb-2">
                            {['short', 'long'].map((t) => (
                                <label key={t} className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="type"
                                        checked={newExampleType === t}
                                        onChange={() => setNewExampleType(t as any)}
                                    />
                                    <span className="text-xs font-bold uppercase">{t} Example</span>
                                </label>
                            ))}
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
                <CardHeader>
                    <CardTitle>Model Selection</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-muted-foreground">Active Model Name</label>
                        <Input
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            placeholder="e.g. gemini-2.0-flash-thinking-preview"
                            list="gemini-models"
                            className="font-mono"
                        />
                        <datalist id="gemini-models">
                            <option value="gemini-2.0-flash" />
                            <option value="gemini-2.0-flash-lite" />
                            <option value="gemini-1.5-pro" />
                            <option value="gemini-2.0-pro-exp-02-05" />
                            <option value="gemini-2.0-flash-thinking-preview-01-21" />
                        </datalist>
                    </div>
                    <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg">
                        <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                            {model.includes('thinking') ?
                                "🧠 RAW THINKING ENABLED: The agent will capture and display the internal chain-of-thought blocks from this model." :
                                model.includes('2.0') ?
                                    "✨ AGENTIC MODEL: High-speed tool-calling and reasoning loop supported." :
                                    "⚠️ Standard model detected."}
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>AI Data Tools / Skills</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {[
                        { id: 'getCompanyProfile', label: 'Company Profile (Price, P/E, Sector PE, Div Yield)', desc: 'Fundamental basics and current market pricing.' },
                        { id: 'getPriceHistoryMetrics', label: 'Price History (52w High/Low, History)', desc: 'Historical price action context.' },
                        { id: 'getQuarterlyEarnings', label: 'Quarterly Earnings (Last 8 Quarters)', desc: 'Recent EPS and Net Income performance.' },
                        { id: 'getAnnualEarnings', label: 'Annual Earnings (Last 3 Years)', desc: 'Long-term profitability trends.' },
                        { id: 'getDividendInfo', label: 'Dividend Info (Detailed History)', desc: 'Detailed dividend payments and yield tracking.' },
                        { id: 'googleSearch', label: 'Google Search Grounding (Web Access)', desc: 'Allow AI to search the web for real-time news and macro data.' },
                    ].map(tool => (
                        <div key={tool.id} className="flex items-start gap-3 p-3 bg-secondary/50 rounded-lg border border-border">
                            <input
                                type="checkbox"
                                id={tool.id}
                                checked={enabledTools[tool.id] !== false}
                                onChange={(e) => setEnabledTools({ ...enabledTools, [tool.id]: e.target.checked })}
                                className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div>
                                <label htmlFor={tool.id} className="text-sm font-bold block">{tool.label}</label>
                                <p className="text-xs text-muted-foreground">{tool.desc}</p>
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <Button size="lg" className="w-full h-14 text-lg font-black bg-blue-600 hover:bg-blue-700" onClick={save}>Save Brand Profile</Button>
        </div>
    );
}
