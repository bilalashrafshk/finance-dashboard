/**
 * Test the economic data API route directly
 */

const API_KEY = process.env.SBP_API_KEY || 'EE4D300822A1DA67800823DAADBA299D2962FE07'

// Test a few series to see what happens
const testSeries = [
  'TS_GP_PT_CPI_M.P00011516', // CPI
  'TS_GP_RLS_PAKGDP15_Y.GDP00160000', // GDP
]

async function testAPI(seriesKey: string) {
  console.log(`\n=== Testing ${seriesKey} ===`)
  
  // Test direct SBP API first
  const sbpUrl = `https://easydata.sbp.org.pk/api/v1/series/${seriesKey}/data?api_key=${API_KEY}&start_date=2024-01-01&format=json`
  
  try {
    const response = await fetch(sbpUrl)
    if (!response.ok) {
      console.error(`❌ SBP API Error: ${response.status}`)
      return
    }
    const data = await response.json()
    console.log(`✅ SBP API works: ${data.rows?.length || 0} rows`)
    
    // Check the data structure
    if (data.rows && data.rows.length > 0) {
      const firstRow = data.rows[0]
      console.log('First row structure:', firstRow)
      console.log('Columns:', data.columns)
      
      // Check column indices
      const dateColIdx = data.columns.findIndex((col: string) => 
        col.toLowerCase().includes('date') || col.toLowerCase().includes('observation date')
      )
      const valueColIdx = data.columns.findIndex((col: string) => 
        col.toLowerCase().includes('value') || col.toLowerCase().includes('observation value')
      )
      console.log(`Date column index: ${dateColIdx}, Value column index: ${valueColIdx}`)
    }
  } catch (error: any) {
    console.error(`❌ Error:`, error.message)
  }
}

async function runTests() {
  console.log('Testing Economic Data API Route Logic\n')
  console.log('='.repeat(60))
  
  for (const series of testSeries) {
    await testAPI(series)
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('Tests completed')
}

runTests().catch(console.error)

