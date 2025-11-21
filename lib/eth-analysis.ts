// ETH Risk Analysis Library - Implements the EXACT same logic as the Python code

import { getWeekEndSunday } from "./algorithms/helpers"
import { calculateFairValueBands, type BandParams, type WeeklyData } from "./algorithms/fair-value-bands"
import { calculateSVal } from "./algorithms/s-val-calculation"
import { calculateSRel } from "./algorithms/s-rel-calculation"
import { calculateRiskMetrics as calculateCompositeRiskMetrics, type RiskWeights } from "./algorithms/risk-metrics"
import { DEFAULT_RISK_WEIGHTS } from "./config/app.config"

// Re-export types for backward compatibility
export type { BandParams, WeeklyData, RiskWeights }

export interface KlineData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  closeTime: number
  quoteVolume: number
  tradesCount: number
  takerBuyBaseVolume: number
  takerBuyQuoteVolume: number
}

export interface ProcessedData {
  date: Date
  ethUsdOpen: number
  ethUsdHigh: number
  ethUsdLow: number
  ethUsdClose: number
  ethBtcClose: number
  volume: number
}

export interface RiskMetrics {
  dates: Date[]
  sVal: number[]
  sRel: number[]
  riskEq: number[]
  riskValHeavy: number[]
  riskRelHeavy: number[]
  ethUsdPrices: number[]
  ethBtcPrices: number[]
  bands: {
    fair: number[]
    upper1s: number[]
    lower1s: number[]
    upper2s: number[]
    lower2s: number[]
    upper3s: number[]
    lower3s: number[]
  }
  currentState: {
    price: number
    ethBtc: number
    fairValue: number
    sVal: number
    sRel: number
    riskEq: number
  }
}

export async function fetchEthHistoricalData(): Promise<ProcessedData[]> {
  // Fallback URLs in order of preference
  const binanceUrls = [
    "https://api.binance.com/api/v3/klines",
    "https://api.binance.us/api/v3/klines",
    "https://api1.binance.com/api/v3/klines",
    "https://api2.binance.com/api/v3/klines",
    "https://api3.binance.com/api/v3/klines",
  ]

  const fetchBinanceKlines = async (symbol: string, startDate: Date): Promise<any[]> => {
    const startTimestamp = startDate.getTime()
    const allData: any[] = []
    let currentStart = startTimestamp
    const maxIterations = 50 // Prevent infinite loops
    let iterations = 0
    let currentUrlIndex = 0

    const tryFetchWithFallback = async (params: URLSearchParams): Promise<Response | null> => {
      let lastError: Error | null = null
      
      // Try each URL in sequence
      for (let i = currentUrlIndex; i < binanceUrls.length; i++) {
        const url = binanceUrls[i]
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

          const response = await fetch(`${url}?${params}`, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; RiskDashboard/1.0)',
              'Accept': 'application/json',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          })
          clearTimeout(timeoutId)

          if (response.ok) {
            // If this URL works, use it for subsequent requests
            currentUrlIndex = i
            return response
          }

          // If 404, try next URL immediately
          if (response.status === 404) {
            console.warn(`[ETHBTC Fetch] URL ${url} returned 404, trying next fallback...`)
            continue
          }

          // For other errors, store and continue
          lastError = new Error(`HTTP ${response.status}: ${response.statusText}`)
          continue
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            lastError = new Error("Request timeout")
            continue
          }
          lastError = error instanceof Error ? error : new Error(String(error))
          continue
        }
      }

      // All URLs failed
      throw lastError || new Error(`Failed to fetch ${symbol} data from all Binance endpoints`)
    }

    while (iterations < maxIterations) {
      iterations++
      const params = new URLSearchParams({
        symbol,
        interval: "1d",
        startTime: currentStart.toString(),
        limit: "1000",
      })

      try {
        const response = await tryFetchWithFallback(params)

        if (!response) {
          throw new Error(`Failed to fetch ${symbol} data: All fallback URLs failed`)
        }

        // Handle 451 specifically - might be rate limiting or geographic restriction
        if (response.status === 451) {
          // Retry with longer delay
          await new Promise((resolve) => setTimeout(resolve, 2000))
          const retryResponse = await tryFetchWithFallback(params)
          if (!retryResponse || !retryResponse.ok) {
            throw new Error(`Failed to fetch ${symbol} data: ${retryResponse?.status || 'unknown'} ${retryResponse?.statusText || 'unknown'}. This may be due to rate limiting or geographic restrictions.`)
          }
          const retryBatch = await retryResponse.json()
          if (!retryBatch || retryBatch.length === 0) break
          allData.push(...retryBatch)
          currentStart = retryBatch[retryBatch.length - 1][6] + 1
          if (retryBatch.length < 1000) break
          await new Promise((resolve) => setTimeout(resolve, 200))
          continue
        }

        const batch = await response.json()
        if (!batch || batch.length === 0) break

        allData.push(...batch)
        currentStart = batch[batch.length - 1][6] + 1

        if (batch.length < 1000) break
        // Increased delay to respect rate limits, especially on Vercel
        await new Promise((resolve) => setTimeout(resolve, 200))
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(`Request timeout while fetching ${symbol} data`)
        }
        throw error
      }
    }
    return allData
  }

  const startDate = new Date("2015-08-08")

  const ethBtcData = await fetchBinanceKlines("ETHBTC", startDate)
  const btcUsdtData = await fetchBinanceKlines("BTCUSDT", startDate)

  // Convert to DataFrames equivalent
  const ethBtcMap = new Map()
  const btcUsdtMap = new Map()

  ethBtcData.forEach((candle) => {
    ethBtcMap.set(candle[0], {
      open: Number.parseFloat(candle[1]),
      high: Number.parseFloat(candle[2]),
      low: Number.parseFloat(candle[3]),
      close: Number.parseFloat(candle[4]),
      volume: Number.parseFloat(candle[5]),
    })
  })

  btcUsdtData.forEach((candle) => {
    btcUsdtMap.set(candle[0], {
      open: Number.parseFloat(candle[1]),
      high: Number.parseFloat(candle[2]),
      low: Number.parseFloat(candle[3]),
      close: Number.parseFloat(candle[4]),
      volume: Number.parseFloat(candle[5]),
    })
  })

  // Merge on timestamp and compute ETH/USD
  const merged: ProcessedData[] = []

  for (const [timestamp, ethBtc] of ethBtcMap) {
    const btcUsdt = btcUsdtMap.get(timestamp)
    if (btcUsdt) {
      merged.push({
        date: new Date(timestamp),
        ethUsdOpen: ethBtc.open * btcUsdt.open,
        ethUsdHigh: ethBtc.high * btcUsdt.high,
        ethUsdLow: ethBtc.low * btcUsdt.low,
        ethUsdClose: ethBtc.close * btcUsdt.close,
        ethBtcClose: ethBtc.close,
        volume: ethBtc.volume,
      })
    }
  }

  return merged.sort((a, b) => a.date.getTime() - b.date.getTime())
}

