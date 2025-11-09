// Chart Dataset Creation Helpers

import type { ChartData } from "chart.js"

/**
 * Create a basic line dataset
 */
export function createLineDataset(
  label: string,
  data: (number | null)[],
  color: string,
  options?: {
    borderWidth?: number
    borderDash?: number[]
    pointRadius?: number
    fill?: boolean
    tension?: number
  },
) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: `${color}20`,
    borderWidth: options?.borderWidth ?? 2,
    borderDash: options?.borderDash,
    fill: options?.fill ?? false,
    pointRadius: options?.pointRadius ?? 0,
    tension: options?.tension ?? 0.1,
  }
}

/**
 * Create dataset for price line
 */
export function createPriceDataset(data: number[], dates: Date[]) {
  // Color will be overridden by component using theme colors
  return createLineDataset("ETH/USD Price", data, "rgb(37, 99, 235)", {
    borderWidth: 2,
    pointRadius: 0,
  })
}

/**
 * Create dataset for fair value line
 */
export function createFairValueDataset(data: number[]) {
  // Color will be overridden by component using theme colors
  return createLineDataset("Fair Value", data, "rgb(234, 88, 12)", {
    borderWidth: 2,
    borderDash: [5, 5],
    pointRadius: 0,
  })
}

/**
 * Create dataset for sigma bands
 */
export function createSigmaBandDataset(
  label: string,
  upperData: number[],
  lowerData: number[],
  color: string,
  dashPattern: number[] = [2, 2],
) {
  return [
    createLineDataset(`Upper Band (${label})`, upperData, color, {
      borderWidth: 1,
      borderDash: dashPattern,
      pointRadius: 0,
    }),
    createLineDataset(`Lower Band (${label})`, lowerData, color, {
      borderWidth: 1,
      borderDash: dashPattern,
      pointRadius: 0,
    }),
  ]
}

/**
 * Create dataset for trendlines
 */
export function createTrendlineDataset(
  label: string,
  data: number[],
  color: string,
  isDashed: boolean = true,
) {
  return createLineDataset(label, data, color, {
    borderWidth: 2,
    borderDash: isDashed ? [5, 5] : undefined,
    pointRadius: 0,
  })
}

/**
 * Create dataset for extreme points (peaks/troughs)
 */
export function createExtremePointsDataset(
  label: string,
  data: (number | null)[],
  color: string,
  pointStyle: "circle" | "triangle" = "triangle",
  rotation: number = 0,
) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color,
    pointStyle,
    pointRadius: 6,
    pointRotation: rotation,
    showLine: false,
  }
}


