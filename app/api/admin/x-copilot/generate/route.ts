import { NextResponse } from 'next/server';
import { TwitterAgentService } from '@/lib/ai/twitter-agent';

export async function POST(req: Request) {
    try {
        const { symbol, notes } = await req.json();

        if (!symbol) {
            return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
        }

        const draft = await TwitterAgentService.generateTweetDraft(symbol, notes);

        return NextResponse.json({ draft });
    } catch (error: any) {
        console.error('X-Copilot Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
