
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { hashPassword } from '../lib/auth/auth-utils';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function seedAdmin() {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

    if (!connectionString) {
        console.error('DATABASE_URL or POSTGRES_URL environment variable is required');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString,
        ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    });

    const client = await pool.connect();

    try {
        const email = 'bilalashraf248@gmail.com';
        const role = 'admin';
        const tempPassword = 'adminPassword123!';

        console.log(`Checking for user ${email}...`);
        const res = await client.query('SELECT * FROM users WHERE email = $1', [email]);

        if (res.rows.length > 0) {
            console.log('User exists.');
            const user = res.rows[0];
            console.log('Current Role:', user.role);

            if (user.role !== role) {
                console.log('Updating role to admin...');
                await client.query('UPDATE users SET role = $1 WHERE email = $2', [role, email]);
                console.log('Role updated successfully.');
            } else {
                console.log('Role is already admin.');
            }
        } else {
            console.log('User does not exist. Creating admin user...');
            const hashedPassword = await hashPassword(tempPassword);
            await client.query(
                `INSERT INTO users (email, password_hash, name, role) 
         VALUES ($1, $2, $3, $4)`,
                [email, hashedPassword, 'Admin User', role]
            );
            console.log(`Admin user created with temporary password: ${tempPassword}`);
        }
    } catch (err) {
        console.error('Error seeding admin:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

seedAdmin();
