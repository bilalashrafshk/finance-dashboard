"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { ChartPeriod, DateRange } from "@/lib/charts/time-frame-filter"

interface TimeFrameSelectorProps {
  chartPeriod: ChartPeriod
  customRange: DateRange
  onPeriodChange: (period: ChartPeriod) => void
  onRangeChange: (range: DateRange) => void
}

export function TimeFrameSelector({
  chartPeriod,
  customRange,
  onPeriodChange,
  onRangeChange,
}: TimeFrameSelectorProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor="time-frame">Time Frame</Label>
        <Select value={chartPeriod} onValueChange={(value) => {
          onPeriodChange(value as ChartPeriod)
          if (value !== 'CUSTOM') {
            onRangeChange({ startDate: null, endDate: null })
          }
        }}>
          <SelectTrigger id="time-frame">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1M">Last 1 Month</SelectItem>
            <SelectItem value="3M">Last 3 Months</SelectItem>
            <SelectItem value="6M">Last 6 Months</SelectItem>
            <SelectItem value="1Y">Last 1 Year</SelectItem>
            <SelectItem value="2Y">Last 2 Years</SelectItem>
            <SelectItem value="5Y">Last 5 Years</SelectItem>
            <SelectItem value="ALL">All Time</SelectItem>
            <SelectItem value="CUSTOM">Custom Range</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {chartPeriod === 'CUSTOM' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="start-date">Start Date</Label>
            <Input
              id="start-date"
              type="date"
              value={customRange.startDate || ''}
              onChange={(e) => onRangeChange({ ...customRange, startDate: e.target.value || null })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end-date">End Date</Label>
            <Input
              id="end-date"
              type="date"
              value={customRange.endDate || ''}
              onChange={(e) => onRangeChange({ ...customRange, endDate: e.target.value || null })}
            />
          </div>
        </>
      )}
    </div>
  )
}

