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
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    const save = async () => {
        const token = getAuthToken();
        const res = await fetch('/api/admin/brand', {
            method: 'POST',
            body: JSON.stringify({ instructions, examples, default_model: model }),
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
                    <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="w-full h-10 px-3 bg-secondary rounded-md border border-input text-sm focus:ring-2 focus:ring-ring"
                    >
                        <option value="gemini-2.0-flash">Gemini 2.0 Flash (Fast & Experimental)</option>
                        <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite (Cheapest)</option>
                        <option value="gemini-1.5-pro">Gemini 1.5 Pro (Steady)</option>
                        <option value="gemini-2.0-pro-exp-02-05">Gemini 2.0 Pro Experimental (Deep Reasoning)</option>
                    </select>
                    <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg">
                        <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                            {model.includes('2.0') ?
                                "✨ You are using a 2.0 Agentic model. This supports high-speed tool-calling and reasoning loop." :
                                "⚠️ Warning: This model may be slower or less capable in complex reasoning loops."}
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Button size="lg" className="w-full" onClick={save}>Save Brand Profile</Button>
        </div>
    );
}
