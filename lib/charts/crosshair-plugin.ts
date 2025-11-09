// Chart.js plugin for synchronized vertical crosshair line

export interface CrosshairPluginOptions {
  hoveredDate: Date | null
  color?: string
  width?: number
  dash?: number[]
}

export const crosshairPlugin = {
  id: "crosshair",
  afterDraw: (chart: any) => {
    const options = chart.options.plugins?.crosshair as CrosshairPluginOptions | undefined
    if (!options || !options.hoveredDate) return

    const ctx = chart.ctx
    const chartArea = chart.chartArea
    const xScale = chart.scales.x

    if (!xScale || !chartArea) return

    // Convert date to pixel position
    const dateValue = options.hoveredDate.getTime()
    const xPos = xScale.getPixelForValue(dateValue)

    // Only draw if within chart area
    if (xPos < chartArea.left || xPos > chartArea.right) return

    ctx.save()
    ctx.strokeStyle = options.color || "rgba(0, 0, 0, 0.5)"
    ctx.lineWidth = options.width || 1
    ctx.setLineDash(options.dash || [5, 5])
    ctx.beginPath()
    ctx.moveTo(xPos, chartArea.top)
    ctx.lineTo(xPos, chartArea.bottom)
    ctx.stroke()
    ctx.restore()
  },
}

