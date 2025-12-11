/**
 * Modern Portfolio Theory (MPT) Optimization Functions
 * 
 * Implements portfolio optimization algorithms:
 * - Minimum Variance Portfolio
 * - Maximum Sharpe Portfolio
 * - Maximum Sortino Portfolio
 * - Maximum Return Portfolio
 * - Efficient Frontier
 * 
 * All calculations use annualized returns and covariance (250 trading days)
 */

import { matrixVectorMultiply, dotProduct } from './matrix-utils'
import * as qp from 'quadprog'

export interface PriceDataPoint {
  date: string
  close: number
}

export interface PortfolioWeights {
  [symbol: string]: number
}

export interface PortfolioMetrics {
  expectedReturn: number // Annualized
  volatility: number // Annualized
  sharpeRatio: number
  sortinoRatio: number
  weights: PortfolioWeights
}

export interface EfficientFrontierPoint {
  expectedReturn: number
  volatility: number
  weights: PortfolioWeights
}

export interface OptimizationResult {
  weights: PortfolioWeights
  metrics: PortfolioMetrics
}

const TRADING_DAYS_PER_YEAR = 250

/**
 * Calculate daily simple (arithmetic) returns from price data
 * r_t = P_t / P_{t-1} - 1
 */
export function calculateDailyReturns(prices: number[]): number[] {
  const returns: number[] = []
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1]
    if (prev > 0) {
      const ret = prices[i] / prev - 1 // Simple arithmetic returns
      returns.push(ret)
    } else {
      returns.push(0)
    }
  }

  return returns
}

/**
 * Calculate mean return (annualized) using geometric mean (compound growth)
 * r_ann = (1 + r̄_daily)^250 - 1
 * 
 * Uses geometric annualization because returns compound over time.
 * Arithmetic annualization (r̄_daily × 250) is incorrect for returns.
 */
export function calculateMeanReturn(returns: number[]): number {
  if (returns.length === 0) return 0
  const meanDaily = returns.reduce((sum, r) => sum + r, 0) / returns.length

  // Geometric annualization (compound growth)
  // If daily return is r, then annual return = (1 + r)^250 - 1
  return Math.pow(1 + meanDaily, TRADING_DAYS_PER_YEAR) - 1
}

/**
 * Calculate covariance matrix (annualized) from arithmetic returns
 * Σ_ann = cov_daily × 250
 */
export function calculateCovarianceMatrix(returnsMatrix: number[][]): number[][] {
  const n = returnsMatrix.length
  const m = returnsMatrix[0].length

  // Calculate mean returns for each asset
  const meanReturns = returnsMatrix.map(row => row.reduce((s, v) => s + v, 0) / row.length)

  // Calculate covariance matrix
  const cov: number[][] = Array(n).fill(0).map(() => Array(n).fill(0))

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0
      for (let k = 0; k < m; k++) {
        s += (returnsMatrix[i][k] - meanReturns[i]) * (returnsMatrix[j][k] - meanReturns[j])
      }
      cov[i][j] = (s / (m - 1)) * TRADING_DAYS_PER_YEAR // Annualize
    }
  }

  return cov
}

/**
 * Check if matrix is positive definite using Cholesky decomposition attempt
 * Returns true if Cholesky decomposition succeeds (matrix is PD)
 */
function isPositiveDefinite(matrix: number[][]): boolean {
  const n = matrix.length
  try {
    // Attempt Cholesky decomposition: A = L * L^T
    const L: number[][] = Array(n).fill(null).map(() => Array(n).fill(0))

    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = 0
        for (let k = 0; k < j; k++) {
          sum += L[i][k] * L[j][k]
        }

        if (i === j) {
          const diag = matrix[i][i] - sum
          if (diag <= 0) return false // Not positive definite
          L[i][j] = Math.sqrt(diag)
        } else {
          if (Math.abs(L[j][j]) < 1e-10) return false
          L[i][j] = (matrix[i][j] - sum) / L[j][j]
        }
      }
    }
    return true
  } catch {
    return false
  }
}

