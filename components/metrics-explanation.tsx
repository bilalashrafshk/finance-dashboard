"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Info, TrendingUp, Activity, AlertTriangle, BarChart3, Target } from "lucide-react"
import { RISK_THRESHOLDS, RISK_VARIANT_WEIGHTS } from "@/lib/config/app.config"
import { METRIC_NAMES } from "@/lib/config/metric-names.config"

export function MetricsExplanation() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
          <Info className="h-5 w-5" />
          Overview
          </CardTitle>
          <CardDescription>
            This dashboard provides comprehensive risk analysis for Ethereum using multiple quantitative metrics.
            All metrics are normalized to a 0-1 scale for easy interpretation.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            {METRIC_NAMES.sVal.long}
          </CardTitle>
          <CardDescription>Absolute valuation metric based on fair value bands</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">What it measures:</h4>
            <p className="text-sm text-muted-foreground mb-3">
              {METRIC_NAMES.sVal.short} measures how overvalued or undervalued Ethereum is relative to its fair value trendline.
              It's an absolute valuation metric that compares the current ETH/USD price to a parametric
              log-regression fair value model.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-2">How it's calculated:</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>
                <strong>Fair Value Calculation:</strong> A parametric log-regression model is fitted to historical
                ETH/USD prices using the formula: <code className="bg-muted px-1 rounded">ln(price) = ln(basePrice) + baseCoeff + growthCoeff × ln(years)</code>
              </li>
              <li>
                <strong>Residual Calculation:</strong> The log difference between actual price and fair value is
                calculated: <code className="bg-muted px-1 rounded">residual = ln(actualPrice) - ln(fairValue)</code>
              </li>
              <li>
                <strong>Sigma Calculation:</strong> The standard deviation (σ) of residuals is computed to measure
                historical volatility around the fair value.
              </li>
              <li>
                <strong>Z-Score:</strong> Each residual is divided by sigma to get a z-score: <code className="bg-muted px-1 rounded">z = residual / σ</code>
              </li>
              <li>
                <strong>Normalization:</strong> Z-scores are rescaled to [0,1] range where ±2σ maps to [0,1]:
                <code className="bg-muted px-1 rounded">{METRIC_NAMES.sVal.short} = (z + 2) / 4</code>
              </li>
            </ol>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Interpretation:</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="default">0.0 - {RISK_THRESHOLDS.low}</Badge>
                <span className="text-sm">Undervalued - Price is significantly below fair value</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{RISK_THRESHOLDS.low} - {RISK_THRESHOLDS.high}</Badge>
                <span className="text-sm">Fair Value - Price is near the fair value trendline</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="destructive">{RISK_THRESHOLDS.high} - 1.0</Badge>
                <span className="text-sm">Overvalued - Price is significantly above fair value</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            {METRIC_NAMES.sRel.long}
          </CardTitle>
          <CardDescription>Relative risk to Bitcoin metric based on ETH/BTC trendlines</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">What it measures:</h4>
            <p className="text-sm text-muted-foreground mb-3">
              {METRIC_NAMES.sRel.short} measures Ethereum's relative risk to Bitcoin. It indicates whether ETH is performing
              strongly or weakly relative to BTC based on historical trendlines. This metric helps identify
              relative momentum and cyclical patterns in the ETH/BTC ratio.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-2">How it's calculated:</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>
                <strong>Log Transformation:</strong> ETH/BTC ratios are converted to log space for better
                statistical properties: <code className="bg-muted px-1 rounded">r = ln(ETH/BTC)</code>
              </li>
              <li>
                <strong>Peak/Trough Detection:</strong> Local maxima (peaks) and minima (troughs) are identified
                in the log-transformed ETH/BTC time series.
              </li>
              <li>
                <strong>Extreme Selection:</strong> Top 3-5 peaks and troughs are selected, ensuring global
                extremes are included for robust trendline fitting.
              </li>
              <li>
                <strong>Trendline Fitting:</strong> Linear regression is performed on peaks to create an upper
                trendline, and on troughs to create a lower trendline, both in log space.
              </li>
              <li>
                <strong>Gap Adjustment:</strong> A minimum gap is enforced between trendlines (10% of 95th percentile
                of price changes) to prevent unrealistic compression.
              </li>
              <li>
                <strong>Relative Position:</strong> The current ETH/BTC ratio's position between the upper and lower
                trendlines is calculated: <code className="bg-muted px-1 rounded">{METRIC_NAMES.sRel.short} = (current - lower) / (upper - lower)</code>
              </li>
              <li>
                <strong>Normalization:</strong> The result is clamped to [0,1] range.
              </li>
            </ol>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Interpretation:</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="default">0.0 - 0.3</Badge>
                <span className="text-sm">Weak - ETH is underperforming relative to BTC</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">0.3 - 0.7</Badge>
                <span className="text-sm">Neutral - ETH/BTC ratio is in the middle range</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="destructive">0.7 - 1.0</Badge>
                <span className="text-sm">Strong - ETH is outperforming relative to BTC</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Risk_eq (Composite Risk Metric)
          </CardTitle>
          <CardDescription>Equal-weighted composite of {METRIC_NAMES.sVal.short} and {METRIC_NAMES.sRel.short}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">What it measures:</h4>
            <p className="text-sm text-muted-foreground mb-3">
              Risk_eq is a balanced composite risk metric that equally weights both {METRIC_NAMES.sVal.short}
              and {METRIC_NAMES.sRel.short}. It provides a holistic view of Ethereum's risk profile by combining
              both perspectives.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-2">How it's calculated:</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Simple equal-weighted average:
            </p>
            <div className="bg-muted p-3 rounded-md">
              <code className="text-sm">Risk_eq = 0.5 × {METRIC_NAMES.sVal.short} + 0.5 × {METRIC_NAMES.sRel.short}</code>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Interpretation:</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="default">0.0 - 0.3</Badge>
                <span className="text-sm">Low Risk - Both undervalued and weak relative to BTC</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">0.3 - 0.7</Badge>
                <span className="text-sm">Medium Risk - Mixed signals or neutral position</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="destructive">0.7 - 1.0</Badge>
                <span className="text-sm">High Risk - Both overvalued and strong relative to BTC</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Risk Variants
          </CardTitle>
          <CardDescription>Weighted composites with different emphasis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Risk_valHeavy (Value-Heavy Composite):</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Emphasizes absolute valuation ({RISK_VARIANT_WEIGHTS.valHeavy.sValWeight * 100}% {METRIC_NAMES.sVal.short}, {RISK_VARIANT_WEIGHTS.valHeavy.sRelWeight * 100}% {METRIC_NAMES.sRel.short}). Use this when you care more about
              whether ETH is overvalued/undervalued in absolute terms.
            </p>
            <div className="bg-muted p-3 rounded-md mb-4">
              <code className="text-sm">Risk_valHeavy = {RISK_VARIANT_WEIGHTS.valHeavy.sValWeight} × {METRIC_NAMES.sVal.short} + {RISK_VARIANT_WEIGHTS.valHeavy.sRelWeight} × {METRIC_NAMES.sRel.short}</code>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Risk_relHeavy (Relative-Heavy Composite):</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Emphasizes relative risk to Bitcoin ({RISK_VARIANT_WEIGHTS.relHeavy.sValWeight * 100}% {METRIC_NAMES.sVal.short}, {RISK_VARIANT_WEIGHTS.relHeavy.sRelWeight * 100}% {METRIC_NAMES.sRel.short}). Use this when you care more about
              ETH's performance relative to BTC and market cycles.
            </p>
            <div className="bg-muted p-3 rounded-md">
              <code className="text-sm">Risk_relHeavy = {RISK_VARIANT_WEIGHTS.relHeavy.sValWeight} × {METRIC_NAMES.sVal.short} + {RISK_VARIANT_WEIGHTS.relHeavy.sRelWeight} × {METRIC_NAMES.sRel.short}</code>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Fair Value Bands
          </CardTitle>
          <CardDescription>Statistical bands around the fair value trendline</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">What they represent:</h4>
            <p className="text-sm text-muted-foreground mb-3">
              Fair value bands provide statistical context around the fair value trendline. They show
              how far prices typically deviate from fair value and help identify extreme overvaluation
              or undervaluation.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Band Types:</h4>
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline">±1σ Bands</Badge>
                  <span className="text-sm font-medium">Parametric Multiplier Bands</span>
                </div>
                <p className="text-xs text-muted-foreground ml-2">
                  Created using upper/lower multipliers on the fair value. These represent the expected
                  range based on the parametric model.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline">±2σ Bands</Badge>
                  <span className="text-sm font-medium">Statistical Regression Bands</span>
                </div>
                <p className="text-xs text-muted-foreground ml-2">
                  Calculated using actual price residuals. These represent 2 standard deviations from
                  fair value based on historical volatility.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline">±3σ Bands</Badge>
                  <span className="text-sm font-medium">Extreme Deviation Bands</span>
                </div>
                <p className="text-xs text-muted-foreground ml-2">
                  Represent 3 standard deviations from fair value. Prices outside these bands are
                  extremely rare (statistically speaking) and may indicate bubbles or crashes.
                </p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Fair Value Calculation:</h4>
            <p className="text-sm text-muted-foreground mb-2">
              The fair value uses a Pine Script-style parametric log-regression model:
            </p>
            <div className="bg-muted p-3 rounded-md">
              <code className="text-sm">
                ln(fairValue) = ln(basePrice) + baseCoeff + growthCoeff × ln(yearsSinceStart)
              </code>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              This model assumes exponential growth in log space, which is common for cryptocurrencies
              that exhibit power-law growth patterns.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Methodology Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong>Data Frequency:</strong> All calculations use weekly data (resampled to week-ending-Sunday)
            to reduce noise and focus on longer-term trends.
          </p>
          <p>
            <strong>Historical Data:</strong> Data is fetched from Binance API, combining ETH/BTC and BTC/USDT
            to derive ETH/USD prices going back to 2015.
          </p>
          <p>
            <strong>Log Space:</strong> Most calculations are performed in logarithmic space because crypto
            prices exhibit multiplicative rather than additive behavior, and log transforms help normalize
            the data distribution.
          </p>
          <p>
            <strong>Robustness:</strong> The algorithms include safeguards like minimum gap enforcement,
            global extreme inclusion, and outlier filtering to ensure stable results even with noisy data.
          </p>
          <p>
            <strong>Interpretation:</strong> These metrics are tools for analysis, not predictions. High risk
            doesn't guarantee a price drop, and low risk doesn't guarantee a price rise. Always combine
            quantitative metrics with fundamental analysis and market context.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}


