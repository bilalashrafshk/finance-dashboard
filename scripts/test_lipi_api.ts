
import fetch from 'node-fetch';

const BASE_URL = 'https://www.scstrade.com/FIPILIPI.aspx';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Content-Type': 'application/json; charset=UTF-8',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Origin': 'https://www.scstrade.com',
    'Referer': 'https://www.scstrade.com/FIPILIPI.aspx'
};

async function fetchFromSCSTrade(path: string, payload: any) {
    const response = await fetch(`${BASE_URL}/${path}`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`SCSTrade API Error: ${response.status}`);
    }

    const data = await response.json();
    if (data.d) {
        if (typeof data.d === 'string') {
            return JSON.parse(data.d);
        }
        return data.d;
    }
    return data;
}

async function run() {
    const date1 = '12/04/2024';
    const date2 = '12/05/2024';

    console.log(`Fetching range ${date1} to ${date2}...`);

    const payload = {
        date1: date1,
        date2: date2,
        _search: false,
        nd: Date.now(),
        rows: 1000,
        page: 1,
        sidx: "FLSectorName asc, FLTypeNew",
        sord: "desc"
    };

    try {
        const data = await fetchFromSCSTrade('loadfipisector', payload);
        console.log('Response length:', Array.isArray(data) ? data.length : 'Not array');
        if (Array.isArray(data) && data.length > 0) {
            console.log('Sample item:', data[0]);
        }

        // Fetch individual days to compare
        console.log('\nFetching individual days for comparison...');
        const payload1 = { ...payload, date2: date1 };
        const data1 = await fetchFromSCSTrade('loadfipisector', payload1);

        const payload2 = { ...payload, date1: date2 };
        const data2 = await fetchFromSCSTrade('loadfipisector', payload2);

        console.log(`Day 1 records: ${data1.length}`);
        console.log(`Day 2 records: ${data2.length}`);

        // Check if range is just a sum or union?
        // Let's look for a specific sector/client combo
        const checkItem = (arr: any[], sector: string, type: string) =>
            arr.find((x: any) => x.FLSectorName === sector && x.FLTypeNew === type);

        if (data1.length > 0) {
            const sample = data1[0];
            const sector = sample.FLSectorName;
            const type = sample.FLTypeNew;

            const v1 = checkItem(data1, sector, type);
            const v2 = checkItem(data2, sector, type);
            const vRange = checkItem(data, sector, type);

            console.log(`\nComparison for ${sector} - ${type}:`);
            console.log(`Day 1 Buy: ${v1?.FLBuyValue}`);
            console.log(`Day 2 Buy: ${v2?.FLBuyValue}`);

            const sum = (parseFloat(v1?.FLBuyValue || '0') + parseFloat(v2?.FLBuyValue || '0'));
            console.log(`Sum: ${sum}`);
            console.log(`Range Buy: ${vRange?.FLBuyValue}`);

            if (Math.abs(sum - parseFloat(vRange?.FLBuyValue || '0')) < 0.01) {
                console.log('CONCLUSION: API returns AGGREGATED result for the range.');
            } else {
                console.log('CONCLUSION: API returns something else (maybe distinct records?).');
            }
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

run();
