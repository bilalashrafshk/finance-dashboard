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
function layoutRow(
  row: TreemapItem[],
  container: Rect,
  isVertical: boolean // true if laying out along width (vertical cuts), false if along height
): TreemapNode[] {
  const nodes: TreemapNode[] = []
  const sum = row.reduce((s, i) => s + i.value, 0)
  
  let offset = 0
  // The total width/height of the row
  const rowSize = isVertical ? container.height : container.width
  const rowBreadth = sum / rowSize
  
  row.forEach(item => {
    const itemSize = item.value / rowBreadth
    
    if (isVertical) {
        // Layout vertically in a strip that is 'rowBreadth' wide
        // Each item has height 'itemSize' and width 'rowBreadth'
        // BUT wait, standard squarify usually cuts along the SHORTER dimension.
        
        // Let's follow standard definition:
        // We are filling a rectangle of size (rowBreadth x rowSize) or (rowSize x rowBreadth)
        // Here we are effectively stacking rectangles.
        
        // Let's stick to the coordinates:
        // If we decided to stack along Y (vertical stack), then width is fixed (rowBreadth).
        // This happens if we are filling a vertical strip.
    }
  })
  
  return nodes
}

/**
 * Standard Squarify Algorithm
 * Based on Bruls, Mark, Kees Huizing, and Jarke J. Van Wijk. "Squarified treemaps."
 */
function squarify(
  items: TreemapItem[],
  x: number,
  y: number,
  width: number,
  height: number
): TreemapNode[] {
  if (items.length === 0) return []

  // 1. Normalize values so they fill the area
  // We don't need to normalize if we assume input values map proportionally to area,
  // but typically we scale them so sum(values) = width * height.
  const totalValue = items.reduce((acc, item) => acc + item.value, 0)
  const totalArea = width * height
  
  if (totalValue === 0) return [] // Avoid division by zero

  const multiplier = totalArea / totalValue
  
  const scaledItems = items.map(item => ({
    ...item,
    scaledValue: item.value * multiplier
  })).sort((a, b) => b.scaledValue - a.scaledValue) // Sort descending

  const result: TreemapNode[] = []
  
  let container = { x, y, width, height }
  let currentRow: typeof scaledItems = []

  function layout(row: typeof scaledItems, container: Rect) {
    const sideLength = Math.min(container.width, container.height)
    const rowValue = row.reduce((acc, item) => acc + item.scaledValue, 0)
    
    // Determine orientation:
    // If width >= height, we stack columns (vertical cuts), i.e., row fills full height
    // Actually, squarify usually fills the short side.
    // If width >= height, shortest side is height. We place a column of width 'w' on the left.
    // The items in that column are stacked vertically.
    
    // If height > width, shortest side is width. We place a row of height 'h' on top.
    // The items in that row are stacked horizontally.
    
    const vertical = container.width >= container.height
    // if vertical (w >= h), we are building a column on the left. width of column = rowValue / height
    // items in column are stacked vertically.
    // dimension along which we stack = height
    
    // if !vertical (h > w), we are building a row on top. height of row = rowValue / width
    // items in row are stacked horizontally.
    // dimension along which we stack = width
    
    const breadth = vertical ? container.height : container.width
    // Breadth of the row (the fixed dimension for the row)
    
    // The other dimension (thickness of the row)
    const thickness = rowValue / breadth 
    
    let currentOffset = 0
    
    row.forEach((item, idx) => {
      const itemLength = item.scaledValue / thickness // This is the dimension along the 'breadth'
      
      let itemX = 0, itemY = 0, itemW = 0, itemH = 0
      
      if (vertical) {
        // Stacking vertically in a column on the left
        itemX = container.x
        itemY = container.y + currentOffset
        itemW = thickness
        // For the last item in the row, ensure it fills remaining space to avoid gaps
        if (idx === row.length - 1) {
          itemH = container.height - currentOffset
        } else {
          itemH = itemLength
        }
      } else {
        // Stacking horizontally in a row on top
        itemX = container.x + currentOffset
        itemY = container.y
        // For the last item in the row, ensure it fills remaining space to avoid gaps
        if (idx === row.length - 1) {
          itemW = container.width - currentOffset
        } else {
          itemW = itemLength
        }
        itemH = thickness
      }
      
      // Ensure minimum dimensions
      itemW = Math.max(0.5, itemW)
      itemH = Math.max(0.5, itemH)
      
      result.push({
        bounds: { x: itemX, y: itemY, width: itemW, height: itemH },
        data: item.data
      })
      
      currentOffset += itemLength
    })
  }

  // Recursive function to process items
  function processItems(remainingItems: typeof scaledItems, currentContainer: Rect) {
    if (remainingItems.length === 0) return
    
    // If container is too small, still try to fit items (they'll be tiny but visible)
    // Only skip if both dimensions are essentially zero
    if (currentContainer.width < 0.1 && currentContainer.height < 0.1) {
        // If we have remaining items but no space, still try to render them as tiny boxes
        // This ensures all sectors are shown
        remainingItems.forEach((item, idx) => {
          result.push({
            bounds: {
              x: currentContainer.x + (idx * 1),
              y: currentContainer.y,
              width: Math.max(0.5, currentContainer.width / remainingItems.length),
              height: Math.max(0.5, currentContainer.height)
            },
            data: item.data
          })
        })
        return
    }

    let row: typeof scaledItems = [remainingItems[0]]
    let rest = remainingItems.slice(1)
    
    // Try adding items to row
    for (let i = 0; i < rest.length; i++) {
      const item = rest[i]
      const newRow = [...row, item]
      
      // Calculate worst ratios
      const side = Math.min(currentContainer.width, currentContainer.height)
      
      const currentWorst = worstRatio(row.map(r => r.scaledValue), side)
      const newWorst = worstRatio(newRow.map(r => r.scaledValue), side)
      
      if (newWorst <= currentWorst) {
        // Ratio improved or stayed same, add to row
        row = newRow
      } else {
        // Ratio worsened, stop this row
        // Break loop and process this row, then recurse
        rest = rest.slice(i) // Remaining items start from current one
        break
      }
      
      // If we added the last item
      if (i === rest.length - 1) {
        rest = []
      }
    }
    
    // Layout the current row
    layout(row, currentContainer)
    
    // Update container for remaining items
    const rowValue = row.reduce((acc, item) => acc + item.scaledValue, 0)
    const vertical = currentContainer.width >= currentContainer.height
    
    let nextContainer: Rect
    
    if (vertical) {
      // We used a column on the left of width = rowValue / height
      const colWidth = rowValue / currentContainer.height
      nextContainer = {
        x: currentContainer.x + colWidth,
        y: currentContainer.y,
        width: Math.max(0, currentContainer.width - colWidth),
        height: currentContainer.height
      }
    } else {
      // We used a row on top of height = rowValue / width
      const rowHeight = rowValue / currentContainer.width
      nextContainer = {
        x: currentContainer.x,
        y: currentContainer.y + rowHeight,
        width: currentContainer.width,
        height: Math.max(0, currentContainer.height - rowHeight)
      }
    }
    
    if (rest.length > 0) {
      processItems(rest, nextContainer)
    }
  }
  
  processItems(scaledItems, container)
  
  // Verify all items were processed - if not, ensure they're added
  if (result.length < items.length) {
    const processedData = new Set(result.map(r => r.data))
    scaledItems.forEach((item) => {
      if (!processedData.has(item.data)) {
        // Add as a tiny box - find available space
        const existingMaxY = result.length > 0 
          ? Math.max(...result.map(r => r.bounds.y + r.bounds.height))
          : 0
        const existingMaxX = result.length > 0
          ? Math.max(...result.map(r => r.bounds.x + r.bounds.width))
          : 0
        result.push({
          bounds: { 
            x: Math.min(existingMaxX + 2, width - 10), 
            y: Math.min(existingMaxY + 2, height - 10), 
            width: Math.max(2, width / 50), 
            height: Math.max(2, height / 50) 
          },
          data: item.data
        })
      }
    })
  }
  
  return result
}


