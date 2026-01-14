'use client';

import { useState } from 'react';
import { updatePrompt } from './actions';

export function PromptEditor({ prompt }: { prompt: any }) {
    const [content, setContent] = useState(prompt.content);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleSave = async () => {
        setIsSaving(true);
        setMessage(null);
        try {
            await updatePrompt(prompt.slug, content);
            setMessage({ type: 'success', text: 'Prompt updated successfully' });

            // Clear message after 3 seconds
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to update prompt' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <textarea
                className="w-full h-64 p-4 font-mono text-sm border rounded-md bg-background focus:ring-2 focus:ring-ring"
                value={content}
                onChange={(e) => setContent(e.target.value)}
            />
            <div className="flex items-center justify-between">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md disabled:opacity-50"
                >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
                {message && (
                    <span className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                        {message.text}
                    </span>
                )}
            </div>
        </div>
    );
}
