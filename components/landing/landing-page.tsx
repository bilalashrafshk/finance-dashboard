"use client"

import { useState } from "react"
import { SharedNavbar } from "@/components/shared-navbar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  TrendingUp,
  ShieldCheckIcon,
  BarChart3Icon,
  ActivityIcon,
  ZapIcon,
  ChevronRightIcon,
  CheckIcon,
  LineChartIcon,
  PieChartIcon,
  Wallet,
  Search,
  Globe,
  DollarSign,
  Filter,
} from "lucide-react"
import Link from "next/link"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <SharedNavbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 via-transparent to-cyan-600/5" />
        <div className="container relative mx-auto px-4 py-24 md:py-32">
          <div className="mx-auto max-w-3xl text-center space-y-6">
            <Badge variant="secondary" className="gap-1">
              <ZapIcon className="h-3 w-3" />
              Professional Quantitative Research Platform
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight text-balance md:text-6xl lg:text-7xl">
              Intelligent Market Analysis for <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">Pakistani Equities</span>
            </h1>
            <p className="text-lg text-muted-foreground text-pretty md:text-xl">
              Make data-driven investment decisions with advanced quantitative tools, real-time analytics, and
              comprehensive risk management for the Pakistan Stock Exchange.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button size="lg" className="gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700" asChild>
                <Link href="/charts">
                  Start Free Trial
                  <ChevronRightIcon className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline">
                Watch Demo
              </Button>
            </div>
            <div className="flex items-center justify-center gap-8 pt-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                No credit card required
              </div>
              <div className="flex items-center gap-2">
                <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                Free for everyone
              </div>
            </div>
          </div>

          {/* Dashboard Preview */}
          <div className="mx-auto mt-16 max-w-5xl">
            <div className="rounded-xl border border-border bg-card/50 p-2 shadow-2xl backdrop-blur">
              <div className="aspect-video rounded-lg bg-gradient-to-br from-blue-600/10 to-cyan-600/10 flex items-center justify-center">
                <div className="text-center space-y-2">
                  <BarChart3Icon className="h-16 w-16 text-blue-600 dark:text-blue-400 mx-auto" />
                  <p className="text-sm text-muted-foreground">Dashboard Preview</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y border-border bg-muted/30">
        <div className="container mx-auto px-4 py-12">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="text-center space-y-2">
              <div className="text-3xl font-bold font-mono bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">500+</div>
              <div className="text-sm text-muted-foreground">Listed Companies</div>
            </div>
            <div className="text-center space-y-2">
              <div className="text-3xl font-bold font-mono bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">50M+</div>
              <div className="text-sm text-muted-foreground">Data Points Analyzed</div>
            </div>
            <div className="text-center space-y-2">
              <div className="text-3xl font-bold font-mono bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">25+</div>
              <div className="text-sm text-muted-foreground">Market Charts</div>
            </div>
            <div className="text-center space-y-2">
              <div className="text-3xl font-bold font-mono bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">100%</div>
              <div className="text-sm text-muted-foreground">Free Forever</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center space-y-4 mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-balance md:text-4xl">
              Everything You Need for Quantitative Analysis
            </h2>
            <p className="text-lg text-muted-foreground text-pretty">
              Powerful tools designed for professional investors and traders in the Pakistani market
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card className="border-l-4 border-l-blue-600">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600/10">
                  <LineChartIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle>Market Charts & Analytics</CardTitle>
                <CardDescription>
                  KSE100 Market Cycle, Market Heatmap, Advance-Decline indicators, P/E Ratio analysis, and Interest Rate correlations
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-l-4 border-l-cyan-600">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-600/10">
                  <ShieldCheckIcon className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                </div>
                <CardTitle>Risk Management</CardTitle>
                <CardDescription>
                  Comprehensive risk metrics including Sharpe ratio, Sortino ratio, beta analysis, maximum drawdown, and stress testing
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-l-4 border-l-blue-500">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10">
                  <PieChartIcon className="h-6 w-6 text-blue-500 dark:text-blue-400" />
                </div>
                <CardTitle>Portfolio Optimization</CardTitle>
                <CardDescription>
                  Modern Portfolio Theory tools for asset allocation, efficient frontier analysis, and diversification strategies
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-l-4 border-l-cyan-500">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-500/10">
                  <Wallet className="h-6 w-6 text-cyan-500 dark:text-cyan-400" />
                </div>
                <CardTitle>Multi-Asset Portfolio Tracking</CardTitle>
                <CardDescription>
                  Track US equities, PK equities, crypto, commodities, and indices with detailed performance analytics
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-l-4 border-l-blue-400">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-400/10">
                  <ActivityIcon className="h-6 w-6 text-blue-400 dark:text-blue-300" />
                </div>
                <CardTitle>Market Breadth Analysis</CardTitle>
                <CardDescription>
                  Advance-decline indicators, new highs/lows tracking, and sector rotation analysis for market sentiment
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-l-4 border-l-cyan-400">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-400/10">
                  <Search className="h-6 w-6 text-cyan-400 dark:text-cyan-300" />
                </div>
                <CardTitle>Asset Screening</CardTitle>
                <CardDescription>
                  Build and save custom stock screeners with fundamental and technical criteria for finding opportunities
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-l-4 border-l-blue-600">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600/10">
                  <BarChart3Icon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle>ETH Risk Dashboard</CardTitle>
                <CardDescription>
                  Real-time Ethereum risk analysis with valuation metrics, relative risk to Bitcoin, and fair value trendlines
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-l-4 border-l-cyan-600">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-600/10">
                  <Globe className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                </div>
                <CardTitle>Macro Economic Data</CardTitle>
                <CardDescription>
                  Access to GDP, CPI, interest rates, exchange rates, remittances, reserves, and industrial data for Pakistan
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-l-4 border-l-blue-500">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10">
                  <TrendingUp className="h-6 w-6 text-blue-500 dark:text-blue-400" />
                </div>
                <CardTitle>Historical Analysis</CardTitle>
                <CardDescription>
                  10+ years of historical data with seasonality patterns, drawdown analysis, and benchmark comparisons
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center space-y-4 mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-balance md:text-4xl">Simple, Transparent Pricing</h2>
            <p className="text-lg text-muted-foreground text-pretty">Choose the plan that fits your trading style</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-3 mx-auto max-w-5xl">
            <Card>
              <CardHeader>
                <CardTitle>Free</CardTitle>
                <CardDescription>Perfect for everyone</CardDescription>
                <div className="mt-4">
                  <span className="text-3xl font-bold font-mono bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">Free</span>
                  <span className="text-muted-foreground"> forever</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm">All market charts & analytics</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm">Portfolio tracking</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm">Risk metrics & analysis</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm">Asset screening</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm">Macro economic data</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm">ETH risk dashboard</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm">Modern Portfolio Theory</span>
                  </li>
                </ul>
                <Button className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700">
                  Get Started
                </Button>
              </CardContent>
            </Card>

            <Card className="border-blue-600 shadow-lg scale-105">
              <CardHeader>
                <Badge className="w-fit mb-2 bg-gradient-to-r from-blue-600 to-cyan-600">Most Popular</Badge>
                <CardTitle>Free</CardTitle>
                <CardDescription>For everyone</CardDescription>
                <div className="mt-4">
                  <span className="text-3xl font-bold font-mono bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">Free</span>
                  <span className="text-muted-foreground"> forever</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm">Everything included</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm">No limitations</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm">Full feature access</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm">Unlimited portfolios</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm">All charts & analytics</span>
                  </li>
                </ul>
                <Button className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700">
                  Get Started
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Free</CardTitle>
                <CardDescription>For everyone</CardDescription>
                <div className="mt-4">
                  <span className="text-3xl font-bold font-mono bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">Free</span>
                  <span className="text-muted-foreground"> forever</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm">Complete platform access</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm">All features unlocked</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm">No hidden fees</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm">Regular updates</span>
                  </li>
                </ul>
                <Button variant="outline" className="w-full bg-transparent">
                  Get Started
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl rounded-2xl bg-gradient-to-br from-blue-600/10 via-cyan-600/10 to-blue-600/10 border border-border p-12 text-center space-y-6">
            <h2 className="text-3xl font-bold tracking-tight text-balance md:text-4xl">
              Ready to Make Better Investment Decisions?
            </h2>
            <p className="text-lg text-muted-foreground text-pretty">
              Join thousands of traders using CONVICTION PLAY for quantitative analysis
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button size="lg" className="gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700" asChild>
                <Link href="/charts">
                  Start Your Free Trial
                  <ChevronRightIcon className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline">
                Schedule Demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30">
        <div className="container mx-auto px-4 py-12">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
                <span className="font-bold">CONVICTION PLAY</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Professional quantitative research platform for Pakistani equities
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-3">Product</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="#features" className="hover:text-foreground transition-colors">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="#pricing" className="hover:text-foreground transition-colors">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/charts" className="hover:text-foreground transition-colors">
                    Charts
                  </Link>
                </li>
                <li>
                  <Link href="/portfolio" className="hover:text-foreground transition-colors">
                    Portfolio
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-3">Company</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="#about" className="hover:text-foreground transition-colors">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-foreground transition-colors">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-foreground transition-colors">
                    Careers
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-foreground transition-colors">
                    Contact
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-3">Legal</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/privacy" className="hover:text-foreground transition-colors">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-foreground transition-colors">
                    Terms
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-foreground transition-colors">
                    Security
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-border text-center text-sm text-muted-foreground">
            © 2025 CONVICTION PLAY. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
