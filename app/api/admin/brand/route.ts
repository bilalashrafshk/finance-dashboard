import { NextResponse } from 'next/server';
import { PersonalityService } from '@/lib/ai/personality-service';

export async function GET() {
    const personality = await PersonalityService.getPersonality('bilal-ashraf');
    return NextResponse.json(personality);
}

export async function POST(req: Request) {
    const body = await req.json();
    await PersonalityService.updatePersonality('bilal-ashraf', body);
    return NextResponse.json({ success: true });
}
