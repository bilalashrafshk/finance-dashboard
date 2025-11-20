import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import { requireAuth } from '@/lib/auth/middleware'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

/**
 * Add All PSX Stocks
 * 
 * POST /api/screener/add-all-psx-stocks
 * 
 * Fetches all stocks from PSX market-watch page, checks which ones are missing,
 * and adds them to the database. Uses same logic as asset screener for adding assets.
 * 
 * Cache: 1 month (global, not per user)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const client = await pool.connect()

    try {
      // Check cache - has this been run in the last month?
      const cacheResult = await client.query(
        `SELECT last_run FROM psx_all_stocks_batch_cache WHERE id = 1`
      )
      
      if (cacheResult.rows.length > 0) {
        const lastRun = new Date(cacheResult.rows[0].last_run)
        const oneMonthAgo = new Date()
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
        
        if (lastRun > oneMonthAgo) {
          const daysRemaining = Math.ceil((lastRun.getTime() - oneMonthAgo.getTime()) / (1000 * 60 * 60 * 24))
          return NextResponse.json({
            success: false,
            error: `This operation was recently run. Please wait ${daysRemaining} more days before running again.`,
            cached: true
          }, { status: 429 })
        }
      }

      // Fetch PSX market-watch page
      console.log('[PSX All Stocks Batch] Fetching all PSX stocks from market-watch...')
      const response = await fetch('https://dps.psx.com.pk/market-watch', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch market-watch page: ${response.status}`)
      }

      const html = await response.text()
      
      // Parse HTML to extract stocks
      // Pattern: <td data-search="SYMBOL" data-order="SYMBOL"><a class="tbl__symbol" href="/company/SYMBOL" data-title="Company Name"><strong>SYMBOL</strong>
      // Note: There may be optional tags like <div class="tag"> after the link
      const symbolRegex = /<td data-search="([A-Z0-9]+)"[^>]*>\s*<a class="tbl__symbol"[^>]*href="\/company\/([A-Z0-9]+)"[^>]*data-title="([^"]+)"[^>]*>\s*<strong>([A-Z0-9]+)<\/strong>/g
      const stocks: Array<{ symbol: string; name: string }> = []
      let match

      while ((match = symbolRegex.exec(html)) !== null) {
        const symbol = match[1].toUpperCase().trim()
        const name = match[3].trim()
        // Use symbol from data-search attribute (match[1]) as it's the most reliable
        if (symbol && name && !stocks.find(s => s.symbol === symbol)) {
          stocks.push({ symbol, name })
        }
      }

      console.log(`[PSX All Stocks Batch] Found ${stocks.length} stocks in market-watch`)

      if (stocks.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'No stocks found in market-watch page'
        }, { status: 400 })
      }

      // Check which stocks already have price data (same logic as screener update)
      const existingSymbols = await client.query(
        `SELECT DISTINCT symbol FROM historical_price_data WHERE asset_type = 'pk-equity' AND symbol = ANY($1)`,
        [stocks.map(s => s.symbol)]
      )
      const existingSet = new Set(existingSymbols.rows.map(r => r.symbol.toUpperCase()))

      // Filter to only missing stocks (those without price data)
      const missingStocks = stocks.filter(s => !existingSet.has(s.symbol.toUpperCase()))
      
      console.log(`[PSX All Stocks Batch] ${existingSet.size} already have price data, ${missingStocks.length} need to be added`)

      if (missingStocks.length === 0) {
        // Update cache even if nothing to add
        await client.query(
          `INSERT INTO psx_all_stocks_batch_cache (id, last_run) VALUES (1, NOW())
           ON CONFLICT (id) DO UPDATE SET last_run = NOW()`
        )
        
        return NextResponse.json({
          success: true,
          message: 'All PSX stocks already have price data in database',
          added: 0,
          total: stocks.length
        })
      }

      // Add missing stocks one by one (with price fetching and historical data)
      const added: string[] = []
      const failed: Array<{ symbol: string; error: string }> = []
      const baseUrl = request.nextUrl.origin

      for (const stock of missingStocks) {
        try {
          // Initialize historical data (this will fetch and store if missing)
          // This is the same logic used in asset screener - only fetches price data
          // Company profile will be created later when financials are fetched
          const histResponse = await fetch(
            `${baseUrl}/api/historical-data?assetType=pk-equity&symbol=${encodeURIComponent(stock.symbol)}&market=PSX`,
            {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' }
            }
          )

          if (!histResponse.ok) {
            throw new Error(`Failed to initialize historical data for ${stock.symbol}`)
          }

          // Note: We do NOT add to company_profiles here
          // This matches asset screener behavior - company_profiles is only created
          // when financials are fetched (via /api/financials/update)

          added.push(stock.symbol)
          console.log(`[PSX All Stocks Batch] Added price data for ${stock.symbol}: ${stock.name}`)
        } catch (error: any) {
          console.error(`[PSX All Stocks Batch] Failed to add ${stock.symbol}:`, error)
          failed.push({ symbol: stock.symbol, error: error.message || 'Unknown error' })
        }
      }

      // Update cache
      await client.query(
        `INSERT INTO psx_all_stocks_batch_cache (id, last_run) VALUES (1, NOW())
         ON CONFLICT (id) DO UPDATE SET last_run = NOW()`
      )

      return NextResponse.json({
        success: true,
        message: `Added ${added.length} stocks, ${failed.length} failed`,
        added: added.length,
        failed: failed.length,
        total: stocks.length,
        addedSymbols: added,
        failedSymbols: failed
      })

    } finally {
      client.release()
    }
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }
    
    console.error('[PSX All Stocks Batch] Error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to add PSX stocks'
    }, { status: 500 })
  }
}

