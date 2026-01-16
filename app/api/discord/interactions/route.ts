import { NextResponse } from 'next/server';
import { TwitterAgentService } from '@/lib/ai/twitter-agent';

/**
 * Discord Interactions Endpoint
 * This follows the Discord standard for Slash Commands (HTTP Interactions)
 * Note: You must register your Discord App and set this URL as the interactions endpoint.
 */
export async function POST(req: Request) {
    const body = await req.json();

    // 1. Handle Ping (Discord validation)
    if (body.type === 1) {
        return NextResponse.json({ type: 1 });
    }

    // 2. Handle Slash Command
    if (body.type === 2) {
        const { name, options } = body.data;

        if (name === 'draft') {
            const symbol = options.find((o: any) => o.name === 'symbol')?.value;
            const notes = options.find((o: any) => o.name === 'notes')?.value || '';

            // We return a "Deferred" response because AI takes > 3 seconds
            // Actually, for simplicity in Vercel, we might just try to run it fast
            // OR use the Discord "Deferred Channel Message with Source" type 5.

            // To keep it simple for now, we'll try to generate synchronously 
            // but warned: Discord expects a response in 3s.
            try {
                const draft = await TwitterAgentService.generateTweetDraft(symbol, notes);

                return NextResponse.json({
                    type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
                    data: {
                        content: `**Bilal Ashraf Analyst Draft for $${symbol.toUpperCase()}**\n\n${draft}\n\n*Character count: ${draft.length}*`
                    }
                });
            } catch (error) {
                return NextResponse.json({
                    type: 4,
                    data: { content: `❌ Error generating draft: ${error}` }
                });
            }
        }
    }

    return NextResponse.json({ error: 'Unknown interaction' }, { status: 400 });
}
