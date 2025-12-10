
const BASE_URL = 'https://www.scstrade.com/FIPILIPI.aspx';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Content-Type': 'application/json; charset=UTF-8',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Origin': 'https://www.scstrade.com',
    'Referer': 'https://www.scstrade.com/FIPILIPI.aspx'
};

async function fetchFromSCSTrade(path, payload) {
    try {
        console.log(`Payload dates: ${payload.date1} to ${payload.date2}`);
        const response = await fetch(`${BASE_URL}/${path}`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error(`Error: ${response.status} ${response.statusText}`);
            return [];
        }

        const data = await response.json();
        const result = data.d ? (typeof data.d === 'string' ? JSON.parse(data.d) : data.d) : data;
        return result || [];
    } catch (e) {
        console.error('Fetch failed:', e);
        return [];
    }
}

async function verifyRange(start, end) {
    console.log(`\n--- Verifying Range ${start} to ${end} ---`);
    const payload = {
        date1: start,
        date2: end,
        _search: false,
        nd: Date.now(),
        rows: 1000,
        page: 1,
        sidx: "FLSectorName asc, FLTypeNew",
        sord: "desc"
    };

    const items = await fetchFromSCSTrade('loadfipisector', payload);

    const totals = {};
    let count = 0;

    items.forEach(item => {
        const client = item.FLTypeNew;
        if (!totals[client]) {
            totals[client] = { buy: 0, sell: 0, net: 0, records: 0 };
        }
        totals[client].buy += parseFloat(item.FLBuyValue) || 0;
        totals[client].sell += parseFloat(item.FLSellValue) || 0;
        totals[client].net += (parseFloat(item.FLBuyValue) || 0) + (parseFloat(item.FLSellValue) || 0);
        totals[client].records++;
        count++;
    });

    console.log(`Total Records: ${count}`);
    // If it's an aggregate, we expect similar number of records as a single day (records ~= sectors * clients).
    // If it's daily breakdown, records would be much higher.

    console.log("Client | Net");
    Object.keys(totals).sort().forEach(k => {
        const t = totals[k];
        console.log(`${k} | ${t.net.toFixed(2)} (${t.records} records)`);
    });
}

// 1. Fetch single day (Dec 8)
// 2. Fetch single day (Dec 5 - assuming 6,7 are weekend?)
// 3. Fetch Range (Dec 5 to Dec 8) and see if it equals Sum(Dec 5 + Dec 8)
// Dec 8 is Monday. Dec 5 is Friday.
// Let's try Dec 4 (Thursday) and Dec 5 (Friday) to be safe.

async function run() {
    console.log("Fetching Day 1 (12/04/2025)...");
    await verifyRange('12/04/2025', '12/04/2025');

    console.log("\nFetching Day 2 (12/05/2025)...");
    await verifyRange('12/05/2025', '12/05/2025');

    console.log("\nFetching Range (12/04/2025 - 12/05/2025)...");
    await verifyRange('12/04/2025', '12/05/2025');
}

run();
