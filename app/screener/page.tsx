import ScreenerPage from "./screener-client"
import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Stock Screener - PSX & US Equities | ConvictionPays",
    description: "Scan and filter Pakistan Stock Exchange (PSX) and US stocks based on P/E ratio, market cap, dividend yield, and technical indicators. Find undervalued stocks instantly.",
    keywords: ["PSX Screener", "Pakistan Stock Screener", "Undervalued Stocks Pakistan", "KSE 100 Screener", "Stock Filter"],
}

export default function Page() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "SoftwareApplication",
                        "name": "ConvictionPays Stock Screener",
                        "applicationCategory": "FinanceApplication",
                        "description": "Advanced stock screening tool for PSX and Global markets."
                    })
                }}
            />
            <ScreenerPage />
        </>
    )
}
