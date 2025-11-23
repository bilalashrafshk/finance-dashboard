/**
 * Test script for Advance-Decline and KSE100 endpoints
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.PORT ? `http://localhost:${process.env.PORT}` : 'http://localhost:3002'

async function testEndpoint(name, url) {
  console.log(`\n=== Testing ${name} ===`)
  console.log(`URL: ${url}\n`)
  
  try {
    const response = await fetch(url)
    const data = await response.json()
    
    console.log(`Status: ${response.status}`)
    
    if (response.ok) {
      if (data.success) {
        console.log(`✅ Success: ${data.count || data.data?.length || 0} data points`)
        if (data.data && data.data.length > 0) {
          console.log(`First point:`, JSON.stringify(data.data[0], null, 2))
          console.log(`Last point:`, JSON.stringify(data.data[data.data.length - 1], null, 2))
        }
      } else {
        console.log(`❌ Error: ${data.error}`)
      }
    } else {
      console.log(`❌ Failed: ${data.error || 'Unknown error'}`)
    }
    
    return { success: response.ok, data }
  } catch (error) {
    console.log(`❌ Exception: ${error.message}`)
    return { success: false, error: error.message }
  }
}

async function main() {
  console.log('🚀 Testing Advance-Decline and KSE100 Endpoints\n')
  console.log(`Base URL: ${BASE_URL}\n`)
  
  // Test 1: Advance-Decline endpoint
  const startDate = '2024-01-01'
  const endDate = '2024-12-31'
  const adResult = await testEndpoint(
    'Advance-Decline',
    `${BASE_URL}/api/advance-decline?startDate=${startDate}&endDate=${endDate}&limit=100`
  )
  
  // Test 2: KSE100 historical data
  const kse100Result = await testEndpoint(
    'KSE100 Historical Data',
    `${BASE_URL}/api/historical-data?assetType=kse100&symbol=KSE100&startDate=${startDate}&endDate=${endDate}`
  )
  
  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 Test Summary')
  console.log('='.repeat(60))
  console.log(`Advance-Decline: ${adResult.success ? '✅ PASS' : '❌ FAIL'}`)
  console.log(`KSE100 Data: ${kse100Result.success ? '✅ PASS' : '❌ FAIL'}`)
  
  if (adResult.success && kse100Result.success) {
    console.log('\n✅ All tests passed!')
    process.exit(0)
  } else {
    console.log('\n❌ Some tests failed')
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})

