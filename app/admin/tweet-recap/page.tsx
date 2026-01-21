'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Copy, Sparkles, Loader2, RefreshCw, Twitter } from 'lucide-react';
import { toast } from 'sonner';

export default function TweetRecapPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);
    const [recapText, setRecapText] = useState('');
    const [data, setData] = useState<any>(null);

    // Protection: Admin/Staff only
    useEffect(() => {
        if (!authLoading && (!user || (user.role !== 'admin' && user.role !== 'staff'))) {
            toast.error('Unauthorized access');
            // router.push('/'); // Uncomment to enforce redirect
        }
    }, [user, authLoading, router]);

    const formatCurrency = (val: number): string => {
        if (val >= 1000000000) return (val / 1000000000).toFixed(2) + 'B';
        if (val >= 1000000) return (val / 1000000).toFixed(2) + 'M';
        return val.toLocaleString();
    };

    const generateTweet = async () => {
        setLoading(true);
        setRecapText('');
        try {
            const response = await fetch(`/api/admin/recap-data?date=${selectedDate}`);
            const result = await response.json();

            if (result.success) {
                const { index, breadth, topGainers, valueLeaders } = result.data;
                setData(result.data);

                // Build Tweet String
                let text = '';
                const changePct = index?.changePercent || 0;

                if (changePct > 0.5) text += `Karachi 100 Ends on a Bullish Note 🚀\n\n`;
                else if (changePct > 0) text += `Karachi 100 Closes in the Green 📈\n\n`;
                else if (changePct < -0.5) text += `Karachi 100 Faces Pressure 📉\n\n`;
                else if (changePct < 0) text += `Karachi 100 Dips Slightly 🔻\n\n`;
                else text += `Karachi 100 Remains Flat ⚖️\n\n`;

                if (index) {
                    text += `🔹 KSE-100: ${index.price.toLocaleString()} (${index.change >= 0 ? '+' : ''}${index.change.toFixed(2)} | ${index.changePercent.toFixed(2)}%)\n`;
                }

                text += `🔹 Breadth: 🟢 ${breadth.gainers} | 🔴 ${breadth.losers} | ⚪ ${breadth.neutral}\n\n`;

                text += `🚀 Top Gainers:\n`;
                topGainers.slice(0, 3).forEach((s: any) => {
                    text += `• ${s.symbol}: +${s.changePercent.toFixed(2)}%\n`;
                });

                text += `\n🌊 Value Leaders (Liquidity):\n`;
                valueLeaders.slice(0, 3).forEach((s: any) => {
                    text += `• ${s.symbol}: Rs ${formatCurrency(s.valueTraded)} (${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%)\n`;
                });

                text += `\n#PSX #KSE100 #PakistanMarket`;
                setRecapText(text);
                toast.success('Recap Generated!');
            } else {
                toast.error(result.error || 'Failed to fetch data');
            }
        } catch (err) {
            toast.error('Error generating recap');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        if (!recapText) return;
        navigator.clipboard.writeText(recapText);
        toast.success('Copied to clipboard');
    };

    const openInX = () => {
        if (!recapText) return;
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(recapText)}`;
        window.open(url, '_blank');
    };

    if (authLoading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-foreground">
                        Tweet <span className="text-blue-500">Recap</span> Tool
                    </h1>
                    <p className="text-muted-foreground mt-2">Generate tweet-ready market summaries for PSX</p>
                </div>
                <div className="flex gap-2">
                    <div className="px-3 py-1 bg-blue-500/10 text-blue-500 rounded-full text-xs font-bold uppercase tracking-widest border border-blue-500/20">
                        Admin Access
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Controls */}
                <Card className="lg:col-span-4 shadow-xl border-blue-500/10 bg-card/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="text-xs uppercase tracking-widest opacity-50 font-black">Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-muted-foreground">Select Date</label>
                            <Input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="h-12 border-blue-500/20 focus:border-blue-500"
                            />
                        </div>
                        <Button
                            className="w-full h-14 text-lg font-black bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 gap-2"
                            onClick={generateTweet}
                            disabled={loading}
                        >
                            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                            Generate Tweet
                        </Button>
                    </CardContent>
                </Card>

                {/* Output */}
                <Card className="lg:col-span-8 shadow-2xl border-blue-500/20 overflow-hidden">
                    <div className="h-2 bg-gradient-to-r from-blue-600 to-blue-400" />
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-xs uppercase tracking-widest opacity-50 font-black">Tweet Output</CardTitle>
                        {recapText && (
                            <span className={`text-xs font-bold px-2 py-1 rounded ${recapText.length > 280 ? 'bg-red-500/10 text-red-500' : 'bg-muted'}`}>
                                {recapText.length} / 280
                            </span>
                        )}
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="p-6 bg-muted/20 rounded-xl min-h-[300px] border border-blue-500/10 relative group">
                            {recapText ? (
                                <Textarea
                                    value={recapText}
                                    onChange={(e) => setRecapText(e.target.value)}
                                    className="min-h-[320px] text-xl font-medium leading-relaxed bg-transparent border-none focus-visible:ring-0 p-0 resize-none"
                                />
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/30">
                                    <Twitter className="w-16 h-16 mb-2 opacity-10" />
                                    <p className="italic">Click generate to see the recap...</p>
                                </div>
                            )}
                        </div>

                        {recapText && (
                            <div className="flex gap-4">
                                <Button variant="outline" className="h-14 flex-1 text-lg font-bold border-2" onClick={copyToClipboard}>
                                    <Copy className="w-5 h-5 mr-3" /> Copy Text
                                </Button>
                                <Button className="h-14 flex-1 text-lg font-black bg-black hover:bg-zinc-900 text-white" onClick={openInX}>
                                    <Twitter className="w-5 h-5 mr-3 fill-current" /> Post to X
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
