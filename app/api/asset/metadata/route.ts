import { NextRequest, NextResponse } from 'next/server'
import { getCompanyProfileData } from '@/lib/portfolio/db-client'

/**
 * GET /api/asset/metadata
 * 
 * Fetches asset metadata (name, etc.) by symbol and asset type
 * This endpoint does not require authentication
 * 
 * Query parameters:
 * - symbol: Asset symbol (required)
 * - assetType: Asset type (required)
 * 
 * Returns:
 * {
 *   success: boolean
 *   name?: string
 *   all_time_high?: number
 *   fifty_two_week_high?: number
 *   symbol: string
 *   assetType: string
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const symbol = searchParams.get('symbol')
    const assetType = searchParams.get('assetType')

    if (!symbol || !assetType) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: symbol and assetType' },
        { status: 400 }
      )
    }

    // Try to fetch name from database (only works for pk-equity currently)
    let metaData: { name: string | null, all_time_high: number | null, fifty_two_week_high: number | null } | null = null
    if (assetType === 'pk-equity') {
      metaData = await getCompanyProfileData(symbol, assetType)
    }

    // If no name found in database, return null (client can use symbol as fallback)
    return NextResponse.json({
      success: true,
      symbol: symbol.toUpperCase(),
      assetType,
      name: metaData?.name || null,
      all_time_high: metaData?.all_time_high || null,
      fifty_two_week_high: metaData?.fifty_two_week_high || null
    })
  } catch (error: any) {
    console.error('Error fetching asset metadata:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch asset metadata' },
      { status: 500 }
    )
  }
}

