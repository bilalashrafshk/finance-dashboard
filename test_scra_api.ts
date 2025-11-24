/**
 * Test script to check output format of SCRA SBP EasyData API series
 */

const API_KEY = process.env.SBP_API_KEY || 'EE4D300822A1DA67800823DAADBA299D2962FE07'

const SERIES_TO_TEST = [
  {
    name: 'Opening Balance SCRA',
    key: 'TS_GP_BOP_SCRA_W.P00010',
  },
  {
    name: 'Inflow: Inward Remittances',
    key: 'TS_GP_BOP_SCRA_W.P00020',
  },
  {
    name: 'Closing Balance SCRA',
    key: 'TS_GP_BOP_SCRA_W.P00080',
  },
  {
    name: 'Opening Market Value of Equity',
    key: 'TS_GP_BOP_SCRA_W.P00100',
  },
  {
    name: 'Closing Market Value of Equity',
    key: 'TS_GP_BOP_SCRA_W.P00130',
  },
]

async function testSeries(seriesName: string, seriesKey: string) {
  console.log(`\n=== Testing ${seriesName} ===`)
  console.log(`Series Key: ${seriesKey}`)
  
  const url = `https://easydata.sbp.org.pk/api/v1/series/${seriesKey}/data?api_key=${API_KEY}&start_date=2024-01-01&format=json`
  
  try {
    const response = await fetch(url)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Error (${response.status}):`, errorText.substring(0, 200))
      return
    }
    
    const data = await response.json()
    
    console.log('Columns:', data.columns)
    console.log('Number of rows:', data.rows?.length || 0)
    
    if (data.rows && data.rows.length > 0) {
      console.log('\nFirst row:', data.rows[0])
      console.log('Last row:', data.rows[data.rows.length - 1])
      
      // Map columns to values for first row
      const firstRow = data.rows[0]
      const columnMap: Record<string, any> = {}
      data.columns.forEach((col: string, idx: number) => {
        columnMap[col] = firstRow[idx]
      })
      console.log('\nFirst row mapped:')
      console.log(JSON.stringify(columnMap, null, 2))
    }
  } catch (error: any) {
    console.error(`Error testing ${seriesName}:`, error.message)
  }
}

async function runTests() {
  console.log('Testing SCRA SBP EasyData API Series Output Formats\n')
  console.log('='.repeat(60))
  
  for (const series of SERIES_TO_TEST) {
    await testSeries(series.name, series.key)
    await new Promise(resolve => setTimeout(resolve, 1000)) // Rate limiting
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('Tests completed')
}

runTests().catch(console.error)

