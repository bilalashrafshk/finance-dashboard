
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function runMigration() {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

    if (!connectionString) {
        console.error('DATABASE_URL or POSTGRES_URL environment variable is required');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString,
        ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    });

    try {
        const client = await pool.connect();
        console.log('Connected to database');

        const sqlPath = path.join(process.cwd(), 'lib/auth/add_role_column.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Running migration...');
        await client.query(sql);
        console.log('Migration completed successfully');

        client.release();
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
