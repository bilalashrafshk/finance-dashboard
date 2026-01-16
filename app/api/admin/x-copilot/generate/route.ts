import { NextRequest, NextResponse } from 'next/server';
import { TwitterAgentService } from '@/lib/ai/twitter-agent';
import { getAuthenticatedUser } from '@/lib/auth/middleware';
import { getUserById } from '@/lib/auth/db-auth';

async function verifyAdmin(request: NextRequest) {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return null;
    const user = await getUserById(authUser.id);
    if (!user || user.role !== 'admin') return null;
    return user;
}

export async function POST(req: NextRequest) {
    try {
        const admin = await verifyAdmin(req);
        if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { symbol, notes, mode, targetTweet } = await req.json();

        if (!symbol) {
            return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
        }

        const { draft, reasoningLog } = await TwitterAgentService.generate(
            symbol,
            notes,
            mode || 'tweet',
            targetTweet || ''
        );

        return NextResponse.json({ draft, reasoningLog });
    } catch (error: any) {
        console.error('API Error in X-Copilot Generate:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