/**
 * Regularize covariance matrix to ensure positive definiteness
 * Uses industry-standard Ledoit-Wolf shrinkage approach combined with ridge regularization
 * Ensures matrix is symmetric and positive definite
 */
export function regularizeCov(cov: number[][], lambda = 1e-4): number[][] {
  const n = cov.length
  const out: number[][] = []

  // Step 1: Ensure symmetry (standard practice)
  for (let i = 0; i < n; i++) {
    out[i] = []
    for (let j = 0; j < n; j++) {
      out[i][j] = (cov[i][j] + cov[j][i]) / 2
    }
  }

  // Step 2: Calculate average variance for shrinkage target
  const avgVariance = out.reduce((sum, row, i) => sum + row[i], 0) / n

  // Step 3: Apply Ledoit-Wolf style shrinkage towards identity
  // Shrinkage factor: blend between sample covariance and identity
  const shrinkage = 0.1 // Conservative shrinkage factor
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        // Shrink diagonal towards average variance
        out[i][j] = (1 - shrinkage) * out[i][j] + shrinkage * avgVariance
      } else {
        // Shrink off-diagonal towards zero
        out[i][j] = (1 - shrinkage) * out[i][j]
      }
    }
  }

  // Step 4: Add ridge regularization to ensure positive definiteness
  // Standard practice: add small multiple of identity
  const ridgeLambda = Math.max(lambda, avgVariance * 0.01)
  for (let i = 0; i < n; i++) {
    out[i][i] += ridgeLambda
  }

  // Step 5: Verify positive definiteness, strengthen if needed
  let attempts = 0
  const maxAttempts = 10
  while (!isPositiveDefinite(out) && attempts < maxAttempts) {
    // Increase regularization
    const additionalRidge = ridgeLambda * Math.pow(2, attempts)
    for (let i = 0; i < n; i++) {
      out[i][i] += additionalRidge
    }
    attempts++
  }

  // Step 6: Final check - ensure diagonal dominance as fallback
  if (!isPositiveDefinite(out)) {
    for (let i = 0; i < n; i++) {
      const rowSum = out[i].reduce((s, v, j) => s + (j !== i ? Math.abs(v) : 0), 0)
      out[i][i] = Math.max(out[i][i], rowSum * 1.1 + ridgeLambda)
    }
  }

  return out
}

/**
 * Calculate portfolio return: w^T @ μ
 */
export function portfolioReturn(weights: number[], expectedReturns: number[]): number {
  return dotProduct(weights, expectedReturns)
}

/**
 * Calculate portfolio variance: w^T @ Σ @ w
 */
export function portfolioVariance(weights: number[], covarianceMatrix: number[][]): number {
  const w = weights
  const cov = covarianceMatrix

  // Compute Σ @ w first (matrix-vector multiply)
  const cov_w = matrixVectorMultiply(cov, w)

  // Then compute w^T @ (Σ @ w) = dot product
  return dotProduct(w, cov_w)
}

/**
 * Calculate portfolio volatility: sqrt(w^T @ Σ @ w)
 */
export function portfolioVolatility(weights: number[], covarianceMatrix: number[][]): number {
  return Math.sqrt(portfolioVariance(weights, covarianceMatrix))
}

/**
 * Calculate downside deviation (for Sortino ratio)
 * Uses daily excess returns against daily RF (rf_daily = rf_annual / 250)
 * Then annualize downside by sqrt(250)
 * rfAnnual should be decimal (e.g., 0.20 for 20%)
 */
export function calculateDownsideDeviation(portfolioDailyReturns: number[], rfAnnual: number): number {
  const rfDaily = rfAnnual / TRADING_DAYS_PER_YEAR

  const downsides = portfolioDailyReturns
    .map(r => Math.min(0, r - rfDaily))
    .filter(x => x < 0)

  if (downsides.length === 0) return 0

  const meanDown = downsides.reduce((s, v) => s + v, 0) / downsides.length
  const variance = downsides.reduce((s, v) => s + Math.pow(v - meanDown, 2), 0) / downsides.length

  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR) // Annualize
}

