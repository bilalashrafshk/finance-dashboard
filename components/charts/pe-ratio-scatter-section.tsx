"use client"

import { useState, useEffect } from "react"
import { ValuationScatterChart } from "@/components/screener/valuation-scatter-chart"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, Filter } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export function PERatioScatterSection() {
  const [metrics, setMetrics] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [groupBy, setGroupBy] = useState<'sector' | 'industry'>('sector')
  
  // Filters for chart view
  const [minMarketCapChart, setMinMarketCapChart] = useState(0) // In Billions
  const [sectorFilter, setSectorFilter] = useState<string>("")

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/screener/metrics')
        if (res.ok) {
            const data = await res.json()
            setMetrics(data.data || [])
        }
      } catch (e) {
        console.error("Failed to load screener metrics", e)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const filteredMetrics = metrics.filter(m => {
      const groupName = groupBy === 'industry' ? (m.industry || m.sector) : m.sector
      const matchesGroup = sectorFilter ? groupName?.toLowerCase().includes(sectorFilter.toLowerCase()) : true
      // Assuming market_cap stored in raw rupees. 1 Billion = 1,000,000,000
      const matchesCap = (m.market_cap || 0) >= (minMarketCapChart * 1_000_000_000)
      return matchesGroup && matchesCap
  })

  return (
    <div className="space-y-6">
      {/* Filter Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <Label>Group By:</Label>
              <ToggleGroup type="single" value={groupBy} onValueChange={(value) => value && setGroupBy(value as 'sector' | 'industry')}>
                <ToggleGroupItem value="sector" aria-label="Sector">
                  Sector
                </ToggleGroupItem>
                <ToggleGroupItem value="industry" aria-label="Industry">
                  Industry
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            
            <div className="flex flex-wrap gap-6 items-end">
              <div className="space-y-2 w-full md:w-64">
                <Label className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filter by {groupBy === 'industry' ? 'Industry' : 'Sector'}
                </Label>
                <Input 
                  placeholder={groupBy === 'industry' ? "e.g. Oil & Gas, Banking..." : "e.g. Cement, Bank..."} 
                  value={sectorFilter}
                  onChange={(e) => setSectorFilter(e.target.value)}
                />
              </div>
              
              <div className="space-y-4 w-full md:w-64">
                <Label>Min Market Cap: {minMarketCapChart} Billion PKR</Label>
                <Slider 
                  min={0} 
                  max={100} 
                  step={1} 
                  value={[minMarketCapChart]} 
                  onValueChange={(v) => setMinMarketCapChart(v[0])} 
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-6">
          <ValuationScatterChart data={filteredMetrics} groupBy={groupBy} />
        </div>
      )}
    </div>
  )
}

