import { NextRequest, NextResponse } from 'next/server'
import { verifyResetToken, markTokenAsUsed } from '@/lib/auth/password-reset-utils'
import { hashPassword } from '@/lib/auth/auth-utils'
import { resetPasswordSchema } from '@/validations/auth'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'
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

/**
 * POST /api/auth/reset-password
 * Reset password using a valid reset token
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const limitResult = await rateLimit(ip, 5, 60 * 1000)
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': Math.ceil((limitResult.reset - Date.now()) / 1000).toString() } }
      )
    }

    const body = await request.json()
    const validated = resetPasswordSchema.parse(body)

    // Verify token
    const userId = await verifyResetToken(validated.token)

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired reset token', code: 'INVALID_TOKEN' },
        { status: 400 }
      )
    }

    // Hash new password
    const passwordHash = await hashPassword(validated.password)

    // Update user password
    const pool = getPool()
    const client = await pool.connect()

    try {
      await client.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [passwordHash, userId]
      )

      // Mark token as used
      await markTokenAsUsed(validated.token)
    } finally {
      client.release()
    }

    return NextResponse.json({
      success: true,
      message: 'Password has been reset successfully',
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.errors[0].message, code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    console.error('Reset password error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to reset password', code: 'INTERNAL_SERVER_ERROR' },
      { status: 500 }
    )
  }
}

