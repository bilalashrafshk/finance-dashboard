"use client"

import { useMemo } from "react"
import { StockListPopover } from "./stock-list-popover"

export interface MarketHeatmapStock {
  symbol: string
  name: string
  marketCap: number
  price: number
  previousPrice: number | null
  changePercent: number | null
  sector: string | null
  industry: string | null
}

export type SizeMode = 'marketCap' | 'marketCapChange' | 'absoluteChange'

interface TreemapProps {
  stocks: MarketHeatmapStock[]
  width: number
  height: number
  sizeMode?: SizeMode
  sectorPerformance?: { name: string; change: number }[]
}

interface SectorGroup {
  sector: string
  stocks: MarketHeatmapStock[]
  totalValue: number
  bounds: { x: number; y: number; width: number; height: number }
}

interface StockNode {
  stock: MarketHeatmapStock
  bounds: { x: number; y: number; width: number; height: number }
  sector: string
}

/**
 * Color scheme: Red for negative, Green for positive
 * Intensity based on percentage change magnitude
 */
function getColorForChange(changePercent: number | null): string {
  if (changePercent === null) {
    return 'rgba(156, 163, 175, 0.7)' // Gray for no data
  }

  // Normalize change to 0-1 range for intensity (cap at ±10% for color calculation)
  const normalizedChange = Math.min(Math.abs(changePercent) / 10, 1)

  if (changePercent > 0) {
    // Green gradient: light green (small change) to dark green (large change)
    const r = Math.floor(34 + (22 - 34) * normalizedChange) // from 34 to 22
    const g = Math.floor(197 + (163 - 197) * normalizedChange) // from 197 to 163
    const b = Math.floor(94 + (74 - 94) * normalizedChange) // from 94 to 74
    return `rgba(${r}, ${g}, ${b}, 0.85)`
  } else if (changePercent < 0) {
    // Red gradient: light red (small change) to dark red (large change)
    const r = Math.floor(239 + (185 - 239) * normalizedChange) // from 239 to 185
    const g = Math.floor(68 + (28 - 68) * normalizedChange) // from 68 to 28
    const b = Math.floor(68 + (28 - 68) * normalizedChange) // from 68 to 28
    return `rgba(${r}, ${g}, ${b}, 0.85)`
  } else {
    // Zero change: neutral gray
    return 'rgba(156, 163, 175, 0.7)'
  }
}

// --- Squarified Treemap Implementation ---

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface TreemapItem {
  value: number
  data: any
}

interface TreemapNode {
  bounds: Rect
  data: any
}

/**
 * Calculate the worst aspect ratio of a row of items within a given length (side of the layout rectangle).
 * row: array of values
 * length: length of the side along which the row is laid out
 */
function worstRatio(row: number[], length: number) {
  if (row.length === 0) return Infinity
  const min = Math.min(...row)
  const max = Math.max(...row)
  const sum = row.reduce((a, b) => a + b, 0)
  if (sum === 0 || length === 0) return Infinity

  // Formula: max(w^2 * r_max / s^2, s^2 / (w^2 * r_min))
  // Simplified: max((length^2 * max) / sum^2, sum^2 / (length^2 * min))
  const s2 = sum * sum
  const l2 = length * length
  return Math.max((l2 * max) / s2, s2 / (l2 * min))
}

/**
 * Recursive function to layout items
 */
/**
 * Standard Squarify Algorithm (Iterative)
 * Incorporates specific sorting logic to optimize aspect ratios.
 */
