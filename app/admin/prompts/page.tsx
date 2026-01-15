import { getPrompts, getAlertConfigs } from './actions';
import { PromptEditor } from './prompt-editor';
import { AlertConfigEditor } from './alert-config-editor';

export default async function AdminPromptsPage() {
    const [prompts, alertConfigs] = await Promise.all([
        getPrompts(),
        getAlertConfigs()
    ]);

    return (
        <div className="container mx-auto py-10 max-w-5xl">
            <h1 className="text-3xl font-bold mb-8">System Configuration</h1>

            <section className="mb-12">
                <div className="flex items-center gap-2 mb-6">
                    <div className="h-8 w-1 bg-blue-600 rounded-full" />
                    <h2 className="text-2xl font-semibold">Alert Filtering & Thresholds</h2>
                </div>
                <div className="grid gap-6">
                    {alertConfigs.filter((c: any) => c.key !== 'ai_context_payload').map((config: any) => (
                        <div key={config.key} className="border rounded-xl p-6 bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all">
                            <AlertConfigEditor config={config} />
                        </div>
                    ))}
                </div>
            </section>

            <section className="mb-12">
                <div className="flex items-center gap-2 mb-6">
                    <div className="h-8 w-1 bg-emerald-600 rounded-full" />
                    <h2 className="text-2xl font-semibold">AI Context & Structure</h2>
                </div>
                <div className="grid gap-6">
                    {alertConfigs.filter((c: any) => c.key === 'ai_context_payload' || c.key === 'ai_context_instructions').map((config: any) => (
                        <div key={config.key} className="border rounded-xl p-6 bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all">
                            <AlertConfigEditor config={config} />
                        </div>
                    ))}
                </div>
            </section>

            <section>
                <div className="flex items-center gap-2 mb-6">
                    <div className="h-8 w-1 bg-purple-600 rounded-full" />
                    <h2 className="text-2xl font-semibold">AI System Prompts</h2>
                </div>
                <div className="grid gap-8">
                    {prompts.map((prompt: any) => (
                        <div key={prompt.slug} className="border rounded-xl p-6 bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all">
                            <h3 className="text-xl font-semibold mb-2">{prompt.description}</h3>
                            <p className="text-xs text-muted-foreground mb-4 font-mono uppercase tracking-wider">Slug: {prompt.slug}</p>
                            <PromptEditor prompt={prompt} />
                        </div>
                    ))}
                    {prompts.length === 0 && (
                        <div className="text-muted-foreground p-8 text-center border rounded-xl border-dashed">
                            No prompts found in the database.
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
