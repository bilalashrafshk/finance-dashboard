/**
 * Database Authentication Functions
 * 
 * Handles user registration, login, and user data retrieval from database
 */

import { Pool } from 'pg'
import { hashPassword, verifyPassword, generateToken, UserPayload } from './auth-utils'

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL or POSTGRES_URL environment variable is required')
  }

  // Create a new pool for auth operations
  return new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  })
}

export interface User {
  id: number
  email: string
  name: string | null
  role: string // 'admin' | 'staff' | 'tier_1_customer', etc.
  subscriptionTier: string // 'free' | 'pro' | 'enterprise'
  accountStatus: string // 'active' | 'banned' | 'suspended'
  createdAt: string
  updatedAt: string
}

export interface RegisterInput {
  email: string
  password: string
  name?: string
  role?: string
  subscriptionTier?: string
  accountStatus?: string
}

export interface LoginInput {
  email: string
  password: string
}

/**
 * Register a new user
 */
export async function registerUser(input: RegisterInput): Promise<{ user: User; token: string }> {
  let pool: Pool | null = null
  let client: any = null

  try {
    pool = getPool()
    client = await pool.connect()

    // Check if user already exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [input.email.toLowerCase()]
    )

    if (existingUser.rows.length > 0) {
      throw new Error('User with this email already exists')
    }

    // Hash password
    const passwordHash = await hashPassword(input.password)

    // Insert user
    // Defaults: role='tier_1_customer', subscription_tier='free', account_status='active'
    const result = await client.query(
      `INSERT INTO users (email, password_hash, name, role, subscription_tier, account_status)
       VALUES ($1, $2, $3, COALESCE($4, 'tier_1_customer'), COALESCE($5, 'free'), COALESCE($6, 'active'))
       RETURNING id, email, name, role, subscription_tier, account_status, created_at, updated_at`,
      [
        input.email.toLowerCase(),
        passwordHash,
        input.name || null,
        input.role || null,
        input.subscriptionTier || null,
        input.accountStatus || null
      ]
    )

    if (!result.rows || result.rows.length === 0) {
      throw new Error('Failed to create user - no data returned')
    }

    const userRow = result.rows[0]
    const user: User = {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      role: userRow.role,
      subscriptionTier: userRow.subscription_tier,
      accountStatus: userRow.account_status,
      createdAt: userRow.created_at.toISOString(),
      updatedAt: userRow.updated_at.toISOString(),
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      subscriptionTier: user.subscriptionTier,
      accountStatus: user.accountStatus
    })

    return { user, token }
  } catch (error: any) {
    if (error.code === '42P01') {
      throw new Error('Database table "users" does not exist. Please run the database schema migration.')
    }
    if (error.code === '23505') {
      throw new Error('User with this email already exists')
    }
    if (error.message?.includes('DATABASE_URL')) {
      throw new Error('Database connection not configured. Please set DATABASE_URL environment variable.')
    }
    throw error
  } finally {
    if (client) {
      client.release()
    }
  }
}

/**
 * Login a user
 */