function squarify(
  items: TreemapItem[],
  x: number,
  y: number,
  width: number,
  height: number
): TreemapNode[] {
  if (items.length === 0) return []

  // --- CRITICAL FIX: Sort descending ---
  const sortedData = [...items].sort((a, b) => b.value - a.value)

  const totalValue = sortedData.reduce((acc, i) => acc + i.value, 0)
  const totalArea = width * height

  if (totalValue === 0) return []

  const result: TreemapNode[] = []

  let currentRow: TreemapItem[] = []
  let currentX = x
  let currentY = y
  let currentWidth = width
  let currentHeight = height

  // Helper to layout a row
  const layoutRow = (row: TreemapItem[]) => {
    const rowValue = row.reduce((acc, i) => acc + i.value, 0)
    // Area of this row matches its proportional value
    const rowArea = (rowValue / totalValue) * totalArea

    // We layout along the shortest side of the remaining space
    const vertical = currentWidth < currentHeight
    const rowBreadth = vertical ? rowArea / currentWidth : rowArea / currentHeight

    let tempX = currentX
    let tempY = currentY

    row.forEach(item => {
      const itemArea = (item.value / totalValue) * totalArea
      const itemLength = itemArea / rowBreadth

      const itemW = vertical ? currentWidth : itemLength
      const itemH = vertical ? itemLength : rowBreadth

      result.push({
        bounds: {
          x: vertical ? tempX : tempX,
          y: vertical ? tempY : tempY,
          width: itemW,
          height: itemH
        },
        data: item.data
      })

      if (vertical) tempY += itemLength
      else tempX += itemLength
    })

    // Subtract the used area from the remaining space
    if (vertical) {
      currentY += rowBreadth
      currentHeight = Math.max(0, currentHeight - rowBreadth)
    } else {
      currentX += rowBreadth
      currentWidth = Math.max(0, currentWidth - rowBreadth)
    }
  }

  // Iterate through sorted items
  sortedData.forEach(item => {
    if (currentRow.length === 0) {
      currentRow.push(item)
      return
    }

    // Check if adding this item makes the row's aspect ratio worse
    // "Side length" is the dimension perpendicular to the direction we are filling? called 'w' in user phrase
    // If vertical (stacking rows top-down? No squarify flips). 
    // User logic: const vertical = currentWidth < currentHeight; const sideLength = vertical ? currentWidth : currentHeight;
    // Note: User snippet: vertical = currentWidth < currentHeight. 
    // And layoutRow splits along the LONGER axis? 
    // If width < height (Tall), vertical=true. rowBreadth uses Width. 
    // Wait. If Tall, we should split horizontally (make rows) or vertically (cols)?
    // Squarify usually cuts perpendicular to the longest side.
    // If Height > Width, longest is Height. We cut a horizontal strip (width=full).
    // User snippet: if vertical (Width < Height), rowBreadth = Area / Width. 
    // This means the row has Width = currentWidth. So it's a Horizontal strip.
    // So "vertical" var name in User snippet might mean "Structure is Vertical" (Tall)? 
    // Yes.

    const vertical = currentWidth < currentHeight
    const sideLength = vertical ? currentWidth : currentHeight

    // Calculate Ratios
    // We need to map item values to generic "Areas" relative to sideLength?
    // User snippet uses raw values in getAspectRatio. "w" is sideLength.
    // Ratio = max((w^2 * max) / sum^2, ...).
    // Wait, aspect ratio depends on AREA. If we use VALUE in formula, 'w' must be scaled? 
    // User snippet: `(w * w * max) / (sum * sum)`. 
    // If 'max' is a Value (e.g. 1000), and 'w' is pixels (e.g. 100).
    // This compares units: px^2 * value / value^2 = px^2 / value.
    // This assumes specific scaling or that value~area. 
    // Squarify paper formula: max(w^2 * area_max / area_sum^2 ...).
    // If we use values, we effectively assume Area = Value.
    // BUT 'w' is in pixels. 'value' is in currency.
    // This mismatch causes issues unless we scale 'value' to 'area' before checking ratio!
    // My previous implementation normalized values (`scaledValue`).
    // The User snippet DOES NOT normalize in `getAspectRatio` but passes `sideLength` (pixels).
    // Unless `item.value` passed to getAspectRatio IS area?
    // In `layoutRow`: `itemArea = (item.value / totalValue) * totalArea`.
    // In `forEach`: passes `item` (with raw value).
    // CRITICAL: The user snippet might be missing normalization in the ratio check!
    // OR `w` should be `rowBreadth` which is derived? No.

    // Let's normalize values to areas for the ratio check to be correct in units.
    // Ratio formula expects: Area and Width.
    // If I use Raw Values, I must use "Value Width" (TotalValue/TotalArea * PixelWidth)? No.

    // I will use SCALED values for the ratio check to match the pixels 'w'.
    // Multiplier = TotalArea / TotalValue.

    const multiplier = totalArea / totalValue
    const currentRowMethod = currentRow.map(i => i.value * multiplier)
    const newItemScaled = item.value * multiplier
    const newRowMethod = [...currentRowMethod, newItemScaled]

    const currentRatio = worstRatio(currentRowMethod, sideLength)
    const newRatio = worstRatio(newRowMethod, sideLength)

    if (newRatio <= currentRatio) {
      currentRow.push(item)
    } else {
      layoutRow(currentRow)
      currentRow = [item]
    }
  })

  // Layout leftovers
  if (currentRow.length > 0) {
    layoutRow(currentRow)
  }

  return result
}


