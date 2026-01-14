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
                className="w-full h-64 p-4 font-mono text-sm border rounded-lg bg-background/50 focus:ring-2 focus:ring-blue-500/50 outline-none transition-all"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter system prompt here..."
            />
            <div className="flex items-center justify-between">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-6 py-2 bg-purple-600 text-white hover:bg-purple-700 rounded-lg disabled:opacity-50 transition-all font-medium text-sm shadow-sm hover:shadow-md"
                >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
                {message && (
                    <span className={`text-sm font-medium ${message.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                        {message.text}
                    </span>
                )}
            </div>
        </div>
    );
}
