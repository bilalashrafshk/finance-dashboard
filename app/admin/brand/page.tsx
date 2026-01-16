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
    const [examples, setExamples] = useState<string[]>([]);
    const [newExample, setNewExample] = useState('');
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
        setExamples([...examples, newExample]);
        setNewExample('');
    };

    if (loading) return <div className="p-8">Loading...</div>;

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold">X-Copilot Brand Training</h1>

            <Card>
                <CardHeader><CardTitle>System Instructions</CardTitle></CardHeader>
                <CardContent>
                    <Textarea
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        className="h-64 font-mono text-sm"
                        placeholder="Enter brand guidelines here..."
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Style Examples (Few-Shot)</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    {examples.map((ex, i) => (
                        <div key={i} className="p-3 bg-secondary rounded-lg relative group">
                            <p className="text-sm italic">"{ex}"</p>
                            <Button
                                variant="destructive"
                                size="sm"
                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"
                                onClick={() => setExamples(examples.filter((_, idx) => idx !== i))}
                            >Delete</Button>
                        </div>
                    ))}
                    <div className="flex gap-2">
                        <Input
                            value={newExample}
                            onChange={(e) => setNewExample(e.target.value)}
                            placeholder="Add a new tweet example..."
                        />
                        <Button onClick={addExample}>Add</Button>
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
