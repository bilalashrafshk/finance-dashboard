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

export type SizeMode = 'marketCap' | 'marketCapChange'

interface TreemapProps {
  stocks: MarketHeatmapStock[]
  width: number
  height: number
  sizeMode?: SizeMode
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
 * Improved color scheme matching reference
 */
function getColorForChange(changePercent: number | null): string {
  if (changePercent === null) {
    return 'rgba(156, 163, 175, 0.7)' // Gray for no data
  }

  if (changePercent > 0) {
    // Positive: Light blue to green gradient
    if (changePercent >= 1.5) {
      return 'rgba(34, 197, 94, 0.85)' // Green for significant gains
    } else {
      return 'rgba(59, 130, 246, 0.8)' // Light blue for small gains
    }
  } else if (changePercent === 0) {
    return 'rgba(59, 130, 246, 0.7)' // Light blue for neutral
  } else {
    // Negative: Red gradient (darker for larger losses)
    const intensity = Math.min(Math.abs(changePercent) / 3, 1)
    const r = Math.floor(239 - (239 - 185) * intensity)
    const g = Math.floor(68 - (68 - 28) * intensity)
    const b = Math.floor(68 - (68 - 28) * intensity)
    return `rgba(${r}, ${g}, ${b}, 0.85)`
  }
}

/**
 * Squarified Treemap Algorithm - Better aspect ratios
 */
function squarify(
  items: Array<{ value: number; data: any }>,
  x: number,
  y: number,
  width: number,
  height: number
): Array<{ bounds: { x: number; y: number; width: number; height: number }; data: any }> {
  if (items.length === 0) return []
  if (items.length === 1) {
    return [{
      bounds: { x, y, width, height },
      data: items[0].data,
    }]
  }

  const nodes: Array<{ bounds: { x: number; y: number; width: number; height: number }; data: any }> = []
  const totalValue = items.reduce((sum, item) => sum + item.value, 0)

  // Sort by value descending
  const sorted = [...items].sort((a, b) => b.value - a.value)

  let currentX = x
  let currentY = y
  let remainingWidth = width
  let remainingHeight = height

  let row: Array<{ value: number; data: any }> = []
  let rowValue = 0

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i]
    const nextRow = [...row, item]
    const nextRowValue = rowValue + item.value

    const isHorizontal = remainingWidth >= remainingHeight

    // Calculate worst aspect ratio
    const rowLength = isHorizontal ? remainingWidth : remainingHeight
    const rowHeight = isHorizontal ? remainingHeight : remainingWidth

    const currentWorst = row.length > 0
      ? Math.max(...row.map(r => {
        const itemWidth = isHorizontal ? (r.value / rowValue) * rowLength : rowHeight
        const itemHeight = isHorizontal ? rowHeight : (r.value / rowValue) * rowLength
        return Math.max(itemWidth / itemHeight, itemHeight / itemWidth)
      }))
      : Infinity

    const nextWorst = Math.max(...nextRow.map(r => {
      const itemWidth = isHorizontal ? (r.value / nextRowValue) * rowLength : rowHeight
      const itemHeight = isHorizontal ? rowHeight : (r.value / nextRowValue) * rowLength
      return Math.max(itemWidth / itemHeight, itemHeight / itemWidth)
    }))

    if (nextWorst > currentWorst && row.length > 0) {
      // Layout current row
      const rLength = isHorizontal ? remainingWidth : remainingHeight
      const rHeight = isHorizontal ? remainingHeight : remainingWidth

      row.forEach((r) => {
        const itemWidth = isHorizontal ? (r.value / rowValue) * rLength : rHeight
        const itemHeight = isHorizontal ? rHeight : (r.value / rowValue) * rLength

        nodes.push({
          bounds: {
            x: isHorizontal ? currentX : currentX,
            y: isHorizontal ? currentY : currentY,
            width: isHorizontal ? itemWidth : itemHeight,
            height: isHorizontal ? itemHeight : itemWidth,
          },
          data: r.data,
        })

        if (isHorizontal) {
          currentX += itemWidth
        } else {
          currentY += itemHeight
        }
      })

      if (isHorizontal) {
        currentY += rHeight
        remainingHeight -= rHeight
        currentX = x
      } else {
        currentX += rHeight
        remainingWidth -= rHeight
        currentY = y
      }

      row = []
      rowValue = 0
    }

    row.push(item)
    rowValue += item.value
  }

  // Layout remaining row
  if (row.length > 0) {
    const isHorizontal = remainingWidth >= remainingHeight
    const rLength = isHorizontal ? remainingWidth : remainingHeight
    const rHeight = isHorizontal ? remainingHeight : remainingWidth

    row.forEach((r) => {
      const itemWidth = isHorizontal ? (r.value / rowValue) * rLength : rHeight
      const itemHeight = isHorizontal ? rHeight : (r.value / rowValue) * rLength

      nodes.push({
        bounds: {
          x: isHorizontal ? currentX : currentX,
          y: isHorizontal ? currentY : currentY,
          width: isHorizontal ? itemWidth : itemHeight,
          height: isHorizontal ? itemHeight : itemWidth,
        },
        data: r.data,
      })

      if (isHorizontal) {
        currentX += itemWidth
      } else {
        currentY += itemHeight
      }
    })
  }

  return nodes
}

