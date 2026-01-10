
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function verifySectorPE() {
    const client = await pool.connect();
    try {
        console.log('--- Verifying Sector PE Accuracy ---');

        // Calculate Expected Sector PE manually
        const manualCalcQuery = `
      SELECT 
        sector,
        AVG(sector_pe) as stored_pe,
        SUM(market_cap) as total_mcap,
        SUM(CASE WHEN pe_ratio IS NOT NULL AND pe_ratio != 0 THEN market_cap / pe_ratio ELSE 0 END) as total_earnings,
        COUNT(*) as stock_count
      FROM screener_metrics
      WHERE asset_type = 'pk-equity'
        AND sector IS NOT NULL
        AND market_cap > 0
      GROUP BY sector
      HAVING COUNT(*) > 2
      LIMIT 10
    `;

        const manualRes = await client.query(manualCalcQuery);

        console.log(`\n${"Sector".padEnd(25)} | ${"Stored PE".padEnd(10)} | ${"Calc PE".padEnd(10)} | ${"Diff %".padEnd(10)}`);
        console.log("-".repeat(70));

        for (const row of manualRes.rows) {
            const storedPE = parseFloat(row.stored_pe || '0');
            const calcPE = row.total_earnings !== 0 ? row.total_mcap / row.total_earnings : 0;
            const diff = storedPE !== 0 ? Math.abs((storedPE - calcPE) / storedPE) * 100 : 0;

            console.log(`${row.sector.padEnd(25)} | ${storedPE.toFixed(2).padEnd(10)} | ${calcPE.toFixed(2).padEnd(10)} | ${diff.toFixed(1)}%`);
        }

    } catch (error) {
        console.error('Error verifying Sector PE:', error);
    } finally {
        client.release();
        pool.end();
    }
}

verifySectorPE();
