#!/usr/bin/env node
/**
 * Check if authentication tables exist in the database
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

async function checkTables() {
  const client = await pool.connect()
  
  try {
    console.log('🔍 Checking for authentication tables...\n')
    
    // Check if users table exists
    const usersTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `)
    
    // Check if user_holdings table exists
    const holdingsTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_holdings'
      );
    `)
    
    // Check if user_trades table exists
    const tradesTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_trades'
      );
    `)
    
    console.log('Table Status:')
    console.log(`  ✅ users: ${usersTable.rows[0].exists ? 'EXISTS' : '❌ MISSING'}`)
    console.log(`  ✅ user_holdings: ${holdingsTable.rows[0].exists ? 'EXISTS' : '❌ MISSING'}`)
    console.log(`  ✅ user_trades: ${tradesTable.rows[0].exists ? 'EXISTS' : '❌ MISSING'}`)
    console.log('')
    
    const allExist = usersTable.rows[0].exists && holdingsTable.rows[0].exists && tradesTable.rows[0].exists
    
    if (allExist) {
      console.log('✅ All authentication tables exist!')
      console.log('')
      console.log('You can now use the authentication features.')
    } else {
      console.log('❌ Some tables are missing!')
      console.log('')
      console.log('To fix this:')
      console.log('1. Go to your Neon Console: https://console.neon.tech')
      console.log('2. Open SQL Editor')
      console.log('3. Copy the contents of lib/portfolio/db-schema.sql')
      console.log('4. Paste and execute the SQL in the Neon SQL Editor')
      console.log('')
      console.log('Or run: node scripts/setup-database.js')
    }
    
  } catch (error) {
    console.error('❌ Error checking tables:', error.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

checkTables().catch((error) => {
  console.error('❌ Unexpected error:', error)
  process.exit(1)
})

