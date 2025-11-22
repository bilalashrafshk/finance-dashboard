"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatPercentage, formatCurrency } from "@/lib/asset-screener/metrics-calculations"
import type { MonthlySeasonality } from "@/lib/asset-screener/metrics-calculations"

interface SeasonalityTableProps {
  monthlySeasonality?: MonthlySeasonality[] | null
}

export function SeasonalityTable({ monthlySeasonality }: SeasonalityTableProps) {
  const [selectedMonth, setSelectedMonth] = useState<MonthlySeasonality | null>(null)

  if (!monthlySeasonality || monthlySeasonality.length === 0) {
    return null
  }

  return (
    <>
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
                  <TableRow 
                    key={month.month}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setSelectedMonth(month)}
                  >
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

      <Dialog open={selectedMonth !== null} onOpenChange={(open) => !open && setSelectedMonth(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedMonth?.monthName} Breakdown</DialogTitle>
            <DialogDescription>
              Detailed monthly returns for {selectedMonth?.monthName} across all years
            </DialogDescription>
          </DialogHeader>
          {selectedMonth && selectedMonth.observations.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead className="text-right">Start Date</TableHead>
                    <TableHead className="text-right">End Date</TableHead>
                    <TableHead className="text-right">Start Price</TableHead>
                    <TableHead className="text-right">End Price</TableHead>
                    <TableHead className="text-right">Return</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedMonth.observations.map((obs, idx) => (
                    <TableRow key={`${obs.year}-${idx}`}>
                      <TableCell className="font-medium">
                        {new Date(obs.startDate).toLocaleDateString('en-US', { 
                          month: 'short', 
                          year: 'numeric'
                        })}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {new Date(obs.startDate).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {new Date(obs.endDate).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(obs.startPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(obs.endPrice)}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${
                        obs.return >= 0 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {formatPercentage(obs.return)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              No detailed observations available
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

