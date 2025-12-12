/**
 * Password Reset Utilities
 * 
 * Handles password reset token generation and validation
 */

import crypto from 'crypto'
import { getPool } from '@/lib/db'

/**
 * Generate a secure random token for password reset
 */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Create a password reset token for a user
 * Token expires in 1 hour
 */
export async function createPasswordResetToken(userId: number): Promise<string> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    // Delete any existing unused tokens for this user
    await client.query(
      'DELETE FROM password_reset_tokens WHERE user_id = $1 AND used = FALSE',
      [userId]
    )

    // Generate new token
    const token = generateResetToken()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 1) // Token expires in 1 hour

    // Insert token
    await client.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, token, expiresAt]
    )

    return token
  } finally {
    client.release()
  }
}

/**
 * Verify and get user ID from reset token
 * Returns null if token is invalid, expired, or already used
 */
export async function verifyResetToken(token: string): Promise<number | null> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    const result = await client.query(
      `SELECT user_id, expires_at, used
       FROM password_reset_tokens
       WHERE token = $1`,
      [token]
    )

    if (result.rows.length === 0) {
      return null // Token not found
    }

    const row = result.rows[0]

    // Check if token is used
    if (row.used) {
      return null // Token already used
    }

    // Check if token is expired
    const expiresAt = new Date(row.expires_at)
    if (expiresAt < new Date()) {
      return null // Token expired
    }

    return row.user_id
  } finally {
    client.release()
  }
}

/**
 * Mark a reset token as used
 */
export async function markTokenAsUsed(token: string): Promise<void> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    await client.query(
      'UPDATE password_reset_tokens SET used = TRUE WHERE token = $1',
      [token]
    )
  } finally {
    client.release()
  }
}

/**
 * Get user email by user ID
 */
export async function getUserEmailById(userId: number): Promise<string | null> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    const result = await client.query(
      'SELECT email FROM users WHERE id = $1',
      [userId]
    )

    if (result.rows.length === 0) {
      return null
    }

    return result.rows[0].email
  } finally {
    client.release()
  }
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<{ id: number; email: string } | null> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    const result = await client.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email.toLowerCase()]
    )

    if (result.rows.length === 0) {
      return null
    }

    return {
      id: result.rows[0].id,
      email: result.rows[0].email,
    }
  } finally {
    client.release()
  }
}




