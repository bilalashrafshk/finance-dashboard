import { getPrompts, updatePrompt } from './actions';
import { PromptEditor } from './prompt-editor';

export default async function AdminPromptsPage() {
    const prompts = await getPrompts();

    return (
        <div className="container mx-auto py-10">
            <h1 className="text-3xl font-bold mb-8">AI Prompt Configuration</h1>
            <div className="grid gap-8">
                {prompts.map((prompt: any) => (
                    <div key={prompt.slug} className="border rounded-lg p-6 bg-card text-card-foreground shadow-sm">
                        <h2 className="text-xl font-semibold mb-2">{prompt.description}</h2>
                        <p className="text-sm text-muted-foreground mb-4">Slug: {prompt.slug}</p>
                        <PromptEditor prompt={prompt} />
                    </div>
                ))}
                {prompts.length === 0 && (
                    <div className="text-muted-foreground">No prompts found in the database.</div>
                )}
            </div>
        </div>
    );
}
