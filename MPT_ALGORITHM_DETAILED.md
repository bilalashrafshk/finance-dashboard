# Modern Portfolio Theory (MPT) Algorithm - Detailed Documentation

## Overview

This document describes the exact algorithm implementation for portfolio optimization using Modern Portfolio Theory. The current implementation uses **Projected Gradient Descent** with simplex constraints.

---

## 1. Data Preparation

### Input Data
- **Price Data**: Array of `{date: string, close: number}` for each asset
- **Assets**: List of asset symbols (e.g., ["BOP", "OGDC", "UBL", "HBL"])
- **Time Frame**: Historical data period (1Y, 2Y, 3Y, 5Y, or ALL)

### Step 1: Calculate Daily Returns
```typescript
function calculateDailyReturns(prices: number[]): number[] {
  const returns: number[] = []
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1])) // Log returns
    }
  }
  return returns
}
```

**Formula**: `r_t = ln(P_t / P_{t-1})`

### Step 2: Align Returns Across Assets
- Find common trading dates across all assets
- Filter to dates where ALL assets have data
- Minimum requirement: 30 common trading days

### Step 3: Calculate Expected Returns (Annualized)
```typescript
function calculateMeanReturn(returns: number[]): number {
  const meanDaily = returns.reduce((sum, r) => sum + r, 0) / returns.length
  return meanDaily * 250 // Annualize (250 trading days)
}
```

**Formula**: `μ_annual = μ_daily × 250`

### Step 4: Calculate Covariance Matrix (Annualized)
```typescript
function calculateCovarianceMatrix(returnsMatrix: number[][]): number[][] {
  const n = returnsMatrix.length // number of assets
  const m = returnsMatrix[0].length // number of observations
  
  // Calculate mean returns for each asset
  const meanReturns = returnsMatrix.map(returns => {
    return returns.reduce((sum, r) => sum + r, 0) / returns.length
  })
  
  // Calculate covariance matrix
  const cov: number[][] = Array(n).fill(0).map(() => Array(n).fill(0))
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0
      for (let k = 0; k < m; k++) {
        sum += (returnsMatrix[i][k] - meanReturns[i]) * 
               (returnsMatrix[j][k] - meanReturns[j])
      }
      // Sample covariance, then annualize
      cov[i][j] = (sum / (m - 1)) * 250
    }
  }
  
  return cov
}
```

**Formula**: 
- `Cov(i,j) = (1/(m-1)) × Σ(r_i,t - μ_i)(r_j,t - μ_j)`
- `Σ_annual = Σ_daily × 250`

---

## 2. Portfolio Metrics Calculations

### Portfolio Return
```typescript
function portfolioReturn(weights: number[], expectedReturns: number[]): number {
  return dotProduct(weights, expectedReturns)
}
```

**Formula**: `R_p = w^T @ μ = Σ(w_i × μ_i)`

### Portfolio Variance
```typescript
function portfolioVariance(weights: number[], covarianceMatrix: number[][]): number {
  // Compute Σ @ w first
  const cov_w = matrixVectorMultiply(covarianceMatrix, weights)
  // Then compute w^T @ (Σ @ w) = dot product
  return dotProduct(weights, cov_w)
}
```

**Formula**: `σ_p² = w^T @ Σ @ w`

### Portfolio Volatility
```typescript
function portfolioVolatility(weights: number[], covarianceMatrix: number[][]): number {
  return Math.sqrt(portfolioVariance(weights, covarianceMatrix))
}
```

**Formula**: `σ_p = sqrt(w^T @ Σ @ w)`

### Sharpe Ratio
```typescript
const sharpeRatio = (expectedReturn - riskFreeRate) / volatility
```

**Formula**: `Sharpe = (R_p - R_f) / σ_p`

### Sortino Ratio
```typescript
function calculateDownsideDeviation(portfolioReturns: number[], riskFreeRate: number): number {
  // Filter to negative excess returns only
  const downsideReturns = portfolioReturns
    .map(r => Math.min(0, r - riskFreeRate / 250))
    .filter(r => r < 0)
  
  // Calculate standard deviation of downside returns
  const meanDownside = downsideReturns.reduce((sum, r) => sum + r, 0) / downsideReturns.length
  const variance = downsideReturns.reduce((sum, r) => 
    sum + Math.pow(r - meanDownside, 2), 0) / downsideReturns.length
  
  return Math.sqrt(variance) * Math.sqrt(250) // Annualize
}
```

**Formula**: 
- `σ_downside = sqrt((1/N) × Σ min(0, r_t - R_f)²) × sqrt(250)`
- `Sortino = (R_p - R_f) / σ_downside`

---

## 3. Optimization Algorithm: Projected Gradient Descent

### Constraints
- **Equality Constraint**: `Σ w_i = 1` (weights sum to 100%)
- **Inequality Constraint**: `w_i ≥ 0` (long-only, no short selling)

### Algorithm Pseudocode

