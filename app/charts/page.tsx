"use client"

import { useState, useMemo } from "react"
import { SharedNavbar } from "@/components/shared-navbar"
import { Search, ChevronRight, LayoutGrid } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import { CHART_CATEGORIES, type ChartId } from "@/lib/config/charts-registry"

export default function ChartsPage() {
    const [selectedChartId, setSelectedChartId] = useState<ChartId>("market-cycle")
    const [searchQuery, setSearchQuery] = useState("")

    // Filter categories and charts based on search query
    const filteredCategories = useMemo(() => {
        if (!searchQuery.trim()) return CHART_CATEGORIES

        const query = searchQuery.toLowerCase()
        return CHART_CATEGORIES
            .map((category) => ({
                ...category,
                charts: category.charts.filter(
                    (chart) =>
                        chart.title.toLowerCase().includes(query) ||
                        chart.keywords.some((k) => k.toLowerCase().includes(query))
                ),
            }))
            .filter((category) => category.charts.length > 0)
    }, [searchQuery])

    const selectedChart = CHART_CATEGORIES
        .flatMap((c) => c.charts)
        .find((c) => c.id === selectedChartId)

    const [isSidebarOpen, setIsSidebarOpen] = useState(true)

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <SharedNavbar />

            <div className="flex-1 flex overflow-hidden relative">
                {/* Sidebar */}
                <aside
                    className={cn(
                        "border-r bg-muted/10 flex flex-col h-[calc(100vh-64px)] transition-all duration-300 ease-in-out absolute md:relative z-20 bg-background md:bg-muted/10",
                        isSidebarOpen ? "w-80 translate-x-0" : "w-0 -translate-x-full md:translate-x-0 md:w-0 overflow-hidden border-none"
                    )}
                >
                    <div className="p-3 border-b flex items-center justify-between flex-shrink-0">
                        <div className="relative flex-1 mr-2">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search charts..."
                                className="pl-9 h-9"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="md:hidden h-9 w-9"
                            onClick={() => setIsSidebarOpen(false)}
                        >
                            <ChevronRight className="h-4 w-4 rotate-180" />
                        </Button>
                    </div>

                    <ScrollArea className="flex-1 min-h-0">
                        <div className="p-3">
                            <Accordion
                                type="multiple"
                                defaultValue={CHART_CATEGORIES.map(c => c.id)}
                                className="space-y-1"
                            >
                                {filteredCategories.map((category) => (
                                    <AccordionItem key={category.id} value={category.id} className="border-none">
                                        <AccordionTrigger className="py-1.5 hover:no-underline px-2 rounded-md hover:bg-muted/50">
                                            <div className="flex items-center gap-2 font-semibold text-sm">
                                                <category.icon className="w-4 h-4 text-muted-foreground" />
                                                {category.title}
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="pb-0 pt-0.5">
                                            <div className="flex flex-col gap-0.5 ml-2 border-l pl-2">
                                                {category.charts.map((chart) => (
                                                    <Button
                                                        key={chart.id}
                                                        variant={selectedChartId === chart.id ? "secondary" : "ghost"}
                                                        className={cn(
                                                            "justify-start h-auto py-1.5 px-2.5 text-sm font-normal",
                                                            selectedChartId === chart.id
                                                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                                                : "text-muted-foreground hover:text-foreground"
                                                        )}
                                                        onClick={() => {
                                                            setSelectedChartId(chart.id)
                                                            if (window.innerWidth < 768) setIsSidebarOpen(false)
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-2 w-full">
                                                            <chart.icon className="w-4 h-4 opacity-70" />
                                                            <span className="truncate">{chart.title}</span>
                                                            {selectedChartId === chart.id && (
                                                                <ChevronRight className="w-3 h-3 ml-auto opacity-50" />
                                                            )}
                                                        </div>
                                                    </Button>
                                                ))}
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>

                            {filteredCategories.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground text-sm">
                                    No charts found matching "{searchQuery}"
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </aside>

                {/* Main Content */}
                <main className="flex-1 overflow-auto bg-background w-full">
                    <div className="flex items-center gap-2 mb-6">
                        {!isSidebarOpen && (
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setIsSidebarOpen(true)}
                                className="mr-2"
                                title="Show Sidebar"
                            >
                                <LayoutGrid className="h-4 w-4" />
                            </Button>
                        )}
                        {isSidebarOpen && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsSidebarOpen(false)}
                                className="mr-2 hidden md:flex"
                                title="Hide Sidebar"
                            >
                                <ChevronRight className="h-4 w-4 rotate-180" />
                            </Button>
                        )}
                    </div>
                    <div className="container max-w-6xl mx-auto p-6 md:p-8">
                        {selectedChart ? (
                            <div className="space-y-6 animate-in fade-in duration-300">
                                <div className="flex items-center gap-2 pb-4 border-b">
                                    <selectedChart.icon className="w-6 h-6 text-muted-foreground" />
                                    <h1 className="text-2xl font-bold tracking-tight">{selectedChart.title}</h1>
                                </div>

                                <div className="min-h-[500px]">
                                    {selectedChart.component}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                <LayoutGrid className="w-16 h-16 mb-4 opacity-20" />
                                <p className="text-lg font-medium">Select a chart to view</p>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    )
}
