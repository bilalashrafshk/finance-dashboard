import { getPrompts, getAlertConfigs } from './actions';
import { PromptEditor } from './prompt-editor';
import { AlertConfigEditor } from './alert-config-editor';
import { SettingsZone } from './settings-zone';
import { BarChart3, Users, Newspaper, ShieldAlert, Sliders, Bell, Sparkles, PenTool, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default async function AdminPromptsPage() {
    const [prompts, alertConfigs] = await Promise.all([
        getPrompts(),
        getAlertConfigs()
    ]);

    const financialPrompt = prompts.find(p => p.slug === 'financial-analyst');
    const governancePrompt = prompts.find(p => p.slug === 'governance-analyst');
    const eventPrompt = prompts.find(p => p.slug === 'event-analyst');
    const otherPrompts = prompts.filter(p => !['financial-analyst', 'governance-analyst', 'event-analyst'].includes(p.slug));

    const getAlertConfig = (key: string) => alertConfigs.find(c => c.key === key);

    return (
        <div className="container mx-auto py-10 max-w-5xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
                <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-foreground to-foreground/70">
                    AI Intelligence Center
                </h1>
                <div className="flex gap-2">
                    <Link href="/admin/brand">
                        <Button variant="outline" size="sm" className="gap-2">
                            <PenTool className="w-4 h-4" /> Brand Settings
                        </Button>
                    </Link>
                    <Link href="/admin/x-copilot">
                        <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700">
                            <Sparkles className="w-4 h-4" /> X-Copilot
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="grid gap-6">
                {/* --- PERSONALITY & SOCIAL --- */}
                <SettingsZone
                    title="Personality & Social"
                    description="Personal brand guidelines and Twitter Copilot"
                    icon={<Sparkles className="w-6 h-6" />}
                    color="bg-blue-600"
                    defaultOpen={true}
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="border rounded-xl p-6 bg-blue-600/5 border-blue-600/10 flex flex-col justify-between">
                            <div>
                                <h4 className="text-lg font-bold mb-2 flex items-center gap-2">
                                    <PenTool className="w-5 h-5 text-blue-500" />
                                    Brand Personality
                                </h4>
                                <p className="text-sm text-muted-foreground mb-6">
                                    Configure your "AI Double" instructions, writing style, and few-shot examples.
                                </p>
                            </div>
                            <Link href="/admin/brand">
                                <Button variant="secondary" className="w-full gap-2">
                                    Manage Brand Rules <ExternalLink className="w-4 h-4" />
                                </Button>
                            </Link>
                        </div>

                        <div className="border rounded-xl p-6 bg-blue-400/5 border-blue-400/10 flex flex-col justify-between">
                            <div>
                                <h4 className="text-lg font-bold mb-2 flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-blue-400" />
                                    X-Copilot Playground
                                </h4>
                                <p className="text-sm text-muted-foreground mb-6">
                                    Draft data-backed tweets using your brand persona and live market context.
                                </p>
                            </div>
                            <Link href="/admin/x-copilot">
                                <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700">
                                    Open Copilot <ExternalLink className="w-4 h-4" />
                                </Button>
                            </Link>
                        </div>
                    </div>
                </SettingsZone>

                {/* --- FINANCIAL INTELLIGENCE --- */}
                <SettingsZone
                    title="Financial Intelligence"
                    description="Performance metrics, Dividends, and Earnings trends"
                    icon={<BarChart3 className="w-6 h-6" />}
                    color="bg-emerald-500"
                >
                    <div className="grid gap-8">
                        {financialPrompt && (
                            <div className="border rounded-xl p-6 bg-emerald-500/5 border-emerald-500/10">
                                <h4 className="text-lg font-bold mb-1 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                    Financial analyst brain
                                </h4>
                                <p className="text-xs text-muted-foreground mb-6 font-mono opacity-70">Detects: Results, Dividends, Bonus, Rights</p>
                                <PromptEditor prompt={financialPrompt} />
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {['ai_context_instructions', 'ai_context_payload', 'priority_keywords'].map(key => {
                                const config = getAlertConfig(key);
                                if (!config) return null;
                                return (
                                    <div key={key} className={`border rounded-xl p-6 transition-all ${key === 'ai_context_instructions' ? 'md:col-span-2 bg-emerald-500/10 border-emerald-500/20 shadow-sm' : 'bg-card/50'}`}>
                                        <AlertConfigEditor config={config} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </SettingsZone>

                {/* --- GOVERNANCE INTELLIGENCE --- */}
                <SettingsZone
                    title="Governance Intelligence"
                    description="Insider movements and management changes"
                    icon={<Users className="w-6 h-6" />}
                    color="bg-orange-500"
                >
                    <div className="grid gap-8">
                        {governancePrompt && (
                            <div className="border rounded-xl p-6 bg-orange-500/5 border-orange-500/10">
                                <h4 className="text-lg font-bold mb-1 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                                    Governance analyst brain
                                </h4>
                                <p className="text-xs text-muted-foreground mb-6 font-mono opacity-70">Detects: Insider Trades, CEO/CFO Shifts</p>
                                <PromptEditor prompt={governancePrompt} />
                            </div>
                        )}
                    </div>
                </SettingsZone>

                {/* --- EVENT INTELLIGENCE --- */}
                <SettingsZone
                    title="Event Intelligence"
                    description="Material news and board room updates"
                    icon={<Newspaper className="w-6 h-6" />}
                    color="bg-blue-500"
                >
                    <div className="grid gap-8">
                        {eventPrompt && (
                            <div className="border rounded-xl p-6 bg-blue-500/5 border-blue-500/10">
                                <h4 className="text-lg font-bold mb-1 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                                    Event analyst brain
                                </h4>
                                <p className="text-xs text-muted-foreground mb-6 font-mono opacity-70">Detects: Material Info, Board Meetings</p>
                                <PromptEditor prompt={eventPrompt} />
                            </div>
                        )}
                    </div>
                </SettingsZone>

                {/* --- GLOBAL CONSTRAINTS --- */}
                <SettingsZone
                    title="Global Constraints"
                    description="Filtering rules and market-wide thresholds"
                    icon={<ShieldAlert className="w-6 h-6" />}
                    color="bg-purple-500"
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {['ignore_keywords', 'fundamental_mc_threshold_rank', 'technical_mc_threshold_rank'].map(key => {
                            const config = getAlertConfig(key);
                            if (!config) return null;
                            return (
                                <div key={key} className={`border rounded-xl p-6 bg-card/50 transition-all ${key === 'ignore_keywords' ? 'md:col-span-2 border-red-500/10 bg-red-500/5' : ''}`}>
                                    <AlertConfigEditor config={config} />
                                </div>
                            );
                        })}
                    </div>
                </SettingsZone>

                {/* --- TECHNICAL ALERTS --- */}
                <SettingsZone
                    title="Technical Alerts"
                    description="Signals based on price action and volume"
                    icon={<Sliders className="w-6 h-6" />}
                    color="bg-blue-600"
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {['volume_surge_settings'].map(key => {
                            const config = getAlertConfig(key);
                            if (!config) return null;
                            return (
                                <div key={key} className="border rounded-xl p-6 bg-card/50 transition-all md:col-span-2 border-blue-500/10 bg-blue-500/5">
                                    <AlertConfigEditor config={config} />
                                </div>
                            );
                        })}
                    </div>
                </SettingsZone>

                {/* --- NOTIFICATION CHANNELS --- */}
                <SettingsZone
                    title="Notification Channels"
                    description="Discord Webhooks for alerts and reporting"
                    icon={<Bell className="w-6 h-6" />}
                    color="bg-pink-500"
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {['fundamental_webhook_url', 'technical_webhook_url'].map(key => {
                            const config = getAlertConfig(key);
                            if (!config) return null;
                            return (
                                <div key={key} className="border rounded-xl p-6 bg-card/50 transition-all">
                                    <AlertConfigEditor config={config} />
                                </div>
                            );
                        })}
                    </div>
                </SettingsZone>

                {/* --- OTHER SYSTEMS --- */}
                {otherPrompts.length > 0 && (
                    <SettingsZone
                        title="Other Systems"
                        description="Miscellaneous AI configurations"
                        icon={<Sliders className="w-6 h-6" />}
                        color="bg-gray-500"
                    >
                        <div className="grid gap-8">
                            {otherPrompts.map((prompt: any) => (
                                <div key={prompt.slug} className="border rounded-xl p-6 bg-card/50">
                                    <h4 className="text-lg font-bold mb-2">{prompt.description}</h4>
                                    <p className="text-xs text-muted-foreground mb-4 font-mono opacity-70 italic">Slug: {prompt.slug}</p>
                                    <PromptEditor prompt={prompt} />
                                </div>
                            ))}
                        </div>
                    </SettingsZone>
                )}
            </div>
        </div>
    );
}
