'use client';

import { useState } from 'react';
import { updateAlertConfig } from './actions';

export function AlertConfigEditor({ config }: { config: any }) {
    const [value, setValue] = useState(
        typeof config.value === 'string' ? config.value : JSON.stringify(config.value, null, 2)
    );
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleSave = async () => {
        setIsSaving(true);
        setMessage(null);
        try {
            let parsedValue;
            try {
                parsedValue = JSON.parse(value);
            } catch (e) {
                // If it's not JSON, treat it as a string (though our defaults are JSON)
                parsedValue = value;
            }

            await updateAlertConfig(config.key, parsedValue);
            setMessage({ type: 'success', text: 'Settings updated successfully' });
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to update settings' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">{config.description}</label>
                <textarea
                    className="w-full h-32 p-3 font-mono text-sm border rounded-md bg-background focus:ring-2 focus:ring-ring"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                />
            </div>
            <div className="flex items-center justify-between">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md disabled:opacity-50 transition-colors text-sm font-medium"
                >
                    {isSaving ? 'Saving...' : 'Update Config'}
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
