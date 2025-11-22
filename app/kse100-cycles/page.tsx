"use client"

import { SharedNavbar } from "@/components/shared-navbar"
import { MarketCycleChart } from "@/components/kse100/market-cycle-chart"

export default function KSE100CyclesPage() {
  return (
    <div className="min-h-screen bg-background">
      <SharedNavbar />
      <main>
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-7xl mx-auto">
            <MarketCycleChart />
          </div>
        </div>
      </main>
    </div>
  )
}

