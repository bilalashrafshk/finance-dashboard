import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { Pool } from 'pg'
import { hashPassword, verifyPassword } from '@/lib/auth/auth-utils'

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

// GET - Get current user profile
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const pool = getPool()
    const client = await pool.connect()
    
    try {
      const result = await client.query(
        'SELECT id, email, name, created_at, updated_at FROM users WHERE id = $1',
        [user.id]
      )
      
      if (result.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'User not found' },
          { status: 404 }
        )
      }
      
      const row = result.rows[0]
      return NextResponse.json({
        success: true,
        user: {
          id: row.id,
          email: row.email,
          name: row.name,
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
        },
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
    
    console.error('Get profile error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get profile' },
      { status: 500 }
    )
  }
}

// PUT - Update user profile
export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const body = await request.json()
    
    const { name, email, currentPassword, newPassword } = body
    
    const pool = getPool()
    const client = await pool.connect()
    
    try {
      // Start transaction
      await client.query('BEGIN')
      
      // Get current user data
      const currentUser = await client.query(
        'SELECT email, password_hash FROM users WHERE id = $1',
        [user.id]
      )
      
      if (currentUser.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: 'User not found' },
          { status: 404 }
        )
      }
      
      const currentEmail = currentUser.rows[0].email
      const currentPasswordHash = currentUser.rows[0].password_hash
      
      // Update name if provided
      if (name !== undefined) {
        await client.query(
          'UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2',
          [name.trim() || null, user.id]
        )
      }
      
      // Update email if provided and different
      if (email !== undefined && email.trim() !== currentEmail) {
        const newEmail = email.trim().toLowerCase()
        
        // Check if email is already taken
        const emailCheck = await client.query(
          'SELECT id FROM users WHERE email = $1 AND id != $2',
          [newEmail, user.id]
        )
        
        if (emailCheck.rows.length > 0) {
          await client.query('ROLLBACK')
          return NextResponse.json(
            { success: false, error: 'Email already in use' },
            { status: 409 }
          )
        }
        
        await client.query(
          'UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2',
          [newEmail, user.id]
        )
      }
      
      // Update password if provided
      if (newPassword !== undefined && newPassword.trim()) {
        if (!currentPassword) {
          await client.query('ROLLBACK')
          return NextResponse.json(
            { success: false, error: 'Current password is required to change password' },
            { status: 400 }
          )
        }
        
        // Verify current password
        const isValidPassword = await verifyPassword(currentPassword, currentPasswordHash)
        if (!isValidPassword) {
          await client.query('ROLLBACK')
          return NextResponse.json(
            { success: false, error: 'Current password is incorrect' },
            { status: 401 }
          )
        }
        
        // Validate new password
        if (newPassword.trim().length < 6) {
          await client.query('ROLLBACK')
          return NextResponse.json(
            { success: false, error: 'New password must be at least 6 characters' },
            { status: 400 }
          )
        }
        
        // Hash and update password
        const newPasswordHash = await hashPassword(newPassword.trim())
        await client.query(
          'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
          [newPasswordHash, user.id]
        )
      }
      
      // Commit transaction
      await client.query('COMMIT')
      
      // Fetch updated user
      const updatedUser = await client.query(
        'SELECT id, email, name, created_at, updated_at FROM users WHERE id = $1',
        [user.id]
      )
      
      const row = updatedUser.rows[0]
      return NextResponse.json({
        success: true,
        user: {
          id: row.id,
          email: row.email,
          name: row.name,
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
        },
      })
    } catch (error: any) {
      await client.query('ROLLBACK')
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
    
    console.error('Update profile error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update profile' },
      { status: 500 }
    )
  }
}