/**
 * Calculate Sortino ratio
 * Sortino = (expectedReturnAnn - rfAnnual) / downsideAnn
 * rfAnnual should be decimal (e.g., 0.20 for 20%)
 */
export function sortinoRatio(expectedReturnAnn: number, rfAnnual: number, downsideAnn: number): number {
  const excess = expectedReturnAnn - rfAnnual
  if (downsideAnn === 0) {
    return excess > 0 ? Infinity : (excess === 0 ? 0 : -Infinity)
  }
  return excess / downsideAnn
}

/**
 * Calculate Sharpe ratio
 * Sharpe = (expectedReturnAnn - rfAnnual) / volatilityAnn
 * rfAnnual should be decimal (e.g., 0.20 for 20%)
 */
export function sharpeRatio(expectedReturnAnn: number, rfAnnual: number, volatilityAnn: number): number {
  const excess = expectedReturnAnn - rfAnnual
  if (volatilityAnn === 0) {
    return excess > 0 ? Infinity : (excess === 0 ? 0 : -Infinity)
  }
  return excess / volatilityAnn
}

/**
 * Project vector onto simplex using Duchi et al. algorithm (numerically stable)
 * Projects vector v onto the probability simplex {w | w_i >= 0, sum w_i = 1}
 */
function projectOntoSimplex(v: number[]): number[] {
  const n = v.length
  const u = v.slice().sort((a, b) => b - a) // descending
  let cssv = 0
  let rho = -1

  for (let i = 0; i < n; i++) {
    cssv += u[i]
    const t = (cssv - 1) / (i + 1)
    if (u[i] - t > 0) {
      rho = i
    } else {
      break
    }
  }

  if (rho === -1) {
    // fallback to uniform
    return Array(n).fill(1 / n)
  }

  cssv = u.slice(0, rho + 1).reduce((s, x) => s + x, 0)
  const theta = (cssv - 1) / (rho + 1)
  return v.map(x => Math.max(0, x - theta))
}

/**
 * Project gradient to sum constraint
 * Remove component of gradient along the all-ones vector
 * proj = grad - (sum(grad) / n) * 1
 */
function projectGradientToSumConstraint(grad: number[]): number[] {
  const n = grad.length
  const sumGrad = grad.reduce((s, x) => s + x, 0)
  const scalar = sumGrad / n
  return grad.map(g => g - scalar)
}

/**
 * Improved PGD loop with multi-start
 * Practical implementation with adaptive learning rate
 */
function optimizePGD(
  objective: (w: number[]) => number,
  gradient: (w: number[]) => number[],
  n: number,
  maxIter = 2000,
  tol = 1e-8,
  multiStarts = 10
): { bestW: number[]; bestObj: number } {
  let bestW = Array(n).fill(1 / n)
  let bestObj = objective(bestW)

  for (let start = 0; start < multiStarts; start++) {
    // Random initial weight on simplex
    let w = projectOntoSimplex(Array.from({ length: n }, (_, i) => Math.random()))
    let lr = 0.1

    for (let iter = 0; iter < maxIter; iter++) {
      const grad = gradient(w)
      const pgrad = projectGradientToSumConstraint(grad)

      // Gradient descent step (minimize)
      const wNewRaw = w.map((wi, i) => wi - lr * pgrad[i])

      // Project back onto simplex
      const wNew = projectOntoSimplex(wNewRaw)

      const objNew = objective(wNew)

      if (objNew < bestObj) {
        bestObj = objNew
        bestW = wNew.slice()
        lr = Math.min(lr * 1.05, 1.0)
      } else {
        lr *= 0.8
        if (lr < 1e-12) break
      }

      const change = Math.sqrt(wNew.reduce((s, x, i) => s + Math.pow(x - w[i], 2), 0))
      w = wNew

      if (change < tol) break
    }
  }

  return { bestW, bestObj }
}

