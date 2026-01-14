import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

// --- CONFIGURATION ---
const API_URL = 'https://dps.psx.com.pk/announcements';
const BASE_URL = 'https://dps.psx.com.pk';
const OUTPUT_FILE = path.join(process.cwd(), 'scripts/data/announcements.json');

async function scrapeAnnouncements() {
    try {
        console.log(`[${new Date().toLocaleTimeString()}] Fetching PSX data...`);

        const payload = new URLSearchParams({
            type: 'C',       // 'C' for Companies
            symbol: '',      // All symbols
            query: '',
            count: '50',     // Last 50 items
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

        rows.each((i, element) => {
            const cols = $(element).find('td');
            if (cols.length === 0) return;

            const date = $(cols[0]).text().trim();
            const time = $(cols[1]).text().trim();
            const symbol = $(cols[2]).text().trim();
            const company = $(cols[3]).text().trim();
            const title = $(cols[4]).text().trim();

            const attachments: string[] = [];

            // PDF links
            $(cols[5]).find('a[href$=".pdf"]').each((_, el) => {
                const href = $(el).attr('href');
                if (href) attachments.push(BASE_URL + href);
            });

            // Scanned images
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

        // Ensure directory exists
        const dir = path.dirname(OUTPUT_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(announcements, null, 2));
        console.log(`Successfully saved ${announcements.length} announcements to ${OUTPUT_FILE}`);

    } catch (error: any) {
        console.error("Scrape Error:", error.message);
    }
}

scrapeAnnouncements();
