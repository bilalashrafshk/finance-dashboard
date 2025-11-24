/**
 * Test script to check if economic data API endpoints work correctly
 */

const API_KEY = process.env.SBP_API_KEY || 'EE4D300822A1DA67800823DAADBA299D2962FE07'

const SERIES_TO_TEST = [
  {
    name: 'CPI National',
    key: 'TS_GP_PT_CPI_M.P00011516',
  },
  {
    name: 'Real GDP Growth Rate',
    key: 'TS_GP_RLS_PAKGDP15_Y.GDP00160000',
  },
  {
    name: 'Average PKR per USD',
    key: 'TS_GP_ER_FAERPKR_M.E00220',
  },
  {
    name: 'Workers Remittances',
    key: 'TS_GP_BOP_WR_M.WR0340',
  },
  {
    name: '6-Months KIBOR',
    key: 'TS_GP_BAM_SIRKIBOR_D.KIBOR0030',
  },
  {
    name: 'SBP Gross Reserves',
    key: 'TS_GP_BOP_BPM6SUM_M.P00730',
  },
  {
    name: 'Net FDI',
    key: 'TS_GP_FI_SUMFIPK_M.FI00030',
  },
  {
    name: 'Broad Money M2',
    key: 'TS_GP_BAM_M2_W.M000070',
  },
  {
    name: 'Total Deposits',
    key: 'TS_GP_BAM_M2_W.M000030',
  },
  {
    name: 'Vehicle Sales',
    key: 'TS_GP_RLS_PSAUTO_M.TAS_001000',
  },
  {
    name: 'Cement Sales',
    key: 'TS_GP_RLS_CEMSEC_M.C_001000',
  },
  {
    name: 'Electricity Generation',
    key: 'TS_GP_RLS_ELECGEN_M.E_001000',
  },
  {
    name: 'POL Sales',
    key: 'TS_GP_RLS_POLSALE_M.P_001000',
  },
]

async function testSeries(seriesName: string, seriesKey: string) {
  console.log(`\n=== Testing ${seriesName} ===`)
  console.log(`Series Key: ${seriesKey}`)
  
  // Test direct SBP API
  const sbpUrl = `https://easydata.sbp.org.pk/api/v1/series/${seriesKey}/data?api_key=${API_KEY}&start_date=2024-01-01&format=json`
  
  try {
    const response = await fetch(sbpUrl)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ SBP API Error (${response.status}):`, errorText.substring(0, 200))
      return
    }
    
    const data = await response.json()
    console.log(`✅ SBP API: ${data.rows?.length || 0} rows returned`)
    
    if (data.rows && data.rows.length > 0) {
      const firstRow = data.rows[0]
      const columnMap: Record<string, any> = {}
      data.columns.forEach((col: string, idx: number) => {
        columnMap[col] = firstRow[idx]
      })
      console.log(`   Latest value: ${columnMap['Observation Value']} ${columnMap['Unit']} on ${columnMap['Observation Date']}`)
    }
  } catch (error: any) {
    console.error(`❌ Error testing ${seriesName}:`, error.message)
  }
}

async function runTests() {
  console.log('Testing SBP Economic Data API Endpoints\n')
  console.log('='.repeat(60))
  
  for (const series of SERIES_TO_TEST) {
    await testSeries(series.name, series.key)
    await new Promise(resolve => setTimeout(resolve, 500)) // Rate limiting
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('Tests completed')
}

runTests().catch(console.error)

