"use client"

import { AdvanceDeclineChart } from "@/components/advance-decline-chart"

export function AdvanceDeclineSection() {

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">Advance-Decline Line</h2>
                <p className="text-muted-foreground">
                    Track market breadth using the cumulative Advance-Decline Line for top PK stocks
                </p>
            </div>

            <AdvanceDeclineChart />
        </div>
    )
}
