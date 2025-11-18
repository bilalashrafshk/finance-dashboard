// Centralized utilities for portfolio chart configurations

import { getThemeColors } from "./theme-colors"

export interface YAxisScaleConfig {
  type: 'linear' | 'logarithmic'
  display: boolean
  grid: {
    color: string
  }
  ticks: {
    color: string
    callback: (value: any) => string
  }
  title?: {
    display: boolean
    text: string
  }
}

/**
 * Creates a y-axis scale configuration for portfolio charts
 * Supports both linear and logarithmic scales, with percentage or currency formatting
 */
export function createYAxisScaleConfig(options: {
  useLogScale: boolean
  isPercentage: boolean
  currency?: string
  title?: string
}): YAxisScaleConfig {
  const colors = getThemeColors()
  const { useLogScale, isPercentage, currency = 'USD', title } = options

  return {
    type: useLogScale ? 'logarithmic' : 'linear',
    display: true,
    grid: {
      color: colors.grid,
    },
    ticks: {
      color: colors.foreground,
      callback: (value: any) => {
        const num = Number(value)
        if (isPercentage) {
          return `${num.toFixed(0)}%`
        } else {
          // Currency formatting
          if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M ${currency}`
          if (num >= 1000) return `${(num / 1000).toFixed(1)}K ${currency}`
          return `${num.toFixed(0)} ${currency}`
        }
      },
    },
    ...(title && {
      title: {
        display: true,
        text: title,
      },
    }),
  }
}

/**
 * Creates a y-axis scale configuration for asset price charts
 * Supports both linear and logarithmic scales, with percentage or currency formatting
 */
export function createAssetPriceYAxisScaleConfig(options: {
  useLogScale: boolean
  isPercentage: boolean
  currency: string
  assetType?: string
  formatCurrency: (value: number, currency: string, decimals?: number) => string
  theme?: string
}): YAxisScaleConfig {
  const colors = getThemeColors()
  const { useLogScale, isPercentage, currency, assetType, formatCurrency, theme } = options

  return {
    type: useLogScale ? 'logarithmic' : 'linear',
    display: true,
    grid: {
      color: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    ticks: {
      color: colors.foreground,
      callback: (value: any) => {
        if (isPercentage) {
          return `${value.toFixed(0)}%`
        }
        return formatCurrency(value, currency, assetType === 'crypto' ? 4 : 2)
      },
    },
  }
}

