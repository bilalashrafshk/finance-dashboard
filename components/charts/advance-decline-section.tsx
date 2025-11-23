"use client"

import { useState } from "react"
import { AdvanceDeclineChart } from "@/components/advance-decline-chart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { format } from "date-fns"

export function AdvanceDeclineSection() {
    const [startDate, setStartDate] = useState<Date | undefined>(() => {
        // Default to 1 year ago
        const date = new Date()
        date.setFullYear(date.getFullYear() - 1)
        return date
    })
    const [endDate, setEndDate] = useState<Date | undefined>(new Date())
    const [limit, setLimit] = useState(100)

    const startDateStr = startDate ? format(startDate, 'yyyy-MM-dd') : undefined
    const endDateStr = endDate ? format(endDate, 'yyyy-MM-dd') : undefined

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">Advance-Decline Line</h2>
                <p className="text-muted-foreground">
                    Track market breadth using the cumulative Advance-Decline Line for top PK stocks
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Chart Settings</CardTitle>
                    <CardDescription>Configure the date range and number of stocks</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="start-date">Start Date</Label>
                            <Input
                                id="start-date"
                                type="date"
                                value={startDate ? format(startDate, 'yyyy-MM-dd') : ''}
                                onChange={(e) => {
                                    if (e.target.value) {
                                        setStartDate(new Date(e.target.value))
                                    } else {
                                        setStartDate(undefined)
                                    }
                                }}
                                max={endDate ? format(endDate, 'yyyy-MM-dd') : undefined}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="end-date">End Date</Label>
                            <Input
                                id="end-date"
                                type="date"
                                value={endDate ? format(endDate, 'yyyy-MM-dd') : ''}
                                onChange={(e) => {
                                    if (e.target.value) {
                                        setEndDate(new Date(e.target.value))
                                    } else {
                                        setEndDate(undefined)
                                    }
                                }}
                                min={startDate ? format(startDate, 'yyyy-MM-dd') : undefined}
                                max={format(new Date(), 'yyyy-MM-dd')}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="limit">Top Stocks by Market Cap</Label>
                            <Input
                                id="limit"
                                type="number"
                                min={10}
                                max={500}
                                value={limit}
                                onChange={(e) => setLimit(parseInt(e.target.value) || 100)}
                            />
                            <p className="text-xs text-muted-foreground">Top {limit} stocks by market cap</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <AdvanceDeclineChart
                startDate={startDateStr}
                endDate={endDateStr}
                limit={limit}
            />
        </div>
    )
}
