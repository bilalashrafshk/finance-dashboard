import fs from 'fs';
import path from 'path';
require('dotenv').config({ path: '.env.local' });

// We use title case for matching, but the search will be case-insensitive
const CRITICAL_KEYWORDS = ["Material Information"];

const PRIORITY_KEYWORDS = [
    "Financial Results",
    "Board Meeting",
    "Dividend",
    "Bonus",
    "Right Shares",
    "Appointment of CEO",
    "Appointment of Chief Executive",
    "Appointment of Chairman",
    "Appointment of CFO",
    "Appointment of Chief Financial Officer",
    "Change of CEO",
    "Change of Chief Executive",
    "Change of CFO",
    "Change of Chief Financial Officer"
];

const IGNORE_KEYWORDS = [
    "Daily Dividend",
    "Subscription Status",
    "Unclaimed Dividends",
    "Loss of Share Certificate",
    "Transmission of Annual Report",
    "Notice of Annual General Meeting",
    "Corrigendum",
    "Change of Share Registrar"
];

async function analyze() {
    const { getPool } = require('../lib/db');
    const pool = getPool();
    const { rows } = await pool.query("SELECT symbol FROM company_profiles WHERE symbol NOT LIKE 'TEST%' AND market_cap IS NOT NULL ORDER BY market_cap DESC LIMIT 100");
    const top100 = rows.map((r: any) => r.symbol);

    const announcements = JSON.parse(fs.readFileSync('scripts/data/announcements.json', 'utf8'));
    const jan14 = announcements.filter((a: any) => a.date === 'Jan 14, 2026');

    const results = jan14.filter((a: any) => {
        const titleLower = a.title.toLowerCase();

        // Rule 1: Critical Keywords (Never blocked)
        const criticalMatch = CRITICAL_KEYWORDS.find(k => titleLower.includes(k.toLowerCase()));
        if (criticalMatch) {
            a.reason = `Critical: ${criticalMatch}`;
            return true;
        }

        // Rule 0: Noise Filter
        if (IGNORE_KEYWORDS.some(k => titleLower.includes(k.toLowerCase()))) return false;

        // Rule 2: Priority Keywords
        const priorityMatch = PRIORITY_KEYWORDS.find(k => titleLower.includes(k.toLowerCase()));
        if (priorityMatch) {
            a.reason = `Priority: ${priorityMatch}`;
            return true;
        }

        // Rule 3: Disclosure of Interest for Top 100
        if (titleLower.includes("disclosure of interest") && top100.includes(a.symbol)) {
            a.reason = "Top 100 Insider Transfer";
            return true;
        }

        return false;
    });

    const filtered = jan14.filter((a: any) => !results.find((r: any) => r.uniqueId === a.uniqueId));

    const finalResults = {
        summary: {
            total: jan14.length,
            passed: results.length,
            filtered: filtered.length,
            noiseReduction: `${Math.round((filtered.length / jan14.length) * 100)}%`
        },
        passed: results.map((r: any) => ({ symbol: r.symbol, title: r.title, time: r.time, reason: r.reason })),
        filtered: filtered.map((f: any) => ({ symbol: f.symbol, title: f.title, time: f.time }))
    };

    const outputPath = path.join(process.cwd(), 'scripts/data/analysis_results.json');
    fs.writeFileSync(outputPath, JSON.stringify(finalResults, null, 2));

    console.log(`Total Jan 14th announcements: ${jan14.length}`);
    console.log(`Announcements passing AI filter: ${results.length}`);
    console.log(`Results saved to ${outputPath}`);
}

analyze();
