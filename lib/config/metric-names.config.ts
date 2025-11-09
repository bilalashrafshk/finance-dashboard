/**
 * Metric Display Names Configuration
 * 
 * Intuitive, user-friendly names for all metrics displayed in the UI.
 * These names make the dashboard more accessible and understandable.
 */

export const METRIC_NAMES = {
  // Core Metrics
  sVal: {
    short: "Valuation Risk",
    long: "Valuation Risk",
    description: "Measures how overvalued or undervalued ETH is relative to its calculated fair value",
  },
  sRel: {
    short: "Relative Risk to Bitcoin",
    long: "Relative Risk to Bitcoin",
    description: "Measures ETH's risk relative to Bitcoin based on trendline analysis",
  },
  riskEq: {
    short: "Overall Risk",
    long: "Composite Risk Score",
    description: "Combined risk metric weighing both valuation risk and relative risk to Bitcoin",
  },
  riskValHeavy: {
    short: "Valuation-Focused Risk",
    long: "Valuation-Weighted Risk Score",
    description: "Risk score emphasizing valuation risk over relative risk to Bitcoin",
  },
  riskRelHeavy: {
    short: "Relative-Focused Risk",
    long: "Relative-Weighted Risk Score",
    description: "Risk score emphasizing relative risk to Bitcoin over valuation risk",
  },
  fairValue: {
    short: "Fair Value",
    long: "Calculated Fair Value",
    description: "Theoretical fair value based on log-regression model",
  },
  price: {
    short: "ETH Price",
    long: "Ethereum Price (USD)",
    description: "Current ETH price in USD",
  },
  ethBtc: {
    short: "ETH/BTC",
    long: "Ethereum to Bitcoin Ratio",
    description: "Current ETH price relative to BTC",
  },
} as const

/**
 * Badge labels for metric values
 */
export const METRIC_LABELS = {
  sVal: {
    high: "Overvalued",
    medium: "Fair Value",
    low: "Undervalued",
  },
  sRel: {
    high: "Strong",
    medium: "Neutral",
    low: "Weak",
  },
  riskEq: {
    high: "High Risk",
    medium: "Medium Risk",
    low: "Low Risk",
  },
} as const