export function MarketHeatmapTreemap({ stocks, width, height, sizeMode = 'marketCap' }: TreemapProps) {
  // Group stocks by sector
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

  // Calculate stock values
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
      } else {
        value = stock.marketCap
      }
      return { stock, value: Math.max(value, 0) }
    }).filter(item => item.value > 0)
  }, [stocks, sizeMode])

  // Create sector groups with total values
  const sectorGroups = useMemo(() => {
    const groups: Array<{ sector: string; stocks: MarketHeatmapStock[]; totalValue: number }> = []

    stocksBySector.forEach((sectorStocks, sector) => {
      const totalValue = sectorStocks.reduce((sum, stock) => {
        const stockData = stockValues.find(s => s.stock.symbol === stock.symbol)
        return sum + (stockData?.value || 0)
      }, 0)

      if (totalValue > 0) {
        groups.push({
          sector,
          stocks: sectorStocks.sort((a, b) => {
            const aVal = stockValues.find(s => s.stock.symbol === a.symbol)?.value || 0
            const bVal = stockValues.find(s => s.stock.symbol === b.symbol)?.value || 0
            return bVal - aVal
          }),
          totalValue,
        })
      }
    })

    return groups.sort((a, b) => b.totalValue - a.totalValue)
  }, [stocksBySector, stockValues])

  // Create treemap layout
  const { sectorNodes, stockNodes } = useMemo(() => {
    const HEADER_HEIGHT = 32

    // Create sector-level treemap
    const sectorItems = sectorGroups.map(group => ({
      value: group.totalValue,
      data: group,
    }))

    const sectorLayout = squarify(sectorItems, 0, 0, width, height)

    const sectors: SectorGroup[] = []
    const stocks: StockNode[] = []

    sectorLayout.forEach(sectorLayoutNode => {
      const group = sectorLayoutNode.data as typeof sectorGroups[0]
      const sectorBounds = sectorLayoutNode.bounds

      sectors.push({
        ...group,
        bounds: sectorBounds,
      })

      // Create stock treemap within sector
      const stockAreaHeight = Math.max(0, sectorBounds.height - HEADER_HEIGHT)
      if (stockAreaHeight > 0 && group.stocks.length > 0) {
        const stockItems = group.stocks
          .map(stock => {
            const stockData = stockValues.find(s => s.stock.symbol === stock.symbol)
            return stockData ? { value: stockData.value, data: stock } : null
          })
          .filter((item): item is { value: number; data: MarketHeatmapStock } => item !== null)

        if (stockItems.length > 0) {
          const stockLayout = squarify(
            stockItems,
            sectorBounds.x,
            sectorBounds.y + HEADER_HEIGHT,
            sectorBounds.width,
            stockAreaHeight
          )

          stockLayout.forEach(stockLayoutNode => {
            stocks.push({
              stock: stockLayoutNode.data,
              bounds: stockLayoutNode.bounds,
              sector: group.sector,
            })
          })
        }
      }
    })

    return { sectorNodes: sectors, stockNodes: stocks }
  }, [sectorGroups, stockValues, width, height])

  if (stocks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No data available
      </div>
    )
  }

  return (
    <div className="relative" style={{ width, height }}>
      {/* Render sector headers */}
      {sectorNodes.map((sector, index) => (
        <div
          key={`sector-${index}`}
          className="absolute bg-slate-700 dark:bg-slate-800 text-white font-bold flex items-center px-3 border-b border-slate-600 dark:border-slate-700"
          style={{
            left: `${sector.bounds.x}px`,
            top: `${sector.bounds.y}px`,
            width: `${sector.bounds.width}px`,
            height: '32px',
            fontSize: '11px',
            letterSpacing: '0.05em',
            zIndex: 10,
          }}
        >
          {(sector.sector || 'OTHER').toUpperCase()}
        </div>
      ))}

      {/* Render stock boxes */}
      {stockNodes.map((node, index) => {
        const color = getColorForChange(node.stock.changePercent)
        const minDim = Math.min(node.bounds.width, node.bounds.height)
        const symbolSize = Math.max(9, Math.min(14, minDim / 5.5))
        const percentSize = Math.max(7, Math.min(11, minDim / 7))
        const showPercent = node.bounds.width > 50 && node.bounds.height > 40

        const sectorStocks = stocksBySector.get(node.sector) || [node.stock]

        return (
          <StockListPopover
            key={`stock-${index}`}
            stocks={sectorStocks}
            sector={node.stock.sector}
            industry={node.stock.industry}
          >
            <div
              className="absolute border border-slate-300/30 dark:border-slate-600/30 cursor-pointer transition-all hover:opacity-90 hover:border-slate-400/50 dark:hover:border-slate-500/50"
              style={{
                left: `${node.bounds.x}px`,
                top: `${node.bounds.y}px`,
                width: `${node.bounds.width}px`,
                height: `${node.bounds.height}px`,
                backgroundColor: color,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '4px 2px',
                overflow: 'hidden',
              }}
            >
              <div
                className="font-bold text-center leading-none select-none"
                style={{
                  fontSize: `${symbolSize}px`,
                  lineHeight: '1',
                  fontWeight: 700,
                  letterSpacing: '0.03em',
                  color: 'rgba(0, 0, 0, 0.9)',
                  textShadow: '0 1px 2px rgba(255, 255, 255, 0.3)',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={node.stock.symbol}
              >
                {node.stock.symbol}
              </div>
              {showPercent && (
                <div
                  className="text-center leading-none mt-1 select-none"
                  style={{
                    fontSize: `${percentSize}px`,
                    lineHeight: '1',
                    fontWeight: 600,
                    color: 'rgba(0, 0, 0, 0.85)',
                    textShadow: '0 1px 2px rgba(255, 255, 255, 0.3)',
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {node.stock.changePercent !== null
                    ? `${node.stock.changePercent > 0 ? '+' : ''}${Number(node.stock.changePercent).toFixed(1)}%`
                    : 'N/A'}
                </div>
              )}
            </div>
          </StockListPopover>
        )
      })}
    </div>
  )
}













