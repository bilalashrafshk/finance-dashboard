import { NextRequest, NextResponse } from 'next/server';
import { RoutineReportService } from '@/lib/market/routine-report-service';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || undefined;

    // Auth check normally would go here (e.g. check session for admin)
    // For now assuming internal/admin access

    try {
        const data = await RoutineReportService.generateRecapData(date);
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error('Recap Data API Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