/**
 * Convert 0-indexed matrix to 1-indexed (Fortran style for quadprog)
 */
function to1Indexed(matrix: number[][]): number[][] {
  const n = matrix.length
  const result: number[][] = Array(n + 1).fill(null).map(() => Array(n + 1).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      result[i + 1][j + 1] = matrix[i][j]
    }
  }
  return result
}

/**
 * Convert 0-indexed vector to 1-indexed
 */
function vecTo1Indexed(vec: number[]): number[] {
  return [0, ...vec]
}

/**
 * Convert 1-indexed vector to 0-indexed
 */
function vecTo0Indexed(vec: number[]): number[] {
  return vec.slice(1)
}


/**
 * Minimum Variance Portfolio (GMVP)
 * Minimize: 0.5 * w^T @ Σ @ w
 * Subject to: sum(w) = 1, w >= 0
 */
export function optimizeMinimumVariance(
  covarianceMatrix: number[][],
  symbols: string[]
): PortfolioWeights {
  const n = symbols.length

  // QP: min 0.5 * w^T Σ w
  // Dmat = Σ (quadratic term)
  const Dmat = to1Indexed(covarianceMatrix)

  // dvec = 0 (linear term)
  const dvec = vecTo1Indexed(Array(n).fill(0))

  // Constraints: sum(w) = 1, w >= 0
  // Format: A^T * w >= b0 where A columns are constraint vectors
  // Constraint 1 (equality): sum(w) = 1 → [1,1,...,1]^T * w = 1
  // Constraint 2..n+1 (inequality): w[i] >= 0 → [0,...,1,...,0]^T * w >= 0
  const numConstraints = 1 + n // 1 equality + n inequalities
  const Amat: number[][] = Array(n + 1).fill(null).map(() => Array(numConstraints + 1).fill(0))
  // Column 1: all 1s (for sum constraint: sum(w) = 1)
  for (let i = 1; i <= n; i++) {
    Amat[i][1] = 1
  }
  // Columns 2 to n+1: identity matrix (for w[i] >= 0)
  // Column j+1 corresponds to w[j] >= 0
  for (let j = 0; j < n; j++) {
    Amat[j + 1][j + 2] = 1 // Only the j-th variable has coefficient 1
  }

  const bvec = vecTo1Indexed([1, ...Array(n).fill(0)])
  const meq = 1 // First constraint is equality

  const solution = qp.solveQP(Dmat, dvec, Amat, bvec, meq)

  // Check if solution is valid (empty message often means success in quadprog)
  const isSuccess = solution.message === 'optimal' || solution.message === '' || !solution.message || solution.message === undefined

  if (!isSuccess) {
    // Fallback to equal weights
    const result: PortfolioWeights = {}
    symbols.forEach((symbol) => {
      result[symbol] = 1 / n
    })
    return result
  }

  const weights = vecTo0Indexed(solution.solution)

  const result: PortfolioWeights = {}
  symbols.forEach((symbol, i) => {
    result[symbol] = Math.max(0, weights[i]) // Ensure non-negative
  })

  // Normalize to sum to 1
  const sum = Object.values(result).reduce((s, w) => s + w, 0)
  if (sum > 0) {
    symbols.forEach((symbol) => {
      result[symbol] = result[symbol] / sum
    })
  } else {
    symbols.forEach((symbol) => {
      result[symbol] = 1 / n
    })
  }

  return result
}

/**
 * Maximum Sharpe Portfolio
 * Maximize: (w^T @ μ - rf) / sqrt(w^T @ Σ @ w)
 * 
 * This is transformed to a QP problem by introducing a scaling variable.
 * We solve: min w^T @ Σ @ w subject to w^T @ (μ - rf) = 1, w >= 0
 * Then normalize so sum(w) = 1
 */
