
async function testFetch() {
    const ticker = 'LUCK'
    // Try different variations of company name
    // Based on `pk-equity-api.ts`, it seems the expected format is "TICKER - Company Name"
    const variations = [
        'LUCK - LUCKY CEMENT LIMITED',
        'LUCK - Lucky Cement Limited',
        'LUCK',
        'Lucky Cement Limited',
        'LUCK - Lucky Cement'
    ]

    console.log('Starting SCSTrade fetch test for LUCK...')

    for (const name of variations) {
        console.log(`\nTesting with name: "${name}"...`)
        try {
            const url = 'https://scstrade.com/MarketStatistics/MS_HistoricalPrices.aspx/chart'
            const endDate = new Date()
            const startDate = new Date()
            startDate.setFullYear(startDate.getFullYear() - 5) // 5 years

            const formatDate = (d: Date) => {
                const mm = String(d.getMonth() + 1).padStart(2, '0')
                const dd = String(d.getDate()).padStart(2, '0')
                const yyyy = d.getFullYear()
                return `${mm}/${dd}/${yyyy}`
            }

            const body = {
                par: name,
                date1: formatDate(startDate),
                date2: formatDate(endDate),
                _search: false,
                nd: Date.now(),
                page: 1,
                rows: 2000,
                sidx: 'trading_Date',
                sord: 'desc'
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Origin': 'https://scstrade.com',
                    'Referer': 'https://scstrade.com/MarketStatistics/MS_HistoricalPrices.aspx'
                },
                body: JSON.stringify(body)
            })

            if (!response.ok) {
                console.log(`Failed with status: ${response.status} ${response.statusText}`)
                continue
            }

            const data = await response.json()
            if (data.d && Array.isArray(data.d) && data.d.length > 0) {
                console.log('SUCCESS! Data found:')
                console.log(`Total records: ${data.d.length}`)
                const first = data.d[0]
                const last = data.d[data.d.length - 1]
                console.log('Most recent record:', first.trading_Date)
                console.log('Oldest record:', last.trading_Date)

                // Allow checking other name variations
            } else {
                console.log('Response OK but no data found (data.d is empty or invalid).')
                // console.log('Response:', JSON.stringify(data).substring(0, 200))
            }

        } catch (e) {
            console.error('Error:', e)
        }
    }
}

testFetch()
