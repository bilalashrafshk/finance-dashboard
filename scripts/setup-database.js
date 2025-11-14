#!/usr/bin/env node
/**
 * Database Setup Script
 * Runs the SQL schema to create tables in Neon database
 */

const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env.local
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL

if (!connectionString) {
  console.error('❌ Error: DATABASE_URL or POSTGRES_URL not found in .env.local')
  console.error('Please make sure .env.local exists and contains DATABASE_URL')
  process.exit(1)
}

console.log('🚀 Setting up database schema...')
console.log('📋 Reading SQL schema file...')

// Read the SQL schema file
const schemaPath = path.join(__dirname, '..', 'lib', 'portfolio', 'db-schema.sql')
let sqlSchema

try {
  sqlSchema = fs.readFileSync(schemaPath, 'utf8')
} catch (error) {
  console.error(`❌ Error reading SQL schema file: ${schemaPath}`)
  console.error(error.message)
  process.exit(1)
}

// Create database connection
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

async function setupDatabase() {
  const client = await pool.connect()
  
  try {
    console.log('✅ Connected to database')
    console.log('📝 Executing SQL schema...')
    
    // Execute the SQL schema
    await client.query(sqlSchema)
    
    console.log('')
    console.log('✅ Database schema created successfully!')
    console.log('')
    console.log('Tables created:')
    console.log('  - historical_price_data')
    console.log('  - historical_data_metadata')
    console.log('  - users')
    console.log('  - user_holdings')
    console.log('  - user_trades')
    console.log('')
    console.log('Next steps:')
    console.log('  1. Restart your dev server: npm run dev')
    console.log('  2. Try registering a new user account')
    console.log('  3. Login and start adding portfolio holdings')
    console.log('')
  } catch (error) {
    console.error('')
    console.error('❌ Error executing SQL schema:')
    console.error(error.message)
    console.error('')
    console.error('Please check:')
    console.error('  1. Database connection string is correct')
    console.error('  2. Database is accessible')
    console.error('  3. SQL schema file is valid')
    console.error('')
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

setupDatabase().catch((error) => {
  console.error('❌ Unexpected error:', error)
  process.exit(1)
})

