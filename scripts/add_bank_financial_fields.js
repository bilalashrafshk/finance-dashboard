#!/usr/bin/env node
/**
 * Add bank-specific financial fields to financial_statements table
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
    console.log('📝 Adding bank-specific financial fields to financial_statements...')

    // Assets
    const assetFields = [
      'goodwill',
      'other_intangible_assets',
      'restricted_cash',
      'other_current_assets',
      'long_term_deferred_tax_assets',
      'other_long_term_assets',
    ]

    // Liabilities
    const liabilityFields = [
      'accrued_expenses',
      'interest_bearing_deposits',
      'non_interest_bearing_deposits',
      'total_deposits',
      'short_term_borrowings',
      'current_portion_long_term_debt',
      'current_portion_leases',
      'current_income_taxes_payable',
      'accrued_interest_payable',
      'other_current_liabilities',
      'long_term_debt',
      'long_term_leases',
      'long_term_unearned_revenue',
      'pension_post_retirement_benefits',
      'long_term_deferred_tax_liabilities',
      'other_long_term_liabilities',
    ]

    for (const field of [...assetFields, ...liabilityFields]) {
      await client.query(`
        ALTER TABLE financial_statements
        ADD COLUMN IF NOT EXISTS ${field} DECIMAL(20, 2);
      `)
      console.log(`  ✓ Added ${field}`)
    }

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

