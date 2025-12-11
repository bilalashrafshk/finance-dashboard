import { NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

// Simple in-memory cache for default list
let defaultListCache: any[] | null = null;
let defaultListCacheTimestamp = 0;
const CACHE_TTL = 300 * 1000; // 5 minutes

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const queryParam = searchParams.get('query')

  // Lazy loading: if no query, we can return a default list or trending items.
  // User feedback suggests "no stock is listed", implying they expect a default list.
  // We will allow empty query to proceed to SQL with a wildcard or separate query.

  const client = await pool.connect()
  try {
    // If queryParam is null or empty, `%${queryParam}%` becomes `%%`, which acts as a wildcard matching everything.
    const trimmedQuery = (queryParam || '').trim()
    const searchQuery = trimmedQuery ? `%${trimmedQuery}%` : '%'
    const sortQuery = trimmedQuery ? `${trimmedQuery}%` : ''

    // Optimized Union Strategy with Caching for Default View

    // Check if we can serve default list from cache (if implemented globally)
    // Note: In Next.js App Router, we can use standard request memoization or just let the DB handle it if fast.
    // Given the constraints and the user usage, we'll implement a fast path.
    if (!trimmedQuery) { // Only cache default list (empty query)
      const now = Date.now();
      if (defaultListCache && (now - defaultListCacheTimestamp < CACHE_TTL)) {
        // Cache hit, return cached data
        console.log('[Global Search] Serving default list from cache.');
        return NextResponse.json({
          success: true,
          assets: defaultListCache
        });
      }
    }

    // Union Strategy:
    // Searching the full table (1M rows) for 'symbol ILIKE' is slow.
    // However, searching by (asset_type, symbol) is indexed.
    // We iterate over known asset types and UNION the results. This is reasonably fast (~300-600ms).

    const assetTypes = ['pk-equity', 'us-equity', 'crypto', 'commodities', 'kse100', 'metals', 'spx500']

    // Create params array starting with fixed ones
    // We need one param for the LIKE query per sub-query if we want to be safe, or just reuse the named/numbered param?
    // PG allows reusing $1.

    const unionParts = assetTypes.map(type => `
      (SELECT DISTINCT
        symbol,
        asset_type,
        symbol as name, -- Fallback
        CASE 
            WHEN asset_type = 'crypto' THEN 'Cryptocurrency'
            WHEN asset_type = 'index' OR asset_type = 'kse100' OR asset_type = 'spx500' THEN 'Index'
            WHEN asset_type LIKE '%commodity%' OR asset_type = 'metals' THEN 'Commodities'
            ELSE 'Unknown'
        END as sector,
        CASE
            WHEN asset_type = 'pk-equity' OR asset_type = 'kse100' THEN 'PKR'
            ELSE 'USD'
        END as currency
       FROM historical_price_data 
       WHERE asset_type = '${type}' 
       AND ($1 = '%' OR symbol ILIKE $1)
       LIMIT 10)
    `)

    const dbQuery = `
      SELECT * FROM (
        ${unionParts.join(' UNION ALL ')}
      ) as combined_results
      ORDER BY 
        CASE 
          WHEN $2 != '' AND symbol ILIKE $2 THEN 1 
          ELSE 2 
        END,
        asset_type,
        symbol
      LIMIT 20
    `

    const { rows } = await client.query(dbQuery, [searchQuery, sortQuery])

    const assets = rows.map(row => ({
      symbol: row.symbol,
      name: row.name,
      sector: row.sector,
      asset_type: row.asset_type,
      currency: row.currency
    }));

    // Cache the result if it's the default list
    if (!trimmedQuery) {
      defaultListCache = assets;
      defaultListCacheTimestamp = Date.now();
      console.log('[Global Search] Default list cached.');
    }

    return NextResponse.json({
      success: true,
      assets: assets
    })
  } catch (error: any) {
    console.error('[Global Search] Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch assets',
      details: error.message
    }, { status: 500 })
  } finally {
    client.release()
  }
}
