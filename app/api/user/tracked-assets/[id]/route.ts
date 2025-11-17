import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { Pool } from 'pg'
import type { TrackedAsset } from '../route'

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

// DELETE - Remove a tracked asset
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    const { id } = await params
    const pool = getPool()
    const client = await pool.connect()
    
    try {
      const result = await client.query(
        `DELETE FROM user_tracked_assets
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [id, user.id]
      )
      
      if (result.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Tracked asset not found' },
          { status: 404 }
        )
      }
      
      return NextResponse.json({ success: true })
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
    
    console.error('Delete tracked asset error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete tracked asset' },
      { status: 500 }
    )
  }
}


