import { NextResponse } from 'next/server'
import { syncAllDataToGoogleSheets } from '@/lib/google-sheets/sync-engine'

export const maxDuration = 60

/**
 * GET /api/cron/sync-sheets
 * Triggers full sync of ConvictionPays database and computed metrics to Google Sheets.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const spreadsheetId = url.searchParams.get('spreadsheetId') || undefined

  try {
    const result = await syncAllDataToGoogleSheets({ spreadsheetId })

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Google Sheets sync completed successfully',
        summary: result,
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('[API /api/cron/sync-sheets] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    )
  }
}
