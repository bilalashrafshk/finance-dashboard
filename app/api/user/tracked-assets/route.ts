import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { Pool } from 'pg'

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL
  
  if (!connectionString) {
    throw new Error('DATABASE_URL or POSTGRES_URL environment variable is required')
  }
  
  return new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  })
}

export interface TrackedAsset {
  id: string
  assetType: string
  symbol: string
  name: string
  currency: string
  notes?: string
  createdAt: string
  updatedAt: string
}

// GET - Get all tracked assets for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const pool = getPool()
    const client = await pool.connect()
    
    try {
      const result = await client.query(
        `SELECT id, asset_type, symbol, name, currency, notes, created_at, updated_at
         FROM user_tracked_assets
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [user.id]
      )
      
      const assets: TrackedAsset[] = result.rows.map(row => ({
        id: row.id.toString(),
        assetType: row.asset_type,
        symbol: row.symbol,
        name: row.name,
        currency: row.currency,
        notes: row.notes || undefined,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      }))
      
      return NextResponse.json({ success: true, assets })
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
    
    console.error('Get tracked assets error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get tracked assets' },
      { status: 500 }
    )
  }
}

// POST - Create a new tracked asset
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const body = await request.json()
    
    const { assetType, symbol, name, currency, notes } = body
    
    if (!assetType || !symbol || !name) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    const pool = getPool()
    const client = await pool.connect()
    
    try {
      const result = await client.query(
        `INSERT INTO user_tracked_assets 
         (user_id, asset_type, symbol, name, currency, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, asset_type, symbol) 
         DO UPDATE SET 
           name = EXCLUDED.name,
           currency = EXCLUDED.currency,
           notes = EXCLUDED.notes,
           updated_at = NOW()
         RETURNING id, asset_type, symbol, name, currency, notes, created_at, updated_at`,
        [user.id, assetType, symbol.toUpperCase().trim(), name.trim(), currency || 'USD', notes || null]
      )
      
      const row = result.rows[0]
      const asset: TrackedAsset = {
        id: row.id.toString(),
        assetType: row.asset_type,
        symbol: row.symbol,
        name: row.name,
        currency: row.currency,
        notes: row.notes || undefined,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      }
      
      return NextResponse.json({ success: true, asset }, { status: 201 })
    } catch (error: any) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'Asset is already being tracked' },
          { status: 409 }
        )
      }
      throw error
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
    
    console.error('Create tracked asset error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create tracked asset' },
      { status: 500 }
    )
  }
}

