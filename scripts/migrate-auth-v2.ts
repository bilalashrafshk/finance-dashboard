

import { Pool } from 'pg'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })


/**
 * Migration: Add subscription_tier and account_status to users table
 */
async function migrate() {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL

    if (!connectionString) {
        console.error('DATABASE_URL or POSTGRES_URL environment variable is required')
        process.exit(1)
    }

    const pool = new Pool({
        connectionString,
        ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    })

    const client = await pool.connect()

    try {
        console.log('Starting migration...')

        // Check if columns exist
        const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('subscription_tier', 'account_status');
    `
        const { rows } = await client.query(checkQuery)
        const existingColumns = rows.map(r => r.column_name)

        // Add subscription_tier if missing
        if (!existingColumns.includes('subscription_tier')) {
            console.log('Adding subscription_tier column...')
            await client.query(`
        ALTER TABLE users 
        ADD COLUMN subscription_tier VARCHAR(50) NOT NULL DEFAULT 'free';
      `)
        } else {
            console.log('subscription_tier column already exists.')
        }

        // Add account_status if missing
        if (!existingColumns.includes('account_status')) {
            console.log('Adding account_status column...')
            await client.query(`
        ALTER TABLE users 
        ADD COLUMN account_status VARCHAR(50) NOT NULL DEFAULT 'active';
      `)
        } else {
            console.log('account_status column already exists.')
        }

        // Validate columns were added
        const validateQuery = `
        SELECT subscription_tier, account_status FROM users LIMIT 1;
    `
        // If the table is empty this won't throw, but query validity is checked
        try {
            await client.query(validateQuery)
            console.log('Migration verified successfully.')
        } catch (e) {
            console.error('Verification failed:', e)
            throw e
        }

        console.log('Migration completed successfully.')
    } catch (error) {
        console.error('Migration failed:', error)
        process.exit(1)
    } finally {
        client.release()
        await pool.end()
    }
}

migrate()