export async function loginUser(input: LoginInput): Promise<{ user: User; token: string }> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    // Find user by email
    const result = await client.query(
      `SELECT id, email, password_hash, name, role, subscription_tier, account_status, created_at, updated_at 
       FROM users WHERE email = $1`,
      [input.email.toLowerCase()]
    )

    if (result.rows.length === 0) {
      throw new Error('Invalid email or password')
    }

    const userRow = result.rows[0]

    // Check account status
    if (userRow.account_status === 'banned' || userRow.account_status === 'suspended') {
      throw new Error(`Your account is ${userRow.account_status}. Please contact support.`)
    }

    // Verify password
    const isValid = await verifyPassword(input.password, userRow.password_hash)
    if (!isValid) {
      throw new Error('Invalid email or password')
    }

    const user: User = {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      role: userRow.role,
      subscriptionTier: userRow.subscription_tier,
      accountStatus: userRow.account_status,
      createdAt: userRow.created_at.toISOString(),
      updatedAt: userRow.updated_at.toISOString(),
    }

    // Generate token with extended payload
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      subscriptionTier: user.subscriptionTier,
      accountStatus: user.accountStatus
    })

    return { user, token }
  } finally {
    client.release()
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId: number): Promise<User | null> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    const result = await client.query(
      `SELECT id, email, name, role, subscription_tier, account_status, created_at, updated_at 
       FROM users WHERE id = $1`,
      [userId]
    )

    if (result.rows.length === 0) {
      return null
    }

    const userRow = result.rows[0]
    return {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      role: userRow.role,
      subscriptionTier: userRow.subscription_tier,
      accountStatus: userRow.account_status,
      createdAt: userRow.created_at.toISOString(),
      updatedAt: userRow.updated_at.toISOString(),
    }
  } finally {
    client.release()
  }
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    const result = await client.query(
      `SELECT id, email, name, role, subscription_tier, account_status, created_at, updated_at 
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    )

    if (result.rows.length === 0) {
      return null
    }

    const userRow = result.rows[0]
    return {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      role: userRow.role,
      subscriptionTier: userRow.subscription_tier,
      accountStatus: userRow.account_status,
      createdAt: userRow.created_at.toISOString(),
      updatedAt: userRow.updated_at.toISOString(),
    }
  } finally {
    client.release()
  }
}

/**
 * Get all users (with pagination)
 */
export async function getAllUsers(limit: number = 20, offset: number = 0): Promise<{ users: User[], total: number }> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    // Get total count
    const countResult = await client.query('SELECT COUNT(*) FROM users')
    const total = parseInt(countResult.rows[0].count)

    const result = await client.query(
      `SELECT id, email, name, role, subscription_tier, account_status, created_at, updated_at 
         FROM users 
         ORDER BY created_at DESC 
         LIMIT $1 OFFSET $2`,
      [limit, offset]
    )

    const users = result.rows.map(row => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      subscriptionTier: row.subscription_tier,
      accountStatus: row.account_status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }))

    return { users, total }
  } finally {
    client.release()
  }
}

/**
 * Create a new user (Admin function to allow setting role)
 */
export async function createUser(input: RegisterInput): Promise<User> {
  const { user } = await registerUser(input)
  return user
}

/**
 * Update user details (Admin function)
 */
export async function updateUser(userId: number, updates: {
  name?: string;
  role?: string;
  subscriptionTier?: string;
  accountStatus?: string
}): Promise<User> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    // Build query dynamically based on provided updates
    const sets: string[] = []
    const values: any[] = [userId]
    let paramIndex = 2

    if (updates.name !== undefined) {
      sets.push(`name = $${paramIndex++}`)
      values.push(updates.name)
    }

    if (updates.role !== undefined) {
      sets.push(`role = $${paramIndex++}`)
      values.push(updates.role)
    }

    if (updates.subscriptionTier !== undefined) {
      sets.push(`subscription_tier = $${paramIndex++}`)
      values.push(updates.subscriptionTier)
    }

    if (updates.accountStatus !== undefined) {
      sets.push(`account_status = $${paramIndex++}`)
      values.push(updates.accountStatus)
    }

    sets.push(`updated_at = NOW()`)

    if (sets.length === 1) { // Only updated_at
      throw new Error('No updates provided')
    }

    const result = await client.query(
      `UPDATE users 
       SET ${sets.join(', ')} 
       WHERE id = $1 
       RETURNING id, email, name, role, subscription_tier, account_status, created_at, updated_at`,
      values
    )

    if (result.rows.length === 0) {
      throw new Error('User not found')
    }

    const row = result.rows[0]
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      subscriptionTier: row.subscription_tier,
      accountStatus: row.account_status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }
  } finally {
    client.release()
  }
}

/**
 * Delete user (Admin function)
 */
export async function deleteUser(userId: number): Promise<void> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    const result = await client.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [userId]
    )

    if (result.rows.length === 0) {
      throw new Error('User not found')
    }
  } finally {
    client.release()
  }
}

