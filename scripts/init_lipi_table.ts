
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getPostgresClient } from '../lib/portfolio/db-client'

async function initLipiTable() {
    console.log('Initializing Liquidity Map (Lipi) Table...')
    const client = await getPostgresClient()

    try {
        await client.query('BEGIN')

        // Create table for Liquidity Data
        // Stores both Summary (sector_name = 'ALL') and Detailed Sector data
        await client.query(`
      CREATE TABLE IF NOT EXISTS lipi_data (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        client_type VARCHAR(100) NOT NULL,
        sector_name VARCHAR(100) NOT NULL,
        buy_value DECIMAL NOT NULL,
        sell_value DECIMAL NOT NULL,
        net_value DECIMAL NOT NULL,
        source VARCHAR(50) DEFAULT 'scstrade',
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        -- Unique constraint to prevent duplicates
        CONSTRAINT lipi_data_unique UNIQUE (date, client_type, sector_name)
      );
    `)

        // Create Metadata table for caching
        await client.query(`
      CREATE TABLE IF NOT EXISTS lipi_metadata (
        date DATE PRIMARY KEY,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        is_complete BOOLEAN DEFAULT FALSE
      );
    `)

        // Indexes for performance
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lipi_date ON lipi_data(date);
      CREATE INDEX IF NOT EXISTS idx_lipi_client_sector ON lipi_data(client_type, sector_name);
    `)

        await client.query('COMMIT')
        console.log('✅ lipi_data table created successfully')

    } catch (error) {
        await client.query('ROLLBACK')
        console.error('❌ Error creating table:', error)
    } finally {
        client.release()
        process.exit(0) // Ensure script exits
    }
}

initLipiTable()
