/**
 * Calculate effective SBP interest rate based on availability
 * 
 * Priority:
 * 1. Policy Target Rate (if available)
 * 2. Average of Reverse Repo (ceiling) and Repo (floor) if both available
 * 3. Reverse Repo Rate (ceiling) if only that available
 */

export interface InterestRateDataPoint {
  date: string
  targetRate: number | null
  reverseRepoRate: number | null // ceiling
  repoRate: number | null // floor
}

export interface EffectiveInterestRate {
  date: string
  rate: number
  source: 'target' | 'average' | 'ceiling'
}

/**
 * Calculate effective interest rate for a given date
 */
export function calculateEffectiveRate(dataPoint: InterestRateDataPoint): EffectiveInterestRate | null {
  const { date, targetRate, reverseRepoRate, repoRate } = dataPoint

  // Priority 1: Use target rate if available
  if (targetRate !== null && targetRate !== undefined) {
    return {
      date,
      rate: targetRate,
      source: 'target'
    }
  }

  // Priority 2: Use average of ceiling and floor if both available
  if (reverseRepoRate !== null && reverseRepoRate !== undefined && 
      repoRate !== null && repoRate !== undefined) {
    return {
      date,
      rate: (reverseRepoRate + repoRate) / 2,
      source: 'average'
    }
  }

  // Priority 3: Use ceiling (reverse repo) if available
  if (reverseRepoRate !== null && reverseRepoRate !== undefined) {
    return {
      date,
      rate: reverseRepoRate,
      source: 'ceiling'
    }
  }

  // No data available
  return null
}

/**
 * Calculate effective interest rates for multiple dates
 * Merges data from all three series and calculates effective rate for each date
 */
export function calculateEffectiveRates(
  targetRates: Array<{ date: string; value: number }>,
  reverseRepoRates: Array<{ date: string; value: number }>,
  repoRates: Array<{ date: string; value: number }>
): EffectiveInterestRate[] {
  // Create maps for quick lookup
  const targetMap = new Map<string, number>()
  targetRates.forEach(r => targetMap.set(r.date, r.value))

  const reverseRepoMap = new Map<string, number>()
  reverseRepoRates.forEach(r => reverseRepoMap.set(r.date, r.value))

  const repoMap = new Map<string, number>()
  repoRates.forEach(r => repoMap.set(r.date, r.value))

  // Get all unique dates
  const allDates = new Set<string>()
  targetRates.forEach(r => allDates.add(r.date))
  reverseRepoRates.forEach(r => allDates.add(r.date))
  repoRates.forEach(r => allDates.add(r.date))

  // Calculate effective rate for each date
  const effectiveRates: EffectiveInterestRate[] = []
  
  Array.from(allDates)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    .forEach(date => {
      const dataPoint: InterestRateDataPoint = {
        date,
        targetRate: targetMap.get(date) ?? null,
        reverseRepoRate: reverseRepoMap.get(date) ?? null,
        repoRate: repoMap.get(date) ?? null
      }

      const effective = calculateEffectiveRate(dataPoint)
      if (effective) {
        effectiveRates.push(effective)
      }
    })

  return effectiveRates
}

