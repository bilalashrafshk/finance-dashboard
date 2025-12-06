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

export async function getPostgresClient() {
  return await getPool().connect()
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
 * Get current price and its timestamp from database
 */
export async function getTodayPriceWithTimestamp(
  assetType: string,
  symbol: string,
  marketDate: string
): Promise<{ price: number; updatedAt: Date } | null> {
  try {
    const client = await getPool().connect()

    try {
      const result = await client.query(
        `SELECT close, updated_at
         FROM historical_price_data
         WHERE asset_type = $1 AND symbol = $2 AND date = $3`,
        [assetType, symbol.toUpperCase(), marketDate]
      )

      if (result.rows.length > 0) {
        return {
          price: parseFloat(result.rows[0].close),
          updatedAt: result.rows[0].updated_at
        }
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
 * Get the latest available price from database (regardless of date)
 * Used as fallback when live fetch fails
 */
export async function getLatestPriceFromDatabase(
  assetType: string,
  symbol: string
): Promise<{ price: number; date: string } | null> {
  try {
    const client = await getPool().connect()

    try {
      const result = await client.query(
        `SELECT close, date
         FROM historical_price_data
         WHERE asset_type = $1 AND symbol = $2
         ORDER BY date DESC
         LIMIT 1`,
        [assetType, symbol.toUpperCase()]
      )

      if (result.rows.length > 0) {
        const row = result.rows[0]
        // Format date as YYYY-MM-DD
        let dateStr = row.date
        if (row.date instanceof Date) {
          dateStr = row.date.toISOString().split('T')[0]
        }

        return {
          price: parseFloat(row.close),
          date: dateStr
        }
      }

      return null
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(`Error getting latest price for ${assetType}-${symbol}:`, error)
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
  source: 'stockanalysis' | 'binance' | 'investing' | 'manual' | 'scstrade'
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
  source: 'scstrade' | 'stockanalysis' | 'binance' | 'investing' | 'manual'
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
 * Get dividend data for multiple assets
 */
export async function getDividendDataBatch(
  assetType: string,
  symbols: string[]
): Promise<Record<string, DividendRecord[]>> {
  if (!symbols || symbols.length === 0) {
    return {}
  }

  try {
    const client = await getPool().connect()

    try {
      const normalizedSymbols = symbols.map(s => s.toUpperCase())

      const result = await client.query(
        `SELECT symbol, date, dividend_amount
         FROM dividend_data
         WHERE asset_type = $1 AND symbol = ANY($2)
         ORDER BY date ASC`,
        [assetType, normalizedSymbols]
      )

      const dividendsMap: Record<string, DividendRecord[]> = {}

      // Initialize arrays for all requested symbols
      normalizedSymbols.forEach(s => {
        dividendsMap[s] = []
      })

      result.rows.forEach(row => {
        const symbol = row.symbol.toUpperCase()
        if (!dividendsMap[symbol]) {
          dividendsMap[symbol] = []
        }

        dividendsMap[symbol].push({
          date: row.date.toISOString().split('T')[0],
          dividend_amount: parseFloat(row.dividend_amount)
        })
      })

      return dividendsMap
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(`Error getting batch dividend data:`, error)
    return {}
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
 * Get the last updated timestamp for dividend data
 */
export async function getLatestDividendUpdate(
  assetType: string,
  symbol: string
): Promise<string | null> {
  try {
    const client = await getPool().connect()

    try {
      const result = await client.query(
        `SELECT updated_at
         FROM dividend_data
         WHERE asset_type = $1 AND symbol = $2
         ORDER BY updated_at DESC
         LIMIT 1`,
        [assetType, symbol.toUpperCase()]
      )

      if (result.rows.length > 0) {
        return result.rows[0].updated_at.toISOString()
      }

      return null
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(`Error getting latest dividend update for ${assetType}-${symbol}:`, error)
    return null
  }
}

/**
 * Check if dividend data needs refresh (5-day cache)
 */
export async function shouldRefreshDividends(
  assetType: string,
  symbol: string
): Promise<boolean> {
  try {
    const lastUpdated = await getLatestDividendUpdate(assetType, symbol)

    if (!lastUpdated) {
      return true // No data, need to fetch
    }

    const lastUpdatedTime = new Date(lastUpdated).getTime()
    const now = Date.now()
    const ageInDays = (now - lastUpdatedTime) / (1000 * 60 * 60 * 24)

    // Refresh if data is older than 5 days
    return ageInDays > 5
  } catch (error: any) {
    console.error(`[DB] Error checking if dividends need refresh for ${assetType}-${symbol}:`, error.message)
    return true // On error, refresh to be safe
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
 * Get company name from profile
 * @param symbol - Asset symbol
 * @param assetType - Asset type (default: 'pk-equity')
 * @returns Company name or null if not found
 */
export async function getCompanyProfileName(
  symbol: string,
  assetType: string = 'pk-equity'
): Promise<string | null> {
  try {
    const client = await getPool().connect()

    try {
      const result = await client.query(
        `SELECT name
         FROM company_profiles
         WHERE symbol = $1 AND asset_type = $2
         LIMIT 1`,
        [symbol.toUpperCase(), assetType]
      )

      if (result.rows.length > 0 && result.rows[0].name) {
        return result.rows[0].name
      }

      return null
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(`Error getting company name for ${assetType}-${symbol}:`, error)
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

/**
 * Market Cycles Storage Functions
 * Stores completed cycles for efficient retrieval
 */

export interface MarketCycleRecord {
  cycleId: number
  cycleName: string
  startDate: string
  endDate: string
  startPrice: number
  endPrice: number
  roi: number
  durationTradingDays: number
}

/**
 * Save a completed market cycle to the database
 */
export async function saveMarketCycle(
  assetType: string,
  symbol: string,
  cycle: MarketCycleRecord
): Promise<void> {
  const pool = getPool()

  try {
    await pool.query(
      `INSERT INTO market_cycles 
       (asset_type, symbol, cycle_id, cycle_name, start_date, end_date, start_price, end_price, roi, duration_trading_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (asset_type, symbol, cycle_id) 
       DO UPDATE SET
         cycle_name = EXCLUDED.cycle_name,
         start_date = EXCLUDED.start_date,
         end_date = EXCLUDED.end_date,
         start_price = EXCLUDED.start_price,
         end_price = EXCLUDED.end_price,
         roi = EXCLUDED.roi,
         duration_trading_days = EXCLUDED.duration_trading_days,
         updated_at = NOW()`,
      [
        assetType,
        symbol,
        cycle.cycleId,
        cycle.cycleName,
        cycle.startDate,
        cycle.endDate,
        cycle.startPrice,
        cycle.endPrice,
        cycle.roi,
        cycle.durationTradingDays
      ]
    )
  } catch (error: any) {
    console.error(`Error saving market cycle ${cycle.cycleId} for ${assetType}-${symbol}:`, error.message)
    throw error
  }
}

/**
 * Load all saved market cycles for an asset
 */
export async function loadMarketCycles(
  assetType: string,
  symbol: string
): Promise<MarketCycleRecord[]> {
  const pool = getPool()

  try {
    const result = await pool.query(
      `SELECT cycle_id, cycle_name, start_date, end_date, start_price, end_price, roi, duration_trading_days
       FROM market_cycles
       WHERE asset_type = $1 AND symbol = $2
       ORDER BY cycle_id ASC`,
      [assetType, symbol]
    )

    return result.rows.map(row => ({
      cycleId: row.cycle_id,
      cycleName: row.cycle_name,
      startDate: row.start_date,
      endDate: row.end_date,
      startPrice: parseFloat(row.start_price),
      endPrice: parseFloat(row.end_price),
      roi: parseFloat(row.roi),
      durationTradingDays: row.duration_trading_days
    }))
  } catch (error: any) {
    console.error(`Error loading market cycles for ${assetType}-${symbol}:`, error.message)
    throw error
  }
}

/**
 * Get database client connection from the centralized pool
 * Use this for custom queries that need direct database access
 */
export async function getDbClient() {
  const pool = getPool()
  return await pool.connect()
}

/**
 * Get the last saved cycle's end date for an asset
 * Returns null if no cycles are saved yet
 */
export async function getLastCycleEndDate(
  assetType: string,
  symbol: string
): Promise<string | null> {
  const pool = getPool()

  try {
    const result = await pool.query(
      `SELECT MAX(end_date) as last_end_date
       FROM market_cycles
       WHERE asset_type = $1 AND symbol = $2`,
      [assetType, symbol]
    )

    return result.rows[0]?.last_end_date || null
  } catch (error: any) {
    console.error(`Error getting last cycle end date for ${assetType}-${symbol}:`, error.message)
    return null
  }
}

// ============================================================================
// SBP Interest Rates Database Functions
// ============================================================================

export interface SBPInterestRateRecord {
  date: string // YYYY-MM-DD
  value: number
  series_key: string
  series_name: string
  unit: string
  observation_status?: string
  status_comments?: string
}

export interface SBPInterestRateMetadata {
  series_key: string
  last_stored_date: string | null
  last_updated: string
  total_records: number
  source: string
}

/**
 * Get SBP interest rate data with date range
 */
export async function getSBPInterestRates(
  seriesKey: string,
  startDate?: string,
  endDate?: string
): Promise<{ data: SBPInterestRateRecord[]; latestStoredDate: string | null; earliestStoredDate: string | null }> {
  try {
    const client = await getPool().connect()

    try {
      const baseParams: any[] = [seriesKey]
      let whereClause = 'WHERE series_key = $1'
      let paramIndex = 2

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

      // Get data
      const dataQuery = `
        SELECT 
          date,
          value,
          series_key,
          series_name,
          unit,
          observation_status,
          status_comments
        FROM sbp_interest_rates
        ${whereClause}
        ORDER BY date DESC
      `

      const dataResult = await client.query(dataQuery, baseParams)

      const data: SBPInterestRateRecord[] = dataResult.rows.map(row => ({
        date: row.date,
        value: parseFloat(row.value),
        series_key: row.series_key,
        series_name: row.series_name,
        unit: row.unit,
        observation_status: row.observation_status,
        status_comments: row.status_comments
      }))

      // Get metadata separately
      const metadataQuery = `
        SELECT 
          MAX(date) as latest_date,
          MIN(date) as earliest_date
        FROM sbp_interest_rates
        WHERE series_key = $1
      `

      const metadataResult = await client.query(metadataQuery, [seriesKey])
      const latestStoredDate = metadataResult.rows[0]?.latest_date || null
      const earliestStoredDate = metadataResult.rows[0]?.earliest_date || null

      return { data, latestStoredDate, earliestStoredDate }
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error(`[DB] Error getting SBP interest rates for ${seriesKey}:`, error.message)
    return { data: [], latestStoredDate: null, earliestStoredDate: null }
  }
}

/**
 * Insert SBP interest rate data
 */
export async function insertSBPInterestRates(
  seriesKey: string,
  seriesName: string,
  data: Array<{
    date: string
    value: number
    unit?: string
    observation_status?: string
    status_comments?: string
  }>
): Promise<{ inserted: number; skipped: number }> {
  if (!data || data.length === 0) {
    return { inserted: 0, skipped: 0 }
  }

  try {
    const client = await getPool().connect()

    try {
      await client.query('BEGIN')

      let inserted = 0
      let skipped = 0

      for (const record of data) {
        try {
          await client.query(
            `INSERT INTO sbp_interest_rates 
             (series_key, series_name, date, value, unit, observation_status, status_comments, source)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (series_key, date) 
             DO UPDATE SET
               value = EXCLUDED.value,
               series_name = EXCLUDED.series_name,
               unit = EXCLUDED.unit,
               observation_status = EXCLUDED.observation_status,
               status_comments = EXCLUDED.status_comments,
               updated_at = NOW()`,
            [
              seriesKey,
              seriesName,
              record.date,
              record.value,
              record.unit || 'Percent',
              record.observation_status || 'Normal',
              record.status_comments || null,
              'sbp-easydata'
            ]
          )
          inserted++
        } catch (err: any) {
          if (err.code === '23505') { // Unique violation
            skipped++
          } else {
            throw err
          }
        }
      }

      // Update metadata
      const latestDate = data
        .map(r => r.date)
        .sort()
        .reverse()[0]

      const metadataResult = await client.query(
        `SELECT total_records 
         FROM sbp_rates_metadata 
         WHERE series_key = $1`,
        [seriesKey]
      )

      const currentTotal = metadataResult.rows[0]?.total_records || 0
      const newTotal = currentTotal + inserted

      await client.query(
        `INSERT INTO sbp_rates_metadata 
         (series_key, last_stored_date, total_records, source, last_updated)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (series_key)
         DO UPDATE SET 
           last_stored_date = EXCLUDED.last_stored_date,
           total_records = EXCLUDED.total_records,
           last_updated = NOW()`,
        [seriesKey, latestDate, newTotal, 'sbp-easydata']
      )

      await client.query('COMMIT')

      return { inserted, skipped }
    } catch (error: any) {
      await client.query('ROLLBACK')
      console.error(`[DB] insertSBPInterestRates: Transaction rolled back for ${seriesKey}:`, error.message)
      throw error
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error(`[DB] Error inserting SBP interest rates for ${seriesKey}:`, error.message)
    return { inserted: 0, skipped: 0 }
  }
}

/**
 * Get SBP interest rate metadata (for caching check)
 */
export async function getSBPInterestRateMetadata(
  seriesKey: string
): Promise<SBPInterestRateMetadata | null> {
  try {
    const client = await getPool().connect()

    try {
      const result = await client.query(
        `SELECT 
           series_key,
           last_stored_date,
           last_updated,
           total_records,
           source
         FROM sbp_rates_metadata
         WHERE series_key = $1`,
        [seriesKey]
      )

      if (result.rows.length === 0) {
        return null
      }

      const row = result.rows[0]
      return {
        series_key: row.series_key,
        last_stored_date: row.last_stored_date,
        last_updated: row.last_updated,
        total_records: row.total_records,
        source: row.source
      }
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error(`[DB] Error getting SBP interest rate metadata for ${seriesKey}:`, error.message)
    return null
  }
}

/**
 * Check if SBP interest rate data needs refresh (3-day cache)
 */
export async function shouldRefreshSBPInterestRates(seriesKey: string): Promise<boolean> {
  try {
    const metadata = await getSBPInterestRateMetadata(seriesKey)

    if (!metadata || !metadata.last_updated) {
      return true // No data, need to fetch
    }

    const lastUpdated = new Date(metadata.last_updated).getTime()
    const now = Date.now()
    const ageInDays = (now - lastUpdated) / (1000 * 60 * 60 * 24)

    // Refresh if data is older than 3 days
    return ageInDays > 3
  } catch (error: any) {
    console.error(`[DB] Error checking if SBP interest rates need refresh for ${seriesKey}:`, error.message)
    return true // On error, refresh to be safe
  }
}

// ============================================================================
// Balance of Payments Database Functions
// ============================================================================

export interface BOPRecord {
  date: string // YYYY-MM-DD
  value: number
  series_key: string
  series_name: string
  unit: string
  observation_status?: string
  status_comments?: string
}

export interface BOPMetadata {
  series_key: string
  last_stored_date: string | null
  last_updated: string
  total_records: number
  source: string
}

/**
 * Get Balance of Payments data with date range
 */
export async function getBOPData(
  seriesKey: string,
  startDate?: string,
  endDate?: string
): Promise<{ data: BOPRecord[]; latestStoredDate: string | null; earliestStoredDate: string | null }> {
  try {
    const client = await getPool().connect()

    try {
      const baseParams: any[] = [seriesKey]
      let whereClause = 'WHERE series_key = $1'
      let paramIndex = 2

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

      // Get data and metadata in one query
      const query = `
        WITH data AS (
          SELECT 
            date,
            value,
            series_key,
            series_name,
            unit,
            observation_status,
            status_comments
          FROM balance_of_payments
          ${whereClause}
          ORDER BY date DESC
        ),
        metadata AS (
          SELECT 
            MAX(date) as latest_date,
            MIN(date) as earliest_date
          FROM balance_of_payments
          WHERE series_key = $1
        )
        SELECT 
          d.*,
          m.latest_date,
          m.earliest_date
        FROM data d
        CROSS JOIN metadata m
      `

      const result = await client.query(query, baseParams)

      const data: BOPRecord[] = result.rows.map(row => ({
        date: row.date,
        value: parseFloat(row.value),
        series_key: row.series_key,
        series_name: row.series_name,
        unit: row.unit,
        observation_status: row.observation_status,
        status_comments: row.status_comments
      }))

      const latestStoredDate = result.rows[0]?.latest_date || null
      const earliestStoredDate = result.rows[0]?.earliest_date || null

      return { data, latestStoredDate, earliestStoredDate }
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error(`[DB] Error getting BOP data for ${seriesKey}:`, error.message)
    return { data: [], latestStoredDate: null, earliestStoredDate: null }
  }
}

/**
 * Insert Balance of Payments data
 */
export async function insertBOPData(
  seriesKey: string,
  seriesName: string,
  data: Array<{
    date: string
    value: number
    unit?: string
    observation_status?: string
    status_comments?: string
  }>
): Promise<{ inserted: number; skipped: number }> {
  if (!data || data.length === 0) {
    return { inserted: 0, skipped: 0 }
  }

  try {
    const client = await getPool().connect()

    try {
      await client.query('BEGIN')

      let inserted = 0
      let skipped = 0

      for (const record of data) {
        try {
          await client.query(
            `INSERT INTO balance_of_payments 
             (series_key, series_name, date, value, unit, observation_status, status_comments, source)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (series_key, date) 
             DO UPDATE SET
               value = EXCLUDED.value,
               series_name = EXCLUDED.series_name,
               unit = EXCLUDED.unit,
               observation_status = EXCLUDED.observation_status,
               status_comments = EXCLUDED.status_comments,
               updated_at = NOW()`,
            [
              seriesKey,
              seriesName,
              record.date,
              record.value,
              record.unit || 'Million USD',
              record.observation_status || 'Normal',
              record.status_comments || null,
              'sbp-easydata'
            ]
          )
          inserted++
        } catch (err: any) {
          if (err.code === '23505') { // Unique violation
            skipped++
          } else {
            throw err
          }
        }
      }

      // Update metadata
      const latestDate = data
        .map(r => r.date)
        .sort()
        .reverse()[0]

      const metadataResult = await client.query(
        `SELECT total_records 
         FROM bop_metadata 
         WHERE series_key = $1`,
        [seriesKey]
      )

      const currentTotal = metadataResult.rows[0]?.total_records || 0
      const newTotal = currentTotal + inserted

      await client.query(
        `INSERT INTO bop_metadata 
         (series_key, last_stored_date, total_records, source, last_updated)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (series_key)
         DO UPDATE SET 
           last_stored_date = EXCLUDED.last_stored_date,
           total_records = EXCLUDED.total_records,
           last_updated = NOW()`,
        [seriesKey, latestDate, newTotal, 'sbp-easydata']
      )

      await client.query('COMMIT')

      return { inserted, skipped }
    } catch (error: any) {
      await client.query('ROLLBACK')
      console.error(`[DB] insertBOPData: Transaction rolled back for ${seriesKey}:`, error.message)
      throw error
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error(`[DB] Error inserting BOP data for ${seriesKey}:`, error.message)
    return { inserted: 0, skipped: 0 }
  }
}

/**
 * Get Balance of Payments metadata (for caching check)
 */
export async function getBOPMetadata(
  seriesKey: string
): Promise<BOPMetadata | null> {
  try {
    const client = await getPool().connect()

    try {
      const result = await client.query(
        `SELECT 
           series_key,
           last_stored_date,
           last_updated,
           total_records,
           source
         FROM bop_metadata
         WHERE series_key = $1`,
        [seriesKey]
      )

      if (result.rows.length === 0) {
        return null
      }

      const row = result.rows[0]
      return {
        series_key: row.series_key,
        last_stored_date: row.last_stored_date,
        last_updated: row.last_updated,
        total_records: row.total_records,
        source: row.source
      }
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error(`[DB] Error getting BOP metadata for ${seriesKey}:`, error.message)
    return null
  }
}

/**
 * Check if Balance of Payments data needs refresh (3-day cache)
 */
export async function shouldRefreshBOPData(seriesKey: string): Promise<boolean> {
  try {
    const metadata = await getBOPMetadata(seriesKey)

    if (!metadata || !metadata.last_updated) {
      return true // No data, need to fetch
    }

    const lastUpdated = new Date(metadata.last_updated).getTime()
    const now = Date.now()
    const ageInDays = (now - lastUpdated) / (1000 * 60 * 60 * 24)

    // Refresh if data is older than 3 days
    return ageInDays > 3
  } catch (error: any) {
    console.error(`[DB] Error checking if BOP data needs refresh for ${seriesKey}:`, error.message)
    return true // On error, refresh to be safe
  }
}

// SBP Economic Data (CPI, GDP, etc.)
export interface SBPEconomicRecord {
  date: string // YYYY-MM-DD
  value: number
  series_key: string
  series_name: string
  unit: string
  observation_status: string
  status_comments: string | null
}

export interface SBPEconomicMetadata {
  series_key: string
  last_stored_date: string | null
  last_updated: string
  total_records: number
  source: string
}

export async function getSBPEconomicData(
  seriesKey: string,
  startDate?: string,
  endDate?: string
): Promise<{ data: SBPEconomicRecord[]; latestStoredDate: string | null; earliestStoredDate: string | null }> {
  try {
    const client = await getPool().connect()

    try {
      const baseParams: any[] = [seriesKey]
      let query = `
        SELECT date, value, series_key, series_name, unit, observation_status, status_comments
        FROM sbp_economic_data
        WHERE series_key = $1
      `

      if (startDate) {
        query += ` AND date >= $${baseParams.length + 1}`
        baseParams.push(startDate)
      }

      if (endDate) {
        query += ` AND date <= $${baseParams.length + 1}`
        baseParams.push(endDate)
      }

      query += ` ORDER BY date DESC`

      const result = await client.query(query, baseParams)

      // Get metadata separately
      const metadataResult = await client.query(
        'SELECT last_stored_date FROM sbp_economic_metadata WHERE series_key = $1',
        [seriesKey]
      )

      const latestStoredDate = metadataResult.rows[0]?.last_stored_date || null
      const earliestStoredDate = result.rows.length > 0 ? result.rows[result.rows.length - 1].date : null

      const data: SBPEconomicRecord[] = result.rows.map(row => ({
        date: row.date,
        value: parseFloat(row.value),
        series_key: row.series_key,
        series_name: row.series_name,
        unit: row.unit,
        observation_status: row.observation_status,
        status_comments: row.status_comments,
      }))

      return { data, latestStoredDate, earliestStoredDate }
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error(`[DB] getSBPEconomicData error for ${seriesKey}:`, error.message)
    throw error
  }
}

export async function insertSBPEconomicData(
  seriesKey: string,
  seriesName: string,
  data: Array<{
    date: string
    value: number
    unit: string
    observation_status: string
    status_comments: string
  }>
): Promise<{ inserted: number; skipped: number }> {
  if (data.length === 0) {
    return { inserted: 0, skipped: 0 }
  }

  try {
    const client = await getPool().connect()

    try {
      await client.query('BEGIN')

      let inserted = 0
      let skipped = 0
      let latestDate: string | null = null

      for (const record of data) {
        try {
          const result = await client.query(
            `INSERT INTO sbp_economic_data 
             (series_key, series_name, date, value, unit, observation_status, status_comments, source)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (series_key, date) DO UPDATE SET
               value = EXCLUDED.value,
               series_name = EXCLUDED.series_name,
               unit = EXCLUDED.unit,
               observation_status = EXCLUDED.observation_status,
               status_comments = EXCLUDED.status_comments,
               updated_at = NOW()`,
            [
              seriesKey,
              seriesName,
              record.date,
              record.value,
              record.unit,
              record.observation_status,
              record.status_comments,
              'sbp-easydata'
            ]
          )

          if (result.rowCount && result.rowCount > 0) {
            inserted++
          } else {
            skipped++
          }

          // Track latest date
          if (!latestDate || record.date > latestDate) {
            latestDate = record.date
          }
        } catch (insertError: any) {
          // Skip duplicates or other insert errors, continue with next record
          skipped++
          console.warn(`[DB] insertSBPEconomicData: Skipped record for ${seriesKey} on ${record.date}:`, insertError.message)
        }
      }

      // Update metadata
      // Get total records count first
      const countResult = await client.query(
        'SELECT COUNT(*) as count FROM sbp_economic_data WHERE series_key = $1',
        [seriesKey]
      )
      const totalRecords = parseInt(countResult.rows[0].count) || 0

      await client.query(
        `INSERT INTO sbp_economic_metadata (series_key, last_stored_date, last_updated, total_records, source)
         VALUES ($1, $2, NOW(), $3, $4)
         ON CONFLICT (series_key) DO UPDATE SET
           last_stored_date = EXCLUDED.last_stored_date,
           last_updated = NOW(),
           total_records = $3`,
        [seriesKey, latestDate, totalRecords, 'sbp-easydata']
      )

      await client.query('COMMIT')

      return { inserted, skipped }
    } catch (error: any) {
      await client.query('ROLLBACK')
      console.error(`[DB] insertSBPEconomicData: Transaction rolled back for ${seriesKey}:`, error.message)
      throw error
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error(`[DB] insertSBPEconomicData error for ${seriesKey}:`, error.message)
    throw error
  }
}

export async function getSBPEconomicMetadata(
  seriesKey: string
): Promise<SBPEconomicMetadata | null> {
  try {
    const client = await getPool().connect()

    try {
      const result = await client.query(
        'SELECT series_key, last_stored_date, last_updated, total_records, source FROM sbp_economic_metadata WHERE series_key = $1',
        [seriesKey]
      )

      if (result.rows.length === 0) {
        return null
      }

      const row = result.rows[0]
      return {
        series_key: row.series_key,
        last_stored_date: row.last_stored_date,
        last_updated: row.last_updated.toISOString(),
        total_records: parseInt(row.total_records) || 0,
        source: row.source,
      }
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error(`[DB] getSBPEconomicMetadata error for ${seriesKey}:`, error.message)
    return null
  }
}

export async function shouldRefreshSBPEconomicData(seriesKey: string): Promise<boolean> {
  try {
    const metadata = await getSBPEconomicMetadata(seriesKey)

    if (!metadata || !metadata.last_updated) {
      return true // No data, need to fetch
    }

    const lastUpdated = new Date(metadata.last_updated).getTime()
    const now = Date.now()
    const ageInDays = (now - lastUpdated) / (1000 * 60 * 60 * 24)

    // Refresh if data is older than 3 days
    return ageInDays > 3
  } catch (error: any) {
    console.error(`[DB] Error checking if SBP economic data needs refresh for ${seriesKey}:`, error.message)
    return true // On error, refresh to be safe
  }
}
