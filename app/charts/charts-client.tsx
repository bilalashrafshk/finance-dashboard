"use client"

import { useState, useMemo, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
import { ChartsWelcome } from "./charts-welcome"
import { ChartInfo } from "@/components/chart-info"

function ChartsContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const selectedChartId = searchParams.get("chart") as ChartId | null
    const [searchQuery, setSearchQuery] = useState("")
    const [isSidebarOpen, setIsSidebarOpen] = useState(true)

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

    const selectedChart = selectedChartId
        ? CHART_CATEGORIES
            .flatMap((c) => c.charts)
            .find((c) => c.id === selectedChartId)
        : null

    const handleChartSelect = (chartId: string) => {
        router.push(`/charts?chart=${chartId}`)
        if (window.innerWidth < 768) setIsSidebarOpen(false)
    }

    return (
        <div className="h-screen bg-background flex flex-col">
            <SharedNavbar />

            <div className="flex-1 flex overflow-hidden relative">
                {/* Sidebar */}
                <aside
                    className={cn(
                        "border-r bg-muted/10 flex flex-col h-full transition-all duration-300 ease-in-out absolute md:relative z-20 bg-background md:bg-muted/10",
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
                                                        onClick={() => handleChartSelect(chart.id)}
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
                    <div className="flex items-center gap-2 mb-6 sticky top-0 bg-background/95 backdrop-blur z-10 p-4 border-b md:static md:bg-transparent md:p-0 md:border-none md:m-6 md:mb-6">
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
                        {selectedChart && (
                            <div className="flex items-center gap-2">
                                <selectedChart.icon className="w-5 h-5 text-muted-foreground" />
                                <h1 className="text-xl font-semibold tracking-tight">{selectedChart.title}</h1>
                                {selectedChart.explanation && (
                                    <ChartInfo title={selectedChart.title} explanation={selectedChart.explanation} />
                                )}
                            </div>
                        )}
                    </div>

                    <div className="container max-w-6xl mx-auto p-4 md:p-8 pt-0 md:pt-0">
                        {selectedChart ? (
                            <div className="space-y-6 animate-in fade-in duration-300 min-h-[500px]">
                                {selectedChart.component}
                            </div>
                        ) : (
                            <ChartsWelcome />
                        )}
                    </div>
                </main>
            </div>
        </div>
    )
}

export default function ChartsPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
            <ChartsContent />
        </Suspense>
    )
}
