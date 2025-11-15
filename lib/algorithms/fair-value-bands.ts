// Fair Value Band Calculation Algorithm

export interface BandParams {
  basePrice: number
  baseCoeff: number
  growthCoeff: number
  startYear: number
  startMonth: number
  startDay: number
  mainMult: number
  upperMult: number
  lowerMult: number
  offset: number
}

export interface WeeklyData {
  date: Date
  ethUsdClose: number
  ethBtcClose: number
}

export interface FairValueBands {
  fair: number[]
  upper1s: number[]
  lower1s: number[]
  upper2s: number[]
  lower2s: number[]
  upper3s: number[]
  lower3s: number[]
  sigma: number
}

/**
 * Calculate fair value bands using parametric log-regression (Pine-style)
 */
export function calculateFairValueBands(
  weeklyData: WeeklyData[],
  params: BandParams,
): FairValueBands {
  const startTs = new Date(params.startYear, params.startMonth - 1, params.startDay)

  const yearsSinceStart = weeklyData.map((week) => {
    const diffMs = week.date.getTime() - startTs.getTime()
    const years = diffMs / (365.25 * 24 * 60 * 60 * 1000)
    return Math.max(0.01, years)
  })

  // Pine formula for fair value - EXACT
  const lnReg = yearsSinceStart.map(
    (years) => Math.log(params.basePrice) + params.baseCoeff + params.growthCoeff * Math.log(years),
  )
  const regPrice = lnReg.map((ln) => Math.exp(ln))

  const bands = {
    fair: regPrice.map((price) => price * params.mainMult + params.offset),
    upper1s: regPrice.map((price) => price * params.upperMult + params.offset),
    lower1s: regPrice.map((price) => price * params.lowerMult + params.offset),
    upper2s: [] as number[],
    lower2s: [] as number[],
    upper3s: [] as number[],
    lower3s: [] as number[],
  }

  // === STATISTICAL REGRESSION BANDS (using actual price residuals) ===
  // Calculate log residuals to get true sigma
  const logPrice = weeklyData.map((week) => Math.log(week.ethUsdClose))
  const logFair = bands.fair.map((fair) => Math.log(fair))
  const resid = logPrice.map((lp, i) => lp - logFair[i])

  // Calculate sigma using numpy.nanstd equivalent
  const validResid = resid.filter((r) => !isNaN(r) && isFinite(r))
  const mean = validResid.reduce((sum, r) => sum + r, 0) / validResid.length
  const variance = validResid.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / validResid.length
  const sigma = validResid.length > 0 && Math.sqrt(variance) > 0 ? Math.sqrt(variance) : 1.0

  // Create regression bands at different sigma levels
  bands.upper2s = logFair.map((ln) => Math.exp(ln + 2.0 * sigma))
  bands.lower2s = logFair.map((ln) => Math.exp(ln - 2.0 * sigma))
  bands.upper3s = logFair.map((ln) => Math.exp(ln + 3.0 * sigma))
  bands.lower3s = logFair.map((ln) => Math.exp(ln - 3.0 * sigma))

  return {
    ...bands,
    sigma,
  }
}




