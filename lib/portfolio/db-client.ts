/**
 * Database Client for Historical Price Data
 * 
 * Uses Neon PostgreSQL database to store and retrieve historical price data
 * Implements incremental updates: only stores new dates after last stored date
 */

import { Pool } from 'pg'

// Initialize connection pool
let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL
    
    if (!connectionString) {
      throw new Error('DATABASE_URL or POSTGRES_URL environment variable is required')
    }
    
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000, // Increased to 10 seconds for better reliability
      statement_timeout: 30000, // 30 second statement timeout
      query_timeout: 30000, // 30 second query timeout
    })
  }
  
  return pool
}

export interface HistoricalPriceRecord {
  date: string // YYYY-MM-DD
  open: number | null
  high: number | null
  low: number | null
  close: number
  volume: number | null
  adjusted_close: number | null
  change_pct: number | null
}

export interface HistoricalDataMetadata {
  asset_type: string
  symbol: string
  last_stored_date: string | null
  last_updated: string
  total_records: number
  source: string
}

/**
 * Get historical data and latest stored date in a single query (optimized)
 * Returns both the data and the latest/earliest stored dates to avoid multiple round trips
 */
export async function getHistoricalDataWithMetadata(
  assetType: string,
  symbol: string,
  startDate?: string,
  endDate?: string,
  limit?: number
): Promise<{ data: HistoricalPriceRecord[]; latestStoredDate: string | null; earliestStoredDate: string | null }> {
  try {
    const client = await getPool().connect()
    
    try {
      const normalizedSymbol = symbol.toUpperCase()
      
      // Format date as YYYY-MM-DD without timezone conversion
      const formatDate = (date: Date | null | undefined): string | null => {
        if (!date) return null
        try {
          const year = date.getFullYear()
          const month = String(date.getMonth() + 1).padStart(2, '0')
          const day = String(date.getDate()).padStart(2, '0')
          return `${year}-${month}-${day}`
        } catch (error) {
          console.error(`[DB] Error formatting date:`, error, date)
          return null
        }
      }
      
      // OPTIMIZED: Single query that gets data + metadata in one round trip
      // This combines 3 separate queries into 1 for better performance
      // Use CTE to ensure we always get metadata even if main query returns no rows
      const baseParams: any[] = [assetType, normalizedSymbol]
      let whereClause = 'WHERE asset_type = $1 AND symbol = $2'
      let paramIndex = 3
      
      if (startDate) {
        whereClause += ` AND date >= $${paramIndex}`
        baseParams.push(startDate)
        paramIndex++
      }
      
      if (endDate) {
        whereClause += ` AND date <= $${paramIndex}`
        baseParams.push(endDate)
        paramIndex++
      }
      
      // Build query with metadata in CTE to ensure it's always available
      let query = `
        WITH metadata AS (
          SELECT 
            (SELECT MIN(date) FROM historical_price_data WHERE asset_type = $1 AND symbol = $2) as earliest_date,
            (SELECT MAX(date) FROM historical_price_data WHERE asset_type = $1 AND symbol = $2) as latest_date,
            (SELECT date FROM historical_price_data WHERE asset_type = $1 AND symbol = $2 ORDER BY date DESC LIMIT 1) as actual_latest_date
        ),
        main_data AS (
          SELECT date, open, high, low, close, volume, adjusted_close, change_pct
          FROM historical_price_data
          ${whereClause}
        )
        SELECT 
          m.date, m.open, m.high, m.low, m.close, m.volume, m.adjusted_close, m.change_pct,
          md.earliest_date, md.latest_date, md.actual_latest_date
        FROM main_data m
        CROSS JOIN metadata md
      `
      
      // Add ordering and limit
      if (limit && limit > 0) {
        query += ` ORDER BY m.date DESC LIMIT $${paramIndex}`
        baseParams.push(limit)
      } else {
        query += ` ORDER BY m.date ASC`
      }
      
      const result = await client.query(query, baseParams)
      
      // Extract metadata from first row (all rows have same metadata values from CTE)
      // If no rows returned, we still need to get metadata - use a fallback query
      let earliestStoredDate: string | null = null
      let latestStoredDate: string | null = null
      let actualLatestDate: string | null = null
      
      if (result.rows.length > 0) {
        const firstRow = result.rows[0]
        earliestStoredDate = firstRow.earliest_date
          ? formatDate(firstRow.earliest_date)
          : null
        
        latestStoredDate = firstRow.latest_date
          ? formatDate(firstRow.latest_date)
          : null
        
        // Use actual_latest_date (ORDER BY DESC LIMIT 1) as source of truth (more reliable than MAX)
        actualLatestDate = firstRow.actual_latest_date
          ? formatDate(firstRow.actual_latest_date)
          : latestStoredDate
      } else {
        // No rows returned - get metadata separately (edge case: date filters exclude all rows)
        // This is still better than original (1 query vs 3 queries in common case)
        const metadataResult = await client.query(
          `SELECT 
            (SELECT MIN(date) FROM historical_price_data WHERE asset_type = $1 AND symbol = $2) as earliest_date,
            (SELECT MAX(date) FROM historical_price_data WHERE asset_type = $1 AND symbol = $2) as latest_date,
            (SELECT date FROM historical_price_data WHERE asset_type = $1 AND symbol = $2 ORDER BY date DESC LIMIT 1) as actual_latest_date`,
          [assetType, normalizedSymbol]
        )
        
        if (metadataResult.rows.length > 0) {
          const metaRow = metadataResult.rows[0]
          earliestStoredDate = metaRow.earliest_date ? formatDate(metaRow.earliest_date) : null
          latestStoredDate = metaRow.latest_date ? formatDate(metaRow.latest_date) : null
          actualLatestDate = metaRow.actual_latest_date
            ? formatDate(metaRow.actual_latest_date)
            : latestStoredDate
        }
      }
      
      // If we used DESC with limit, reverse to ASC order for consistency
      const rows = limit && limit > 0 ? result.rows.reverse() : result.rows
      
      const data = rows
        .map(row => {
          const formattedDate = formatDate(row.date)
          if (!formattedDate) {
            return null
          }
          return {
            date: formattedDate,
            open: row.open ? parseFloat(row.open) : null,
            high: row.high ? parseFloat(row.high) : null,
            low: row.low ? parseFloat(row.low) : null,
            close: parseFloat(row.close),
            volume: row.volume ? parseFloat(row.volume) : null, // Parse as float for DECIMAL type
            adjusted_close: row.adjusted_close ? parseFloat(row.adjusted_close) : null,
            change_pct: row.change_pct ? parseFloat(row.change_pct) : null,
          }
        })
        .filter((record): record is NonNullable<typeof record> => record !== null)
      
      return { data, latestStoredDate: actualLatestDate, earliestStoredDate }
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(`Error getting historical data for ${assetType}-${symbol}:`, error)
    return { data: [], latestStoredDate: null, earliestStoredDate: null }
  }
}

/**
 * Check if today's data exists in database for a given asset
 * @param assetType - Asset type
 * @param symbol - Asset symbol
 * @param marketDate - Today's date in market timezone (YYYY-MM-DD)
 * @returns The close price for today if exists, null otherwise
 */
export async function getTodayPriceFromDatabase(
  assetType: string,
  symbol: string,
  marketDate: string
): Promise<number | null> {
  try {
    const client = await getPool().connect()
    
    try {
      const result = await client.query(
        `SELECT close 
         FROM historical_price_data
         WHERE asset_type = $1 AND symbol = $2 AND date = $3`,
        [assetType, symbol.toUpperCase(), marketDate]
      )
      
      if (result.rows.length > 0) {
        return parseFloat(result.rows[0].close)
      }
      
      return null
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(`Error checking today's price for ${assetType}-${symbol}:`, error)
    return null
  }
}

/**
 * Get the latest stored date for an asset
 * @deprecated Use getHistoricalDataWithMetadata instead for better performance
 */
export async function getLatestStoredDate(
  assetType: string,
  symbol: string
): Promise<string | null> {
  try {
    const client = await getPool().connect()
    
    try {
      const result = await client.query(
        `SELECT last_stored_date 
         FROM historical_data_metadata 
         WHERE asset_type = $1 AND symbol = $2`,
        [assetType, symbol.toUpperCase()]
      )
      
      return result.rows[0]?.last_stored_date || null
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(`Error getting latest stored date for ${assetType}-${symbol}:`, error)
    return null
  }
}

/**
 * Get historical data for an asset within a date range
 * @deprecated Use getHistoricalDataWithMetadata instead for better performance
 */
export async function getHistoricalData(
  assetType: string,
  symbol: string,
  startDate?: string,
  endDate?: string
): Promise<HistoricalPriceRecord[]> {
  const result = await getHistoricalDataWithMetadata(assetType, symbol, startDate, endDate)
  return result.data
}

/**
 * Insert a chunk of historical data (helper function)
 */
async function insertChunk(
  client: any,
  assetType: string,
  symbol: string,
  chunk: HistoricalPriceRecord[],
  source: 'stockanalysis' | 'binance' | 'investing' | 'manual'
): Promise<number> {
  const values: any[] = []
  const placeholders: string[] = []
  
  chunk.forEach((record, index) => {
    const baseIndex = index * 11
    placeholders.push(
      `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11})`
    )
    values.push(
      assetType,
      symbol.toUpperCase(),
      record.date,
      record.open,
      record.high,
      record.low,
      record.close,
      record.volume,
      record.adjusted_close,
      record.change_pct,
      source,
    )
  })
  
  const result = await client.query(
    `INSERT INTO historical_price_data 
     (asset_type, symbol, date, open, high, low, close, volume, adjusted_close, change_pct, source)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (asset_type, symbol, date) 
     DO UPDATE SET 
       open = EXCLUDED.open,
       high = EXCLUDED.high,
       low = EXCLUDED.low,
       close = EXCLUDED.close,
       volume = EXCLUDED.volume,
       adjusted_close = EXCLUDED.adjusted_close,
       change_pct = EXCLUDED.change_pct,
       updated_at = NOW()`,
    values
  )
  
  return result.rowCount || 0
}

/**
 * Insert or update historical price data (upsert)
 * Uses chunked batch inserts for better performance and to avoid parameter limits
 */
export async function insertHistoricalData(
  assetType: string,
  symbol: string,
  data: HistoricalPriceRecord[],
  source: 'stockanalysis' | 'binance' | 'investing' | 'manual'
): Promise<{ inserted: number; skipped: number }> {
  if (!data || data.length === 0) {
    return { inserted: 0, skipped: 0 }
  }
  
  try {
    const client = await getPool().connect()
    
    try {
      // Start transaction
      await client.query('BEGIN')
      
      // Chunk data into batches of 1000 to avoid PostgreSQL parameter limits
      // PostgreSQL max: 65,535 parameters
      // 1000 records × 11 params = 11,000 params (safe margin)
      const CHUNK_SIZE = 1000
      let totalInserted = 0
      
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE)
        const inserted = await insertChunk(client, assetType, symbol, chunk, source)
        totalInserted += inserted
      }
      
      const skipped = data.length - totalInserted
      
      // Update metadata (optimized: increment total_records instead of COUNT)
      const latestDate = data
        .map(r => r.date)
        .sort()
        .reverse()[0]
      
      // Get current total_records and increment by new records inserted
      const metadataResult = await client.query(
        `SELECT total_records 
         FROM historical_data_metadata 
         WHERE asset_type = $1 AND symbol = $2`,
        [assetType, symbol.toUpperCase()]
      )
      
      const currentTotal = metadataResult.rows[0]?.total_records || 0
      const newTotal = currentTotal + totalInserted
      
      await client.query(
        `INSERT INTO historical_data_metadata 
         (asset_type, symbol, last_stored_date, total_records, source, last_updated)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (asset_type, symbol)
         DO UPDATE SET 
           last_stored_date = EXCLUDED.last_stored_date,
           total_records = EXCLUDED.total_records,
           source = EXCLUDED.source,
           last_updated = NOW()`,
        [assetType, symbol.toUpperCase(), latestDate, newTotal, source]
      )
      
      // Commit transaction
      await client.query('COMMIT')
      
      // Update market cap asynchronously (non-blocking)
      // Only update if we inserted new data and it's an equity asset
      if (totalInserted > 0 && (assetType === 'pk-equity' || assetType === 'us-equity')) {
        // Run asynchronously without awaiting - don't block price insertion
        updateMarketCapFromPrice(assetType, symbol).catch(err => {
          console.error(`[Market Cap] Failed to update market cap for ${assetType}-${symbol}:`, err)
        })
      }
      
      return { inserted: totalInserted, skipped }
    } catch (error: any) {
      await client.query('ROLLBACK')
      console.error(`[DB] insertHistoricalData: Transaction rolled back for ${assetType}-${symbol}:`, error.message)
      throw error
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error(`[DB] Error inserting historical data for ${assetType}-${symbol}:`, error.message)
    console.error(`[DB] Full error stack:`, error.stack)
    return { inserted: 0, skipped: 0 }
  }
}

/**
 * Get metadata for an asset
 */
export async function getMetadata(
  assetType: string,
  symbol: string
): Promise<HistoricalDataMetadata | null> {
  try {
    const client = await getPool().connect()
    
    try {
      const result = await client.query(
        `SELECT asset_type, symbol, last_stored_date, last_updated, total_records, source
         FROM historical_data_metadata
         WHERE asset_type = $1 AND symbol = $2`,
        [assetType, symbol.toUpperCase()]
      )
      
      if (result.rows.length === 0) {
        return null
      }
      
      const row = result.rows[0]
      return {
        asset_type: row.asset_type,
        symbol: row.symbol,
        last_stored_date: row.last_stored_date ? row.last_stored_date.toISOString().split('T')[0] : null,
        last_updated: row.last_updated.toISOString(),
        total_records: row.total_records,
        source: row.source,
      }
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(`Error getting metadata for ${assetType}-${symbol}:`, error)
    return null
  }
}

/**
 * Close database connection pool (for cleanup)
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}

// ============================================================================
// DIVIDEND DATA FUNCTIONS
// ============================================================================

export interface DividendRecord {
  date: string // YYYY-MM-DD
  dividend_amount: number // percent/10 (e.g., 110% = 11.0)
}

/**
 * Insert or update dividend data (upsert)
 * Uses chunked batch inserts for better performance
 */
export async function insertDividendData(
  assetType: string,
  symbol: string,
  data: DividendRecord[],
  source: string = 'scstrade'
): Promise<{ inserted: number; skipped: number }> {
  if (!data || data.length === 0) {
    return { inserted: 0, skipped: 0 }
  }

  try {
    const client = await getPool().connect()

    try {
      await client.query('BEGIN')

      const CHUNK_SIZE = 1000
      let totalInserted = 0

      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE)
        const values: any[] = []
        const placeholders: string[] = []

        chunk.forEach((record, index) => {
          const baseIndex = index * 5
          placeholders.push(
            `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5})`
          )
          values.push(
            assetType,
            symbol.toUpperCase(),
            record.date,
            record.dividend_amount,
            source
          )
        })

        const result = await client.query(
          `INSERT INTO dividend_data 
           (asset_type, symbol, date, dividend_amount, source)
           VALUES ${placeholders.join(', ')}
           ON CONFLICT (asset_type, symbol, date) 
           DO UPDATE SET 
             dividend_amount = EXCLUDED.dividend_amount,
             source = EXCLUDED.source,
             updated_at = NOW()`,
          values
        )

        totalInserted += result.rowCount || 0
      }

      const skipped = data.length - totalInserted

      await client.query('COMMIT')

      return { inserted: totalInserted, skipped }
    } catch (error: any) {
      await client.query('ROLLBACK')
      console.error(`[DB] insertDividendData: Transaction rolled back for ${assetType}-${symbol}:`, error.message)
      throw error
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error(`[DB] Error inserting dividend data for ${assetType}-${symbol}:`, error.message)
    return { inserted: 0, skipped: 0 }
  }
}

/**
 * Get dividend data for an asset within a date range
 */
export async function getDividendData(
  assetType: string,
  symbol: string,
  startDate?: string,
  endDate?: string
): Promise<DividendRecord[]> {
  try {
    const client = await getPool().connect()

    try {
      const normalizedSymbol = symbol.toUpperCase()
      const params: any[] = [assetType, normalizedSymbol]
      let whereClause = 'WHERE asset_type = $1 AND symbol = $2'
      let paramIndex = 3

      if (startDate) {
        whereClause += ` AND date >= $${paramIndex}`
        params.push(startDate)
        paramIndex++
      }

      if (endDate) {
        whereClause += ` AND date <= $${paramIndex}`
        params.push(endDate)
        paramIndex++
      }

      const result = await client.query(
        `SELECT date, dividend_amount
         FROM dividend_data
         ${whereClause}
         ORDER BY date ASC`,
        params
      )

      return result.rows.map(row => ({
        date: row.date.toISOString().split('T')[0],
        dividend_amount: parseFloat(row.dividend_amount)
      }))
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(`Error getting dividend data for ${assetType}-${symbol}:`, error)
    return []
  }
}

/**
 * Check if dividend data exists for an asset
 */
export async function hasDividendData(
  assetType: string,
  symbol: string
): Promise<boolean> {
  try {
    const client = await getPool().connect()

    try {
      const result = await client.query(
        `SELECT COUNT(*) as count
         FROM dividend_data
         WHERE asset_type = $1 AND symbol = $2`,
        [assetType, symbol.toUpperCase()]
      )

      return parseInt(result.rows[0]?.count || '0', 10) > 0
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(`Error checking dividend data for ${assetType}-${symbol}:`, error)
    return false
  }
}

/**
 * Get the latest dividend date for an asset
 * @returns Latest dividend date (YYYY-MM-DD) or null if no dividends exist
 */
export async function getLatestDividendDate(
  assetType: string,
  symbol: string
): Promise<string | null> {
  try {
    const client = await getPool().connect()

    try {
      const result = await client.query(
        `SELECT date
         FROM dividend_data
         WHERE asset_type = $1 AND symbol = $2
         ORDER BY date DESC
         LIMIT 1`,
        [assetType, symbol.toUpperCase()]
      )

      if (result.rows.length > 0) {
        const date = result.rows[0].date
        // Convert Date object to YYYY-MM-DD string
        if (date instanceof Date) {
          return date.toISOString().split('T')[0]
        }
        return date
      }

      return null
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(`Error getting latest dividend date for ${assetType}-${symbol}:`, error)
    return null
  }
}

/**
 * Get face value for a company from the profile
 * @param symbol - Asset symbol
 * @returns Face value (number) or null if not found/not set
 */
export async function getCompanyFaceValue(
  symbol: string,
  assetType: string = 'pk-equity'
): Promise<number | null> {
  try {
    const client = await getPool().connect()
    
    try {
      const result = await client.query(
        `SELECT face_value
         FROM company_profiles
         WHERE symbol = $1 AND asset_type = $2`,
        [symbol.toUpperCase(), assetType]
      )
      
      if (result.rows.length > 0 && result.rows[0].face_value) {
        return parseFloat(result.rows[0].face_value)
      }
      
      return null
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(`Error getting face value for ${assetType}-${symbol}:`, error)
    return null
  }
}

/**
 * Update market cap based on latest price and shares outstanding
 * Only updates for pk-equity and us-equity assets
 * Uses caching to avoid unnecessary updates
 */
export async function updateMarketCapFromPrice(
  assetType: string,
  symbol: string
): Promise<void> {
  // Only update market cap for equity assets
  if (assetType !== 'pk-equity' && assetType !== 'us-equity') {
    return
  }

  try {
    const client = await getPool().connect()
    
    try {
      // Get latest price
      const priceResult = await client.query(
        `SELECT close, date
         FROM historical_price_data
         WHERE asset_type = $1 AND symbol = $2
         ORDER BY date DESC
         LIMIT 1`,
        [assetType, symbol.toUpperCase()]
      )

      if (priceResult.rows.length === 0) {
        // No price data available
        return
      }

      const latestPrice = parseFloat(priceResult.rows[0].close)
      const latestPriceDate = priceResult.rows[0].date

      // Get shares outstanding from company profile
      const profileResult = await client.query(
        `SELECT shares_outstanding, market_cap
         FROM company_profiles
         WHERE asset_type = $1 AND symbol = $2`,
        [assetType, symbol.toUpperCase()]
      )

      if (profileResult.rows.length === 0) {
        // No profile data, can't calculate market cap
        return
      }

      const sharesOutstanding = profileResult.rows[0].shares_outstanding
      const currentMarketCap = profileResult.rows[0].market_cap

      if (!sharesOutstanding || sharesOutstanding <= 0) {
        // No shares outstanding data
        return
      }

      // Calculate new market cap
      const newMarketCap = latestPrice * parseFloat(sharesOutstanding)

      // Only update if market cap has changed significantly (more than 0.1% difference)
      // This avoids unnecessary database writes
      if (currentMarketCap) {
        const currentCap = parseFloat(currentMarketCap)
        const percentChange = Math.abs((newMarketCap - currentCap) / currentCap) * 100
        if (percentChange < 0.1) {
          // Market cap hasn't changed significantly, skip update
          return
        }
      }

      // Update market cap in company_profiles
      await client.query(
        `UPDATE company_profiles
         SET market_cap = $1, last_updated = NOW()
         WHERE asset_type = $2 AND symbol = $3`,
        [newMarketCap, assetType, symbol.toUpperCase()]
      )

      console.log(`[Market Cap] Updated ${assetType}/${symbol}: ${newMarketCap.toLocaleString()} (Price: ${latestPrice}, Shares: ${sharesOutstanding})`)
    } finally {
      client.release()
    }
  } catch (error: any) {
    // Don't throw - market cap update failure shouldn't break price insertion
    console.error(`[Market Cap] Error updating market cap for ${assetType}-${symbol}:`, error.message)
  }
}
