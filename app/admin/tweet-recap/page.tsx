'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Copy, Sparkles, Loader2, Twitter, LayoutGrid, Zap } from 'lucide-react';
import { toast } from 'sonner';

type ReportType = 'recap' | 'liquidity';

export default function TweetRecapPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [reportType, setReportType] = useState<ReportType>('recap');
    const [loading, setLoading] = useState(false);
    const [recapText, setRecapText] = useState('');

    // Protection: Admin/Staff only
    useEffect(() => {
        if (!authLoading && (!user || (user.role !== 'admin' && user.role !== 'staff'))) {
            toast.error('Unauthorized access');
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
                const { index, breadth, topGainers, topLosers, valueLeaders, sectors } = result.data;

                if (reportType === 'recap') {
                    // NEW REFINED DAILY RECAP FORMAT
                    const changePct = index?.changePercent || 0;
                    let headline = '';
                    if (changePct > 0.5) headline = 'Bullish Session';
                    else if (changePct > 0) headline = 'Green Close';
                    else if (changePct < -0.5) headline = 'Market Pressure';
                    else if (changePct < 0) headline = 'Slight Dip';
                    else headline = 'Flat Session';

                    let text = `${headline} | ${result.data.date}\n`;
                    text += `Index: ${index?.price?.toLocaleString() || 'N/A'} (${index?.change >= 0 ? '+' : ''}${index?.change?.toFixed(2) || '0'} | ${index?.changePercent?.toFixed(2) || '0'}%)\n`;
                    text += `Breadth: ${breadth.gainers} Up, ${breadth.losers} Down\n\n`;

                    text += `Lead: `;
                    text += topGainers.slice(0, 3).map((s: any) => `${s.symbol} ${s.changePercent.toFixed(2)}%`).join(' | ');

                    text += `\nLag: `;
                    text += topLosers.slice(0, 3).map((s: any) => `${s.symbol} ${s.changePercent.toFixed(2)}%`).join(' | ');

                    text += `\n\nSec: ${sectors[0]?.name} ${sectors[0]?.change.toFixed(2)}% | ${sectors[sectors.length - 1]?.name} ${sectors[sectors.length - 1]?.change.toFixed(2)}%`;

                    text += `\n\n#Karachi100 #PSX`;
                    setRecapText(text);
                } else {
                    // VOLUME/LIQUIDITY LEADERS FORMAT
                    let text = `🌊 Liquidity Watch: PSX Value Traded | ${result.data.date}\n\n`;
                    text += `The top stocks by trading value (Vol × Price) today:\n\n`;

                    valueLeaders.forEach((s: any, i: number) => {
                        text += `${i + 1}. ${s.symbol}: Rs ${formatCurrency(s.valueTraded)} (${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%)\n`;
                    });

                    text += `\n#PSX #Trading #PakistanEconomy`;
                    setRecapText(text);
                }

                toast.success('Generated!');
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
                        Tweet <span className="text-blue-500">Recap</span>
                    </h1>
                    <p className="text-muted-foreground mt-2">Generate tweet-ready market summaries for Karachi 100</p>
                </div>
                <div className="px-3 py-1 bg-blue-500/10 text-blue-500 rounded-full text-xs font-bold uppercase tracking-widest border border-blue-500/20">
                    Admin Access
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
                            <label className="text-xs font-bold uppercase text-muted-foreground">Report Type</label>
                            <div className="grid grid-cols-2 gap-2 p-1 bg-muted/50 rounded-lg border">
                                <button
                                    onClick={() => setReportType('recap')}
                                    className={`py-2 px-1 text-[10px] font-black uppercase tracking-widest rounded-md transition-all flex flex-col items-center gap-1 ${reportType === 'recap' ? 'bg-blue-600 text-white shadow-lg' : 'text-muted-foreground hover:bg-muted'}`}
                                >
                                    <LayoutGrid className="w-4 h-4" />
                                    Daily Recap
                                </button>
                                <button
                                    onClick={() => setReportType('liquidity')}
                                    className={`py-2 px-1 text-[10px] font-black uppercase tracking-widest rounded-md transition-all flex flex-col items-center gap-1 ${reportType === 'liquidity' ? 'bg-blue-600 text-white shadow-lg' : 'text-muted-foreground hover:bg-muted'}`}
                                >
                                    <Zap className="w-4 h-4" />
                                    Value Leaders
                                </button>
                            </div>
                        </div>

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
                            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Twitter className="w-5 h-5" />}
                            Generate {reportType === 'recap' ? 'Recap' : 'Liquidity'}
                        </Button>
                    </CardContent>
                </Card>

                {/* Output */}
                <Card className="lg:col-span-8 shadow-2xl border-blue-500/20 overflow-hidden">
                    <div className="h-2 bg-gradient-to-r from-blue-600 to-blue-400" />
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-xs uppercase tracking-widest opacity-50 font-black">Tweet Output</CardTitle>
                        {recapText && (
                            <span className={`text-xs font-bold px-2 py-1 rounded ${recapText.length > 280 ? 'bg-amber-500/10 text-amber-500' : 'bg-green-500/10 text-green-500'}`}>
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
                                    className="min-h-[320px] text-lg font-medium leading-[1.6] bg-transparent border-none focus-visible:ring-0 p-0 resize-none font-sans"
                                />
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/30">
                                    <Twitter className="w-16 h-16 mb-2 opacity-10" />
                                    <p className="italic">Click generate to see the draft...</p>
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
