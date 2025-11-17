/**
 * Theme-aware color utilities for Chart.js
 * Uses CSS variables that adapt to light/dark mode
 */

/**
 * Get a CSS variable value from the computed styles
 */
function getCSSVariable(variable: string): string {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
}

/**
 * Convert oklch color to rgb
 * This is a simplified conversion - for production, use a proper color library
 */
function oklchToRgb(oklch: string): string {
  // Extract oklch values
  const match = oklch.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/)
  if (!match) return oklch
  
  const [, l, c, h] = match.map(Number)
  
  // Simplified conversion - for production use a proper library
  // This is a basic approximation
  const lightness = l
  const chroma = c
  const hue = h
  
  // Convert to RGB (simplified - use a proper library in production)
  // For now, return a reasonable approximation
  if (lightness < 0.5) {
    // Dark mode colors
    return `rgb(${Math.round(lightness * 255)}, ${Math.round(lightness * 255)}, ${Math.round(lightness * 255)})`
  } else {
    // Light mode colors
    return `rgb(${Math.round(lightness * 255)}, ${Math.round(lightness * 255)}, ${Math.round(lightness * 255)})`
  }
}

/**
 * Get theme-aware colors for charts
 */
export function getThemeColors() {
  const isDark = typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
  
  // Use standard CSS variables that work with Tailwind's theme system
  const foreground = isDark ? 'rgb(250, 250, 250)' : 'rgb(23, 23, 23)'
  const mutedForeground = isDark ? 'rgb(163, 163, 163)' : 'rgb(115, 115, 115)'
  const border = isDark ? 'rgb(64, 64, 64)' : 'rgb(229, 229, 229)'
  const grid = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
  const gridStrong = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'
  const background = isDark ? 'rgb(23, 23, 23)' : 'rgb(255, 255, 255)'
  
  return {
    foreground,
    mutedForeground,
    border,
    grid,
    gridStrong,
    background,
    // Chart-specific colors that work in both modes
    price: isDark ? 'rgb(96, 165, 250)' : 'rgb(37, 99, 235)', // Blue
    fairValue: isDark ? 'rgb(251, 146, 60)' : 'rgb(234, 88, 12)', // Orange
    crosshair: isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
    // Risk metric colors
    sVal: isDark ? 'rgb(96, 165, 250)' : 'rgb(59, 130, 246)', // Blue
    sRel: isDark ? 'rgb(74, 222, 128)' : 'rgb(34, 197, 94)', // Green
    riskEq: isDark ? 'rgb(248, 113, 113)' : 'rgb(239, 68, 68)', // Red
  }
}

/**
 * Get grid color based on tick value (for reference lines)
 */
export function getGridColor(value: number, isReferenceLine: boolean = false): string {
  const colors = getThemeColors()
  return isReferenceLine ? colors.gridStrong : colors.grid
}