export function MarketHeatmapTreemap({ stocks, width, height, sizeMode = 'marketCap' }: TreemapProps) {
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
      
      // Only layout stocks if there is space
      if (stockAreaHeight > 0 && bounds.width > 0 && group.stocks.length > 0) {
        const stockItems = group.stocks.map(stock => {
           const val = stockValues.find(s => s.stock.symbol === stock.symbol)?.value || 0.00001
           return { value: val, data: stock }
        })
        
        const stockLayout = squarify(
          stockItems,
          bounds.x,
          stockAreaY,
          bounds.width,
          stockAreaHeight
        )
        
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
         
         // Calculate dynamic font size based on text length and available width
         const availableWidth = sector.bounds.width - 8 // Account for padding (4px on each side)
         const headerHeight = 32
         
         // Start with a base font size
         let fontSize = 12 // Base font size for sector headers
         const estimatedCharWidth = fontSize * 0.6 // Approximate character width
         const textWidth = sectorName.length * estimatedCharWidth
         
         // If text would overflow, reduce font size
         if (textWidth > availableWidth) {
           fontSize = Math.max(8, (availableWidth / sectorName.length) / 0.6)
         }
         
         // Also ensure font size doesn't exceed header height
         fontSize = Math.min(fontSize, headerHeight * 0.5)
         
         const isTruncated = (sectorName.length * (fontSize * 0.6)) > availableWidth
         
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
             title={isTruncated ? sectorName : undefined}
           >
             {sectorName}
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
