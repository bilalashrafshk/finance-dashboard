
"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format, subDays } from "date-fns"
import { CalendarIcon, RefreshCw, BarChart3, Table as TableIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts"

interface LipiRecord {
    date: string
    client_type: string
    sector_name: string
    net_value: number
    buy_value: number
    sell_value: number
}

// Helper to determine color based on value
// Green for buy (positive), Red for sell (negative)
const getValueColor = (value: number, maxAbs: number) => {
    if (value === 0) return "bg-gray-100 dark:bg-gray-800"

    // Normalize opacity strictly between 0.1 and 1
    // Logarithmic scale often looks better for financial data with outliers
    const opacity = Math.min(Math.max(Math.abs(value) / maxAbs, 0.1), 1)

    // Use consistent coloring: Green for Buy, Red for Sell
    if (value > 0) {
        return `rgba(34, 197, 94, ${opacity})` // green-500
    } else {
        return `rgba(239, 68, 68, ${opacity})` // red-500
    }
}

export function LiquidityMapSection() {
    const [date, setDate] = useState<Date>(() => subDays(new Date(), 1)) // Default to yesterday
    const [data, setData] = useState<LipiRecord[]>([])
    const [loading, setLoading] = useState(false)
    const [viewMode, setViewMode] = useState<"heatmap" | "summary">("heatmap")
    const [summaryViewType, setSummaryViewType] = useState<"table" | "chart">("table")

    async function fetchData(targetDate: Date) {
        setLoading(true)
        try {
            const dateStr = format(targetDate, "yyyy-MM-dd")
            const res = await fetch(`/api/scstrade/lipi?startDate=${dateStr}&endDate=${dateStr}`)
            if (!res.ok) throw new Error("Failed to fetch")
            const json = await res.json()
            setData(json)
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData(date)
    }, [date])

    // Process data for Summary View (Net by Client)
    const summaryData = useMemo(() => {
        const clientTotals: Record<string, { net: number, buy: number, sell: number }> = {}
        data.forEach(r => {
            // Removed filter for 'all other' to correct totals
            if (!clientTotals[r.client_type]) {
                clientTotals[r.client_type] = { net: 0, buy: 0, sell: 0 }
            }
            clientTotals[r.client_type].net += r.net_value
            clientTotals[r.client_type].buy += r.buy_value
            clientTotals[r.client_type].sell += r.sell_value
        })

        return Object.entries(clientTotals)
            .map(([name, stats]) => ({ name, ...stats }))
            .sort((a, b) => b.net - a.net) // Sort by Net Value
    }, [data])

    // Process data for Heatmap View
    const { matrix, sectors, clients, maxAbsValue } = useMemo(() => {
        if (data.length === 0) return { matrix: {}, sectors: [], clients: [], maxAbsValue: 0 }

        const sectorsSet = new Set<string>()
        const clientsSet = new Set<string>()
        const matrixData: Record<string, Record<string, number>> = {}
        let maxVal = 0

        data.forEach(r => {
            // Filter meaningless sectors if needed
            if (!r.sector_name || r.sector_name === 'TOTAL') return

            sectorsSet.add(r.sector_name)
            clientsSet.add(r.client_type)

            if (!matrixData[r.sector_name]) matrixData[r.sector_name] = {}
            matrixData[r.sector_name][r.client_type] = r.net_value

            maxVal = Math.max(maxVal, Math.abs(r.net_value))
        })

        return {
            sectors: Array.from(sectorsSet).sort(),
            clients: Array.from(clientsSet).sort(),
            matrix: matrixData,
            maxAbsValue: maxVal
        }
    }, [data])

    return (
        <Card className="w-full">
            <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <CardTitle>Liquidity Map (Lipi)</CardTitle>
                        <CardDescription>
                            Net Buy/Sell activity by Client Type and Sector (Million PKR)
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Select value={viewMode} onValueChange={(v: any) => setViewMode(v)}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Select View" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="heatmap">Sector Heatmap</SelectItem>
                                <SelectItem value="summary">Client Summary</SelectItem>
                            </SelectContent>
                        </Select>

                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                        "w-[240px] justify-start text-left font-normal",
                                        !date && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {date ? format(date, "PPP") : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={(d) => d && setDate(d)}
                                    disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>

                        <Button variant="outline" size="icon" onClick={() => fetchData(date)} disabled={loading}>
                            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {viewMode === "summary" ? (
                    <div className="w-full space-y-4">
                        <div className="flex justify-end gap-2">
                            <div className="flex bg-muted rounded-md p-1 gap-1">
                                <Button
                                    variant={summaryViewType === "table" ? "secondary" : "ghost"}
                                    size="sm"
                                    onClick={() => setSummaryViewType("table")}
                                    className="h-8 px-2"
                                >
                                    <TableIcon className="h-4 w-4 mr-2" />
                                    Table
                                </Button>
                                <Button
                                    variant={summaryViewType === "chart" ? "secondary" : "ghost"}
                                    size="sm"
                                    onClick={() => setSummaryViewType("chart")}
                                    className="h-8 px-2"
                                >
                                    <BarChart3 className="h-4 w-4 mr-2" />
                                    Chart
                                </Button>
                            </div>
                        </div>

                        {summaryViewType === "table" ? (
                            <div className="rounded-md border">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/50 transition-colors hover:bg-muted/50">
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[200px]">Investor Type</th>
                                            <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Gross Buy ($ mn)</th>
                                            <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Gross Sell ($ mn)</th>
                                            <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Net USD ($ mn)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {summaryData.map((row) => (
                                            <tr key={row.name} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                                <td className="p-4 align-middle font-medium">{row.name}</td>
                                                <td className="p-4 align-middle text-right text-green-600 dark:text-green-400">
                                                    {row.buy.toFixed(2)}
                                                </td>
                                                <td className="p-4 align-middle text-right text-red-600 dark:text-red-400">
                                                    {Math.abs(row.sell).toFixed(2)}
                                                </td>
                                                <td className={cn(
                                                    "p-4 align-middle text-right font-bold",
                                                    row.net > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                                                )}>
                                                    {row.net.toFixed(2)}
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="bg-muted/20 font-bold">
                                            <td className="p-4 align-middle">TOTAL</td>
                                            <td className="p-4 align-middle text-right text-green-600 dark:text-green-400">
                                                {summaryData.reduce((acc, curr) => acc + curr.buy, 0).toFixed(2)}
                                            </td>
                                            <td className="p-4 align-middle text-right text-red-600 dark:text-red-400">
                                                {summaryData.reduce((acc, curr) => acc + Math.abs(curr.sell), 0).toFixed(2)}
                                            </td>
                                            <td className={cn(
                                                "p-4 align-middle text-right",
                                                summaryData.reduce((acc, curr) => acc + curr.net, 0) > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                                            )}>
                                                {summaryData.reduce((acc, curr) => acc + curr.net, 0).toFixed(2)}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="h-[500px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={summaryData}
                                        layout="vertical"
                                        margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" />
                                        <YAxis
                                            type="category"
                                            dataKey="name"
                                            width={150}
                                            tick={{ fontSize: 12 }}
                                        />
                                        <Tooltip
                                            formatter={(value: number) => [`${value.toFixed(2)} M`, "Net Value"]}
                                            cursor={{ fill: 'transparent' }}
                                        />
                                        <Bar dataKey="net">
                                            {summaryData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.net > 0 ? "#22c55e" : "#ef4444"} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <div className="min-w-[800px]">
                            {/* Heatmap Grid */}
                            <div className="grid" style={{
                                gridTemplateColumns: `200px repeat(${clients.length}, minmax(100px, 1fr))`
                            }}>
                                {/* Header Row */}
                                <div className="p-2 font-bold text-sm bg-muted/50 sticky left-0 z-10 border-b">Sector \ Client</div>
                                {clients.map(client => (
                                    <div key={client} className="p-2 font-bold text-xs text-center border-b bg-muted/20 truncate" title={client}>
                                        {client}
                                    </div>
                                ))}

                                {/* Data Rows */}
                                {sectors.map(sector => (
                                    <>
                                        {/* Row Label */}
                                        <div key={`label-${sector}`} className="p-2 text-xs font-medium border-b bg-background sticky left-0 z-10 truncate" title={sector}>
                                            {sector}
                                        </div>
                                        {/* Cells */}
                                        {clients.map(client => {
                                            const val = matrix[sector]?.[client] || 0
                                            return (
                                                <div
                                                    key={`${sector}-${client}`}
                                                    className="p-2 text-xs text-center border-b border-l border-muted/20 flex items-center justify-center transition-colors hover:border-primary/50"
                                                    style={{ backgroundColor: getValueColor(val, maxAbsValue) }}
                                                    title={`${sector} - ${client}: ${val.toFixed(2)} M`}
                                                >
                                                    <span className={cn(
                                                        "font-medium",
                                                        Math.abs(val) > maxAbsValue * 0.5 ? "text-white drop-shadow-sm" : "text-foreground"
                                                    )}>
                                                        {val !== 0 ? val.toFixed(1) : "-"}
                                                    </span>
                                                </div>
                                            )
                                        })}
                                    </>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
