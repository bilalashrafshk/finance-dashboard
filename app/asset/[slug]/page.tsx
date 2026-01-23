import { AssetDetailClient } from "./asset-detail-client"
import { Metadata } from "next"
import { parseAssetSlug } from "@/lib/asset-screener/url-utils"

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = params.slug
  const parsed = parseAssetSlug(slug)

  if (!parsed) {
    return {
      title: "Asset Not Found | ConvictionPays",
      description: "The requested asset could not be found."
    }
  }

  const { ticker } = parsed
  const symbol = ticker.toUpperCase()

  return {
    title: `${symbol} Risk Analysis & Fair Value | ConvictionPays`,
    description: `Real-time risk metrics, fair value bands, and technical analysis for ${symbol}. Track volatility, cycle indicators, and portfolio allocation for this asset on ConvictionPays.`,
    alternates: {
      canonical: `https://www.convictionpays.com/asset/${slug}`
    },
    openGraph: {
      title: `${symbol} - Risk & Valuation Analysis`,
      description: `Deep dive into ${symbol} with institutional-grade risk metrics.`,
    }
  }
}

export default function AssetPage({ params }: Props) {
  const parsed = parseAssetSlug(params.slug)
  const symbol = parsed?.ticker || "Asset"

  // Structured Data (JSON-LD) for Financial Product
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    "name": symbol,
    "tickerSymbol": symbol,
    "provider": {
      "@type": "Organization",
      "name": "ConvictionPays"
    },
    "description": `Investment analysis and risk metrics for ${symbol}.`
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <AssetDetailClient slug={params.slug} />
    </>
  )
}
