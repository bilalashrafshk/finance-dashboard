
import dynamic from "next/dynamic"
import { BarChart3, TrendingUp, Activity, Globe, LayoutGrid, Loader2, ScatterChart, PieChart, Calendar, LineChart, DollarSign, Table2, Map } from "lucide-react"
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
const PERatioScatterSection = dynamic(() => import("@/components/charts/pe-ratio-scatter-section").then(mod => mod.PERatioScatterSection), {
    loading: () => <ChartLoader />,
})
const MPTSection = dynamic(() => import("@/components/charts/mpt-section").then(mod => mod.MPTSection), {
    loading: () => <ChartLoader />,
})
const SeasonalitySection = dynamic(() => import("@/components/charts/seasonality-section").then(mod => mod.SeasonalitySection), {
    loading: () => <ChartLoader />,
})
const PriceChartSection = dynamic(() => import("@/components/charts/price-chart-section").then(mod => mod.PriceChartSection), {
    loading: () => <ChartLoader />,
})
const InterestRatesSection = dynamic(() => import("@/components/charts/interest-rates-section").then(mod => mod.InterestRatesSection), {
    loading: () => <ChartLoader />,
})
const BalanceOfPaymentsSection = dynamic(() => import("@/components/charts/balance-of-payments-section").then(mod => mod.BalanceOfPaymentsSection), {
    loading: () => <ChartLoader />,
})
const InterestRateEquitiesSection = dynamic(() => import("@/components/charts/interest-rate-equities-section").then(mod => mod.InterestRateEquitiesSection), {
    loading: () => <ChartLoader />,
})
const CPISection = dynamic(() => import("@/components/charts/cpi-section").then(mod => mod.CPISection), {
    loading: () => <ChartLoader />,
})
const GDPSection = dynamic(() => import("@/components/charts/gdp-section").then(mod => mod.GDPSection), {
    loading: () => <ChartLoader />,
})
const ExchangeRateSection = dynamic(() => import("@/components/charts/exchange-rate-section").then(mod => mod.ExchangeRateSection), {
    loading: () => <ChartLoader />,
})
const RemittancesSection = dynamic(() => import("@/components/charts/remittances-section").then(mod => mod.RemittancesSection), {
    loading: () => <ChartLoader />,
})
const KIBORSection = dynamic(() => import("@/components/charts/kibor-section").then(mod => mod.KIBORSection), {
    loading: () => <ChartLoader />,
})
const SBPReservesSection = dynamic(() => import("@/components/charts/sbp-reserves-section").then(mod => mod.SBPReservesSection), {
    loading: () => <ChartLoader />,
})
const FDISection = dynamic(() => import("@/components/charts/fdi-section").then(mod => mod.FDISection), {
    loading: () => <ChartLoader />,
})
const M2Section = dynamic(() => import("@/components/charts/m2-section").then(mod => mod.M2Section), {
    loading: () => <ChartLoader />,
})
const DepositsSection = dynamic(() => import("@/components/charts/deposits-section").then(mod => mod.DepositsSection), {
    loading: () => <ChartLoader />,
})
const VehicleSalesSection = dynamic(() => import("@/components/charts/vehicle-sales-section").then(mod => mod.VehicleSalesSection), {
    loading: () => <ChartLoader />,
})
const CementSalesSection = dynamic(() => import("@/components/charts/cement-sales-section").then(mod => mod.CementSalesSection), {
    loading: () => <ChartLoader />,
})
const ElectricityGenerationSection = dynamic(() => import("@/components/charts/electricity-generation-section").then(mod => mod.ElectricityGenerationSection), {
    loading: () => <ChartLoader />,
})
const POLSalesSection = dynamic(() => import("@/components/charts/pol-sales-section").then(mod => mod.POLSalesSection), {
    loading: () => <ChartLoader />,
})
const SCRASection = dynamic(() => import("@/components/charts/scra-section").then(mod => mod.SCRASection), {
    loading: () => <ChartLoader />,
})
const SectorQuarterlyPerformance = dynamic(() => import("@/components/charts/sector-quarterly-performance").then(mod => mod.SectorQuarterlyPerformance), {
    loading: () => <ChartLoader />,
})
const PKEquityUSDSection = dynamic(() => import("@/components/charts/pk-equity-usd-section").then(mod => mod.PKEquityUSDSection), {
    loading: () => <ChartLoader />,
})
const UnifiedPriceChart = dynamic(() => import("@/components/charts/unified-price-chart").then(mod => mod.UnifiedPriceChart), {
    loading: () => <ChartLoader />,
})
const LiquidityMapSection = dynamic(() => import("@/components/charts/liquidity-map-section").then(mod => mod.LiquidityMapSection), {
    loading: () => <ChartLoader />,
})

