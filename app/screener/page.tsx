"use client"

import { useState, useEffect } from "react"
import { SharedNavbar } from "@/components/shared-navbar"
import { ValuationScatterChart } from "@/components/screener/valuation-scatter-chart"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, Filter } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"

export default function ScreenerPage() {
  const [metrics, setMetrics] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // Filters
  const [minMarketCap, setMinMarketCap] = useState(0) // In Billions
  const [sectorFilter, setSectorFilter] = useState<string>("")

  useEffect(() => {
    async function loadData() {
      try {
        // We fetch from a simple GET endpoint that queries the 'screener_metrics' table
        // TODO: Create this endpoint /api/screener/metrics
        // For now, we can mock or reuse existing if available, but better to have dedicated.
        // Let's assume /api/screener/metrics exists (we need to create it next).
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
      const matchesSector = sectorFilter ? m.sector.toLowerCase().includes(sectorFilter.toLowerCase()) : true
      // Assuming market_cap stored in raw rupees. 1 Billion = 1,000,000,000
      const matchesCap = (m.market_cap || 0) >= (minMarketCap * 1_000_000_000)
      return matchesSector && matchesCap
  })

  return (
    <div className="min-h-screen bg-background">
      <SharedNavbar />
      <main className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Value Hunter Screener</h1>
            <p className="text-muted-foreground">
                Find undervalued companies relative to their sector peers.
            </p>
        </div>

        {/* Filter Controls */}
        <Card>
            <CardContent className="pt-6">
                <div className="flex flex-wrap gap-6 items-end">
                    <div className="space-y-2 w-full md:w-64">
                        <Label className="flex items-center gap-2">
                            <Filter className="h-4 w-4" />
                            Filter by Sector
                        </Label>
                        <Input 
                            placeholder="e.g. Cement, Bank..." 
                            value={sectorFilter}
                            onChange={(e) => setSectorFilter(e.target.value)}
                        />
                    </div>
                    
                    <div className="space-y-4 w-full md:w-64">
                        <Label>Min Market Cap: {minMarketCap} Billion PKR</Label>
                        <Slider 
                            min={0} 
                            max={100} 
                            step={1} 
                            value={[minMarketCap]} 
                            onValueChange={(v) => setMinMarketCap(v[0])} 
                        />
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
             <ValuationScatterChart data={filteredMetrics} />
             
             {/* We could also add a Table View below later */}
          </div>
        )}
      </main>
    </div>
  )
}

