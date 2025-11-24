/**
 * Test script to check output format of industrial SBP EasyData API series
 */

const API_KEY = process.env.SBP_API_KEY || 'EE4D300822A1DA67800823DAADBA299D2962FE07'

const SERIES_TO_TEST = [
  {
    name: 'Total Sales of Vehicles',
    key: 'TS_GP_RLS_PSAUTO_M.TAS_001000',
    startDate: '2020-01-01',
  },
  {
    name: 'Total Cement Sales',
    key: 'TS_GP_RLS_CEMSEC_M.C_001000',
    startDate: '2020-01-01',
  },
  {
    name: 'Total Electricity Generation',
    key: 'TS_GP_RLS_ELECGEN_M.E_001000',
    startDate: '2020-01-01',
  },
  {
    name: 'Overall POL Sales',
    key: 'TS_GP_RLS_POLSALE_M.P_001000',
    startDate: '2020-01-01',
  },
]

async function testSeries(seriesName: string, seriesKey: string, startDate: string) {
  console.log(`\n=== Testing ${seriesName} ===`)
  console.log(`Series Key: ${seriesKey}`)
  
  const url = `https://easydata.sbp.org.pk/api/v1/series/${seriesKey}/data?api_key=${API_KEY}&start_date=${startDate}&format=json`
  
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
  console.log('Testing Industrial SBP EasyData API Series Output Formats\n')
  console.log('='.repeat(60))
  
  for (const series of SERIES_TO_TEST) {
    await testSeries(series.name, series.key, series.startDate)
    await new Promise(resolve => setTimeout(resolve, 1000)) // Rate limiting
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('Tests completed')
}

runTests().catch(console.error)

