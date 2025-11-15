/**
 * Application Configuration
 * 
 * Centralized configuration for all hardcoded parameters used throughout the application.
 * Modify these values to adjust default behavior without searching through code files.
 */

import type { BandParams, RiskWeights } from "@/lib/algorithms/fair-value-bands"

/**
 * Fair Value Band Parameters
 * 
 * These parameters control the parametric log-regression model (Pine script style)
 * used to calculate fair value bands for ETH/USD price analysis.
 */
export const DEFAULT_FAIR_VALUE_BAND_PARAMS: BandParams = {
  basePrice: 0.16,
  baseCoeff: 1.7,
  growthCoeff: 3.22,
  startYear: 2014,
  startMonth: 12,
  startDay: 3,
  mainMult: 1.0,
  upperMult: 1.35,
  lowerMult: 0.7,
  offset: 0.0,
}

/**
 * Risk Metric Weights
 * 
 * Default weights for calculating Risk_eq from S_val and S_rel.
 * These weights are normalized to sum to 1.0 in the calculation.
 */
export const DEFAULT_RISK_WEIGHTS: RiskWeights = {
  sValWeight: 0.5,
  sRelWeight: 0.5,
}

/**
 * Risk Variant Weights
 * 
 * Hardcoded weights for alternative risk calculations:
 * - Risk_valHeavy: Emphasizes absolute valuation (S_val)
 * - Risk_relHeavy: Emphasizes relative strength (S_rel)
 */
export const RISK_VARIANT_WEIGHTS = {
  valHeavy: {
    sValWeight: 0.7,
    sRelWeight: 0.3,
  },
  relHeavy: {
    sValWeight: 0.3,
    sRelWeight: 0.7,
  },
} as const

/**
 * Risk Thresholds
 * 
 * Threshold values used throughout the UI to determine badge colors and labels:
 * - Values > highThreshold: High risk/Overvalued/Strong (destructive/red)
 * - Values < lowThreshold: Low risk/Undervalued/Weak (default/green)
 * - Values between: Medium risk/Fair/Neutral (secondary/yellow)
 */
export const RISK_THRESHOLDS = {
  high: 0.7,
  low: 0.3,
} as const

/**
 * S_val Cutoff Date Configuration
 * 
 * Configuration for default S_val cutoff date calculation.
 * The default cutoff is set to the last date of the specified year in the data.
 */
export const S_VAL_CUTOFF_CONFIG = {
  defaultYear: 2024,
} as const



