/**
 * API Route for Market Cycles
 * Uses cache for completed cycles, always detects current cycle fresh
 */

import { NextRequest, NextResponse } from 'next/server'
import { detectMarketCycles, findLowestPointDuringDrawdown, type MarketCycle } from '@/lib/algorithms/market-cycle-detection'
import { getHistoricalDataWithMetadata } from '@/lib/portfolio/db-client'
import { getCachedCycles, setCachedCycles } from '@/lib/cache/cycles-cache'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const assetType = searchParams.get('assetType') || 'kse100'
    const symbol = searchParams.get('symbol') || 'KSE100'

    // Try to load cached cycles (all except the last one)
    const cachedCycles = getCachedCycles(assetType, symbol)

    // Fetch historical data (with caching)
    const { generateHistoricalCacheKey } = await import('@/lib/cache/cache-utils')
    const { cacheManager } = await import('@/lib/cache/cache-manager')

    // Use same cache key as historical-data route to share cache
    const cacheKey = generateHistoricalCacheKey(assetType as any, symbol)
    const cacheContext = { isHistorical: true }

    // Manual get/set to prevent caching empty data (same pattern as historical-data route)
    let historicalData: any[] = []

    const cached = await cacheManager.get<any>(cacheKey)

    if (cached && cached.data) {
      historicalData = cached.data
    } else {
      const result = await getHistoricalDataWithMetadata(assetType, symbol)

      if (result && result.data && result.data.length > 0) {
        await cacheManager.set(cacheKey, result, assetType as any, cacheContext)
        historicalData = result.data
      } else {
        console.warn(`[Market Cycles] Skipping cache for ${assetType}/${symbol} because data is empty`)
        historicalData = result?.data || []
      }
    }

    if (!historicalData || historicalData.length === 0) {
      return NextResponse.json({
        cachedCycles: cachedCycles || [],
        currentCycle: null,
        allCycles: cachedCycles || []
      })
    }

    // Convert to PriceDataPoint format
    const priceData = historicalData.map(d => ({
      date: d.date,
      close: d.close
    })).sort((a, b) => a.date.localeCompare(b.date))

    // Determine where to start detection
    let startFromDate: string | undefined = undefined

    if (cachedCycles && cachedCycles.length > 0) {
      // We have cached cycles - find where to start detecting new cycles
      const lastCachedCycle = cachedCycles[cachedCycles.length - 1]
      const lastPeakDate = lastCachedCycle.endDate
      const lastPeakIndex = priceData.findIndex(p => p.date === lastPeakDate)

      if (lastPeakIndex !== -1 && lastPeakIndex < priceData.length - 1) {
        const lastPeakPrice = priceData[lastPeakIndex].close

        // Find the actual trough for the next cycle
        const nextTrough = findLowestPointDuringDrawdown(priceData, lastPeakIndex, lastPeakPrice)

        if (nextTrough && nextTrough.index < priceData.length - 1) {
          startFromDate = priceData[nextTrough.index].date
        }
      }
    } else {
      // No cached cycles, start from hardcoded date (July 13, 1998)
      startFromDate = undefined // Will default to 1998-07-13 in detectMarketCycles
    }

    // Always detect cycles to get the latest state (including current cycle)
    let allDetectedCycles: MarketCycle[] = []

    try {
      allDetectedCycles = detectMarketCycles(priceData, startFromDate)
    } catch (error: any) {
      console.error(`[Market Cycles] Error detecting cycles for ${assetType}/${symbol}:`, error)
      // Continue with empty array - will return cached cycles if available
    }

    // Log for debugging
    if (allDetectedCycles.length === 0) {

    }

    // Separate completed cycles from current cycle
    const today = new Date()
    const oneYearAgo = new Date(today)
    oneYearAgo.setFullYear(today.getFullYear() - 1)

    const completedCycles: MarketCycle[] = []
    const currentCycles: MarketCycle[] = []

    for (const cycle of allDetectedCycles) {
      const cycleEndDate = new Date(cycle.endDate)
      if (cycleEndDate < oneYearAgo) {
        completedCycles.push(cycle)
      } else {
        currentCycles.push(cycle)
      }
    }

    // Combine cached cycles with newly detected cycles
    // Strategy: Use cached cycles as base, then add newly detected cycles that aren't in cache
    let allCompletedCycles: MarketCycle[] = []

    if (cachedCycles && cachedCycles.length > 0) {
      // Start with cached cycles
      allCompletedCycles = [...cachedCycles]

      // Add any newly detected completed cycles that aren't already cached
      for (const newCycle of completedCycles) {
        const alreadyCached = cachedCycles.some(
          cached => cached.startDate === newCycle.startDate && cached.endDate === newCycle.endDate
        )
        if (!alreadyCached) {
          allCompletedCycles.push(newCycle)
        }
      }
    } else {
      // No cache, use newly detected completed cycles
      allCompletedCycles = completedCycles
    }

    // Update cache with all completed cycles (excluding the last one if it's also completed)
    // The last cycle in allCompletedCycles might be the most recent completed cycle
    // But we want to cache all except the absolute last cycle (which is always current)
    // Actually, if all cycles are completed, we still cache all except the last one
    if (allCompletedCycles.length > 0) {
      setCachedCycles(assetType, symbol, allCompletedCycles)
    }

    // Combine all cycles: completed + current
    const allCycles = [...allCompletedCycles, ...currentCycles]

    // Assign proper cycle IDs based on chronological order
    if (allCycles.length > 0) {
      allCycles.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      allCycles.forEach((cycle, index) => {
        cycle.cycleId = index + 1
        const isOngoing = cycle.cycleName.includes('(Ongoing)')
        cycle.cycleName = `Cycle ${index + 1}${isOngoing ? ' (Ongoing)' : ''}`
      })
    }

    // The most recent current cycle
    const currentCycle = currentCycles.length > 0
      ? currentCycles[currentCycles.length - 1]
      : null

    return NextResponse.json({
      cachedCycles: allCompletedCycles,
      currentCycle: currentCycle,
      allCycles: allCycles,
      cyclesDetected: allDetectedCycles.length,
      hasData: priceData.length > 0
    })

  } catch (error: any) {
    console.error('Error in market cycles API:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to load market cycles' },
      { status: 500 }
    )
  }
}

