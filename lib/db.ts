
import { Pool } from 'pg'

// Initialize connection pool
let pool: Pool | null = null

export function getPool(): Pool {
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
            connectionTimeoutMillis: 10000,
        })
    }

    return pool
}

export async function getPostgresClient() {
    return await getPool().connect()
}
