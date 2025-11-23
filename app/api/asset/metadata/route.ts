import { NextRequest, NextResponse } from 'next/server'
import { getCompanyProfileName } from '@/lib/portfolio/db-client'

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
    let name: string | null = null
    if (assetType === 'pk-equity') {
      name = await getCompanyProfileName(symbol, assetType)
    }

    // If no name found in database, return null (client can use symbol as fallback)
    return NextResponse.json({
      success: true,
      symbol: symbol.toUpperCase(),
      assetType,
      name: name || null,
    })
  } catch (error: any) {
    console.error('Error fetching asset metadata:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch asset metadata' },
      { status: 500 }
    )
  }
}