export function optimizeMaximumSharpe(
  expectedReturns: number[],
  covarianceMatrix: number[][],
  riskFreeRate: number,
  symbols: string[]
): PortfolioWeights {
  const n = symbols.length
  // riskFreeRate comes as percentage, convert to decimal
  const rfAnnual = riskFreeRate / 100

  // Excess returns
  const excessReturns = expectedReturns.map(r => r - rfAnnual)

  // QP: min 0.5 * w^T Σ w
  // Subject to: w^T @ (μ - rf) = 1, w >= 0
  const Dmat = to1Indexed(covarianceMatrix)
  const dvec = vecTo1Indexed(Array(n).fill(0))

  // Constraints: w^T @ excessReturns = 1, w >= 0
  // Constraint 1 (equality): excessReturns^T * w = 1
  // Constraint 2..n+1 (inequality): w[i] >= 0
  const numConstraints = 1 + n // 1 equality + n inequalities
  const Amat: number[][] = Array(n + 1).fill(null).map(() => Array(numConstraints + 1).fill(0))
  // Column 1: excess returns (for return constraint)
  for (let i = 1; i <= n; i++) {
    Amat[i][1] = excessReturns[i - 1]
  }
  // Columns 2 to n+1: identity matrix (for w[i] >= 0)
  for (let j = 0; j < n; j++) {
    Amat[j + 1][j + 2] = 1
  }

  const bvec = vecTo1Indexed([1, ...Array(n).fill(0)])
  const meq = 1 // First constraint is equality

  const solution = qp.solveQP(Dmat, dvec, Amat, bvec, meq)

  // Check if solution is valid (empty message often means success in quadprog)
  const isSuccess = solution.message === 'optimal' || solution.message === '' || !solution.message || solution.message === undefined

  if (!isSuccess) {
    // Fallback to equal weights
    const result: PortfolioWeights = {}
    symbols.forEach((symbol) => {
      result[symbol] = 1 / n
    })
    return result
  }

  let weights = vecTo0Indexed(solution.solution)

  // Ensure non-negative and normalize
  weights = weights.map(w => Math.max(0, w))
  const sum = weights.reduce((s, w) => s + w, 0)
  if (sum > 0) {
    weights = weights.map(w => w / sum)
  } else {
    weights = Array(n).fill(1 / n)
  }

  const result: PortfolioWeights = {}
  symbols.forEach((symbol, i) => {
    result[symbol] = weights[i]
  })

  return result
}

/**
 * Maximum Sortino Portfolio
 * Maximize: (w^T @ μ - rf) / σ_downside
 */
export function optimizeMaximumSortino(
  expectedReturns: number[],
  returnsMatrix: number[][],
  riskFreeRate: number,
  symbols: string[]
): PortfolioWeights {
  const n = symbols.length
  const initialGuess = Array(n).fill(1 / n)

  // Calculate portfolio returns for given weights
  const getPortfolioReturns = (w: number[]): number[] => {
    const m = returnsMatrix[0].length
    const portfolioReturns: number[] = []
    for (let t = 0; t < m; t++) {
      let portfolioReturn = 0
      for (let i = 0; i < n; i++) {
        portfolioReturn += w[i] * returnsMatrix[i][t]
      }
      portfolioReturns.push(portfolioReturn)
    }
    return portfolioReturns
  }

  // riskFreeRate comes as percentage, convert to decimal
  const rfAnnual = riskFreeRate / 100

  const objective = (w: number[]) => {
    const ret = portfolioReturn(w, expectedReturns)
    const portfolioReturns = getPortfolioReturns(w)
    const downsideDev = calculateDownsideDeviation(portfolioReturns, rfAnnual)
    if (downsideDev < 1e-10) return Infinity // Avoid division by zero
    return -(ret - rfAnnual) / downsideDev // Negative for minimization
  }

  // Numerical gradient approximation
  const gradient = (w: number[]) => {
    const eps = 1e-6
    const grad: number[] = []
    const baseObj = objective(w)

    for (let i = 0; i < n; i++) {
      const wPlus = [...w]
      wPlus[i] += eps
      // Normalize
      const sum = wPlus.reduce((a, b) => a + b, 0)
      if (sum > 0) {
        for (let j = 0; j < n; j++) {
          wPlus[j] = wPlus[j] / sum
        }
      }
      const objPlus = objective(wPlus)
      grad[i] = (objPlus - baseObj) / eps
    }
    return grad
  }

  // Use multi-start for non-convex, non-smooth optimization
  const { bestW } = optimizePGD(objective, gradient, n, 2000, 1e-8, 20)

  const result: PortfolioWeights = {}
  symbols.forEach((symbol, i) => {
    result[symbol] = bestW[i]
  })
  return result
}