// Types
export type ChartId = "market-cycle" | "market-heatmap" | "advance-decline" | "pe-ratio-scatter" | "eth-risk" | "mpt" | "seasonality" | "price-chart" | "interest-rates" | "balance-of-payments" | "interest-rate-equities" | "cpi" | "gdp" | "exchange-rate" | "remittances" | "kibor" | "sbp-reserves" | "fdi" | "m2" | "deposits" | "vehicle-sales" | "cement-sales" | "electricity-generation" | "pol-sales" | "scra" | "sector-quarterly-performance" | "pk-equity-usd" | "pk-equity-ma" | "liquidity-map"

export interface ChartDefinition {
    id: ChartId
    title: string
    icon: React.ElementType
    component: React.ReactNode
    keywords: string[]
    explanation?: string
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
                explanation: "Visualizes the KSE100 index market cycles, highlighting bull and bear phases based on historical data. Helps in identifying potential market tops and bottoms.",
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
            {
                id: "pe-ratio-scatter",
                title: "P/E Ratio Valuation Scatter",
                icon: ScatterChart,
                component: <PERatioScatterSection />,
                keywords: ["pe", "ratio", "valuation", "scatter", "stocks", "sector", "industry"],
            },
            {
                id: "interest-rate-equities",
                title: "Interest Rate and Equities",
                icon: TrendingUp,
                component: <InterestRateEquitiesSection />,
                keywords: ["interest", "rate", "equities", "stocks", "sbp", "price", "correlation", "kse100"],
            },
            {
                id: "sector-quarterly-performance",
                title: "Sector Quarterly Performance",
                icon: Table2,
                component: <SectorQuarterlyPerformance />,
                keywords: ["sector", "quarterly", "performance", "kse100", "outperformance", "dividends", "returns", "table"],
            },
            {
                id: "pk-equity-usd",
                title: "PK Equity/Index in USD",
                icon: DollarSign,
                component: <PKEquityUSDSection />,
                keywords: ["pk equity", "usd", "exchange rate", "conversion", "pkr", "kse100", "index", "price", "currency"],
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
                explanation: "Comprehensive risk dashboard for Ethereum, tracking key metrics like volatility, moving averages, and on-chain signals to assess current risk levels.",
            },
        ],
    },

    {
        id: "portfolio",
        title: "Portfolio",
        icon: PieChart,
        charts: [
            {
                id: "mpt",
                title: "Modern Portfolio Theory",
                icon: PieChart,
                component: <MPTSection />,
                keywords: ["mpt", "modern portfolio theory", "optimization", "efficient frontier", "sharpe ratio", "portfolio"],
            },
            {
                id: "seasonality",
                title: "Asset Seasonality",
                icon: Calendar,
                component: <SeasonalitySection />,
                keywords: ["seasonality", "monthly", "patterns", "returns", "trends", "calendar"],
            },
            {
                id: "price-chart",
                title: "Price Chart",
                icon: LineChart,
                component: <UnifiedPriceChart />,
                keywords: ["price", "chart", "historical", "pe", "ratio", "trends", "analysis", "moving average", "ma"],
            },
        ],
    },
    {
        id: "macros",
        title: "Macros",
        icon: DollarSign,
        charts: [
            {
                id: "liquidity-map",
                title: "Liquidity Map (Lipi)",
                icon: Map,
                component: <LiquidityMapSection />,
                keywords: ["liquidity", "map", "lipi", "nccpl", "manual-source", "foreign", "buying", "selling", "fipi", "invsetment", "sector"],
                explanation: "Heatmap showing net liquidity flows (FIPI/LIPI) across difference sectors. Green indicates net buying (inflow), red indicates net selling (outflow).",
            },
            {
                id: "interest-rates",
                title: "SBP Interest Rates",
                icon: TrendingUp,
                component: <InterestRatesSection />,
                keywords: ["interest", "rates", "sbp", "policy", "repo", "reverse repo", "macro", "pakistan", "monetary"],
            },
            {
                id: "balance-of-payments",
                title: "Balance of Payments",
                icon: DollarSign,
                component: <BalanceOfPaymentsSection />,
                keywords: ["balance", "payments", "bop", "current account", "surplus", "deficit", "macro", "pakistan", "trade"],
            },
            {
                id: "cpi",
                title: "CPI National (YoY)",
                icon: TrendingUp,
                component: <CPISection />,
                keywords: ["cpi", "inflation", "consumer price index", "national", "yoy", "macro", "pakistan", "economic"],
            },
            {
                id: "gdp",
                title: "Real GDP Growth Rate",
                icon: TrendingUp,
                component: <GDPSection />,
                keywords: ["gdp", "gross domestic product", "growth rate", "real gdp", "macro", "pakistan", "economic"],
            },
            {
                id: "exchange-rate",
                title: "Exchange Rate (PKR/USD)",
                icon: DollarSign,
                component: <ExchangeRateSection />,
                keywords: ["exchange rate", "pkr", "usd", "currency", "forex", "macro", "pakistan"],
            },
            {
                id: "remittances",
                title: "Workers' Remittances",
                icon: DollarSign,
                component: <RemittancesSection />,
                keywords: ["remittances", "workers", "foreign exchange", "inflow", "macro", "pakistan"],
            },
            {
                id: "kibor",
                title: "6-Months KIBOR",
                icon: TrendingUp,
                component: <KIBORSection />,
                keywords: ["kibor", "interest rate", "karachi interbank", "6 months", "macro", "pakistan"],
            },
            {
                id: "sbp-reserves",
                title: "SBP Gross Reserves",
                icon: DollarSign,
                component: <SBPReservesSection />,
                keywords: ["reserves", "foreign exchange", "forex", "sbp", "macro", "pakistan"],
            },
            {
                id: "fdi",
                title: "Net FDI",
                icon: DollarSign,
                component: <FDISection />,
                keywords: ["fdi", "foreign direct investment", "investment", "macro", "pakistan"],
            },
            {
                id: "m2",
                title: "Broad Money (M2)",
                icon: DollarSign,
                component: <M2Section />,
                keywords: ["m2", "broad money", "money supply", "monetary", "macro", "pakistan"],
            },
            {
                id: "deposits",
                title: "Total Bank Deposits",
                icon: DollarSign,
                component: <DepositsSection />,
                keywords: ["deposits", "banks", "scheduled banks", "monetary", "macro", "pakistan"],
            },
            {
                id: "vehicle-sales",
                title: "Vehicle Sales",
                icon: TrendingUp,
                component: <VehicleSalesSection />,
                keywords: ["vehicles", "auto", "sales", "industrial", "pakistan"],
            },
            {
                id: "cement-sales",
                title: "Cement Sales",
                icon: TrendingUp,
                component: <CementSalesSection />,
                keywords: ["cement", "sales", "industrial", "construction", "pakistan"],
            },
            {
                id: "electricity-generation",
                title: "Electricity Generation",
                icon: TrendingUp,
                component: <ElectricityGenerationSection />,
                keywords: ["electricity", "generation", "power", "energy", "industrial", "pakistan"],
            },
            {
                id: "pol-sales",
                title: "POL Sales",
                icon: TrendingUp,
                component: <POLSalesSection />,
                keywords: ["pol", "petroleum", "oil", "lubricants", "sales", "industrial", "pakistan"],
            },
            {
                id: "scra",
                title: "SCRA Weekly Position",
                icon: DollarSign,
                component: <SCRASection />,
                keywords: ["scra", "special convertible rupee accounts", "external sector", "remittances", "securities", "equity", "t-bills", "pibs", "macro", "pakistan"],
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
