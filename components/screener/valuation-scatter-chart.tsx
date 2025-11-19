"use client"

import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Cell, ReferenceLine, Legend, Label } from "recharts"
import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/portfolio/portfolio-utils"

interface ScreenerMetric {
  symbol: string
  sector: string
  pe_ratio: number
  sector_pe: number
  relative_pe: number
  price: number
  dividend_yield: number
  market_cap: number
}

interface ValuationScatterChartProps {
  data: ScreenerMetric[]
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="bg-background border border-border p-3 rounded-lg shadow-lg text-sm">
        <div className="font-bold mb-1">{data.symbol}</div>
        <div className="text-muted-foreground mb-2">{data.sector}</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <span>Price:</span>
          <span className="font-mono text-right">{formatCurrency(data.price, "PKR")}</span>
          
          <span>Stock P/E:</span>
          <span className="font-mono text-right">{data.pe_ratio.toFixed(2)}x</span>
          
          <span>Sector P/E:</span>
          <span className="font-mono text-right">{data.sector_pe.toFixed(2)}x</span>
          
          <span className="border-t pt-1 mt-1">Valuation:</span>
          <span className={`font-mono text-right border-t pt-1 mt-1 font-bold ${data.relative_pe < 1 ? "text-green-500" : "text-red-500"}`}>
            {data.relative_pe < 1 
              ? `${((1 - data.relative_pe) * 100).toFixed(0)}% Discount` 
              : `${((data.relative_pe - 1) * 100).toFixed(0)}% Premium`}
          </span>
        </div>
      </div>
    )
  }
  return null
}

export function ValuationScatterChart({ data }: ValuationScatterChartProps) {
  // Filter outliers (P/E > 50 or < 0) to keep chart readable
  const filteredData = useMemo(() => {
    return data.filter(d => d.pe_ratio > 0 && d.pe_ratio < 50 && d.sector_pe > 0 && d.sector_pe < 50)
  }, [data])

  // Define color palette for sectors
  const COLORS = [
    "#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", 
    "#82ca9d", "#ffc658", "#8dd1e1", "#a4de6c", "#d0ed57"
  ]
  
  // Group by sector to assign colors consistently
  const sectors = useMemo(() => Array.from(new Set(filteredData.map(d => d.sector))).sort(), [filteredData])
  const colorMap = useMemo(() => {
    const map = new Map()
    sectors.forEach((s, i) => map.set(s, COLORS[i % COLORS.length]))
    return map
  }, [sectors])

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
          Identify undervalued stocks relative to their sector peers.
          <br />
          <span className="text-green-600 font-semibold">Below Line</span> = Cheaper than Sector. 
          <span className="text-red-600 font-semibold ml-2">Above Line</span> = More Expensive.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[500px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <XAxis 
                type="number" 
                dataKey="sector_pe" 
                name="Sector P/E" 
                unit="x" 
                domain={['auto', 'auto']}
                label={{ value: 'Sector Average P/E', position: 'bottom', offset: 0 }}
              />
              <YAxis 
                type="number" 
                dataKey="pe_ratio" 
                name="Stock P/E" 
                unit="x" 
                domain={['auto', 'auto']}
                label={{ value: 'Stock P/E', angle: -90, position: 'insideLeft' }}
              />
              <ZAxis type="number" dataKey="market_cap" range={[60, 400]} name="Market Cap" />
              <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
              
              {/* The "Fair Value" Line (x=y) */}
              <ReferenceLine
                segment={[{ x: 0, y: 0 }, { x: 50, y: 50 }]}
                stroke="#666"
                strokeDasharray="3 3"
                strokeWidth={2}
                label={{ position: 'insideTopRight',  value: 'Fair Value (Peer Avg)', fill: '#666', fontSize: 12 }}
              />
              
              <Scatter name="Companies" data={filteredData} fill="#8884d8">
                {filteredData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colorMap.get(entry.sector)} />
                ))}
              </Scatter>
              
              <Legend 
                payload={sectors.map(s => ({
                  value: s,
                  type: 'circle',
                  color: colorMap.get(s)
                }))}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