/**
 * Maximum Return Portfolio
 * Simply allocate 100% to asset with highest expected return
 */
export function optimizeMaximumReturn(
  expectedReturns: number[],
  symbols: string[]
): PortfolioWeights {
  const maxIndex = expectedReturns.reduce((maxIdx, val, idx) =>
    val > expectedReturns[maxIdx] ? idx : maxIdx, 0
  )

  const result: PortfolioWeights = {}
  symbols.forEach((symbol, i) => {
    result[symbol] = i === maxIndex ? 1 : 0
  })
  return result
}

/**
 * Generate Efficient Frontier
 * For a range of target returns, minimize variance using QP
 */
/**
 * Check if target return is feasible given expected returns
 * A target return is feasible if it's between min and max expected returns
 * and can be achieved with non-negative weights
 */
function isTargetReturnFeasible(
  targetReturn: number,
  expectedReturns: number[],
  tolerance = 1e-6
): boolean {
  const minReturn = Math.min(...expectedReturns)
  const maxReturn = Math.max(...expectedReturns)

  // Target must be within achievable range
  if (targetReturn < minReturn - tolerance || targetReturn > maxReturn + tolerance) {
    return false
  }

  return true
}

export function generateEfficientFrontier(
  expectedReturns: number[],
  covarianceMatrix: number[][],
  symbols: string[],
  numPoints: number = 50
): EfficientFrontierPoint[] {
  const n = symbols.length
  const minReturn = Math.min(...expectedReturns)
  const maxReturn = Math.max(...expectedReturns)

  const frontier: EfficientFrontierPoint[] = []

  // QP setup (same for all points)
  const Dmat = to1Indexed(covarianceMatrix)
  const dvec = vecTo1Indexed(Array(n).fill(0))

  for (let i = 0; i < numPoints; i++) {
    const targetReturn = minReturn + (maxReturn - minReturn) * i / (numPoints - 1)

    // Validate target return feasibility (standard practice)
    if (!isTargetReturnFeasible(targetReturn, expectedReturns)) {
      continue
    }

    // Constraints: w^T @ μ = targetReturn, sum(w) = 1, w >= 0
    // Constraint 1 (equality): expectedReturns^T * w = targetReturn
    // Constraint 2 (equality): sum(w) = 1
    // Constraint 3..n+2 (inequality): w[i] >= 0
    const numConstraints = 2 + n // 2 equality + n inequalities
    const Amat: number[][] = Array(n + 1).fill(null).map(() => Array(numConstraints + 1).fill(0))
    // Column 1: expected returns (for return constraint)
    for (let j = 1; j <= n; j++) {
      Amat[j][1] = expectedReturns[j - 1]
    }
    // Column 2: ones (for sum constraint)
    for (let j = 1; j <= n; j++) {
      Amat[j][2] = 1
    }
    // Columns 3 to n+2: identity matrix (for w[i] >= 0)
    for (let k = 0; k < n; k++) {
      Amat[k + 1][k + 3] = 1
    }

    const bvec = vecTo1Indexed([targetReturn, 1, ...Array(n).fill(0)])
    const meq = 2 // First two constraints are equality

    // Attempt QP solve with retry logic (best practice for numerical stability)
    let solution = qp.solveQP(Dmat, dvec, Amat, bvec, meq)
    let retryCount = 0
    const maxRetries = 2

    // If matrix not positive definite, try with additional regularization
    while (
      solution.message === 'matrix D in quadratic function is not positive definite!' &&
      retryCount < maxRetries
    ) {
      retryCount++

      // Create a more strongly regularized covariance matrix
      const additionalLambda = 1e-3 * Math.pow(10, retryCount)
      const strengthenedCov = covarianceMatrix.map((row, i) =>
        row.map((val, j) => (i === j ? val + additionalLambda : val))
      )

      // Verify it's now positive definite
      if (isPositiveDefinite(strengthenedCov)) {
        const strengthenedDmat = to1Indexed(strengthenedCov)
        solution = qp.solveQP(strengthenedDmat, dvec, Amat, bvec, meq)
      } else {
        // If still not PD, skip this point
        break
      }
    }

    // Check if solution is valid (empty message often means success in quadprog)
    const isSuccess = solution.message === 'optimal' || solution.message === '' || !solution.message || solution.message === undefined

    if (!isSuccess) {
      continue
    }

    let weights = vecTo0Indexed(solution.solution)

    // Ensure non-negative
    weights = weights.map(w => Math.max(0, w))
    const sum = weights.reduce((s, w) => s + w, 0)
    if (sum > 0) {
      weights = weights.map(w => w / sum)
    } else {
      continue
    }

    const ret = portfolioReturn(weights, expectedReturns)
    const vol = portfolioVolatility(weights, covarianceMatrix)

    const weightsObj: PortfolioWeights = {}
    symbols.forEach((symbol, j) => {
      weightsObj[symbol] = weights[j]
    })

    frontier.push({
      expectedReturn: ret,
      volatility: vol,
      weights: weightsObj
    })
  }

  return frontier
}

