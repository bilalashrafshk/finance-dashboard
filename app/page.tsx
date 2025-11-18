"use client"

import { useAuth } from "@/lib/auth/auth-context"
import LandingPage from "@/components/landing/landing-page"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart3, Wallet, Search, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"

function DashboardHome() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 md:py-16 lg:py-20">
        <div className="max-w-4xl mx-auto space-y-12">
          {/* Hero Section */}
          <div className="text-center space-y-4">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
              Welcome to{" "}
              <span className="inline-flex items-baseline">
                {"STACK THEM GAINS".split("").map((char, index) => {
                  const scale = Math.pow(1.06, index); // Compounding factor of 6% per letter
                  // Round to 4 decimal places to prevent hydration mismatch
                  const fontSize = Math.round(scale * 10000) / 10000;
                  const isStack = index < "STACK ".length;
                  const colorClass = isStack 
                    ? "text-red-600" 
                    : "text-green-500";
                  return (
                    <span
                      key={index}
                      className={colorClass}
                      style={{
                        fontSize: `${fontSize}em`,
                      }}
                    >
                      {char === " " ? "\u00A0" : char}
                    </span>
                  );
                })}
              </span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Your comprehensive platform for risk analysis, portfolio management, and asset screening
            </p>
          </div>

          {/* Navigation Cards */}
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <BarChart3 className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">ETH Risk</CardTitle>
                </div>
                <CardDescription>
                  Real-time Ethereum risk metrics and valuation analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full">
                  <Link href="/eth-risk">
                    View Dashboard
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Wallet className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">Portfolio</CardTitle>
                </div>
                <CardDescription>
                  Track and manage your multi-asset portfolio with detailed analytics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full">
                  <Link href="/portfolio">
                    View Portfolio
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Search className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">Asset Screener</CardTitle>
                </div>
                <CardDescription>
                  Screen and analyze assets with comprehensive risk metrics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full">
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
              <div className="flex items-start gap-3 p-4 rounded-lg border">
                <TrendingUp className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold mb-1">Risk Analysis</h3>
                  <p className="text-sm text-muted-foreground">
                    Advanced risk metrics and valuation models
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-lg border">
                <BarChart3 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold mb-1">Portfolio Tracking</h3>
                  <p className="text-sm text-muted-foreground">
                    Monitor multiple asset classes in one place
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-lg border">
                <Search className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
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
  )
}

export default function Home() {
  const { user, loading } = useAuth()

  // Show loading state or landing page while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  // Show landing page for logged out users, dashboard for logged in users
  if (!user) {
    return <LandingPage />
  }

  return <DashboardHome />
}
