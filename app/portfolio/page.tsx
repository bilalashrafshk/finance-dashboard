import { PortfolioDashboardV2 } from "@/components/portfolio/portfolio-dashboard-v2"
import { SharedNavbar } from "@/components/shared-navbar"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Pakistan Portfolio Tracker - PSX & Crypto | ConvictionPays",
  description: "The ultimate Pakistan Portfolio Tracker (PSX) and Net Worth Tracker. Monitor Pakistan Stock Exchange shares, Crypto, and US Assets in one real-time dashboard.",
  keywords: ["Pakistan Portfolio Tracker", "PSX Portfolio", "Pakistan Stock Exchange Tracker", "Net Worth Tracker Pakistan", "PSX Watchlist"],
}

export default function PortfolioPage() {
  return (
    <div className="min-h-screen bg-background">
      <SharedNavbar />
      <main>
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                "name": "ConvictionPays Portfolio Tracker",
                "applicationCategory": "FinanceApplication",
                "operatingSystem": "Web",
                "offers": {
                  "@type": "Offer",
                  "price": "0",
                  "priceCurrency": "USD"
                },
                "description": "Comprehensive portfolio tracking for Pakistan Stock Exchange (PSX), Crypto, and Global Assets."
              })
            }}
          />
          <PortfolioDashboardV2 />
        </>
      </main>
    </div>
  )
}




