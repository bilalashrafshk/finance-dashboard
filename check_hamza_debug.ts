
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { getPool } from './lib/db';

async function main() {
    const pool = getPool();
    try {
        console.log("Searching for user 'Hamza'...");
        // Case insensitive search
        const res = await pool.query(`
        SELECT id, email, name, role, permissions, pg_typeof(permissions) as raw_type 
        FROM users 
        WHERE name ILIKE '%Hamza%' OR email ILIKE '%Hamza%'
    `);

        if (res.rows.length === 0) {
            console.log("No user found with name or email containing 'Hamza'");
            // Let's list all staff just in case
            console.log("Listing ALL staff users:");
            const staffRes = await pool.query("SELECT id, email, name, role, permissions FROM users WHERE role = 'staff'");
            console.table(staffRes.rows);
        } else {
            console.log(`Found ${res.rows.length} matches:`);
            for (const row of res.rows) {
                console.log("\n------------------------------------------------");
                console.log(`User: ${row.name} (${row.email})`);
                console.log(`Role: ${row.role}`);
                console.log(`Permissions:`, JSON.stringify(row.permissions));
                console.log(`Permissions Type: ${typeof row.permissions}`);

                // Check auth logic match
                let permissions: string[] = [];
                if (Array.isArray(row.permissions)) {
                    permissions = row.permissions;
                } else if (typeof row.permissions === 'string') {
                    try { permissions = JSON.parse(row.permissions); } catch (e) { permissions = []; }
                }

                const isAuthorized = row.role === 'admin' ||
                    (row.role === 'staff' && permissions.includes('x-copilot'));

                console.log(`> Is Authorized Logic Result: ${isAuthorized}`);
                if (!isAuthorized) {
                    console.log(`  Reason: Role is '${row.role}' (needs 'admin' or 'staff') AND permissions must include 'x-copilot'.`);
                }
            }
        }

    } catch (e) {
        console.error("Error running query:", e);
    } finally {
        process.exit(0);
    }
}

main();
