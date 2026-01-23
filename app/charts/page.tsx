import ChartsClient from "./charts-client"
import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Market Charts - PSX, Crypto & Global | ConvictionPays",
    description: "Interactive market charts for Pakistan Stock Exchange (PSX), KSE-100, Crypto assets, and global commodities. Analyze trends with our advanced charting tools.",
    keywords: ["PSX Charts", "KSE 100 Chart", "Crypto Charts", "Market Analysis", "ConvictionPays Charts"],
}

export default function ChartsPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "SoftwareApplication",
                        "name": "ConvictionPays Charting",
                        "applicationCategory": "FinanceApplication",
                        "description": "Advanced technical and fundamental charting for multi-asset portfolios."
                    })
                }}
            />
            <ChartsClient />
        </>
    )
}