export function MarketHeatmapTreemap({ stocks, width, height, sizeMode = 'marketCap', sectorPerformance = [] }: TreemapProps) {
  // 1. Group stocks by sector
  const stocksBySector = useMemo(() => {
    const groups = new Map<string, MarketHeatmapStock[]>()
    stocks.forEach(stock => {
      const key = stock.sector || 'Other'
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(stock)
    })
    return groups
  }, [stocks])

  // 2. Calculate values for all stocks
  const stockValues = useMemo(() => {
    return stocks.map(stock => {
      let value: number
      if (sizeMode === 'marketCapChange') {
        if (stock.changePercent !== null && stock.previousPrice && stock.previousPrice > 0) {
          const previousMarketCap = stock.marketCap * (stock.previousPrice / stock.price)
          value = Math.abs(stock.marketCap - previousMarketCap)
        } else {
          value = stock.marketCap * 0.001
        }
      } else if (sizeMode === 'absoluteChange') {
        if (stock.previousPrice) {
          // Absolute price change (unweighted). Very small for low priced stocks.
          value = Math.abs(stock.price - stock.previousPrice)
        } else {
          value = 0.001
        }
      } else {
        value = stock.marketCap
      }
      // Ensure strict positive value to avoid division by zero or layout issues
      return { stock, value: Math.max(value, 0.00001) }
    })
  }, [stocks, sizeMode])

  // 3. Create sector groups and sort them
  const sectorGroups = useMemo(() => {
    const groups: Array<{ sector: string; stocks: MarketHeatmapStock[]; totalValue: number }> = []

    stocksBySector.forEach((sectorStocks, sector) => {
      const stocksWithValues = sectorStocks.map(stock => {
        const val = stockValues.find(s => s.stock.symbol === stock.symbol)?.value || 0.00001
        return { stock, value: val }
      })

      const totalValue = stocksWithValues.reduce((sum, item) => sum + item.value, 0)

      if (stocksWithValues.length > 0) {
        groups.push({
          sector,
          stocks: stocksWithValues.map(s => s.stock), // We'll look up values again later or could pass them
          totalValue
        })
      }
    })

    return groups.sort((a, b) => b.totalValue - a.totalValue)
  }, [stocksBySector, stockValues])

  // 4. Run layout
  const { sectorNodes, stockNodes, maxBounds } = useMemo(() => {
    if (width <= 0 || height <= 0) return { sectorNodes: [], stockNodes: [], maxBounds: { width: 0, height: 0 } }

    const HEADER_HEIGHT = 32

    // A. Layout Sectors
    const sectorItems = sectorGroups.map(group => ({
      value: group.totalValue,
      data: group
    }))

    // Using squarify for sectors
    const sectorLayout = squarify(sectorItems, 0, 0, width, height)

    const sectors: SectorGroup[] = []
    const stocks: StockNode[] = []
    let maxX = 0
    let maxY = 0

    // B. Layout Stocks within Sectors
    sectorLayout.forEach(node => {
      const group = node.data as typeof sectorGroups[0]
      const bounds = node.bounds

      // Track maximum bounds
      maxX = Math.max(maxX, bounds.x + bounds.width)
      maxY = Math.max(maxY, bounds.y + bounds.height)

      sectors.push({
        ...group,
        bounds
      })

      // Calculate area for stocks (minus header)
      const stockAreaY = bounds.y + HEADER_HEIGHT
      const stockAreaHeight = Math.max(0, bounds.height - HEADER_HEIGHT)

      // Always try to layout stocks, even if area is very small (they'll be tiny but visible)
      if (bounds.width > 0 && group.stocks.length > 0) {
        const stockItems = group.stocks.map(stock => {
          const val = stockValues.find(s => s.stock.symbol === stock.symbol)?.value || 0.00001
          return { value: val, data: stock }
        })

        // Use minimum height to ensure stocks are rendered even in very small sectors
        const effectiveStockAreaHeight = Math.max(1, stockAreaHeight)

        const stockLayout = squarify(
          stockItems,
          bounds.x,
          stockAreaY,
          bounds.width,
          effectiveStockAreaHeight
        )

        // If squarify returned fewer items than we have stocks, ensure all are rendered
        if (stockLayout.length < stockItems.length) {
          // Add missing stocks as tiny boxes
          const renderedSymbols = new Set(stockLayout.map(n => n.data.symbol))
          stockItems.forEach((item, idx) => {
            if (!renderedSymbols.has(item.data.symbol)) {
              // Place missing stocks as tiny boxes below the header
              const tinyBoxSize = Math.min(5, bounds.width / stockItems.length, effectiveStockAreaHeight / 2)
              stockLayout.push({
                bounds: {
                  x: bounds.x + (idx * tinyBoxSize),
                  y: stockAreaY,
                  width: tinyBoxSize,
                  height: Math.max(1, effectiveStockAreaHeight)
                },
                data: item.data
              })
            }
          })
        }

        stockLayout.forEach(stockNode => {
          // Track maximum bounds for stocks - add small buffer to ensure nothing is cut off
          const stockRight = stockNode.bounds.x + stockNode.bounds.width
          const stockBottom = stockNode.bounds.y + stockNode.bounds.height
          maxX = Math.max(maxX, stockRight)
          maxY = Math.max(maxY, stockBottom)

          stocks.push({
            stock: stockNode.data,
            bounds: stockNode.bounds,
            sector: group.sector
          })
        })
      }
    })

    // Add padding to maxBounds to ensure edge items are fully visible
    const padding = 2
    return {
      sectorNodes: sectors,
      stockNodes: stocks,
      maxBounds: {
        width: Math.max(maxX + padding, width),
        height: Math.max(maxY + padding, height)
      }
    }
  }, [sectorGroups, stockValues, width, height])

  if (stocks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No data available
      </div>
    )
  }

  return (
    <div
      className="relative bg-white dark:bg-gray-900"
      style={{
        width: maxBounds.width,
        height: maxBounds.height,
        minWidth: width,
        minHeight: height,
        overflow: 'auto'
      }}
    >
      {/* Render Sector Headers */}
      {sectorNodes.map((sector, i) => {
        const sectorName = sector.sector || 'OTHER'
        // Find sector performance data
        const sectorStats = sectorPerformance.find(s => s.name === sectorName)
        const changeText = sectorStats ? ` (${sectorStats.change > 0 ? '+' : ''}${sectorStats.change.toFixed(2)}%)` : ''

        const displayName = `${sectorName}${changeText}`

        // Calculate dynamic font size based on text length and available width
        const availableWidth = sector.bounds.width - 8 // Account for padding (4px on each side)
        const headerHeight = 32

        // Start with a base font size
        let fontSize = 12 // Base font size for sector headers
        const estimatedCharWidth = fontSize * 0.6 // Approximate character width
        const textWidth = displayName.length * estimatedCharWidth

        // If text would overflow, reduce font size
        if (textWidth > availableWidth) {
          fontSize = Math.max(8, (availableWidth / displayName.length) / 0.6)
        }

        // Also ensure font size doesn't exceed header height
        fontSize = Math.min(fontSize, headerHeight * 0.5)

        const isTruncated = (displayName.length * (fontSize * 0.6)) > availableWidth

        const changeColor = sectorStats
          ? sectorStats.change > 0 ? 'text-green-400' : sectorStats.change < 0 ? 'text-red-400' : 'text-gray-300'
          : 'text-gray-300'

        return (
          <div
            key={`sector-${i}`}
            className="absolute border-b border-r border-white/20 bg-slate-800 text-white px-2 flex items-center font-bold tracking-wider"
            style={{
              left: sector.bounds.x,
              top: sector.bounds.y,
              width: sector.bounds.width,
              height: headerHeight,
              zIndex: 5,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              fontSize: `${fontSize}px`,
              lineHeight: 1
            }}
            title={isTruncated ? displayName : undefined}
          >
            <span className="mr-1">{sectorName}</span>
            {sectorStats && (
              <span className={changeColor} style={{ opacity: 0.9 }}>
                {sectorStats.change > 0 ? '+' : ''}{sectorStats.change.toFixed(2)}%
              </span>
            )}
          </div>
        )
      })}

      {/* Render Stocks */}
      {stockNodes.map((node, i) => {
        const color = getColorForChange(node.stock.changePercent)
        const showLabel = node.bounds.width > 20 && node.bounds.height > 20

        // Calculate initial font size based on box dimensions
        let fontSize = Math.min(node.bounds.width / 4, node.bounds.height / 3, 14)

        // Adjust font size if text is too long for the box
        if (showLabel) {
          const symbol = node.stock.symbol
          const availableWidth = node.bounds.width - 4 // Account for padding
          const estimatedCharWidth = fontSize * 0.6 // Approximate character width (monospace-like)
          const textWidth = symbol.length * estimatedCharWidth

          // If text would overflow, reduce font size
          if (textWidth > availableWidth) {
            fontSize = Math.max(8, (availableWidth / symbol.length) / 0.6)
          }
        }

        const smallFontSize = Math.max(fontSize * 0.8, 7)

        // Calculate if percentage text fits
        const showPercent = node.bounds.height > 30
        let percentFontSize = smallFontSize
        if (showPercent && node.stock.changePercent !== null) {
          const percentText = `${node.stock.changePercent > 0 ? '+' : ''}${node.stock.changePercent.toFixed(1)}%`
          const availableWidthForPercent = node.bounds.width - 4
          const estimatedPercentWidth = percentText.length * (percentFontSize * 0.6)

          if (estimatedPercentWidth > availableWidthForPercent) {
            percentFontSize = Math.max(6, (availableWidthForPercent / percentText.length) / 0.6)
          }
        }

        const sectorStocks = stocksBySector.get(node.sector) || [node.stock]

        return (
          <StockListPopover
            key={`stock-${node.stock.symbol}-${i}`}
            stocks={sectorStocks}
            sector={node.stock.sector}
            industry={node.stock.industry}
          >
            <div
              className="absolute border border-white/10 hover:border-white/60 hover:z-10 cursor-pointer transition-colors flex flex-col items-center justify-center text-center overflow-hidden select-none"
              style={{
                left: node.bounds.x,
                top: node.bounds.y,
                width: node.bounds.width,
                height: node.bounds.height,
                backgroundColor: color,
                color: '#fff',
                padding: 2
              }}
            >
              {showLabel && (
                <>
                  <span
                    style={{
                      fontSize: `${fontSize}px`,
                      fontWeight: 700,
                      lineHeight: 1,
                      textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                    title={node.stock.symbol}
                  >
                    {node.stock.symbol}
                  </span>
                  {showPercent && (
                    <span
                      style={{
                        fontSize: `${percentFontSize}px`,
                        opacity: 0.9,
                        lineHeight: 1,
                        marginTop: 2,
                        textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {node.stock.changePercent !== null
                        ? `${node.stock.changePercent > 0 ? '+' : ''}${node.stock.changePercent.toFixed(1)}%`
                        : ''}
                    </span>
                  )}
                </>
              )}
            </div>
          </StockListPopover>
        )
      })}
    </div>
  )
}
