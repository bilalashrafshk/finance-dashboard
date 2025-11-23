/**
 * Test script for scstrade.com API
 * Tests the historical prices endpoint to understand response format
 */

const testScstradeAPI = async () => {
  try {
    // Test with multiple tickers
    const testCases = [
      { ticker: 'HBL', companyName: 'HBL - Habib Bank Ltd.' },
      { ticker: 'PTC', companyName: 'PTC - Pakistan Telecommunication Company Ltd.' },
      { ticker: 'OGDC', companyName: 'OGDC - Oil & Gas Development Company Ltd.' },
    ]
    
    for (const testCase of testCases) {
      console.log(`\n\n=== Testing ${testCase.ticker} ===`)
      
      // Date range: Last 30 days
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 30)
      
      const date1 = `${String(startDate.getMonth() + 1).padStart(2, '0')}/${String(startDate.getDate()).padStart(2, '0')}/${startDate.getFullYear()}`
      const date2 = `${String(endDate.getMonth() + 1).padStart(2, '0')}/${String(endDate.getDate()).padStart(2, '0')}/${endDate.getFullYear()}`
      
      const url = 'https://scstrade.com/MarketStatistics/MS_HistoricalPrices.aspx/chart'
      
      const requestBody = {
        par: testCase.companyName,
        date1: date1,
        date2: date2,
        _search: false,
        nd: Date.now(),
        page: 1,
        rows: 100, // Get more records
        sidx: 'trading_Date',
        sord: 'desc'
      }
      
      console.log('Request Body:', JSON.stringify(requestBody, null, 2))
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Referer': 'https://scstrade.com/MarketStatistics/MS_HistoricalPrices.aspx',
          'Origin': 'https://scstrade.com',
        },
        body: JSON.stringify(requestBody)
      })
      
      if (!response.ok) {
        console.error(`Error: ${response.status} ${response.statusText}`)
        continue
      }
      
      const data = await response.json()
      
      if (data.d && Array.isArray(data.d) && data.d.length > 0) {
        console.log(`✅ Success! Received ${data.d.length} records`)
        
        // Parse first and last records
        const firstRecord = data.d[0]
        const lastRecord = data.d[data.d.length - 1]
        
        // Parse date
        const parseDate = (dateStr) => {
          const match = dateStr.match(/\/Date\((\d+)\)\//)
          if (match) {
            const timestamp = parseInt(match[1])
            return new Date(timestamp).toISOString().split('T')[0]
          }
          return null
        }
        
        console.log('\nFirst record (most recent):')
        console.log('  Date:', parseDate(firstRecord.trading_Date))
        console.log('  Open:', firstRecord.trading_open)
        console.log('  High:', firstRecord.trading_high)
        console.log('  Low:', firstRecord.trading_low)
        console.log('  Close:', firstRecord.trading_close)
        console.log('  Volume:', firstRecord.trading_vol)
        console.log('  Change:', firstRecord.trading_change)
        
        console.log('\nLast record (oldest):')
        console.log('  Date:', parseDate(lastRecord.trading_Date))
        console.log('  Close:', lastRecord.trading_close)
        console.log('  Volume:', lastRecord.trading_vol)
        
        // Test mapping to our database format
        console.log('\n=== Mapped to Database Format ===')
        const mappedRecord = {
          date: parseDate(firstRecord.trading_Date),
          open: firstRecord.trading_open,
          high: firstRecord.trading_high,
          low: firstRecord.trading_low,
          close: firstRecord.trading_close,
          volume: firstRecord.trading_vol,
          adjusted_close: null,
          change_pct: firstRecord.trading_change
        }
        console.log(JSON.stringify(mappedRecord, null, 2))
      } else {
        console.log('❌ No data received')
        console.log('Response:', JSON.stringify(data, null, 2))
      }
    }
    
    // Test with a longer historical range
    console.log('\n\n=== Testing Long Historical Range (HBL) ===')
    const longStartDate = new Date('2020-01-01')
    const longEndDate = new Date()
    const longDate1 = `${String(longStartDate.getMonth() + 1).padStart(2, '0')}/${String(longStartDate.getDate()).padStart(2, '0')}/${longStartDate.getFullYear()}`
    const longDate2 = `${String(longEndDate.getMonth() + 1).padStart(2, '0')}/${String(longEndDate.getDate()).padStart(2, '0')}/${longEndDate.getFullYear()}`
    
    const longRequestBody = {
      par: 'HBL - Habib Bank Ltd.',
      date1: longDate1,
      date2: longDate2,
      _search: false,
      nd: Date.now(),
      page: 1,
      rows: 2000, // Try to get more records
      sidx: 'trading_Date',
      sord: 'desc'
    }
    
    console.log('Requesting:', longDate1, 'to', longDate2)
    const longResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': 'https://scstrade.com/MarketStatistics/MS_HistoricalPrices.aspx',
        'Origin': 'https://scstrade.com',
      },
      body: JSON.stringify(longRequestBody)
    })
    
    if (longResponse.ok) {
      const longData = await longResponse.json()
      if (longData.d && Array.isArray(longData.d)) {
        console.log(`✅ Received ${longData.d.length} records for long range`)
        if (longData.d.length > 0) {
          const parseDate = (dateStr) => {
            const match = dateStr.match(/\/Date\((\d+)\)\//)
            if (match) {
              const timestamp = parseInt(match[1])
              return new Date(timestamp).toISOString().split('T')[0]
            }
            return null
          }
          console.log('First date:', parseDate(longData.d[0].trading_Date))
          console.log('Last date:', parseDate(longData.d[longData.d.length - 1].trading_Date))
        }
      }
    }
    
  } catch (error) {
    console.error('Error testing scstrade API:', error)
  }
}

// Run the test
testScstradeAPI()
