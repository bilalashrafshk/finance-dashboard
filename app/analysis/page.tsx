import { AnalysisFeed } from "@/components/analysis/analysis-feed"
import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Market Analysis & Research | ConvictionPays",
    description: "Latest market thoughts, videos, and presentations on various stocks and assets.",
}

export default function AnalysisPage() {
    return (
        <div className="container py-8 max-w-7xl mx-auto">
            <div className="flex flex-col gap-2 mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Market Analysis & Research</h1>
                <p className="text-muted-foreground">
                    Latest thoughts, deep dives, and presentations on key market assets.
                </p>
            </div>

            <AnalysisFeed />
        </div>
    )
}
