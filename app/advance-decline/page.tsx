"use client"

import { useState } from "react"
import { SharedNavbar } from "@/components/shared-navbar"
import { AdvanceDeclineChart } from "@/components/advance-decline-chart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

export default function AdvanceDeclinePage() {
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
    <div className="min-h-screen bg-background">
      <SharedNavbar />
      <div className="container mx-auto py-8 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Advance-Decline Line</h1>
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
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="limit">Number of Stocks</Label>
              <Input
                id="limit"
                type="number"
                min={10}
                max={500}
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value) || 100)}
              />
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
    </div>
  )
}

