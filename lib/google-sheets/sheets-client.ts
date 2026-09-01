import { JWT } from 'google-auth-library'
import axios from 'axios'
import fs from 'fs'
import path from 'path'

export const DEFAULT_SPREADSHEET_ID = '15RsmQnQbCwYzTl6ASxeFSpgzRHBktRSnBiw9TyO3k4w'

interface ServiceAccountCredentials {
  client_email: string
  private_key: string
  project_id?: string
}

/**
 * Get JWT Auth Client from upcoming.json or ENV
 */
export function getGoogleAuthClient(): JWT {
  let credentials: ServiceAccountCredentials | null = null

  // 1. Try GOOGLE_SERVICE_ACCOUNT_JSON env var
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
    } catch (e) {
      console.warn('[Google Sheets] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON env var')
    }
  }

  // 2. Try upcoming.json in workspace or current dir
  if (!credentials) {
    const candidatePaths = [
      path.resolve(process.cwd(), 'upcoming.json'),
      path.resolve(process.cwd(), '../upcoming.json'),
      '/Users/bilalashraf/Risk Metric Dashboard/upcoming.json',
      '/Users/bilalashraf/upcoming.json',
    ]

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          const content = fs.readFileSync(p, 'utf8')
          credentials = JSON.parse(content)
          break
        } catch (e) {
          // ignore and continue
        }
      }
    }
  }

  if (!credentials || !credentials.client_email || !credentials.private_key) {
    throw new Error('Google Service Account credentials not found. Please provide upcoming.json or GOOGLE_SERVICE_ACCOUNT_JSON.')
  }

  return new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  })
}

/**
 * Get Google API Access Token
 */
export async function getAccessToken(): Promise<string> {
  const auth = getGoogleAuthClient()
  const tokenResponse = await auth.getAccessToken()
  if (!tokenResponse.token) {
    throw new Error('Failed to acquire Google OAuth access token')
  }
  return tokenResponse.token
}

/**
 * Fetch spreadsheet metadata including sheet tabs
 */
export async function getSpreadsheet(spreadsheetId: string = DEFAULT_SPREADSHEET_ID) {
  const token = await getAccessToken()
  const res = await axios.get(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  )
  return res.data
}

/**
 * Ensure all required sheet tabs exist. Creates missing ones.
 */
export async function ensureSheetTabs(
  spreadsheetId: string,
  tabNames: string[]
): Promise<Map<string, number>> {
  const token = await getAccessToken()
  const meta = await getSpreadsheet(spreadsheetId)
  const existingSheets = meta.sheets || []

  const sheetIdMap = new Map<string, number>()
  existingSheets.forEach((s: any) => {
    sheetIdMap.set(s.properties.title, s.properties.sheetId)
  })

  const addRequests: any[] = []
  for (const name of tabNames) {
    if (!sheetIdMap.has(name)) {
      addRequests.push({
        addSheet: {
          properties: {
            title: name,
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
      })
    }
  }

  if (addRequests.length > 0) {
    const batchRes = await axios.post(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      { requests: addRequests },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    )

    batchRes.data.replies?.forEach((reply: any) => {
      if (reply.addSheet?.properties) {
        const p = reply.addSheet.properties
        sheetIdMap.set(p.title, p.sheetId)
      }
    })
  }

  // If default Sheet1 exists and we created our custom tabs, clean up Sheet1
  const sheet1Id = sheetIdMap.get('Sheet1')
  if (sheet1Id !== undefined && sheetIdMap.size > 1 && !tabNames.includes('Sheet1')) {
    try {
      await axios.post(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        { requests: [{ deleteSheet: { sheetId: sheet1Id } }] },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      sheetIdMap.delete('Sheet1')
    } catch (e) {
      // ignore if already deleted
    }
  }

  return sheetIdMap
}

export interface ValueRangePayload {
  range: string
  values: any[][]
}

/**
 * Write all data tabs in 1 single high-performance batchUpdate call
 */
export async function batchUpdateSheetValues(
  spreadsheetId: string,
  data: ValueRangePayload[]
) {
  const token = await getAccessToken()
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`

  const payload = {
    valueInputOption: 'USER_ENTERED', // Allows numbers, dates, formulas to be properly parsed
    data: data.map((d) => ({
      range: d.range,
      values: d.values,
    })),
  }

  const res = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  return res.data
}

/**
 * Clear data ranges before fresh write to avoid leftover stale rows
 */
export async function batchClearSheetValues(
  spreadsheetId: string,
  ranges: string[]
) {
  const token = await getAccessToken()
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`

  const res = await axios.post(
    url,
    { ranges },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  )

  return res.data
}

/**
 * Apply institutional styling (Navy header, bold white text, frozen row 1, auto-filter)
 */
export async function applyTabFormatting(
  spreadsheetId: string,
  sheetIdMap: Map<string, number>,
  tabMeta: { name: string; columnCount: number; rowCount: number }[]
) {
  const token = await getAccessToken()
  const requests: any[] = []

  for (const t of tabMeta) {
    const sheetId = sheetIdMap.get(t.name)
    if (sheetId === undefined) continue

    // 1. Freeze Header Row (Row 1)
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
        fields: 'gridProperties.frozenRowCount',
      },
    })

    // 2. Format Header Row: Navy Blue Background (#0F172A), White Bold Text
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: t.columnCount,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: {
              red: 15 / 255,
              green: 23 / 255,
              blue: 42 / 255,
            },
            textFormat: {
              foregroundColor: { red: 1, green: 1, blue: 1 },
              bold: true,
              fontSize: 10,
              fontFamily: 'Inter',
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'WRAP',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)',
      },
    })

    // 3. Set Row 1 Height
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: 0,
          endIndex: 1,
        },
        properties: {
          pixelSize: 38,
        },
        fields: 'pixelSize',
      },
    })

    // 4. Enable Native Google Sheets Auto-Filter
    if (t.rowCount > 1) {
      requests.push({
        setBasicFilter: {
          filter: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: t.rowCount,
              startColumnIndex: 0,
              endColumnIndex: t.columnCount,
            },
          },
        },
      })
    }
  }

  if (requests.length > 0) {
    await axios.post(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      { requests },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    )
  }
}
