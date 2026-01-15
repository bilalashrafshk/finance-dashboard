import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { getPool } from '../lib/db';
require('dotenv').config({ path: '.env.local' });

// --- CONFIGURATION ---
const API_URL = 'https://dps.psx.com.pk/announcements';
const BASE_URL = 'https://dps.psx.com.pk';
const OUTPUT_FILE = path.join(process.cwd(), 'scripts/data/announcements.json');

async function scrapeAnnouncements() {
    try {
        console.log(`[${new Date().toLocaleTimeString()}] Fetching PSX data...`);
        const pool = getPool();

        // 1. Fetch Dynamic Configs
        const configRes = await pool.query("SELECT key, value FROM alert_configs");
        const configs = configRes.rows.reduce((acc: any, row: any) => {
            acc[row.key] = row.value;
            return acc;
        }, {});

        const PRIORITY_KEYWORDS: string[] = configs.priority_keywords || [];
        const IGNORE_KEYWORDS: string[] = configs.ignore_keywords || [];
        const MC_THRESHOLD_RANK = configs.mc_threshold_rank || 100;

        // 2. Fetch Top X Companies
        const topCompaniesRes = await pool.query(
            "SELECT symbol FROM company_profiles WHERE market_cap IS NOT NULL ORDER BY market_cap DESC LIMIT $1",
            [MC_THRESHOLD_RANK]
        );
        const topSymbols = topCompaniesRes.rows.map((r: any) => r.symbol);

        const payload = new URLSearchParams({
            type: 'C',
            symbol: '',
            query: '',
            count: '50',
            offset: '0',
            date_from: '',
            date_to: '',
            page: 'annc'
        });

        const response = await axios.post(API_URL, payload, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const html = response.data;
        const $ = cheerio.load(html);
        const rows = $('tr');
        const announcements: any[] = [];
        let passedCount = 0;

        rows.each((i, element) => {
            const cols = $(element).find('td');
            if (cols.length === 0) return;

            const date = $(cols[0]).text().trim();
            const time = $(cols[1]).text().trim();
            const symbol = $(cols[2]).text().trim();
            const company = $(cols[3]).text().trim();
            const title = $(cols[4]).text().trim();
            const titleLower = title.toLowerCase();

            // --- FILTERING LOGIC ---
            let passed = false;
            let reason = '';

            // Rule 1: Priority Keywords (Strongest Signal - Critical + Roles)
            // Implicit Critical: If "Priority" contains "Material Information" and we check priority first, does it work?
            // Wait, we need Ignore to run first for "Dividend" but NOT for "Material Information".
            // Since we put "Material Information" in Priority, if we run Priority first, it passes.
            // If we run Ignore first, "Dividend" in "Material Information regarding Dividend" (rare) might kill it.
            // But standard "Material Information" has no Ignore keywords.
            // "Daily Dividend" contains "Dividend".
            // If Priority First: "Daily Dividend" matches "Dividend" -> Passes. (BAD)
            // So we MUST run Ignore first for "Dividend".
            // But we must run Priority first for "Material Information" (Critical).
            // Solution: Check Critical explicitly or assume Material Info is safe from ignore.
            // Safer: Hardcode Critical check.

            const CRITICAL_KEYWORDS = ["Material Information"];
            if (CRITICAL_KEYWORDS.some(k => titleLower.includes(k.toLowerCase()))) {
                passed = true;
                reason = "Critical Information";
            } else if (IGNORE_KEYWORDS.some(k => titleLower.includes(k.toLowerCase()))) {
                passed = false;
                reason = "Ignored/Noise";
            } else if (PRIORITY_KEYWORDS.some(k => titleLower.includes(k.toLowerCase()))) {
                passed = true;
                reason = "Priority Keyword";
            } else if (titleLower.includes("disclosure of interest") && topSymbols.includes(symbol)) {
                passed = true;
                reason = "Top 100 Insider";
            }

            if (!passed) return; // Skip if filtered

            passedCount++;

            const attachments: string[] = [];
            $(cols[5]).find('a[href$=".pdf"]').each((_, el) => {
                const href = $(el).attr('href');
                if (href) attachments.push(BASE_URL + href);
            });
            const imgData = $(cols[5]).find('a[data-images]').attr('data-images');
            if (imgData) {
                attachments.push(`${BASE_URL}/download/document/${imgData}`);
            }

            const uniqueId = `${symbol}-${date}-${time}-${title}`;

            announcements.push({
                uniqueId,
                symbol,
                company,
                date,
                time,
                title,
                attachments
            });
        });

        const dir = path.dirname(OUTPUT_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(announcements, null, 2));
        console.log(`Saved ${passedCount} filtered announcements to ${OUTPUT_FILE}`);

    } catch (error: any) {
        console.error("Scrape Error:", error.message);
    }
}

scrapeAnnouncements();
