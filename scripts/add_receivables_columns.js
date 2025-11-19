#!/usr/bin/env node
/**
 * Add accrued_interest_receivable and other_receivables columns to financial_statements table
 */

const { Pool } = require('pg')
const path = require('path')

// Load environment variables from .env.local
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL

if (!connectionString) {
  console.error('❌ Error: DATABASE_URL or POSTGRES_URL not found in .env.local')
  process.exit(1)
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

async function migrate() {
  const client = await pool.connect()

  try {
    console.log('✅ Connected to database')
    console.log('📝 Adding accrued_interest_receivable and other_receivables columns to financial_statements...')

    await client.query(`
      ALTER TABLE financial_statements
      ADD COLUMN IF NOT EXISTS accrued_interest_receivable DECIMAL(20, 2);
    `)

    await client.query(`
      ALTER TABLE financial_statements
      ADD COLUMN IF NOT EXISTS other_receivables DECIMAL(20, 2);
    `)

    console.log('✅ Migration successful!')
  } catch (error) {
    console.error('❌ Error running migration:')
    console.error(error.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()