```
function optimize(objective, gradient, constraints, initialGuess):
  w = normalize(initialGuess)  // Ensure sum = 1, w >= 0
  bestW = w
  bestObj = objective(w)
  learningRate = 0.1
  
  for iter = 1 to maxIterations (2000):
    // 1. Calculate gradient
    grad = gradient(w)
    
    // 2. Project gradient onto constraint space
    // Remove component along [1,1,...,1] direction (sum constraint)
    gradSum = mean(grad)
    projectedGrad = grad - gradSum
    
    // 3. Update weights
    newW = w - learningRate × projectedGrad
    
    // 4. Apply bounds: w >= 0
    newW = max(0, newW) for each component
    
    // 5. Project onto simplex: normalize to sum = 1
    sum = sum(newW)
    if sum > 0:
      newW = newW / sum
    else:
      newW = equalWeights()  // Reset if sum too small
    
    // 6. Check if improved
    newObj = objective(newW)
    if newObj < bestObj:
      bestObj = newObj
      bestW = newW
      learningRate = min(learningRate × 1.1, 1.0)  // Increase LR
    else:
      learningRate = learningRate × 0.9  // Decrease LR
      if learningRate < 1e-10:
        break
    
    // 7. Check convergence
    change = ||newW - w||
    if change < tolerance (1e-8):
      break
    
    w = newW
  
  // Final normalization
  finalSum = sum(bestW)
  if finalSum > 0:
    bestW = max(0, bestW) / finalSum
  else:
    bestW = equalWeights()
  
  return bestW
```

### Key Implementation Details

1. **Gradient Projection**: Removes the component that would violate the sum constraint
2. **Simplex Projection**: After gradient step, projects back onto the simplex (sum=1, w≥0)
3. **Adaptive Learning Rate**: Increases when improving, decreases when not
4. **Best Solution Tracking**: Keeps track of best solution found during optimization

---

## 4. Specific Optimization Problems

### 4.1 Minimum Variance Portfolio

**Objective**: Minimize portfolio variance

```typescript
objective(w) = w^T @ Σ @ w

gradient(w) = 2 × Σ @ w
```

**Mathematical Formulation**:
- Minimize: `w^T @ Σ @ w`
- Subject to: `Σ w_i = 1`, `w_i ≥ 0`

### 4.2 Maximum Sharpe Portfolio

**Objective**: Maximize Sharpe ratio (minimize negative Sharpe)

```typescript
objective(w) = -(R_p - R_f) / σ_p
             = -(w^T @ μ - rf) / sqrt(w^T @ Σ @ w)

gradient(w) = -[μ / σ_p - (R_p - rf) × (Σ @ w) / (σ_p³)]
```

**Mathematical Formulation**:
- Maximize: `(w^T @ μ - rf) / sqrt(w^T @ Σ @ w)`
- Subject to: `Σ w_i = 1`, `w_i ≥ 0`

### 4.3 Maximum Sortino Portfolio

**Objective**: Maximize Sortino ratio

```typescript
objective(w) = -(R_p - R_f) / σ_downside

gradient(w) = numerical_gradient (too complex for analytical)
```

**Approach**: Uses numerical gradient approximation (finite differences)

### 4.4 Maximum Return Portfolio

**Objective**: Maximize expected return

```typescript
// Simply allocate 100% to asset with highest expected return
maxIndex = argmax(μ)
weights[maxIndex] = 1
weights[others] = 0
```

### 4.5 Efficient Frontier

**Objective**: For each target return, minimize variance

```typescript
// For each targetReturn in [minReturn, maxReturn]:
  objective(w) = w^T @ Σ @ w + penalty × (w^T @ μ - targetReturn)²
  
  // Try multiple penalty weights: 1, 10, 100, 1000
  // Accept solution if |actualReturn - targetReturn| < 10% of targetReturn
```

**Mathematical Formulation**:
- For each `R_target`:
  - Minimize: `w^T @ Σ @ w`
  - Subject to: `w^T @ μ = R_target`, `Σ w_i = 1`, `w_i ≥ 0`

**Current Implementation**: Uses penalty method with multiple penalty weights

---

## 5. Current Issues & Potential Fixes

### Issue 1: Portfolio Weights Not Summing to 100%

**Symptom**: Weights show as 1.00%, 0.00%, 0.00%, 0.00% instead of proper percentages

**Root Cause**: 
- Weights are stored as decimals (0.01 = 1%) but displayed incorrectly
- OR normalization is failing

**Fix**:
```typescript
// In portfolio-optimization.ts, ensure final weights are properly normalized:
const finalSum = bestW.reduce((a, b) => a + b, 0)
if (Math.abs(finalSum - 1.0) > 1e-6) {
  console.warn(`Weights sum to ${finalSum}, normalizing...`)
  bestW = bestW.map(x => x / finalSum)
}

// In mpt-portfolio-view.tsx, ensure display uses correct format:
{formatPercentage(weight)} // Should show as "25.00%" not "0.25%"
```

### Issue 2: Efficient Frontier Curve Not Showing

**Symptom**: Only optimization points visible, no curve

**Root Cause**:
- Efficient frontier generation might be failing
- Chart data structure might be incorrect
- Points might be too close together

