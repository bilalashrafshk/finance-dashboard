
import { Pool } from 'pg'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

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
        console.log('Starting migration: Add permissions column to users table...')

        // Check if column exists
        const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name = 'permissions';
    `
        const { rows } = await client.query(checkQuery)

        if (rows.length === 0) {
            console.log('Adding permissions column...')
            // Using JSONB to store permissions array or object
            await client.query(`
        ALTER TABLE users 
        ADD COLUMN permissions JSONB DEFAULT '[]';
      `)
            console.log('permissions column added successfully.')
        } else {
            console.log('permissions column already exists.')
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
