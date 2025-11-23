/**
 * API Route for Market Cycles
 * Handles loading saved cycles and detecting new cycles
 */

import { NextRequest, NextResponse } from 'next/server'
import { detectMarketCycles, findLowestPointDuringDrawdown, type MarketCycle } from '@/lib/algorithms/market-cycle-detection'
import { 
  loadMarketCycles, 
  saveMarketCycle, 
  getLastCycleEndDate,
  getHistoricalDataWithMetadata 
} from '@/lib/portfolio/db-client'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const assetType = searchParams.get('assetType') || 'kse100'
    const symbol = searchParams.get('symbol') || 'KSE100'

    // Load saved cycles from database
    const savedCycles = await loadMarketCycles(assetType, symbol)
    
    // Get the last saved cycle's end date
    const lastCycleEndDate = await getLastCycleEndDate(assetType, symbol)
    
    // Fetch historical data
    const { data: historicalData } = await getHistoricalDataWithMetadata(assetType, symbol)
    
    if (!historicalData || historicalData.length === 0) {
      return NextResponse.json({ 
        savedCycles: savedCycles,
        newCycles: [],
        allCycles: savedCycles
      })
    }

    // Convert to PriceDataPoint format
    const priceData = historicalData.map(d => ({
      date: d.date,
      close: d.close
    })).sort((a, b) => a.date.localeCompare(b.date))

    // Strategy: Always detect cycles from the last known point to catch:
    // 1. Current cycle updates (if it hasn't ended yet)
    // 2. New cycles (if current cycle has ended)
    // 3. Any cycles that became completed since last check
    let startFromDate: string | undefined = undefined
    
    if (savedCycles.length > 0) {
      // We have saved cycles - find where to start detecting new cycles
      const lastSavedCycle = savedCycles[savedCycles.length - 1]
      const lastPeakDate = lastSavedCycle.endDate
      const lastPeakIndex = priceData.findIndex(p => p.date === lastPeakDate)
      
      if (lastPeakIndex !== -1 && lastPeakIndex < priceData.length - 1) {
        const lastPeakPrice = priceData[lastPeakIndex].close
        
        // Find the actual trough for the next cycle (lowest point during drawdown)
        // This trough is where the next cycle (current or future) should start
        const nextTrough = findLowestPointDuringDrawdown(priceData, lastPeakIndex, lastPeakPrice)
        
        if (nextTrough && nextTrough.index < priceData.length - 1) {
          // Always detect from this trough to get:
          // - Current cycle (if it hasn't ended)
          // - New cycle (if current cycle has ended and new one started)
          startFromDate = priceData[nextTrough.index].date
        }
        // If no trough found yet, market hasn't crashed enough after last peak
      }
    } else {
      // No saved cycles, start from hardcoded date (July 13, 1998)
      startFromDate = undefined // Will default to 1998-07-13 in detectMarketCycles
    }
    
    // Always run detection to catch any new cycles or updates to current cycle
    // This ensures we always have the latest cycle information
    const newCycles = startFromDate !== undefined || savedCycles.length === 0
      ? detectMarketCycles(priceData, startFromDate)
      : []

    // Separate completed cycles from current/ongoing cycle
    // A cycle is "completed" if its end date is at least 1 year (252 trading days) before today
    const today = new Date()
    const oneYearAgo = new Date(today)
    oneYearAgo.setFullYear(today.getFullYear() - 1)
    
    const completedNewCycles: MarketCycle[] = []
    
    // Check each new cycle to see if it's completed
    for (const cycle of newCycles) {
      const cycleEndDate = new Date(cycle.endDate)
      
      // If cycle ended more than 1 year ago, it's completed
      if (cycleEndDate < oneYearAgo) {
        completedNewCycles.push(cycle)
      }
      // Otherwise, it's the current/ongoing cycle (we'll keep it in memory only)
    }
    
    // Save completed cycles to database
    // Only save cycles that are truly new and not already in the database
    let nextCycleId = savedCycles.length > 0 
      ? Math.max(...savedCycles.map(c => c.cycleId)) + 1 
      : 1
    
    for (const cycle of completedNewCycles) {
      // Check if this cycle is already saved (by comparing both start and end dates for uniqueness)
      const alreadySaved = savedCycles.some(
        saved => saved.startDate === cycle.startDate && saved.endDate === cycle.endDate
      )
      
      if (!alreadySaved) {
        const newId = nextCycleId++
        await saveMarketCycle(assetType, symbol, {
          cycleId: newId,
          cycleName: `Cycle ${newId}`, // Generate sequential name
          startDate: cycle.startDate,
          endDate: cycle.endDate,
          startPrice: cycle.startPrice,
          endPrice: cycle.endPrice,
          roi: cycle.roi,
          durationTradingDays: cycle.durationTradingDays
        })
      }
    }
    
    // Reload saved cycles after saving new ones
    const updatedSavedCycles = await loadMarketCycles(assetType, symbol)
    
    // Identify current/ongoing cycles (not yet completed)
    // These are cycles that haven't been saved because they're not >1 year old yet
    const currentCycles: MarketCycle[] = []
    for (const cycle of newCycles) {
      const cycleEndDate = new Date(cycle.endDate)
      if (cycleEndDate >= oneYearAgo) {
        // This cycle ended recently (or hasn't ended yet) - it's current
        currentCycles.push(cycle)
      }
    }
    
    // Combine saved cycles with current cycles
    const allCycles = [...updatedSavedCycles]
    
    // Add current cycles (ensuring proper cycle IDs)
    for (const currentCycle of currentCycles) {
      // Check if this cycle is already in allCycles (shouldn't be, but check anyway)
      const alreadyIncluded = allCycles.some(
        saved => saved.startDate === currentCycle.startDate && saved.endDate === currentCycle.endDate
      )
      
      if (!alreadyIncluded) {
        // Assign the next cycle ID
        const lastSavedCycleId = allCycles.length > 0
          ? Math.max(...allCycles.map(c => c.cycleId))
          : 0
        allCycles.push({
          ...currentCycle,
          cycleId: lastSavedCycleId + 1,
          cycleName: `Cycle ${lastSavedCycleId + 1}`
        })
      }
    }
    
    // Sort cycles by start date to ensure proper ordering
    allCycles.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    
    // The most recent current cycle (for backward compatibility)
    const currentCycle = currentCycles.length > 0 
      ? currentCycles[currentCycles.length - 1]
      : null

    return NextResponse.json({
      savedCycles: updatedSavedCycles,
      currentCycle: currentCycle,
      allCycles: allCycles,
      newCyclesDetected: newCycles.length
    })

  } catch (error: any) {
    console.error('Error in market cycles API:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to load market cycles' },
      { status: 500 }
    )
  }
}

