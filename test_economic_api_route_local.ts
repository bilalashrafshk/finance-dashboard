/**
 * Test the economic-data API route locally
 */

async function testEconomicDataRoute() {
  try {
    console.log('🔍 Testing /api/sbp/economic-data route...\n')
    
    // Test with CPI series
    const url = `http://localhost:3000/api/sbp/economic-data?seriesKey=TS_GP_PT_CPI_M.P00011516`
    
    console.log('📡 Fetching from:', url)
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })
    
    const responseText = await response.text()
    
    console.log('📊 Status:', response.status)
    console.log('📊 Status Text:', response.statusText)
    
    if (!response.ok) {
      console.error('❌ Error Response:')
      try {
        const errorData = JSON.parse(responseText)
        console.error(JSON.stringify(errorData, null, 2))
      } catch {
        console.error(responseText)
      }
      return
    }
    
    const data = JSON.parse(responseText)
    
    console.log('✅ Success!')
    console.log('📊 Series Key:', data.seriesKey)
    console.log('📊 Series Name:', data.seriesName)
    console.log('📊 Data Count:', data.count)
    console.log('📊 Source:', data.source)
    console.log('📊 Cached:', data.cached)
    console.log('\n📈 First 3 data points:')
    data.data.slice(0, 3).forEach((point: any, i: number) => {
      console.log(`  ${i + 1}. ${point.date}: ${point.value} ${point.unit}`)
    })
    
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  }
}

// Wait a bit for server to be ready
setTimeout(() => {
  testEconomicDataRoute()
}, 2000)

