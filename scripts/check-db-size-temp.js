
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function checkSize() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const res = await pool.query("SELECT pg_size_pretty(pg_database_size(current_database()));");
        console.log("Database Size:", res.rows[0].pg_size_pretty);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

checkSize();
