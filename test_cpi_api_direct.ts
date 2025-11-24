/**
 * Test CPI API endpoint directly to check response format
 */

const API_KEY = process.env.SBP_API_KEY || 'EE4D300822A1DA67800823DAADBA299D2962FE07'
const SERIES_KEY = 'TS_GP_PT_CPI_M.P00011516'

async function testCPIAPI() {
  try {
    console.log('🔍 Testing CPI API endpoint directly...\n')
    
    const url = `https://easydata.sbp.org.pk/api/v1/series/${SERIES_KEY}/data?api_key=${API_KEY}&start_date=2024-01-01&format=json`
    
    console.log('📡 Fetching from:', url.replace(API_KEY, '***'))
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ API Error:', response.status)
      console.error('Response:', errorText.substring(0, 500))
      return
    }
    
    const data = await response.json()
    
    console.log('✅ Response received!\n')
    console.log('📊 Columns:', data.columns)
    console.log('\n📈 First row:', data.rows?.[0])
    console.log('\n📊 Total rows:', data.rows?.length || 0)
    
    // Test column finding logic
    console.log('\n🔍 Testing column index finding:')
    const dateColIdx = data.columns.findIndex((col: string) => 
      col.toLowerCase().includes('date') || col.toLowerCase().includes('observation date')
    )
    const valueColIdx = data.columns.findIndex((col: string) => 
      col.toLowerCase().includes('value') || col.toLowerCase().includes('observation value')
    )
    const seriesNameColIdx = data.columns.findIndex((col: string) => 
      col.toLowerCase().includes('series name')
    )
    const unitColIdx = data.columns.findIndex((col: string) => 
      col.toLowerCase().includes('unit')
    )
    const statusColIdx = data.columns.findIndex((col: string) => 
      col.toLowerCase().includes('status') && !col.toLowerCase().includes('comment')
    )
    const commentsColIdx = data.columns.findIndex((col: string) => 
      col.toLowerCase().includes('comment')
    )
    
    console.log('  dateColIdx:', dateColIdx, data.columns[dateColIdx])
    console.log('  valueColIdx:', valueColIdx, data.columns[valueColIdx])
    console.log('  seriesNameColIdx:', seriesNameColIdx, data.columns[seriesNameColIdx])
    console.log('  unitColIdx:', unitColIdx, data.columns[unitColIdx])
    console.log('  statusColIdx:', statusColIdx, data.columns[statusColIdx])
    console.log('  commentsColIdx:', commentsColIdx, data.columns[commentsColIdx])
    
    if (data.rows && data.rows.length > 0) {
      const firstRow = data.rows[0]
      console.log('\n📋 Parsed first row:')
      console.log('  date:', firstRow[dateColIdx])
      console.log('  value:', firstRow[valueColIdx])
      console.log('  series_name:', firstRow[seriesNameColIdx])
      console.log('  unit:', firstRow[unitColIdx])
      console.log('  status:', firstRow[statusColIdx])
      console.log('  comments:', firstRow[commentsColIdx])
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  }
}

testCPIAPI()

