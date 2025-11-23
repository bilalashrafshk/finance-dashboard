import dynamic from "next/dynamic"
import { BarChart3, TrendingUp, Activity, Globe, LayoutGrid, Loader2 } from "lucide-react"
import React from "react"

// Loading component
function ChartLoader() {
    return (
        <div className="flex items-center justify-center h-[500px] border rounded-lg bg-muted/10">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p>Loading chart...</p>
            </div>
        </div>
    )
}

// Dynamic Imports
const MarketCycleChart = dynamic(() => import("@/components/kse100/market-cycle-chart").then(mod => mod.MarketCycleChart), {
    loading: () => <ChartLoader />,
})
const EthRiskDashboard = dynamic(() => import("@/components/eth-risk-dashboard").then(mod => mod.EthRiskDashboard), {
    loading: () => <ChartLoader />,
})
const MarketHeatmapSection = dynamic(() => import("@/components/charts/market-heatmap-section").then(mod => mod.MarketHeatmapSection), {
    loading: () => <ChartLoader />,
})
const AdvanceDeclineSection = dynamic(() => import("@/components/charts/advance-decline-section").then(mod => mod.AdvanceDeclineSection), {
    loading: () => <ChartLoader />,
})

// Types
export type ChartId = "market-cycle" | "market-heatmap" | "advance-decline" | "eth-risk" | "us-placeholder"

export interface ChartDefinition {
    id: ChartId
    title: string
    icon: React.ElementType
    component: React.ReactNode
    keywords: string[]
}

export interface CategoryDefinition {
    id: string
    title: string
    icon: React.ElementType
    charts: ChartDefinition[]
}

// Registry
export const CHART_CATEGORIES: CategoryDefinition[] = [
    {
        id: "pk-stocks",
        title: "PK Stocks",
        icon: TrendingUp,
        charts: [
            {
                id: "market-cycle",
                title: "KSE100 Market Cycle",
                icon: Activity,
                component: <MarketCycleChart />,
                keywords: ["kse100", "stocks", "cycle", "market"],
            },
            {
                id: "market-heatmap",
                title: "Market Heatmap",
                icon: LayoutGrid,
                component: <MarketHeatmapSection />,
                keywords: ["heatmap", "treemap", "stocks", "performance"],
            },
            {
                id: "advance-decline",
                title: "Advance-Decline Line",
                icon: TrendingUp,
                component: <AdvanceDeclineSection />,
                keywords: ["breadth", "advance", "decline", "stocks"],
            },
        ],
    },
    {
        id: "crypto",
        title: "Crypto",
        icon: Activity,
        charts: [
            {
                id: "eth-risk",
                title: "ETH Risk Dashboard",
                icon: BarChart3,
                component: <EthRiskDashboard />,
                keywords: ["eth", "ethereum", "crypto", "risk"],
            },
        ],
    },
    {
        id: "us-stocks",
        title: "US Stocks",
        icon: Globe,
        charts: [
            {
                id: "us-placeholder",
                title: "US Market Charts",
                icon: Globe,
                component: (
                    <div className="p-12 border border-dashed rounded-lg text-center text-muted-foreground bg-muted/30">
                        <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <h3 className="text-lg font-medium">US Market Charts Coming Soon</h3>
                        <p>We are working on adding comprehensive charts for US markets.</p>
                    </div>
                ),
                keywords: ["us", "stocks", "market"],
            },
        ],
    },
]

export function getChartById(id: ChartId): ChartDefinition | undefined {
    for (const category of CHART_CATEGORIES) {
        const chart = category.charts.find(c => c.id === id)
        if (chart) return chart
    }
    return undefined
}
