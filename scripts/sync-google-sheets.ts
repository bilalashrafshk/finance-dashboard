import dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env.local or .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

import { syncAllDataToGoogleSheets } from '../lib/google-sheets/sync-engine'

async function main() {
  console.log('====================================================')
  console.log('  CONVICTIONPAYS -> GOOGLE SHEETS FULL DATA SYNC    ')
  console.log('====================================================\n')

  const spreadsheetId = process.argv[2] || process.env.GOOGLE_SPREADSHEET_ID

  const result = await syncAllDataToGoogleSheets({
    spreadsheetId,
    includeFormatting: true,
  })

  if (result.success) {
    console.log('\n📊 SYNC RESULTS BREAKDOWN:')
    console.table(
      result.tabsUpdated.map((t) => ({
        'Tab Name': t.name,
        'Rows Synced': t.rowCount,
        'Columns': t.columnCount,
      }))
    )
    console.log(`\n✅ Total Execution Time: ${(result.durationMs / 1000).toFixed(2)} seconds`)
    console.log(`🔗 Spreadsheet URL: https://docs.google.com/spreadsheets/d/${result.spreadsheetId}/edit`)
    process.exit(0)
  } else {
    console.error('\n❌ Sync encountered an error:', result.error)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal error running sync:', err)
  process.exit(1)
})
