import type React from "react"
import type { Metadata, Viewport } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/lib/auth/auth-context"
import { Toaster } from "@/components/ui/toaster"
import Footer from "@/components/footer"
import "./globals.css"

export const metadata: Metadata = {
  metadataBase: new URL("https://www.convictionpays.com"),
  title: {
    default: "Conviction Pays - Risk Metric Dashboard",
    template: "%s | Conviction Pays",
  },
  description:
    "Advanced investment risk analysis, portfolio management, and market screening tools. Track performance, analyze risk metrics, and optimize your investment strategy with Conviction Pays.",
  keywords: [
    "Investment Analysis",
    "Risk Management",
    "Portfolio Tracker",
    "Stock Screener",
    "Financial Dashboard",
    "Market Analytics",
    "Risk Metrics",
    "Conviction Pays",
  ],
  authors: [{ name: "Conviction Pays Team" }],
  creator: "Conviction Pays",
  publisher: "Conviction Pays",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.convictionpays.com",
    title: "Conviction Pays - Risk Metric Dashboard",
    description:
      "Advanced investment risk analysis and portfolio management tools. Track performance and optimize your strategy.",
    siteName: "Conviction Pays",
  },
  twitter: {
    card: "summary_large_image",
    title: "Conviction Pays - Risk Metric Dashboard",
    description:
      "Advanced investment risk analysis and portfolio management. Optimize your strategy with professional-grade tools.",
    creator: "@convictionpays",
  },
  icons: {
    icon: "/favicon.png",
    apple: "/apple-icon",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style>{`
html {
  font-family: ${GeistSans.style.fontFamily};
  --font-sans: ${GeistSans.variable};
  --font-mono: ${GeistMono.variable};
}
        `}</style>
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthProvider>
            {children}
            <Footer />
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Conviction Pays",
              url: "https://www.convictionpays.com",
              logo: "https://www.convictionpays.com/favicon.png",
              sameAs: [
                "https://twitter.com/convictionpays",
                // Add other social profiles here if available
              ],
              contactPoint: {
                "@type": "ContactPoint",
                contactType: "customer support",
                email: "support@convictionpays.com",
              },
            }),
          }}
        />
      </body>
    </html>
  )
}
