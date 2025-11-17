"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatPercentage } from "@/lib/asset-screener/metrics-calculations"
import type { MonthlySeasonality } from "@/lib/asset-screener/metrics-calculations"

interface SeasonalityTableProps {
  monthlySeasonality?: MonthlySeasonality[] | null
}

export function SeasonalityTable({ monthlySeasonality }: SeasonalityTableProps) {
  if (!monthlySeasonality || monthlySeasonality.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Seasonality</CardTitle>
        <CardDescription>
          Average returns by month - helps detect recurring patterns
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Avg Return</TableHead>
                <TableHead className="text-right">Observations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthlySeasonality.map((month) => (
                <TableRow key={month.month}>
                  <TableCell className="font-medium">{month.monthName}</TableCell>
                  <TableCell className={`text-right font-semibold ${
                    month.avgReturn >= 0 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {formatPercentage(month.avgReturn)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {month.count}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

