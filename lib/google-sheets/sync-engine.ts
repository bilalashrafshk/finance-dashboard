import { getPostgresClient } from '../db'
import {
  DEFAULT_SPREADSHEET_ID,
  ensureSheetTabs,
  batchClearSheetValues,
  batchUpdateSheetValues,
  applyTabFormatting,
  ValueRangePayload,
} from './sheets-client'
import {
  extractPSXScreener,
  extractFinancialFundamentals,
  extractInstitutionalFlows,
  extractMacroSBPData,
  extractGlobalAssets,
  extractNotableEvents,
  extractMarketCycles,
  extractKSE100Daily,
  extractSyncOverview,
  TabExtractionResult,
} from './data-extractors'

export interface SyncOptions {
  spreadsheetId?: string
  includeFormatting?: boolean
}

export interface SyncSummary {
  success: boolean
  spreadsheetId: string
  durationMs: number
  tabsUpdated: { name: string; rowCount: number; columnCount: number }[]
  totalRowsSynced: number
  error?: string
}

/**
 * Execute Full Master Data Sync to Google Sheets
 */
export async function syncAllDataToGoogleSheets(
  options: SyncOptions = {}
): Promise<SyncSummary> {
  const startTime = Date.now()
  const spreadsheetId = options.spreadsheetId || DEFAULT_SPREADSHEET_ID
  const includeFormatting = options.includeFormatting !== false

  console.log(`[Google Sheets Sync] Starting master sync to spreadsheet: ${spreadsheetId}...`)

  let client
  try {
    client = await getPostgresClient()

    // 1. Extract all core datasets in parallel
    console.time('[Google Sheets Sync] DB Extraction Time')
    const [
      psxResult,
      finResult,
      kse100Result,
      flowsResult,
      macroResult,
      globalResult,
      eventsResult,
      cyclesResult,
    ] = await Promise.all([
      extractPSXScreener(client),
      extractFinancialFundamentals(client),
      extractKSE100Daily(client),
      extractInstitutionalFlows(client),
      extractMacroSBPData(client),
      extractGlobalAssets(client),
      extractNotableEvents(client),
      extractMarketCycles(client),
    ])

    // 2. Generate Executive Overview & KPI Tab
    const overviewResult = await extractSyncOverview(client, psxResult, finResult)
    console.timeEnd('[Google Sheets Sync] DB Extraction Time')

    const allTabs: TabExtractionResult[] = [
      overviewResult,
      psxResult,
      kse100Result,
      finResult,
      flowsResult,
      macroResult,
      globalResult,
      eventsResult,
      cyclesResult,
    ]

    const tabNames = allTabs.map((t) => t.tabName)

    // 3. Ensure all sheet tabs exist in Google Sheets
    console.log(`[Google Sheets Sync] Ensuring ${tabNames.length} tabs exist in Google Sheets...`)
    const sheetIdMap = await ensureSheetTabs(spreadsheetId, tabNames)

    // 4. Prepare batch update payload
    const batchValues: ValueRangePayload[] = []
    const clearRanges: string[] = []
    const tabMeta: { name: string; columnCount: number; rowCount: number }[] = []

    for (const tab of allTabs) {
      const fullGrid = [tab.headers, ...tab.rows]
      batchValues.push({
        range: `'${tab.tabName}'!A1`,
        values: fullGrid,
      })
      clearRanges.push(`'${tab.tabName}'!A1:ZZ5000`)
      tabMeta.push({
        name: tab.tabName,
        columnCount: tab.headers.length,
        rowCount: fullGrid.length,
      })
    }

    // 5. Clear old data ranges
    console.log('[Google Sheets Sync] Clearing previous grid data...')
    try {
      await batchClearSheetValues(spreadsheetId, clearRanges)
    } catch (e: any) {
      console.warn('[Google Sheets Sync] Clear warning (first run or empty):', e.message)
    }

    // 6. Push all tab data in 1 single high-throughput HTTP batchUpdate call
    console.log('[Google Sheets Sync] Pushing all tabs data in 1 batchUpdate request...')
    await batchUpdateSheetValues(spreadsheetId, batchValues)

    // 7. Apply visual formatting (Navy header, bold text, frozen row, auto-filter)
    if (includeFormatting) {
      console.log('[Google Sheets Sync] Applying visual styling and auto-filters...')
      try {
        await applyTabFormatting(spreadsheetId, sheetIdMap, tabMeta)
      } catch (err: any) {
        console.warn('[Google Sheets Sync] Formatting non-fatal error:', err.message)
      }
    }

    const durationMs = Date.now() - startTime
    const totalRowsSynced = tabMeta.reduce((sum, t) => sum + t.rowCount, 0)

    console.log(`[Google Sheets Sync] SUCCESS! Synced ${totalRowsSynced} total rows across ${allTabs.length} tabs in ${(durationMs / 1000).toFixed(2)}s.`)

    return {
      success: true,
      spreadsheetId,
      durationMs,
      tabsUpdated: tabMeta,
      totalRowsSynced,
    }
  } catch (error: any) {
    console.error('[Google Sheets Sync] FAILED:', error.message)
    return {
      success: false,
      spreadsheetId,
      durationMs: Date.now() - startTime,
      tabsUpdated: [],
      totalRowsSynced: 0,
      error: error.message,
    }
  } finally {
    if (client) {
      client.release()
    }
  }
}
