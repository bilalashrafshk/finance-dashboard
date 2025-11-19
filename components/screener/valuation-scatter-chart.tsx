"use client"

import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Cell, ReferenceLine, CartesianGrid } from "recharts"
import { useMemo, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/portfolio/portfolio-utils"

interface ScreenerMetric {
  symbol: string
  sector: string
  industry?: string
  pe_ratio: number
  sector_pe: number
  relative_pe: number
  industry_pe?: number
  relative_pe_industry?: number
  price: number
  dividend_yield: number
  market_cap: number
}

interface ValuationScatterChartProps {
  data: ScreenerMetric[]
  groupBy?: 'sector' | 'industry'
}

const CustomTooltip = ({ active, payload, groupBy = 'sector' }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    const stockPE = Number(data.pe_ratio) || 0
    const groupPE = Number(groupBy === 'industry' ? (data.industry_pe || data.sector_pe) : data.sector_pe) || 0
    const price = Number(data.price) || 0
    const relativePE = Number(groupBy === 'industry' ? (data.relative_pe_industry || data.relative_pe) : data.relative_pe) || 0
    const groupName = groupBy === 'industry' ? (data.industry || data.sector) : data.sector
    const groupLabel = groupBy === 'industry' ? 'Industry P/E' : 'Sector P/E'

    return (
      <div className="bg-popover border border-border p-3 rounded-lg shadow-lg text-sm">
        <div className="font-bold mb-1 text-popover-foreground">{data.symbol}</div>
        <div className="text-muted-foreground mb-2">{groupName}</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <span className="text-muted-foreground">Price:</span>
          <span className="font-mono text-right text-foreground">{formatCurrency(price, "PKR")}</span>
          
          <span className="text-muted-foreground">Stock P/E:</span>
          <span className="font-mono text-right text-foreground">{stockPE.toFixed(2)}x</span>
          
          <span className="text-muted-foreground">{groupLabel}:</span>
          <span className="font-mono text-right text-foreground">{groupPE.toFixed(2)}x</span>
          
          <span className="border-t border-border pt-1 mt-1 text-foreground font-medium">Valuation:</span>
          <span className={`font-mono text-right border-t border-border pt-1 mt-1 font-bold ${relativePE < 1 ? "text-green-500" : "text-red-500"}`}>
            {relativePE < 1 
              ? `${((1 - relativePE) * 100).toFixed(0)}% Discount` 
              : `${((relativePE - 1) * 100).toFixed(0)}% Premium`}
          </span>
        </div>
      </div>
    )
  }
  return null
}

