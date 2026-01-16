import { NextRequest, NextResponse } from 'next/server';
import { PersonalityService } from '@/lib/ai/personality-service';
import { getAuthenticatedUser } from '@/lib/auth/middleware';
import { getUserById } from '@/lib/auth/db-auth';

async function verifyAdmin(request: NextRequest) {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return null;
    const user = await getUserById(authUser.id);
    if (!user || user.role !== 'admin') return null;
    return user;
}

export async function GET(req: NextRequest) {
    const admin = await verifyAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const personality = await PersonalityService.getPersonality('bilal-ashraf');
    return NextResponse.json(personality);
}

export async function POST(req: NextRequest) {
    const admin = await verifyAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    await PersonalityService.updatePersonality('bilal-ashraf', body);
    return NextResponse.json({ success: true });
}
