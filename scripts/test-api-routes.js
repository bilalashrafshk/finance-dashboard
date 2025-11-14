/**
 * API Routes Test Script
 * Tests all price API routes to verify behavior before streamlining
 * 
 * Usage: node scripts/test-api-routes.js
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function logTest(name) {
  log(`\n${'='.repeat(60)}`, 'cyan')
  log(`Testing: ${name}`, 'cyan')
  log('='.repeat(60), 'cyan')
}

async function testRoute(name, url, expectedStatus = 200) {
  try {
    const startTime = Date.now()
    const response = await fetch(url)
    const responseTime = Date.now() - startTime
    const data = await response.json()
    
    const statusOk = response.status === expectedStatus
    const statusColor = statusOk ? 'green' : 'red'
    
    log(`  Status: ${response.status} (${responseTime}ms)`, statusColor)
    log(`  URL: ${url}`, 'blue')
    
    if (response.ok) {
      log(`  Response:`, 'green')
      console.log(JSON.stringify(data, null, 2))
      
      // Check for specific response patterns
      if (data.needsClientFetch) {
        log(`  ⚠️  Client-side fetch required`, 'yellow')
        log(`  Instrument ID: ${data.instrumentId}`, 'yellow')
      }
      if (data.source) {
        log(`  Source: ${data.source}`, 'blue')
      }
      if (data.data && Array.isArray(data.data)) {
        log(`  Data points: ${data.data.length}`, 'blue')
      }
    } else {
      log(`  Error: ${data.error || 'Unknown error'}`, 'red')
      if (data.details) {
        log(`  Details: ${data.details}`, 'red')
      }
    }
    
    return { success: statusOk, responseTime, data }
  } catch (error) {
    log(`  ❌ Error: ${error.message}`, 'red')
    return { success: false, error: error.message }
  }
}

async function runTests() {
  log('\n🚀 Starting API Routes Test Suite', 'cyan')
  log(`Base URL: ${BASE_URL}\n`, 'blue')
  
  const results = {
    passed: 0,
    failed: 0,
    total: 0,
  }
  
  // Test 1: Crypto Price (Current)
  logTest('Crypto - Current Price (BTC)')
  const crypto1 = await testRoute('Crypto Current', `${BASE_URL}/api/crypto/price?symbol=BTC`)
  results.total++
  if (crypto1.success) results.passed++
  else results.failed++
  
  // Test 2: PK Equity Price (Current)
  logTest('PK Equity - Current Price (PTC)')
  const pk1 = await testRoute('PK Equity Current', `${BASE_URL}/api/pk-equity/price?ticker=PTC`)
  results.total++
  if (pk1.success) results.passed++
  else results.failed++
  
  // Test 3: US Equity Price (Current)
  logTest('US Equity - Current Price (AAPL)')
  const us1 = await testRoute('US Equity Current', `${BASE_URL}/api/us-equity/price?ticker=AAPL`)
  results.total++
  if (us1.success) results.passed++
  else results.failed++
  
  // Test 4: Metals Price (Current) - May need client fetch
  logTest('Metals - Current Price (GOLD)')
  const metals1 = await testRoute('Metals Current', `${BASE_URL}/api/metals/price?symbol=GOLD`)
  results.total++
  if (metals1.success || metals1.data?.needsClientFetch) results.passed++
  else results.failed++
  
  // Test 5: Crypto with refresh
  logTest('Crypto - With Refresh Flag')
  const crypto2 = await testRoute('Crypto Refresh', `${BASE_URL}/api/crypto/price?symbol=ETH&refresh=true`)
  results.total++
  if (crypto2.success) results.passed++
  else results.failed++
  
  // Test 6: PK Equity with refresh
  logTest('PK Equity - With Refresh Flag')
  const pk2 = await testRoute('PK Equity Refresh', `${BASE_URL}/api/pk-equity/price?ticker=PTC&refresh=true`)
  results.total++
  if (pk2.success) results.passed++
  else results.failed++
  
  // Test 7: Historical Data Route
  logTest('Historical Data - Check Database (Crypto BTC)')
  const hist1 = await testRoute('Historical Data', `${BASE_URL}/api/historical-data?assetType=crypto&symbol=BTC`)
  results.total++
  if (hist1.success) results.passed++
  else results.failed++
  
  // Test 8: Historical Data - PK Equity
  logTest('Historical Data - PK Equity (PTC)')
  const hist2 = await testRoute('Historical Data PK', `${BASE_URL}/api/historical-data?assetType=pk-equity&symbol=PTC`)
  results.total++
  if (hist2.success) results.passed++
  else results.failed++
  
  // Test 9: Historical Data - Metals
  logTest('Historical Data - Metals (GOLD)')
  const hist3 = await testRoute('Historical Data Metals', `${BASE_URL}/api/historical-data?assetType=metals&symbol=GOLD`)
  results.total++
  if (hist3.success) results.passed++
  else results.failed++
  
  // Test 10: Error handling - Missing parameter
  logTest('Error Handling - Missing Symbol')
  const error1 = await testRoute('Error Missing Param', `${BASE_URL}/api/crypto/price`, 400)
  results.total++
  if (error1.success) results.passed++
  else results.failed++
  
  // Summary
  log('\n' + '='.repeat(60), 'cyan')
  log('📊 Test Summary', 'cyan')
  log('='.repeat(60), 'cyan')
  log(`Total Tests: ${results.total}`, 'blue')
  log(`Passed: ${results.passed}`, 'green')
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green')
  log(`Success Rate: ${((results.passed / results.total) * 100).toFixed(1)}%`, 
    results.passed === results.total ? 'green' : 'yellow')
  
  // Notes
  log('\n📝 Notes:', 'cyan')
  log('- Metals/Indices may return needsClientFetch: true (expected)', 'yellow')
  log('- Some routes may fail if database is not set up', 'yellow')
  log('- Server must be running (npm run dev)', 'yellow')
  
  process.exit(results.failed > 0 ? 1 : 0)
}

// Run tests
runTests().catch(error => {
  log(`\n❌ Fatal Error: ${error.message}`, 'red')
  console.error(error)
  process.exit(1)
})