export function ValuationScatterChart({ data, groupBy = 'sector' }: ValuationScatterChartProps) {
  // Detect theme for proper color adaptation
  const [isDark, setIsDark] = useState(false)
  
  useEffect(() => {
    const checkTheme = () => {
      const isDarkMode = document.documentElement.classList.contains('dark') || 
                        window.matchMedia('(prefers-color-scheme: dark)').matches
      setIsDark(isDarkMode)
    }
    
    checkTheme()
    const observer = new MutationObserver(checkTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    
    return () => observer.disconnect()
  }, [])

  // Filter outliers (P/E > 50 or < 0) to keep chart readable
  const filteredData = useMemo(() => {
    return data.map(d => {
      // When grouping by industry, prefer industry_pe, but fall back to sector_pe if not available
      const groupPE = groupBy === 'industry' 
        ? (d.industry_pe != null ? Number(d.industry_pe) : Number(d.sector_pe))
        : Number(d.sector_pe)
      
      // When grouping by industry, use industry name, but fall back to sector if not available
      const groupName = groupBy === 'industry' 
        ? (d.industry || d.sector || 'Unknown')
        : (d.sector || 'Unknown')
      
      return {
        ...d,
        pe_ratio: Number(d.pe_ratio),
        sector_pe: Number(d.sector_pe),
        industry_pe: d.industry_pe != null ? Number(d.industry_pe) : undefined,
        group_pe: groupPE,
        market_cap: Number(d.market_cap),
        relative_pe: Number(d.relative_pe),
        relative_pe_industry: d.relative_pe_industry != null ? Number(d.relative_pe_industry) : undefined,
        price: Number(d.price),
        group_name: groupName
      }
    }).filter(d => 
        !isNaN(d.pe_ratio) && 
        !isNaN(d.group_pe) && 
        d.pe_ratio > 0 && 
        d.pe_ratio < 50 && 
        d.group_pe > 0 && 
        d.group_pe < 50
      )
  }, [data, groupBy])

  // Theme-aware colors
  const gridColor = isDark ? '#374151' : '#e5e7eb'
  const axisColor = isDark ? '#9ca3af' : '#6b7280'
  const axisLabelColor = isDark ? '#f3f4f6' : '#1f2937'
  const referenceLineColor = isDark ? '#d1d5db' : '#374151'

  // Define color palette for sectors/industries - using actual colors that work in both light/dark mode
  const COLORS = [
    "#3b82f6", // blue-500
    "#10b981", // emerald-500
    "#f59e0b", // amber-500
    "#ef4444", // red-500
    "#8b5cf6", // violet-500
    "#06b6d4", // cyan-500
    "#ec4899", // pink-500
    "#14b8a6", // teal-500
    "#f97316", // orange-500
    "#6366f1"  // indigo-500
  ]

  // Calculate common domain for X and Y axes to ensure diagonal line is accurate
  const axisDomain = useMemo(() => {
    if (filteredData.length === 0) return ['auto', 'auto']
    
    const allValues = filteredData.flatMap(d => [d.pe_ratio, d.group_pe])
    const min = Math.floor(Math.min(...allValues) * 0.9)
    const max = Math.ceil(Math.max(...allValues) * 1.1)
    
    return [min, max]
  }, [filteredData])
  
  // Group by sector/industry to assign colors consistently
  const groups = useMemo(() => Array.from(new Set(filteredData.map(d => d.group_name))).sort(), [filteredData])
  const colorMap = useMemo(() => {
    const map = new Map()
    groups.forEach((g, i) => map.set(g, COLORS[i % COLORS.length]))
    return map
  }, [groups])

  // Group data by sector/industry for clearer labeling
  const groupData = useMemo(() => {
    const grouped = new Map<string, typeof filteredData>()
    filteredData.forEach(d => {
      if (!grouped.has(d.group_name)) {
        grouped.set(d.group_name, [])
      }
      grouped.get(d.group_name)!.push(d)
    })
    return grouped
  }, [filteredData])

  if (filteredData.length === 0) {
    return (
      <Card className="h-[500px] flex items-center justify-center text-muted-foreground">
        No valuation data available to plot.
      </Card>
    )
  }

  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle>Relative Valuation Map</CardTitle>
        <CardDescription>
          Identify undervalued stocks relative to their {groupBy === 'industry' ? 'industry' : 'sector'} peers.
          <br />
          <span className="text-green-500 font-semibold">Below Line</span> = Cheaper than {groupBy === 'industry' ? 'Industry' : 'Sector'}. 
          <span className="text-red-500 font-semibold ml-2">Above Line</span> = More Expensive.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Group Color Key */}
          <div className="flex flex-wrap gap-4 text-sm">
            {groups.map(group => (
              <div key={group} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full border border-border" 
                  style={{ backgroundColor: colorMap.get(group) }}
                />
                <span className="text-muted-foreground">{group}</span>
              </div>
            ))}
          </div>
          
          <div className="h-[500px] w-full" key={`chart-${groupBy}`}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 30, bottom: 50, left: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} opacity={0.4} />
                
                <XAxis 
                  type="number" 
                  dataKey="group_pe" 
                  name={groupBy === 'industry' ? 'Industry P/E' : 'Sector P/E'} 
                  unit="x" 
                  domain={axisDomain}
                  stroke={axisColor}
                  tick={{ fill: axisColor, fontSize: 12 }}
                  label={{ value: groupBy === 'industry' ? 'Industry Average P/E' : 'Sector Average P/E', position: 'bottom', offset: 10, fill: axisLabelColor, fontSize: 13 }}
                />
                <YAxis 
                  type="number" 
                  dataKey="pe_ratio" 
                  name="Stock P/E" 
                  unit="x" 
                  domain={axisDomain}
                  stroke={axisColor}
                  tick={{ fill: axisColor, fontSize: 12 }}
                  label={{ value: 'Stock P/E', angle: -90, position: 'insideLeft', fill: axisLabelColor, fontSize: 13 }}
                />
                <ZAxis type="number" dataKey="market_cap" range={[120, 800]} name="Market Cap" />
                <Tooltip content={(props) => <CustomTooltip {...props} groupBy={groupBy} />} cursor={{ strokeDasharray: '3 3', stroke: axisColor, opacity: 0.5 }} />
                
                {/* The "Fair Value" Line (x=y) */}
                <ReferenceLine
                  segment={[{ x: axisDomain[0] as number, y: axisDomain[0] as number }, { x: axisDomain[1] as number, y: axisDomain[1] as number }]}
                  stroke={referenceLineColor}
                  strokeDasharray="5 5"
                  strokeWidth={2.5}
                  opacity={0.9}
                  ifOverflow="extendDomain"
                  label={{ position: 'insideTopRight', value: 'Fair Value', fill: axisColor, fontSize: 11 }}
                />
                
                {/* Render scatter points grouped by sector/industry for better visual organization */}
                {groups.map(group => {
                  const groupDataPoints = groupData.get(group) || []
                  if (groupDataPoints.length === 0) return null
                  
                  return (
                    <Scatter key={group} name={group} data={groupDataPoints} fill={colorMap.get(group)}>
                      {groupDataPoints.map((entry, index) => (
                        <Cell 
                          key={`${group}-${index}`} 
                          fill={colorMap.get(group)} 
                          stroke={colorMap.get(group)}
                          fillOpacity={0.7}
                          strokeWidth={1.5}
                        />
                      ))}
                    </Scatter>
                  )
                })}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
