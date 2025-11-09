// Composite Risk Metrics Calculation

import { RISK_VARIANT_WEIGHTS } from "@/lib/config/app.config"

export interface RiskWeights {
  sValWeight: number // Weight for S_val in Risk_eq (default: 0.5)
  sRelWeight: number // Weight for S_rel in Risk_eq (default: 0.5)
}

/**
 * Calculate composite risk metrics from S_val and S_rel
 */
export function calculateRiskMetrics(
  sVal: number[],
  sRel: number[],
  weights: RiskWeights,
): {
  riskEq: number[]
  riskValHeavy: number[]
  riskRelHeavy: number[]
} {
  // Normalize weights to ensure they sum to 1
  const totalWeight = weights.sValWeight + weights.sRelWeight
  const normalizedSValWeight = weights.sValWeight / totalWeight
  const normalizedSRelWeight = weights.sRelWeight / totalWeight

  // Composite using user-defined weights
  const riskEq = sVal.map((val, i) => normalizedSValWeight * val + normalizedSRelWeight * sRel[i])

  // Value-heavy composite using configured weights
  const riskValHeavy = sVal.map(
    (val, i) => RISK_VARIANT_WEIGHTS.valHeavy.sValWeight * val + RISK_VARIANT_WEIGHTS.valHeavy.sRelWeight * sRel[i],
  )

  // Relative-heavy composite using configured weights
  const riskRelHeavy = sVal.map(
    (val, i) => RISK_VARIANT_WEIGHTS.relHeavy.sValWeight * val + RISK_VARIANT_WEIGHTS.relHeavy.sRelWeight * sRel[i],
  )

  return {
    riskEq,
    riskValHeavy,
    riskRelHeavy,
  }
}

