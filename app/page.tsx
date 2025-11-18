"use client"

import { useAuth } from "@/lib/auth/auth-context"
import LandingPage from "@/components/landing/landing-page"
import { SharedNavbar } from "@/components/shared-navbar"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart3, Wallet, Search, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"

function DashboardHome() {
  return (
    <div className="min-h-screen bg-background">
      <SharedNavbar />
      <main>
        <div className="container mx-auto px-4 py-12 md:py-16 lg:py-20">
          <div className="max-w-4xl mx-auto space-y-12">
            {/* Hero Section */}
            <div className="text-center space-y-6">
              <div className="flex items-center justify-center gap-3 mb-4">
                <span className="text-4xl md:text-5xl font-bold text-foreground inline-flex items-baseline">
                  {"STACK THEM GAINS".split("").map((char, index) => {
                    const scale = Math.pow(1.06, index); // Compounding factor of 6% per letter
                    // Round to 4 decimal places to prevent hydration mismatch
                    const fontSize = Math.round(scale * 10000) / 10000;
                    return (
                      <span
                        key={index}
                        className="text-foreground"
                        style={{
                          fontSize: `${fontSize}em`,
                        }}
                      >
                        {char === " " ? "\u00A0" : char}
                      </span>
                    );
                  })}
                </span>
                <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg shadow-lg shadow-blue-500/20">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
              </div>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Your comprehensive platform for risk analysis, portfolio management, and asset screening
              </p>
            </div>

            {/* Navigation Cards */}
            <div className="grid gap-6 md:grid-cols-3">
            <Card className="hover:shadow-lg transition-shadow hover:border-blue-600/50">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-blue-600/20">
                    <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <CardTitle className="text-2xl">ETH Risk</CardTitle>
                </div>
                <CardDescription>
                    Real-time Ethereum risk metrics and valuation analysis
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700">
                    <Link href="/eth-risk">
                      View Dashboard
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow hover:border-blue-600/50">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-blue-600/20">
                      <Wallet className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <CardTitle className="text-2xl">Portfolio</CardTitle>
                  </div>
                  <CardDescription>
                    Track and manage your multi-asset portfolio with detailed analytics
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700">
                    <Link href="/portfolio">
                      View Portfolio
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow hover:border-blue-600/50">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-blue-600/20">
                      <Search className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <CardTitle className="text-2xl">Asset Screener</CardTitle>
                  </div>
                  <CardDescription>
                    Screen and analyze assets with comprehensive risk metrics
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700">
                    <Link href="/asset-screener">
                      Open Screener
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Features Section */}
            <div className="pt-8 border-t">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-semibold mb-2">Key Features</h2>
                <p className="text-muted-foreground">
                  Everything you need for informed investment decisions
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="flex items-start gap-3 p-4 rounded-lg border hover:border-blue-600/50 transition-colors">
                  <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">Risk Analysis</h3>
                    <p className="text-sm text-muted-foreground">
                      Advanced risk metrics and valuation models
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg border hover:border-blue-600/50 transition-colors">
                  <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">Portfolio Tracking</h3>
                    <p className="text-sm text-muted-foreground">
                      Monitor multiple asset classes in one place
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg border hover:border-blue-600/50 transition-colors">
                  <Search className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">Asset Screening</h3>
                    <p className="text-sm text-muted-foreground">
                      Find and analyze investment opportunities
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function Home() {
  const { user, loading } = useAuth()

  // Show loading state or landing page while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Loading...</div>
      </div>
    )
  }

  // Show landing page for logged out users, dashboard for logged in users
  if (!user) {
    return <LandingPage />
  }

  return <DashboardHome />
}
