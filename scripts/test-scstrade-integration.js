/**
 * Test SCSTrade API integration
 * Tests the actual API client functions
 */

async function testSCSTradeIntegration() {
  try {
    console.log('Testing SCSTrade API Integration...\n')
    
    // Import the API client (using dynamic import for ES modules)
    const { fetchSCSTradeData, getLatestPriceFromSCSTrade } = await import('../lib/portfolio/scstrade-api.ts')
    
    // Test 1: Get latest price for HBL
    console.log('=== Test 1: Get Latest Price (HBL) ===')
    const latestPrice = await getLatestPriceFromSCSTrade('HBL')
    if (latestPrice) {
      console.log('✅ Success!')
      console.log('  Price:', latestPrice.price)
      console.log('  Date:', latestPrice.date)
    } else {
      console.log('❌ Failed to get latest price')
    }
    
    // Test 2: Fetch historical data (last 30 days)
    console.log('\n=== Test 2: Fetch Historical Data (HBL, last 30 days) ===')
    const endDate = new Date().toISOString().split('T')[0]
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)
    const startDateStr = startDate.toISOString().split('T')[0]
    
    const historicalData = await fetchSCSTradeData('HBL', startDateStr, endDate)
    if (historicalData && historicalData.length > 0) {
      console.log(`✅ Success! Fetched ${historicalData.length} records`)
      console.log('  First record:', historicalData[0])
      console.log('  Last record:', historicalData[historicalData.length - 1])
      console.log('  Sample with volume:', historicalData.find(r => r.volume !== null) || 'No volume data')
    } else {
      console.log('❌ Failed to fetch historical data')
    }
    
    // Test 3: Test with different ticker (PTC)
    console.log('\n=== Test 3: Test Different Ticker (PTC) ===')
    const ptcData = await fetchSCSTradeData('PTC', startDateStr, endDate)
    if (ptcData && ptcData.length > 0) {
      console.log(`✅ Success! Fetched ${ptcData.length} records for PTC`)
      console.log('  Latest close:', ptcData[ptcData.length - 1].close)
      console.log('  Latest volume:', ptcData[ptcData.length - 1].volume)
    } else {
      console.log('❌ Failed to fetch PTC data')
    }
    
    // Test 4: Test with longer historical range
    console.log('\n=== Test 4: Test Longer Historical Range (HBL, 1 year) ===')
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0]
    
    const longRangeData = await fetchSCSTradeData('HBL', oneYearAgoStr, endDate)
    if (longRangeData && longRangeData.length > 0) {
      console.log(`✅ Success! Fetched ${longRangeData.length} records for 1 year`)
      console.log('  Date range:', longRangeData[0].date, 'to', longRangeData[longRangeData.length - 1].date)
      console.log('  All records have volume:', longRangeData.every(r => r.volume !== null))
    } else {
      console.log('❌ Failed to fetch long range data')
    }
    
    console.log('\n=== Integration Test Complete ===')
    
  } catch (error) {
    console.error('Error testing SCSTrade integration:', error)
    console.error(error.stack)
  }
}

// Run the test
testSCSTradeIntegration()

