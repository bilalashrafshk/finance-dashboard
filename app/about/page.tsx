import { SharedNavbar } from "@/components/shared-navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, BarChart3, Target, Zap } from "lucide-react"

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <SharedNavbar />
      <main>
        <div className="container mx-auto px-4 py-12 max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl flex items-center gap-2">
                <Target className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                About ConvictionPays
              </CardTitle>
              <CardDescription>
                Professional quantitative research platform for investment analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 prose prose-slate dark:prose-invert max-w-none">
              <section>
                <h2 className="text-2xl font-semibold mb-4">Our Mission</h2>
                <p>
                  ConvictionPays is a comprehensive quantitative research platform designed to empower investors and traders with professional-grade tools for market analysis, risk management, and portfolio optimization. We focus primarily on Pakistani equities while also providing research and analysis capabilities for US equities, cryptocurrencies, and metals.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">What We Offer</h2>
                <div className="grid gap-4 md:grid-cols-2 mt-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400 mb-2" />
                    <h3 className="font-semibold mb-2">Market Analysis</h3>
                    <p className="text-sm text-muted-foreground">
                      Comprehensive charts and analytics including market cycles, heatmaps, advance-decline indicators, and macroeconomic data for informed decision-making.
                    </p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <TrendingUp className="h-6 w-6 text-blue-600 dark:text-blue-400 mb-2" />
                    <h3 className="font-semibold mb-2">Risk Management</h3>
                    <p className="text-sm text-muted-foreground">
                      Advanced risk metrics including Sharpe ratio, Sortino ratio, beta analysis, maximum drawdown, and stress testing to evaluate investment risk.
                    </p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <Target className="h-6 w-6 text-blue-600 dark:text-blue-400 mb-2" />
                    <h3 className="font-semibold mb-2">Portfolio Optimization</h3>
                    <p className="text-sm text-muted-foreground">
                      Modern Portfolio Theory tools for asset allocation, efficient frontier analysis, and diversification strategies across multiple asset classes.
                    </p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <Zap className="h-6 w-6 text-blue-600 dark:text-blue-400 mb-2" />
                    <h3 className="font-semibold mb-2">Asset Screening</h3>
                    <p className="text-sm text-muted-foreground">
                      Powerful screening tools to find investment opportunities based on fundamental and technical criteria across PK equities, US equities, crypto, and metals.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">Our Focus</h2>
                <p>
                  While ConvictionPays is primarily focused on Pakistani equities, we recognize the importance of a global perspective in investment analysis. Our platform provides:
                </p>
                <ul className="list-disc pl-6 space-y-2 mt-2">
                  <li><strong>Primary Focus:</strong> Comprehensive analysis of Pakistan Stock Exchange (PSX) listed companies with detailed market data, sector analysis, and macroeconomic indicators</li>
                  <li><strong>US Equities:</strong> Research and analysis tools for US stocks and ETFs to help you understand global market trends</li>
                  <li><strong>Cryptocurrencies:</strong> Risk analysis and valuation tools for major cryptocurrencies, with a focus on Ethereum risk metrics</li>
                  <li><strong>Metals:</strong> Analysis of precious metals and commodities to diversify your investment perspective</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">Our Values</h2>
                <div className="space-y-3">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h3 className="font-semibold mb-2">Free and Accessible</h3>
                    <p className="text-sm text-muted-foreground">
                      We believe professional-grade investment tools should be accessible to everyone. ConvictionPays is free for all users, with no hidden fees or limitations.
                    </p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h3 className="font-semibold mb-2">Data-Driven</h3>
                    <p className="text-sm text-muted-foreground">
                      Our platform is built on quantitative analysis and real data. We provide transparent, accurate information to help you make informed investment decisions.
                    </p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h3 className="font-semibold mb-2">Continuous Improvement</h3>
                    <p className="text-sm text-muted-foreground">
                      We continuously update and improve our platform based on user feedback and market needs. New features and data sources are added regularly.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">Technology</h2>
                <p>
                  ConvictionPays is built with modern web technologies to provide a fast, reliable, and secure experience. Our platform leverages:
                </p>
                <ul className="list-disc pl-6 space-y-2 mt-2">
                  <li>Real-time data from multiple sources including StockAnalysis.com, Binance, and Investing.com</li>
                  <li>Advanced database systems for efficient data storage and retrieval</li>
                  <li>Interactive charts and visualizations for better data comprehension</li>
                  <li>Secure authentication and data protection measures</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">Contact Us</h2>
                <p>
                  Have questions, feedback, or suggestions? We'd love to hear from you:
                </p>
                <ul className="list-none pl-0 space-y-2 mt-2">
                  <li><strong>Email:</strong> support@convictionpays.com</li>
                </ul>
              </section>

              <section className="pt-6 border-t">
                <p className="text-sm text-muted-foreground">
                  Thank you for using ConvictionPays. We're committed to helping you make better investment decisions through data-driven analysis and professional tools.
                </p>
              </section>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

