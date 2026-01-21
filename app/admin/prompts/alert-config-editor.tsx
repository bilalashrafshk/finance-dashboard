'use client';

import { useState } from 'react';
import { updateAlertConfig } from './actions';

export function AlertConfigEditor({ config }: { config: any }) {
    const [value, setValue] = useState(
        typeof config.value === 'string' ? config.value : JSON.stringify(config.value, null, 2)
    );
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const isMarketCapThreshold = config.key === 'fundamental_mc_threshold_rank' || config.key === 'technical_mc_threshold_rank';
    const isVolumeSurge = config.key === 'volume_surge_settings';

    const handleSave = async (customValue?: any) => {
        setIsSaving(true);
        setMessage(null);
        try {
            let parsedValue = customValue;

            if (customValue === undefined) {
                try {
                    parsedValue = JSON.parse(value);
                } catch (e) {
                    parsedValue = value;
                }
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

    if (isMarketCapThreshold) {
        const options = [
            { label: 'Top 100 Stocks', value: 100 },
            { label: 'Top 200 Stocks', value: 200 },
            { label: 'Top 300 Stocks', value: 300 },
            { label: 'Top 500 Stocks', value: 500 },
            { label: 'Show All Stocks', value: 0 },
        ];

        return (
            <div className="space-y-4">
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                        📊 {config.key === 'fundamental_mc_threshold_rank' ? 'Fundamental' : 'Technical'} Market Cap
                    </label>
                    <p className="text-xs text-muted-foreground mb-2">
                        {config.description}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        {options.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => {
                                    setValue(opt.value.toString());
                                    handleSave(opt.value);
                                }}
                                disabled={isSaving}
                                className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all text-left flex justify-between items-center ${Number(value) === opt.value
                                    ? 'bg-purple-600 border-purple-600 text-white shadow-md'
                                    : 'bg-card hover:border-purple-600/50 border-input'
                                    }`}
                            >
                                {opt.label}
                                {Number(value) === opt.value && <div className="w-2 h-2 rounded-full bg-white animate-pulse" />}
                            </button>
                        ))}
                    </div>
                </div>
                {message && (
                    <p className={`text-xs font-medium ${message.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                        {message.text}
                    </p>
                )}
            </div>
        );
    }

    if (config.key === 'include_heatmap_context' || config.key.startsWith('auto_tweet_') || config.key === 'enable_multimodal_analysis' || config.key === 'ai_triage_mid_small_caps') {
        const isEnabled = typeof value === 'boolean' ? value : value === 'true';
        // Map key to a readable label
        let label = 'Enable Setting';
        if (config.key === 'include_heatmap_context') label = 'Include Sector Performance & Top Movers';
        if (config.key === 'auto_tweet_ath') label = 'Auto-Tweet All Time Highs';
        if (config.key === 'auto_tweet_52w') label = 'Auto-Tweet 52 Week Highs';
        if (config.key === 'auto_tweet_vol') label = 'Enable Volume Surge Detection & Tweets';
        if (config.key === 'enable_multimodal_analysis') label = 'Enable Multimodal (PDF/Image) Analysis';
        if (config.key === 'ai_triage_mid_small_caps') label = 'AI Triage for Mid/Small-Cap Stocks';

        return (
            <div className="space-y-4">
                <div className="flex flex-col gap-1">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                        {config.key.startsWith('auto_tweet_') ? '🤖 Automation' :
                            (config.key === 'include_heatmap_context' ? '🗺️ Heatmap Context' : '💰 Cost Optimization')}
                    </label>
                    <p className="text-xs text-muted-foreground mb-4">
                        {config.description}
                    </p>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-xl bg-card">
                    <span className="text-sm font-medium">{label}</span>
                    <button
                        onClick={() => {
                            const newValue = (!isEnabled).toString();
                            setValue(newValue);
                            handleSave(newValue);
                        }}
                        disabled={isSaving}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${isEnabled ? 'bg-purple-600' : 'bg-input'}`}
                    >
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-1'}`}
                        />
                    </button>
                </div>
                {message && (
                    <p className={`text-xs font-medium ${message.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                        {message.text}
                    </p>
                )}
            </div>
        );
    }
    if (config.key === 'priority_keywords' || config.key === 'ignore_keywords') {
        const keywords = Array.isArray(JSON.parse(value)) ? JSON.parse(value) : [];
        const [newKeyword, setNewKeyword] = useState('');

        const addKeyword = () => {
            if (newKeyword && !keywords.includes(newKeyword)) {
                const updated = [...keywords, newKeyword];
                setValue(JSON.stringify(updated));
                handleSave(updated);
                setNewKeyword('');
            }
        };

        const removeKeyword = (kw: string) => {
            const updated = keywords.filter((k: string) => k !== kw);
            setValue(JSON.stringify(updated));
            handleSave(updated);
        };

        return (
            <div className="space-y-4">
                <div className="flex flex-col gap-1">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                        {config.key === 'priority_keywords' ? '🎯 Priority Keywords' : '🚫 Ignore Keywords'}
                    </label>
                    <p className="text-xs text-muted-foreground mb-4">
                        {config.description}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2 p-3 border rounded-xl bg-card min-h-[60px]">
                    {keywords.map((kw: string) => (
                        <div key={kw} className="flex items-center gap-1 px-3 py-1 bg-purple-600/10 border border-purple-600/30 text-purple-600 rounded-full text-xs font-medium">
                            {kw}
                            <button onClick={() => removeKeyword(kw)} className="hover:text-red-500 transition-colors">
                                ✕
                            </button>
                        </div>
                    ))}
                    {keywords.length === 0 && <span className="text-xs text-muted-foreground italic">No keywords set</span>}
                </div>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                        placeholder="Add new keyword..."
                        className="flex-1 px-3 py-2 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                    <button
                        onClick={addKeyword}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
                    >
                        Add
                    </button>
                </div>
                {message && (
                    <p className={`text-xs font-medium ${message.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                        {message.text}
                    </p>
                )}
            </div>
        );
    }

    if (config.key === 'fundamental_alert_model') {
        const models = [
            { label: 'Gemini 2.5 Flash Lite (Cheapest)', value: 'gemini-2.5-flash-lite' },
            { label: 'Gemini 2.0 Flash (Balanced)', value: 'gemini-2.0-flash' },
            { label: 'Gemini 2.0 Flash Thinking', value: 'gemini-2.0-flash-thinking-exp-01-21' },
            { label: 'Gemini 1.5 Flash (Legacy)', value: 'gemini-1.5-flash' },
        ];

        return (
            <div className="space-y-4">
                <div className="flex flex-col gap-1">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                        🧠 Fundamental AI Model
                    </label>
                    <p className="text-xs text-muted-foreground mb-4">
                        {config.description}
                    </p>
                </div>
                <div className="grid grid-cols-1 gap-2">
                    {models.map((m) => {
                        const isSelected = value.replace(/"/g, '') === m.value;
                        return (
                            <button
                                key={m.value}
                                onClick={() => {
                                    const newValue = JSON.stringify(m.value);
                                    setValue(newValue);
                                    handleSave(m.value);
                                }}
                                disabled={isSaving}
                                className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all text-left flex justify-between items-center ${isSelected
                                    ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                                    : 'bg-card hover:border-blue-600/50 border-input'
                                    }`}
                            >
                                {m.label}
                                <span className="text-xs opacity-70 ml-2">{m.value}</span>
                                {isSelected && <div className="w-2 h-2 rounded-full bg-white animate-pulse" />}
                            </button>
                        );
                    })}
                </div>
                {message && (
                    <p className={`text-xs font-medium ${message.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                        {message.text}
                    </p>
                )}
            </div>
        );
    }

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
                    onClick={() => handleSave()}
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
