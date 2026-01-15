import { getPrompts, getAlertConfigs } from './actions';
import { PromptEditor } from './prompt-editor';
import { AlertConfigEditor } from './alert-config-editor';

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
            <h1 className="text-3xl font-bold mb-8">Intelligence Configuration</h1>

            {/* --- FINANCIAL BRAIN --- */}
            <section className="mb-16">
                <div className="flex items-center gap-2 mb-6">
                    <div className="h-8 w-1 bg-emerald-600 rounded-full" />
                    <h2 className="text-2xl font-bold">Financial Intelligence (Numbers)</h2>
                </div>

                <div className="grid gap-8">
                    {financialPrompt && (
                        <div className="border rounded-xl p-6 bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all border-emerald-500/20">
                            <h3 className="text-xl font-semibold mb-2">Financial Analyst Brain</h3>
                            <p className="text-xs text-muted-foreground mb-4 font-mono">Triggers: Financial Results, Dividends, Bonus, Rights</p>
                            <PromptEditor prompt={financialPrompt} />
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {['ai_context_instructions', 'ai_context_payload', 'priority_keywords'].map(key => {
                            const config = getAlertConfig(key);
                            if (!config) return null;
                            return (
                                <div key={key} className={`border rounded-xl p-6 bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all ${key.includes('instruction') ? 'md:col-span-2 border-emerald-500/30 bg-emerald-500/5' : ''}`}>
                                    <AlertConfigEditor config={config} />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* --- GOVERNANCE BRAIN --- */}
            <section className="mb-16">
                <div className="flex items-center gap-2 mb-6">
                    <div className="h-8 w-1 bg-orange-500 rounded-full" />
                    <h2 className="text-2xl font-bold">Governance Intelligence (People)</h2>
                </div>

                <div className="grid gap-8">
                    {governancePrompt && (
                        <div className="border rounded-xl p-6 bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all border-orange-500/20">
                            <h3 className="text-xl font-semibold mb-2">Governance Analyst Brain</h3>
                            <p className="text-xs text-muted-foreground mb-4 font-mono">Triggers: Insider Trades, Management Changes</p>
                            <PromptEditor prompt={governancePrompt} />
                        </div>
                    )}
                </div>
            </section>

            {/* --- EVENT BRAIN --- */}
            <section className="mb-16">
                <div className="flex items-center gap-2 mb-6">
                    <div className="h-8 w-1 bg-blue-600 rounded-full" />
                    <h2 className="text-2xl font-bold">Event & News Intelligence (Wildcard)</h2>
                </div>

                <div className="grid gap-8">
                    {eventPrompt && (
                        <div className="border rounded-xl p-6 bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all border-blue-500/20">
                            <h3 className="text-xl font-semibold mb-2">Event Analyst Brain</h3>
                            <p className="text-xs text-muted-foreground mb-4 font-mono">Triggers: Material Information, Board Meetings</p>
                            <PromptEditor prompt={eventPrompt} />
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {['mc_threshold_rank', 'ignore_keywords'].map(key => {
                            const config = getAlertConfig(key);
                            if (!config) return null;
                            return (
                                <div key={key} className={`border rounded-xl p-6 bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all ${key === 'ignore_keywords' ? 'md:col-span-2' : ''}`}>
                                    <AlertConfigEditor config={config} />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* --- OTHER PROMPTS --- */}
            {otherPrompts.length > 0 && (
                <section>
                    <div className="flex items-center gap-2 mb-6">
                        <div className="h-8 w-1 bg-gray-600 rounded-full" />
                        <h2 className="text-2xl font-bold">Other System Prompts</h2>
                    </div>
                    <div className="grid gap-8">
                        {otherPrompts.map((prompt: any) => (
                            <div key={prompt.slug} className="border rounded-xl p-6 bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all">
                                <h3 className="text-xl font-semibold mb-2">{prompt.description}</h3>
                                <p className="text-xs text-muted-foreground mb-4 font-mono uppercase tracking-wider">Slug: {prompt.slug}</p>
                                <PromptEditor prompt={prompt} />
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