export async function calculateRiskMetrics(
  params: BandParams,
  sValCutoffDate: Date | null = null,
  riskWeights?: RiskWeights,
): Promise<RiskMetrics> {
  const df = await fetchEthHistoricalData()

  // Resample to weekly (keeping both ETH/USD and ETH/BTC) - EXACT Python pandas logic
  const weeklyMap = new Map<string, ProcessedData>()

  df.forEach((day) => {
    // Get the Sunday that ends this week (pandas 'W-SUN' logic)
    const weekEndSunday = getWeekEndSunday(day.date)
    const weekKey = weekEndSunday.toISOString().split("T")[0]

    // Keep the last (most recent) day for each week ending on Sunday
    const existing = weeklyMap.get(weekKey)
    if (!existing || day.date > existing.date) {
      weeklyMap.set(weekKey, day)
    }
  })

  const ethWeekly: WeeklyData[] = Array.from(weeklyMap.values())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((day) => ({
      date: day.date,
      ethUsdClose: day.ethUsdClose,
      ethBtcClose: day.ethBtcClose,
    }))

  // === CONSOLIDATED FAIR VALUE BANDS (Pine-style parametric log-regression) ===
  const bandsResult = calculateFairValueBands(ethWeekly, params)
  const bands = bandsResult

  // === S_VAL CALCULATION (rescaled to ±2σ) ===
  const sVal = calculateSVal(ethWeekly, bandsResult, sValCutoffDate)

  // === S_REL CALCULATION (consolidated ETH/BTC trendline logic) ===
  const sRel = calculateSRel(ethWeekly)

  // === COMPOSITE RISK METRICS ===
  const { riskEq, riskValHeavy, riskRelHeavy } = calculateCompositeRiskMetrics(
    sVal,
    sRel,
    riskWeights || DEFAULT_RISK_WEIGHTS,
  )

  // === CURRENT STATE ===
  const currentPrice = ethWeekly[ethWeekly.length - 1].ethUsdClose
  const currentEthBtc = ethWeekly[ethWeekly.length - 1].ethBtcClose
  const currentFair = bands.fair[bands.fair.length - 1]
  const currentSVal = sVal[sVal.length - 1]
  const currentSRel = sRel[sRel.length - 1]
  const currentRiskEq = riskEq[riskEq.length - 1]

  return {
    dates: ethWeekly.map((week) => week.date),
    sVal,
    sRel,
    riskEq,
    riskValHeavy,
    riskRelHeavy,
    ethUsdPrices: ethWeekly.map((week) => week.ethUsdClose),
    ethBtcPrices: ethWeekly.map((week) => week.ethBtcClose),
    bands,
    currentState: {
      price: currentPrice,
      ethBtc: currentEthBtc,
      fairValue: currentFair,
      sVal: currentSVal,
      sRel: currentSRel,
      riskEq: currentRiskEq,
    },
  }
}