/**
 * Calculate portfolio metrics
 */
export function calculatePortfolioMetrics(
  weights: PortfolioWeights,
  symbols: string[],
  expectedReturns: number[],
  covarianceMatrix: number[][],
  returnsMatrix: number[][],
  riskFreeRate: number
): PortfolioMetrics {
  const weightArray = symbols.map(s => weights[s] || 0)

  const expectedReturn = portfolioReturn(weightArray, expectedReturns)
  const volatility = portfolioVolatility(weightArray, covarianceMatrix)

  // Calculate portfolio returns time series
  const m = returnsMatrix[0].length
  const portfolioReturns: number[] = []
  for (let t = 0; t < m; t++) {
    let portfolioReturn = 0
    for (let i = 0; i < symbols.length; i++) {
      portfolioReturn += weightArray[i] * returnsMatrix[i][t]
    }
    portfolioReturns.push(portfolioReturn)
  }

  // riskFreeRate comes as percentage, convert to decimal
  const rfAnnual = riskFreeRate / 100

  const downsideDev = calculateDownsideDeviation(portfolioReturns, rfAnnual)

  const sharpe = sharpeRatio(expectedReturn, rfAnnual, volatility)
  const sortino = sortinoRatio(expectedReturn, rfAnnual, downsideDev)

  return {
    expectedReturn,
    volatility,
    sharpeRatio: sharpe,
    sortinoRatio: sortino,
    weights
  }
}

/**
 * Time-Weighted Return (TWR) Support
 * for adjusting cash deposits/withdrawals from performance metrics.
 */

export interface DailyPortfolioData {
  date: string
  value: number
  netFlow: number
}

export interface PortfolioReturnPoint {
  date: string
  return: number
}

/**
 * Calculate Daily TWR using "Flow at Start" logic
 * Best for "Auto-deposits" that participate in the day's return.
 * 
 * Formula: Return = (Value_End) / (Value_Start + Net_Flow) - 1
 */
export function calculateDailyTimeWeightedReturns(history: DailyPortfolioData[]): PortfolioReturnPoint[] {
  if (history.length < 2) return []

  const returns: PortfolioReturnPoint[] = []

  // Skip the very first day (inception) as it has no "Start Value" from yesterday
  // unless we treat flow as the start. But return requires a change.
  // We start from index 1.
  for (let i = 1; i < history.length; i++) {
    const today = history[i]
    const yesterday = history[i - 1]

    const valueEnd = today.value
    const valueStart = yesterday.value
    // We assume the flow happened specifically for this day (Today's flow)
    const netFlow = today.netFlow

    // Denominator: Start Capital + New Capital
    const investedCapital = valueStart + netFlow

    let dailyReturn = 0
    if (investedCapital !== 0) {
      dailyReturn = (valueEnd / investedCapital) - 1
    }

    returns.push({
      date: today.date,
      return: dailyReturn
    })
  }

  return returns
}

