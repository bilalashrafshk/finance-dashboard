// Common Chart.js Configuration Helpers

import type { ChartOptions } from "chart.js"
import { getThemeColors } from "./theme-colors"

/**
 * Common time scale configuration for charts
 */
export function createTimeScaleConfig(unit: "day" | "week" | "month" = "month") {
  const colors = getThemeColors()
  return {
    type: "time" as const,
    time: {
      unit,
    },
    title: {
      display: true,
      text: "Date",
      color: colors.foreground,
    },
    ticks: {
      color: colors.foreground,
    },
    grid: {
      color: colors.grid,
    },
  }
}

/**
 * Common logarithmic scale configuration
 */
export function createLogScaleConfig(title: string) {
  const colors = getThemeColors()
  return {
    type: "logarithmic" as const,
    title: {
      display: true,
      text: title,
      color: colors.foreground,
    },
    ticks: {
      color: colors.foreground,
    },
    grid: {
      color: colors.grid,
    },
  }
}

/**
 * Common linear scale configuration with custom range
 */
export function createLinearScaleConfig(min: number, max: number, stepSize?: number) {
  const colors = getThemeColors()
  return {
    display: true,
    min,
    max,
    title: {
      color: colors.foreground,
    },
    ticks: {
      stepSize,
      padding: 8,
      color: colors.foreground,
      callback: (value: any) => {
        const num = Number(value)
        return num >= 0 && num <= 1 ? num.toFixed(1) : ""
      },
    },
    grid: {
      color: (context: any) => {
        const value = context.tick.value as number
        if (value === 0.2 || value === 0.5 || value === 0.8) {
          return colors.gridStrong // Reference lines
        }
        return colors.grid // Regular grid
      },
      lineWidth: (context: any) => {
        const value = context.tick.value as number
        return value === 0.2 || value === 0.5 || value === 0.8 ? 2 : 1
      },
    },
  }
}

/**
 * Common chart options for time series charts
 */
export function createTimeSeriesChartOptions(
  title: string,
  yAxisTitle: string,
  yAxisType: "linear" | "logarithmic" = "logarithmic",
): ChartOptions<"line"> {
  const colors = getThemeColors()
  const timeScaleConfig = createTimeScaleConfig()
  
  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        ...timeScaleConfig,
        ticks: {
          ...timeScaleConfig.ticks,
          color: colors.foreground,
        },
        grid: {
          color: colors.grid,
        },
      },
      y: yAxisType === "logarithmic" ? createLogScaleConfig(yAxisTitle) : createLinearScaleConfig(0, 1),
    },
    plugins: {
      legend: {
        display: true,
        position: "top" as const,
        labels: {
          color: colors.foreground,
        },
      },
      tooltip: {
        mode: "index",
        intersect: false,
        backgroundColor: colors.background,
        titleColor: colors.foreground,
        bodyColor: colors.foreground,
        borderColor: colors.border,
        borderWidth: 1,
      },
    },
    interaction: {
      mode: "nearest",
      axis: "x",
      intersect: false,
    },
  }
}

/**
 * Chart options for risk metrics (0-1 scale)
 */
export function createRiskMetricsChartOptions(title: string): ChartOptions<"line"> {
  const colors = getThemeColors()
  
  return {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        top: 20,
        bottom: 20,
        left: 10,
        right: 10,
      },
    },
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: title,
        font: { size: 14, weight: "bold" },
        padding: { bottom: 15 },
        color: colors.foreground,
      },
      tooltip: {
        mode: "index",
        intersect: false,
        backgroundColor: colors.background,
        titleColor: colors.foreground,
        bodyColor: colors.foreground,
        borderColor: colors.border,
        borderWidth: 1,
        callbacks: {
          label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(3)}`,
          afterLabel: (context) => {
            const value = context.parsed.y
            if (value <= 0.3) return "Zone: Low Risk (Green)"
            if (value <= 0.7) return "Zone: Medium Risk (Yellow)"
            return "Zone: High Risk (Red)"
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        grid: { 
          display: false,
          color: colors.grid,
        },
        ticks: {
          maxRotation: 45,
          padding: 5,
          color: colors.foreground,
        },
      },
      y: createLinearScaleConfig(-0.05, 1.05, 0.2),
    },
    interaction: {
      mode: "nearest",
      axis: "x",
      intersect: false,
    },
  }
}


