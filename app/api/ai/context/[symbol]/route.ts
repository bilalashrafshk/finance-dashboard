import { NextRequest, NextResponse } from 'next/server';
import { AIContextService } from '@/lib/ai/ai-context-service';

export async function GET(
    request: NextRequest,
    { params }: { params: { symbol: string } }
) {
    try {
        const symbol = params.symbol;
        if (!symbol) {
            return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
        }

        const context = await AIContextService.getContext(symbol);

        // Return with cache-control for speed
        return NextResponse.json(context, {
            headers: {
                'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
            },
        });
    } catch (error: any) {
        console.error(`AI Context API Error:`, error.message);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: error.message.includes('not found') ? 404 : 500 }
        );
    }
}
