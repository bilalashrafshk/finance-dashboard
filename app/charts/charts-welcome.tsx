
import { CHART_CATEGORIES, getChartById } from "@/lib/config/charts-registry"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, BarChart3, Clock } from "lucide-react"
import Link from "next/link"

interface ChartsWelcomeProps {
    recentChartIds?: string[]
    onChartSelect?: (chartId: string) => void
}

export function ChartsWelcome({ recentChartIds = [], onChartSelect }: ChartsWelcomeProps) {
    // Resolve recent chart IDs to actual chart definitions
    const recentCharts = recentChartIds
        .map(id => getChartById(id as any))
        .filter(Boolean)

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="space-y-4">
                <h1 className="text-3xl font-bold tracking-tight">Financial Charts & Analytics</h1>
                <p className="text-muted-foreground max-w-2xl text-lg">
                    Explore our comprehensive collection of financial charts, market indicators, and economic metrics.
                    Select a category below to get started.
                </p>
            </div>

            {/* Recently Viewed */}
            {recentCharts.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        Recently Viewed
                    </div>
                    <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                        {recentCharts.map((chart) => chart && (
                            <button
                                key={chart.id}
                                onClick={() => onChartSelect?.(chart.id)}
                                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-left group"
                            >
                                <div className="p-1.5 bg-primary/10 rounded-md shrink-0">
                                    <chart.icon className="w-4 h-4 text-primary" />
                                </div>
                                <span className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                                    {chart.title}
                                </span>
                                <ArrowRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-primary shrink-0" />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {CHART_CATEGORIES.map((category) => (
                    <Card key={category.id} className="flex flex-col h-full hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <category.icon className="w-5 h-5 text-primary" />
                                </div>
                                <CardTitle>{category.title}</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col gap-4">
                            <div className="space-y-1">
                                {category.charts.slice(0, 5).map((chart) => (
                                    <button
                                        key={chart.id}
                                        onClick={() => onChartSelect?.(chart.id)}
                                        className="flex items-center justify-between p-2 rounded-md hover:bg-muted text-sm group transition-colors w-full text-left"
                                    >
                                        <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                                            {chart.title}
                                        </span>
                                        <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                                    </button>
                                ))}
                                {category.charts.length > 5 && (
                                    <div className="pt-2 text-xs text-muted-foreground pl-2">
                                        + {category.charts.length - 5} more charts
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="rounded-xl bg-muted/50 p-6 border">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-background rounded-full border shadow-sm">
                        <BarChart3 className="w-6 h-6 text-primary" />
                    </div>
                    <div className="space-y-1">
                        <h3 className="font-semibold text-lg">Need help finding a chart?</h3>
                        <p className="text-muted-foreground">
                            Use the search bar in the sidebar to quickly filter through all available charts by name or keyword.
                            You can also browse through the categories above.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