/**
 * Align Portfolio Returns with Benchmark Prices for Correlation/Beta
 * Performs an inner join on Date.
 */
function alignPortfolioAndBenchmark(
  portfolioReturns: PortfolioReturnPoint[],
  benchmarkPrices: PriceDataPoint[]
): { portfolioRestricted: number[], benchmarkRestricted: number[] } {
  // 1. Calculate Benchmark Returns
  // benchmarkPrices is sorted.
  const benchReturnsMap = new Map<string, number>()
  for (let i = 1; i < benchmarkPrices.length; i++) {
    const p0 = benchmarkPrices[i - 1].close
    const p1 = benchmarkPrices[i].close
    if (p0 > 0) {
      benchReturnsMap.set(benchmarkPrices[i].date, p1 / p0 - 1)
    }
  }

  // 2. Align
  const alignedPort: number[] = []
  const alignedBench: number[] = []

  for (const pr of portfolioReturns) {
    // Only includes dates present in BOTH
    if (benchReturnsMap.has(pr.date)) {
      alignedPort.push(pr.return)
      alignedBench.push(benchReturnsMap.get(pr.date)!)
    }
  }

  return { portfolioRestricted: alignedPort, benchmarkRestricted: alignedBench }
}

/**
 * Calculate Beta using Adjusted TWR Series
 */
export function calculatePortfolioBeta(
  portfolioReturns: PortfolioReturnPoint[],
  benchmarkPrices: PriceDataPoint[]
): number | null {
  const { portfolioRestricted, benchmarkRestricted } = alignPortfolioAndBenchmark(portfolioReturns, benchmarkPrices)

  if (portfolioRestricted.length < 20) return null // Insufficient overlapping data

  // Beta = Cov(Rp, Rb) / Var(Rb)
  const cov = covariance(portfolioRestricted, benchmarkRestricted)
  const varB = variance(benchmarkRestricted)

  if (varB === 0) return null
  return cov / varB
}

/**
 * Calculate Sharpe Ratio using Adjusted TWR Series
 */
export function calculatePortfolioSharpeRatio(
  portfolioReturns: PortfolioReturnPoint[],
  riskFreeRateAnnualPercent: number
): number {
  if (portfolioReturns.length === 0) return 0

  const returns = portfolioReturns.map(p => p.return)
  const avgDailyRet = returns.reduce((a, b) => a + b, 0) / returns.length

  // Std Dev
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgDailyRet, 2), 0) / returns.length
  const dailyVol = Math.sqrt(variance)

  // Annualize
  const annualRet = avgDailyRet * 252
  // OR Geometric: Math.pow(1 + avgDailyRet, 252) - 1

  const annualVol = dailyVol * Math.sqrt(252)
  const rf = riskFreeRateAnnualPercent / 100

  if (annualVol === 0) return 0

  return (annualRet - rf) / annualVol
}

// Helpers duplicated/adapted to avoid circular deps if needed, 
// or could import from metrics-calculations if clean.
// Since we are in portfolio-optimization.ts, we already have some helpers but let's just add simple ones here to be self-contained for these new functions.
function mean(data: number[]) {
  return data.reduce((a, b) => a + b, 0) / data.length
}
function variance(data: number[]) {
  const mu = mean(data)
  return data.reduce((a, b) => a + Math.pow(b - mu, 2), 0) / data.length
}
function covariance(data1: number[], data2: number[]) {
  const mu1 = mean(data1)
  const mu2 = mean(data2)
  return data1.reduce((acc, val, i) => acc + (val - mu1) * (data2[i] - mu2), 0) / data1.length
}

