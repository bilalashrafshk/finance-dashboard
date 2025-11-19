#!/usr/bin/env node
/**
 * Add face_value column to company_profiles table
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
    console.log('📝 Adding face_value column to company_profiles...')
    
    await client.query(`
      ALTER TABLE company_profiles 
      ADD COLUMN IF NOT EXISTS face_value DECIMAL(10, 2);
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