**Fix**:
```typescript
// Check if efficientFrontier array has data:
console.log('Frontier points:', efficientFrontier.length)

// Ensure frontier is sorted by volatility for smooth line:
const sortedFrontier = [...efficientFrontier].sort((a, b) => a.volatility - b.volatility)

// Check if points are valid:
efficientFrontier.forEach((point, i) => {
  if (isNaN(point.volatility) || isNaN(point.expectedReturn)) {
    console.error(`Invalid point ${i}:`, point)
  }
})
```

### Issue 3: Optimization Not Converging

**Symptom**: Weights stuck at initial guess or extreme values

**Root Cause**:
- Learning rate too small/large
- Gradient calculation incorrect
- Constraint handling breaking optimization

**Fix**:
```typescript
// Add logging to optimizer:
console.log(`Iteration ${iter}: obj=${objective(w).toFixed(6)}, sum=${w.reduce((a,b)=>a+b).toFixed(6)}`)
console.log(`Weights:`, w.map(x => x.toFixed(4)))
console.log(`Gradient:`, grad.map(x => x.toFixed(4)))

// Try different learning rates:
const learningRates = [0.01, 0.05, 0.1, 0.5, 1.0]
for (const lr of learningRates) {
  const result = optimize(..., lr)
  if (isValid(result)) return result
}
```

### Issue 4: Efficient Frontier Penalty Method Not Working

**Current Approach**: Penalty method with multiple penalty weights

**Better Approach**: Use Lagrange multipliers or sequential quadratic programming

**Alternative Implementation**:
```typescript
// For each target return, solve:
// min w^T @ Σ @ w
// s.t. w^T @ μ = R_target
//      Σ w_i = 1
//      w_i >= 0

// Use analytical solution for unconstrained case, then project:
// w* = (Σ^-1 @ μ) / (1^T @ Σ^-1 @ μ)  [if no bounds]
// Then project onto feasible set
```

---

## 6. Recommended Improvements

### 6.1 Use Analytical Solution for Minimum Variance

For minimum variance portfolio, there's an analytical solution:

```typescript
// If no bounds (short selling allowed):
// w* = (Σ^-1 @ 1) / (1^T @ Σ^-1 @ 1)

// With bounds, use iterative projection:
// 1. Start with analytical solution
// 2. Project onto w >= 0
// 3. Renormalize to sum = 1
// 4. Repeat until convergence
```

### 6.2 Better Efficient Frontier Generation

Instead of penalty method, use:

1. **Sequential Quadratic Programming (SQP)**
2. **Interior Point Method**
3. **Dual Formulation** with Lagrange multipliers

### 6.3 Add Validation

```typescript
function validateWeights(weights: number[], symbols: string[]): boolean {
  const sum = weights.reduce((a, b) => a + b, 0)
  const allNonNegative = weights.every(w => w >= -1e-6) // Allow small numerical errors
  const allFinite = weights.every(w => isFinite(w))
  
  if (Math.abs(sum - 1.0) > 1e-4) {
    console.error(`Weights sum to ${sum}, expected 1.0`)
    return false
  }
  
  if (!allNonNegative) {
    console.error('Some weights are negative:', weights)
    return false
  }
  
  if (!allFinite) {
    console.error('Some weights are not finite:', weights)
    return false
  }
  
  return true
}
```

### 6.4 Add Debugging Output

```typescript
function debugOptimization(weights: number[], expectedReturns: number[], 
                          covarianceMatrix: number[][], symbols: string[]) {
  console.log('=== Optimization Debug ===')
  console.log('Weights:', weights.map((w, i) => `${symbols[i]}: ${(w*100).toFixed(2)}%`))
  console.log('Sum:', weights.reduce((a,b) => a+b))
  console.log('Expected Return:', portfolioReturn(weights, expectedReturns))
  console.log('Volatility:', portfolioVolatility(weights, covarianceMatrix))
  console.log('Variance:', portfolioVariance(weights, covarianceMatrix))
}
```

---

## 7. Testing Checklist

- [ ] Weights sum to exactly 1.0 (within numerical precision)
- [ ] All weights are non-negative
- [ ] Minimum variance portfolio has lowest volatility
- [ ] Maximum Sharpe portfolio has highest Sharpe ratio
- [ ] Efficient frontier curve is smooth and continuous
- [ ] All optimization points lie on or near efficient frontier
- [ ] Results are consistent across different time frames
- [ ] Results are consistent with different numbers of assets (2, 3, 4, 5+)

---

## 8. Mathematical References

- **Markowitz (1952)**: "Portfolio Selection", Journal of Finance
- **Sharpe (1966)**: "Mutual Fund Performance", Journal of Business
- **Sortino & Price (1994)**: "Performance Measurement in a Downside Risk Framework", Journal of Investing

---

## 9. Code Locations

- **Main Algorithm**: `lib/algorithms/portfolio-optimization.ts`
- **Matrix Utilities**: `lib/algorithms/matrix-utils.ts`
- **UI Component**: `components/asset-screener/mpt-portfolio-view.tsx`
- **Integration**: `app/asset-screener/page.tsx`

---

This document provides the complete algorithm specification. Use it to debug and improve the implementation.

