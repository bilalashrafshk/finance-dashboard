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
        <DialogContent className="max-w-[95vw] sm:max-w-[90vw] md:max-w-4xl lg:max-w-5xl xl:max-w-6xl w-full h-[90vh] sm:h-[85vh] md:h-[80vh] flex flex-col p-0 gap-0">
          <div className="px-6 pt-6 pb-4 border-b">
            <DialogHeader>
              <DialogTitle>{selectedMonth?.monthName} Breakdown</DialogTitle>
              <DialogDescription>
                Detailed monthly returns for {selectedMonth?.monthName} across all years
              </DialogDescription>
            </DialogHeader>
          </div>
          {selectedMonth && selectedMonth.observations.length > 0 ? (
            <div className="flex-1 overflow-hidden flex flex-col px-6 pb-6 pt-4">
              <div className="flex-1 overflow-auto">
                <div className="overflow-x-auto min-w-full">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Year</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Start Date</TableHead>
                        <TableHead className="text-right whitespace-nowrap">End Date</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Start Price</TableHead>
                        <TableHead className="text-right whitespace-nowrap">End Price</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Return</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedMonth.observations.map((obs, idx) => (
                        <TableRow key={`${obs.year}-${idx}`}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {new Date(obs.startDate).toLocaleDateString('en-US', { 
                              month: 'short', 
                              year: 'numeric'
                            })}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                            {new Date(obs.startDate).toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                            {new Date(obs.endDate).toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {obs.startPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {obs.endPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className={`text-right font-semibold whitespace-nowrap ${
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
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center px-6 pb-6">
              <p className="text-muted-foreground text-center py-4">
                No detailed observations available
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

