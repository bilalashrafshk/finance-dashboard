
import { CHART_CATEGORIES } from "@/lib/config/charts-registry"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, BarChart3 } from "lucide-react"
import Link from "next/link"

export function ChartsWelcome() {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="space-y-4">
                <h1 className="text-3xl font-bold tracking-tight">Financial Charts & Analytics</h1>
                <p className="text-muted-foreground max-w-2xl text-lg">
                    Explore our comprehensive collection of financial charts, market indicators, and economic metrics.
                    Select a category below to get started.
                </p>
            </div>

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
                                    <Link
                                        key={chart.id}
                                        href={`/charts?chart=${chart.id}`}
                                        className="flex items-center justify-between p-2 rounded-md hover:bg-muted text-sm group transition-colors"
                                    >
                                        <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                                            {chart.title}
                                        </span>
                                        <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                                    </Link>
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
