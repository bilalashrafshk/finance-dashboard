import { NextRequest, NextResponse } from 'next/server';
import { TwitterAgentService } from '@/lib/ai/twitter-agent';
import { getAuthenticatedUser } from '@/lib/auth/middleware';
import { getUserById } from '@/lib/auth/db-auth';

async function verifyAdmin(request: NextRequest) {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return null;
    const user = await getUserById(authUser.id);
    if (!user) return null;

    // Allow admin OR staff with x-copilot permission
    const isAuthorized = user.role === 'admin' ||
        (user.role === 'staff' && user.permissions?.includes('x-copilot'));

    if (!isAuthorized) return null;
    return user;
}

export async function POST(req: NextRequest) {
    try {
        const admin = await verifyAdmin(req);
        if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { symbol, notes, mode, targetTweet, postFormat } = await req.json();

        if (!symbol) {
            return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
        }

        let finalMode = mode || 'tweet';
        let finalFormat = postFormat || 'short';

        // Backward compatibility: If old UI sends postFormat='briefing', map it to mode='briefing'
        if (postFormat === 'briefing') {
            finalMode = 'briefing';
            finalFormat = 'long';
        }

        const { draft, reasoningLog, trace } = await TwitterAgentService.generate(
            symbol,
            notes,
            finalMode as any,
            targetTweet || '',
            finalFormat as any
        );

        return NextResponse.json({ draft, reasoningLog, trace });
    } catch (error: any) {
        console.error('API Error in X-Copilot Generate:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
