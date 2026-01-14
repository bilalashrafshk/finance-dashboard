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
// --- User Provided Squarify Algorithm (D3 Logic) ---

/**
 * Calculates the worst aspect ratio of a row of rectangles given a specific width
 */
function worstRatio(row: TreemapItem[], width: number) {
  if (row.length === 0) return Number.MAX_VALUE;

  const sum = row.reduce((acc, item) => acc + item.value, 0);
  const max = Math.max(...row.map(i => i.value));
  const min = Math.min(...row.map(i => i.value));

  // Based on Bruls et al. Formula: max(w^2 * r_max / R^2, R^2 / (w^2 * r_min))
  return Math.max(
    (width * width * max) / (sum * sum),
    (sum * sum) / (width * width * min)
  );
}

/**
 * Helper to calculate exact coordinates for items in a "finalized" row
 */
function layoutRow(
  row: TreemapItem[],
  x: number,
  y: number,
  width: number,
  height: number,
  result: TreemapNode[]
) {
  const rowValue = row.reduce((acc, c) => acc + c.value, 0);

  // Determine if the ROW itself is horizontal or vertical based on the container shape passed in
  // If height is the fixed dimension (horizontal strip), items stack horizontally (change X).
  const rowIsHorizontal = width > height;

  let currentX = x;
  let currentY = y;

  row.forEach(child => {
    // (ChildValue / RowValue) * RowArea
    // Since RowArea = width * height, we can simplify:
    const childRatio = child.value / rowValue;

    let childW, childH;

    if (rowIsHorizontal) {
      // Row is a wide strip. Items split the width. Height is full row height.
      childW = width * childRatio;
      childH = height;
      result.push({
        bounds: { x: currentX, y: currentY, width: childW, height: childH },
        data: child.data
      });
      currentX += childW;
    } else {
      // Row is a tall strip. Items split the height. Width is full row width.
      childW = width;
      childH = height * childRatio;
      result.push({
        bounds: { x: currentX, y: currentY, width: childW, height: childH },
        data: child.data
      });
      currentY += childH;
    }
  });
}

/**
 * Recursive function to layout rectangles
 */
function squarify(
  children: TreemapItem[], // Assumes descending sort is done BEFORE calling this
  x: number,
  y: number,
  width: number,
  height: number,
  result: TreemapNode[] = []
): TreemapNode[] {
  if (children.length === 0) return result;

  // IMPORTANT: We layout along the SHORTEST side of the remaining rectangle
  const vertical = width < height; // "Vertical" means the short side is Width. We create a horizontal row.
  const sideLength = vertical ? width : height;

  // We need the total value to convert values to area pixels
  const totalValue = children.reduce((acc, c) => acc + c.value, 0);
  const totalArea = width * height;

  // Avoid division by zero
  if (totalValue === 0) return result;

  let row: TreemapItem[] = [];
  let rowValue = 0;

  // We process children one by one
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const nextRow = [...row, child];
    const nextRowValue = rowValue + child.value;

    // Convert Value -> Area -> Length of the row (Breadth)
    // Breadth = Area / SideLength
    const currentBreadth = (rowValue / totalValue) * totalArea / sideLength;
    const nextBreadth = (nextRowValue / totalValue) * totalArea / sideLength;

    const currentWorst = worstRatio(row, currentBreadth); // Ratio with current items
    const nextWorst = worstRatio(nextRow, nextBreadth);   // Ratio if we add the new item

    // If adding the item makes the aspect ratio WORSE, we stop this row.
    if (row.length > 0 && nextWorst > currentWorst) {
      // 1. Finalize the current row
      layoutRow(row, x, y, vertical ? width : currentBreadth, vertical ? currentBreadth : height, result);

      // 2. Calculate remaining space
      const usedBreadth = currentBreadth;

      const nextX = vertical ? x : x + usedBreadth;
      const nextY = vertical ? y + usedBreadth : y;
      const nextW = vertical ? width : width - usedBreadth;
      const nextH = vertical ? height - usedBreadth : height;

      // 3. Recurse with remaining children
      return squarify(children.slice(i), nextX, nextY, nextW, nextH, result);
    }

    // Otherwise, accept the item into the row and continue
    row.push(child);
    rowValue += child.value;
  }

  // Layout the final row
  if (row.length > 0) {
    // For the last row, the "breadth" is just whatever space is left
    const remainingBreadth = vertical ? height : width;
    layoutRow(row, x, y, vertical ? width : remainingBreadth, vertical ? remainingBreadth : height, result);
  }

  return result;
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
          // Use Sqrt to prevent single large movers from dominating (40%+ of map)
          value = Math.sqrt(Math.abs(stock.marketCap - previousMarketCap))
        } else {
          value = Math.sqrt(stock.marketCap * 0.001)
        }
      } else if (sizeMode === 'absoluteChange') {
        if (stock.previousPrice) {
          // Use Sqrt to prevent dominance (Linear was 43% dominance, Sqrt is 11%)
          value = Math.sqrt(Math.abs(stock.price - stock.previousPrice))
        } else {
          value = 0.01 // Tiny fallback
        }
      } else {
        // Market Cap is usually well distributed (Pareto), Linear is fine (6% dominance)
        value = stock.marketCap
      }
      // Ensure strict positive value to avoid division by zero
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
        }).sort((a, b) => b.value - a.value) // CRITICAL: Sort descending for squarify

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
