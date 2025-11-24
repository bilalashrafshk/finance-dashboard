"use client"

import { BarChart3, TrendingUp, Wallet, Search } from "lucide-react"
import Link from "next/link"

export default function DashboardPreviewSimple() {
  return (
    <div className="mx-auto mt-16 max-w-5xl">
      <div className="rounded-xl border border-border bg-card/50 p-2 shadow-2xl backdrop-blur">
        <div className="aspect-video rounded-lg bg-gradient-to-br from-blue-600/10 to-cyan-600/10 p-8">
          <div className="grid grid-cols-3 gap-4 h-full">
            {/* Chart Preview */}
            <div className="bg-background/50 rounded-lg p-4 border border-border/50 flex flex-col items-center justify-center space-y-2">
              <BarChart3 className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              <p className="text-xs text-muted-foreground text-center">Market Charts</p>
              <div className="w-full h-20 bg-gradient-to-t from-blue-600/20 to-transparent rounded flex items-end justify-around px-2 py-2">
                {[30, 50, 40, 60, 45, 55].map((height, i) => (
                  <div
                    key={i}
                    className="w-full bg-gradient-to-t from-blue-600 to-cyan-600 rounded-t opacity-70"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>

            {/* Portfolio Preview */}
            <div className="bg-background/50 rounded-lg p-4 border border-border/50 flex flex-col items-center justify-center space-y-2">
              <Wallet className="h-8 w-8 text-cyan-600 dark:text-cyan-400" />
              <p className="text-xs text-muted-foreground text-center">Portfolio</p>
              <div className="w-full space-y-2">
                <div className="h-2 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-full" style={{ width: "75%" }} />
                <div className="h-2 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-full" style={{ width: "60%" }} />
                <div className="h-2 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-full" style={{ width: "45%" }} />
              </div>
            </div>

            {/* Screener Preview */}
            <div className="bg-background/50 rounded-lg p-4 border border-border/50 flex flex-col items-center justify-center space-y-2">
              <Search className="h-8 w-8 text-blue-500 dark:text-blue-400" />
              <p className="text-xs text-muted-foreground text-center">Asset Screener</p>
              <div className="w-full grid grid-cols-3 gap-1">
                {[...Array(9)].map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square bg-gradient-to-br from-blue-600/30 to-cyan-600/30 rounded border border-border/30"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

